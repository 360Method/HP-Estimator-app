/**
 * quickQuote router: the server side of the Step 8 remodel consultation.
 *
 * sendConsultationToPortal turns the on-site Good / Better / Best moment
 * into a one-page document in the customer's portal: what we are doing,
 * why, how we approach it, and the three investment ranges. Ranges are
 * recomputed server-side from the preset so the document can never drift
 * from the price book. Retail only; nothing internal exists in the output.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, or } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getCustomerById } from "../db";
import { osRemodelQuotePresets, threeSixtyMemberships } from "../../drizzle/schema";
import { computeQuickQuote, presetFromRow } from "../../shared/remodelQuickQuote";
import { TIER_DEFINITIONS, type MemberTier } from "../../shared/threeSixtyTiers";
import { renderConsultationPdf } from "../lib/quickQuote/consultationPdf";
import { storagePut } from "../storage";
import { upsertPortalCustomer, addPortalDocument } from "../portalDb";

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;

export const quickQuoteRouter = router({
  sendConsultationToPortal: protectedProcedure
    .input(
      z.object({
        customerId: z.string().min(1),
        presetId: z.number().int(),
        sqft: z.number().min(1),
        lfByAddon: z.record(z.string(), z.number().min(0)).default({}),
        /** Optional consultant framing of what and why, in their words. */
        consultantIntro: z.string().max(2000).optional(),
      }),
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });

      const customer = await getCustomerById(input.customerId);
      if (!customer) throw new TRPCError({ code: "NOT_FOUND", message: "Customer not found" });
      if (!customer.email?.trim()) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Add an email to this customer first so the consultation can reach their portal.",
        });
      }

      const [row] = await db
        .select()
        .from(osRemodelQuotePresets)
        .where(eq(osRemodelQuotePresets.id, input.presetId))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Preset not found" });
      const preset = presetFromRow(row);
      if (!preset) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Preset is malformed" });

      // Active membership for the savings line (display only).
      let memberTier: MemberTier | null = null;
      try {
        const memberships = await db
          .select({ tier: threeSixtyMemberships.tier, status: threeSixtyMemberships.status })
          .from(threeSixtyMemberships)
          .where(
            or(
              eq(threeSixtyMemberships.hpCustomerId, input.customerId),
              eq(threeSixtyMemberships.customerId, input.customerId),
            ),
          );
        memberTier = (memberships.find((m) => m.status === "active")?.tier ?? null) as MemberTier | null;
      } catch {
        // savings line is a nicety
      }

      const quote = computeQuickQuote(preset, { sqft: input.sqft, lfByAddon: input.lfByAddon }, memberTier);

      const lfParts = preset.lfAddons
        .filter((a) => (input.lfByAddon[a.key] ?? 0) > 0)
        .map((a) => `${input.lfByAddon[a.key]} lf ${a.label.toLowerCase()}`);
      const measurementsLine = [`${input.sqft} sqft floor area`, ...lfParts].join(", ");

      const memberSavings = quote.tiers
        .map((t) => t.memberSavingsLow ?? 0)
        .filter((v) => v > 0);
      const memberLine =
        memberTier && memberSavings.length > 0
          ? `As a ${TIER_DEFINITIONS[memberTier].label} member, your membership saves roughly ${money(Math.min(...memberSavings))} or more on this project, applied when we write the firm price.`
          : undefined;

      const pdf = await renderConsultationPdf({
        customerName: customer.displayName || `${customer.firstName} ${customer.lastName}`.trim(),
        propertyAddress: [customer.street, customer.city].filter(Boolean).join(", ") || "Your home",
        roomLabel: preset.label,
        measurementsLine,
        intro:
          input.consultantIntro?.trim() ||
          `We walked the space together and measured it for a ${preset.label.toLowerCase()}. ${preset.description} The three options below are the same project at three quality levels; the difference is the materials and finish, never the care.`,
        approach:
          "We handle the whole project in order: protect the home, demo, rough work, surfaces, fixtures, and finish, with one team responsible end to end. You will see the full written scope before anything starts, and we keep you posted at every stage.",
        tiers: quote.tiers.map((t) => ({ name: t.name, desc: t.desc, low: t.low, high: t.high })),
        memberLine,
      });

      const fileKey = `remodel-consultations/${input.customerId}-${Date.now()}.pdf`;
      const stored = await storagePut(fileKey, pdf, "application/pdf");

      const portalCustomer = await upsertPortalCustomer({
        hpCustomerId: customer.id,
        name: customer.displayName || `${customer.firstName} ${customer.lastName}`.trim(),
        email: customer.email.trim().toLowerCase(),
        phone: customer.mobilePhone ?? null,
        address: [customer.street, customer.city, customer.state, customer.zip].filter(Boolean).join(", "),
      });
      if (!portalCustomer) {
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Could not open the customer's portal account" });
      }
      await addPortalDocument({
        portalCustomerId: portalCustomer.id,
        name: `Remodel options: ${preset.label}, ${new Date().toLocaleDateString("en-US")}`,
        url: stored.url,
        fileKey: stored.key,
        mimeType: "application/pdf",
      });

      return { pdfUrl: stored.url };
    }),
});
