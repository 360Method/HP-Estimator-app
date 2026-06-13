/**
 * spotInspection router: the staff side of the doctor-style spot visit
 * (360 Method Step 2). For members it builds on the baseline; for
 * non-members it is the inspect-first front door and a taste of membership.
 *
 * Photos upload through uploads.uploadFile first; this router only records
 * the resulting URLs. The AI draft is never customer-visible: the portal
 * filter (portalRoadmap.roadmapRowVisibleToPortal) hides spot rows until
 * approveAndDeliver flips them to completed.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getCustomerById, createOpportunity } from "../db";
import {
  priorityTranslations,
  portalProperties,
  type ClaudePriorityTranslationResponse,
  type SpotInspectionPhoto,
  type SpotCaptureLine,
} from "../../drizzle/schema.priorityTranslation";
import { homeSystemLabel, normalizeToSystem } from "../../shared/homeSystems";
import { properties } from "../../drizzle/schema";
import {
  createSpotInspection,
  generateMiniRoadmap,
  approveAndDeliver,
} from "../lib/spotInspection/orchestrator";

async function db() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return d;
}

async function loadSpotRow(id: string) {
  const d = await db();
  const [row] = await d
    .select()
    .from(priorityTranslations)
    .where(and(eq(priorityTranslations.id, id), eq(priorityTranslations.source, "spot_inspection")))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Spot inspection not found" });
  return { d, row };
}

const findingSchema = z.object({
  category: z.string().min(1).max(120),
  area_key: z.string().max(40).optional(),
  finding: z.string().min(1).max(2000),
  interpretation: z.string().max(2000).optional(),
  recommended_approach: z.string().max(2000).optional(),
  urgency: z.enum(["NOW", "SOON", "WAIT"]),
  investment_range_low_usd: z.number().min(0),
  investment_range_high_usd: z.number().min(0),
  reasoning: z.string().max(2000).default(""),
}).refine((f) => f.investment_range_low_usd <= f.investment_range_high_usd, {
  message: "The low end of the range must be at or below the high end",
});

export const spotInspectionRouter = router({
  /** Start a spot inspection for a CRM customer (email required for delivery). */
  create: protectedProcedure
    .input(z.object({
      customerId: z.string().min(1),
      /** CRM properties.id — which home this visit is about. */
      propertyId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const customer = await getCustomerById(input.customerId);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      if (!customer.email?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Add an email to this customer first so the mini roadmap can reach them.",
        });
      }
      // When the visit is pinned to a property, its address (not the
      // customer's flat fields) becomes the portal property.
      let crmProperty = null;
      if (input.propertyId) {
        const d = await db();
        const [p] = await d
          .select()
          .from(properties)
          .where(and(eq(properties.id, input.propertyId), eq(properties.customerId, input.customerId)))
          .limit(1);
        if (!p) throw new TRPCError({ code: "NOT_FOUND", message: "Property not found for this customer" });
        crmProperty = p;
      }
      try {
        return await createSpotInspection({
          hpCustomerId: customer.id,
          crmPropertyId: crmProperty?.id ?? null,
          email: customer.email,
          firstName: customer.firstName ?? "",
          lastName: customer.lastName ?? "",
          phone: customer.mobilePhone ?? "",
          street: crmProperty?.street || customer.street || "Address on file",
          city: crmProperty?.city ?? customer.city ?? "",
          state: crmProperty?.state ?? customer.state ?? "",
          zip: crmProperty?.zip ?? customer.zip ?? "",
        });
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const { d, row } = await loadSpotRow(input.id);
      const customer = row.hpCustomerId ? await getCustomerById(row.hpCustomerId).catch(() => null) : null;
      const [prop] = await d
        .select()
        .from(portalProperties)
        .where(eq(portalProperties.id, row.propertyId))
        .limit(1);
      return {
        id: row.id,
        status: row.status,
        customerId: row.hpCustomerId,
        customerName: customer?.displayName ?? "",
        propertyAddress: prop
          ? [prop.street, prop.city].filter(Boolean).join(", ")
          : "",
        photos: (row.capturedPhotosJson ?? []) as SpotInspectionPhoto[],
        captureLines: (row.captureLinesJson ?? null) as SpotCaptureLine[] | null,
        techNotes: row.techNotes ?? "",
        draft: (row.claudeResponse ?? null) as ClaudePriorityTranslationResponse | null,
        pdfUrl: row.outputPdfPath,
        failureReason: row.failureReason,
        approvedAt: row.approvedAt,
        createdAt: row.createdAt,
      };
    }),

  listByCustomer: protectedProcedure
    .input(z.object({ customerId: z.string().min(1) }))
    .query(async ({ input }) => {
      const d = await db();
      const rows = await d
        .select({
          id: priorityTranslations.id,
          status: priorityTranslations.status,
          createdAt: priorityTranslations.createdAt,
          approvedAt: priorityTranslations.approvedAt,
          outputPdfPath: priorityTranslations.outputPdfPath,
        })
        .from(priorityTranslations)
        .where(
          and(
            eq(priorityTranslations.hpCustomerId, input.customerId),
            eq(priorityTranslations.source, "spot_inspection"),
          ),
        )
        .orderBy(desc(priorityTranslations.createdAt));
      return rows;
    }),

  /** Record an uploaded photo (bytes already went through uploads.uploadFile). */
  addPhoto: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
      url: z.string().url(),
      fileKey: z.string().min(1),
      caption: z.string().max(300).optional(),
      /** Capture line this photo was taken for (SpotCaptureLine.id). */
      lineId: z.string().max(64).optional(),
    }))
    .mutation(async ({ input }) => {
      const { d, row } = await loadSpotRow(input.id);
      if (row.status === "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Already delivered" });
      const photos = [...((row.capturedPhotosJson ?? []) as SpotInspectionPhoto[])];
      photos.push({ url: input.url, fileKey: input.fileKey, caption: input.caption, lineId: input.lineId });
      await d
        .update(priorityTranslations)
        .set({ capturedPhotosJson: photos, updatedAt: new Date() })
        .where(eq(priorityTranslations.id, input.id));
      return { count: photos.length };
    }),

  removePhoto: protectedProcedure
    .input(z.object({ id: z.string().min(1), fileKey: z.string().min(1) }))
    .mutation(async ({ input }) => {
      const { d, row } = await loadSpotRow(input.id);
      if (row.status === "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Already delivered" });
      const photos = ((row.capturedPhotosJson ?? []) as SpotInspectionPhoto[]).filter(
        (p) => p.fileKey !== input.fileKey,
      );
      await d
        .update(priorityTranslations)
        .set({ capturedPhotosJson: photos, updatedAt: new Date() })
        .where(eq(priorityTranslations.id, input.id));
      return { count: photos.length };
    }),

  updateTechNotes: protectedProcedure
    .input(z.object({ id: z.string().min(1), techNotes: z.string().max(10000) }))
    .mutation(async ({ input }) => {
      const { d, row } = await loadSpotRow(input.id);
      if (row.status === "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Already delivered" });
      await d
        .update(priorityTranslations)
        .set({ techNotes: input.techNotes, updatedAt: new Date() })
        .where(eq(priorityTranslations.id, input.id));
      return { ok: true };
    }),

  /** Replace the structured capture lines (full array, like a form save). */
  setCaptureLines: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
      lines: z.array(z.object({
        id: z.string().min(1).max(64),
        areaKey: z.string().max(40),
        note: z.string().max(4000),
      })).max(20),
    }))
    .mutation(async ({ input }) => {
      const { d, row } = await loadSpotRow(input.id);
      if (row.status === "completed") throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Already delivered" });
      // Snap every area onto the taxonomy so downstream consumers never see
      // a key outside shared/homeSystems.ts.
      const lines = input.lines.map((l) => ({ ...l, areaKey: normalizeToSystem(l.areaKey) }));
      await d
        .update(priorityTranslations)
        .set({ captureLinesJson: lines, updatedAt: new Date() })
        .where(eq(priorityTranslations.id, input.id));
      return { count: lines.length };
    }),

  /** Run the AI over photos + notes. Returns when the draft is ready. */
  generate: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input }) => {
      try {
        await generateMiniRoadmap(input.id);
        return { ok: true };
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  /** Consultant edits to the draft while it is awaiting review. */
  updateDraftResponse: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
      summary: z.string().min(1).max(4000),
      executiveSummary: z.string().max(8000).optional(),
      closing: z.string().max(4000).optional(),
      findings: z.array(findingSchema).min(1).max(10),
    }))
    .mutation(async ({ input }) => {
      const { d, row } = await loadSpotRow(input.id);
      if (row.status !== "awaiting_review") {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Only a draft awaiting review can be edited" });
      }
      const prev = (row.claudeResponse ?? {}) as ClaudePriorityTranslationResponse;
      const next: ClaudePriorityTranslationResponse = {
        ...prev,
        summary_1_paragraph: input.summary,
        executive_summary: input.executiveSummary ?? prev.executive_summary,
        closing: input.closing ?? prev.closing,
        findings: input.findings,
      };
      await d
        .update(priorityTranslations)
        .set({ claudeResponse: next, updatedAt: new Date() })
        .where(eq(priorityTranslations.id, input.id));
      return { ok: true };
    }),

  /** The human gate: approve and deliver to portal + email. */
  approveAndDeliver: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      try {
        return await approveAndDeliver(input.id, { approvedBy: String(ctx.user?.id ?? "staff") });
      } catch (err) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as Error).message });
      }
    }),

  /**
   * Turn interest into a real scope: mint the opportunity for the wizard.
   * The structured seed (spotFindingsJson) carries everything downstream —
   * areas, ranges, interpretation, photos — so the wizard preloads instead
   * of restarting from scratch. Notes keep the flat text for reference.
   */
  createOpportunityFromFindings: protectedProcedure
    .input(z.object({
      id: z.string().min(1),
      opportunityId: z.string().min(4).max(64),
      findingIndexes: z.array(z.number().int().min(0)).min(1),
    }))
    .mutation(async ({ input }) => {
      const { d, row } = await loadSpotRow(input.id);
      if (!row.hpCustomerId) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "No CRM customer linked" });
      const draft = row.claudeResponse as ClaudePriorityTranslationResponse | null;
      const allFindings = draft?.findings ?? [];
      const picked = input.findingIndexes
        .filter((i) => i >= 0 && i < allFindings.length)
        .sort((a, b) => a - b);
      const findings = picked.map((i) => allFindings[i]);
      if (findings.length === 0) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Pick at least one finding" });
      const customer = await getCustomerById(row.hpCustomerId).catch(() => null);

      const [prop] = await d
        .select()
        .from(portalProperties)
        .where(eq(portalProperties.id, row.propertyId))
        .limit(1);
      const street = prop?.street?.trim() || customer?.street?.trim() || "";

      // Photos per finding: a line's photos belong to its finding (the
      // prompt keeps line order); explicit findingIndex is the fallback.
      const photos = (row.capturedPhotosJson ?? []) as SpotInspectionPhoto[];
      const lineIndexById = new Map<string, number>(
        ((row.captureLinesJson ?? []) as SpotCaptureLine[]).map((line, i) => [line.id, i]),
      );
      const photoUrlsByFinding = new Map<number, string[]>();
      for (const photo of photos) {
        let idx: number | null = null;
        if (photo.lineId != null && lineIndexById.has(photo.lineId)) idx = lineIndexById.get(photo.lineId)!;
        else if (photo.findingIndex != null) idx = photo.findingIndex;
        if (idx == null) continue;
        photoUrlsByFinding.set(idx, [...(photoUrlsByFinding.get(idx) ?? []), photo.url]);
      }

      // Title from the areas involved: "Roof and gutters + Plumbing - 1234 Main St".
      const areaLabels = [...new Set(
        findings.map((f) => homeSystemLabel(normalizeToSystem(f.area_key ?? f.category))),
      )].slice(0, 3);
      const title = [areaLabels.join(" + ") || "Spot inspection work", street].filter(Boolean).join(" - ");

      const seed = {
        spotInspectionId: row.id,
        crmPropertyId: row.crmPropertyId ?? null,
        findings: picked.map((i) => {
          const f = allFindings[i];
          return {
            areaKey: normalizeToSystem(f.area_key ?? f.category),
            category: f.category,
            finding: f.finding,
            interpretation: f.interpretation,
            recommended_approach: f.recommended_approach,
            urgency: f.urgency,
            low: f.investment_range_low_usd,
            high: f.investment_range_high_usd,
            photoUrls: photoUrlsByFinding.get(i) ?? [],
          };
        }),
      };

      const attachments = photos
        .filter((p) => {
          const idx = p.lineId != null && lineIndexById.has(p.lineId)
            ? lineIndexById.get(p.lineId)!
            : p.findingIndex ?? null;
          return idx != null && picked.includes(idx);
        })
        .map((p) => ({
          id: p.fileKey,
          name: p.caption?.trim() || p.fileKey.split("/").pop() || "Spot inspection photo",
          url: p.url,
          mimeType: "image/jpeg",
          size: 0,
          uploadedAt: new Date().toISOString(),
        }));

      const clientSnapshot = {
        client: customer?.displayName ?? "",
        companyName: customer?.company ?? "",
        phone: customer?.mobilePhone ?? "",
        email: customer?.email ?? "",
        address: street,
        city: prop?.city ?? customer?.city ?? "",
        state: prop?.state ?? customer?.state ?? "WA",
        zip: prop?.zip ?? customer?.zip ?? "",
        jobType: "",
        scope: title,
      };

      const notes = [
        `From spot inspection ${row.id} (${new Date(row.createdAt).toLocaleDateString("en-US")}).`,
        ``,
        ...findings.map(
          (f) =>
            `${f.urgency}: ${f.category}. ${f.finding} Planning range $${f.investment_range_low_usd.toLocaleString()} to $${f.investment_range_high_usd.toLocaleString()}.`,
        ),
      ].join("\n");

      await createOpportunity({
        id: input.opportunityId,
        customerId: row.hpCustomerId,
        area: "estimate",
        stage: "Draft",
        title,
        notes,
        value: 0,
        propertyId: row.crmPropertyId ?? undefined,
        propertyIdSource: row.crmPropertyId ? "manual" : undefined,
        clientSnapshot: JSON.stringify(clientSnapshot),
        attachments: attachments.length > 0 ? JSON.stringify(attachments) : undefined,
        spotFindingsJson: JSON.stringify(seed),
      });
      // Return the seed + client snapshot so the caller can hydrate local
      // state immediately (the wizard preloads from opp.spotFindings; a DB
      // re-sync would otherwise be a race against the prefill effect).
      return {
        opportunityId: input.opportunityId,
        title,
        spotFindings: seed,
        crmPropertyId: row.crmPropertyId ?? null,
        clientSnapshot,
      };
    }),

  /**
   * Delivered PDF bytes for the staff "Open the PDF" link. The stored
   * Cloudinary raw URL 401s on direct access (the account requires signed
   * delivery for raw assets), so the server fetches it: stored URL first,
   * then signed candidates (with-extension public_id, then legacy
   * extensionless). Mirrors closeFlow.getRoadmapPdf and portal.getDocumentFile.
   */
  getDeliveredPdf: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input }) => {
      const { row } = await loadSpotRow(input.id);
      if (!row.outputPdfPath) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No PDF on file for this inspection yet" });
      }
      const tryFetch = async (u: string) => {
        const res = await fetch(u);
        if (!res.ok) return { ok: false as const, status: res.status };
        return { ok: true as const, buf: Buffer.from(await res.arrayBuffer()) };
      };
      let result = await tryFetch(row.outputPdfPath);
      if (!result.ok) {
        try {
          const { storageGet } = await import("../storage");
          const signed = await storageGet(`spot-inspections/${input.id}.pdf`, "raw");
          for (const candidate of signed.candidateUrls) {
            result = await tryFetch(candidate);
            if (result.ok) break;
          }
        } catch { /* fall through to the original error */ }
      }
      if (!result.ok) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message: `The document host refused to serve the PDF (HTTP ${result.status}).`,
        });
      }
      return { base64: result.buf.toString("base64"), mimeType: "application/pdf" };
    }),
});
