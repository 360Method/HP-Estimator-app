/**
 * Leads router — unified read-side for the operator-facing Leads inbox.
 *
 * One query returns every active lead (area='lead', archived=false) joined
 * with the customer info the inbox row needs to render: display name, primary
 * contact, derived source label, age bucket, assigned operator, online-request
 * payload (timeline + photos + read state), and the most recent pipeline event.
 *
 * The Pro app's old "Requests" page has been folded into this list — every
 * lead source (online booking, Roadmap Generator/Priority Translation,
 * inbound call, missed call, manual, 360° intent, baseline walkthrough)
 * already creates an opportunity row, so this router simply joins the
 * surrounding context onto that single source of truth.
 */
import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  opportunities,
  customers,
  onlineRequests,
  users,
  type DbOpportunity,
  type DbCustomer,
  type OnlineRequest,
} from "../../drizzle/schema";
import { priorityTranslations, portalAccounts } from "../../drizzle/schema.priorityTranslation";

// ─── Types ────────────────────────────────────────────────────────────────────
export type LeadSourceLabel =
  | "Online Request"
  | "Roadmap Generator"
  | "Inbound Call"
  | "Missed Call"
  | "Voicemail"
  | "Membership Intent"
  | "Baseline Walkthrough"
  | "Manual"
  | "Contact Form"
  | "Referral"
  | "Other";

export interface LeadRow {
  id: string;
  customerId: string;
  customerName: string;
  customerCompany: string;
  customerEmail: string;
  customerPhone: string;
  city: string;
  state: string;
  zip: string;
  title: string;
  notes: string;
  stage: string;
  value: number; // cents
  source: LeadSourceLabel;
  sourceDetail: string;
  assignedUserId: number | null;
  assignedRole: string | null;
  assignedUserName: string | null;
  // Online-request payload (when sourced from /book)
  onlineRequestId: number | null;
  onlineRequestTimeline: string | null;
  onlineRequestPhotoUrls: string[];
  onlineRequestReadAt: string | null;
  // Has a Roadmap (Priority Translation) deliverable
  hasRoadmap: boolean;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ─── Source derivation ────────────────────────────────────────────────────────
// The opportunity row doesn't carry a structured source; we infer it from the
// linked online_request, the customer's leadSource label, and the notes blob.
function deriveSource(
  opp: DbOpportunity,
  customer: DbCustomer | null,
  request: OnlineRequest | null,
): { source: LeadSourceLabel; detail: string } {
  if (request) {
    return {
      source: "Online Request",
      detail: request.serviceType || "via /book",
    };
  }
  const ls = (customer?.leadSource ?? "").toLowerCase();
  if (ls.includes("online")) return { source: "Online Request", detail: customer?.leadSource ?? "" };
  if (ls.includes("roadmap") || ls.includes("priority")) return { source: "Roadmap Generator", detail: customer?.leadSource ?? "" };
  if (ls.includes("missed")) return { source: "Missed Call", detail: customer?.leadSource ?? "" };
  if (ls.includes("voicemail")) return { source: "Voicemail", detail: customer?.leadSource ?? "" };
  if (ls.includes("call")) return { source: "Inbound Call", detail: customer?.leadSource ?? "" };
  if (ls.includes("baseline")) return { source: "Baseline Walkthrough", detail: customer?.leadSource ?? "" };
  if (ls.includes("membership") || ls.includes("360")) return { source: "Membership Intent", detail: customer?.leadSource ?? "" };
  if (ls.includes("referral")) return { source: "Referral", detail: customer?.leadSource ?? "" };
  if (ls.includes("contact")) return { source: "Contact Form", detail: customer?.leadSource ?? "" };
  // Notes-based heuristic — older booking/automation paths put the source in notes
  const notes = (opp.notes ?? "").toLowerCase();
  if (notes.includes("online request") || notes.includes("/book")) return { source: "Online Request", detail: "" };
  if (notes.includes("roadmap") || notes.includes("priority translation")) return { source: "Roadmap Generator", detail: "" };
  if (notes.includes("missed call")) return { source: "Missed Call", detail: "" };
  if (notes.includes("voicemail")) return { source: "Voicemail", detail: "" };
  return { source: "Manual", detail: customer?.leadSource ?? "" };
}

function safeJsonArray(raw: unknown): string[] {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw as string[];
  try {
    const v = JSON.parse(raw as string);
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function isoOr(s: unknown): string {
  if (s instanceof Date) return s.toISOString();
  if (typeof s === "string" && s) return s;
  return new Date().toISOString();
}

// ─── Router ───────────────────────────────────────────────────────────────────
export const leadsRouter = router({
  /**
   * Unified leads inbox. Returns every non-archived `area='lead'` opportunity
   * with the surrounding context the inbox row needs. Sort order: newest first.
   */
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().int().min(1).max(500).default(200),
          source: z.string().optional(),
          stage: z.string().optional(),
          assignedUserId: z.number().int().optional(),
        })
        .optional(),
    )
    .query(async ({ input }): Promise<LeadRow[]> => {
      const db = await getDb();
      if (!db) return [];

      const limit = input?.limit ?? 200;

      // Single round trip for opportunities (filtered server-side where cheap).
      const oppRows: DbOpportunity[] = await db
        .select()
        .from(opportunities)
        .where(and(eq(opportunities.area, "lead"), eq(opportunities.archived, false)))
        .orderBy(desc(opportunities.createdAt))
        .limit(limit);

      if (oppRows.length === 0) return [];

      const customerIds = Array.from(new Set(oppRows.map((o) => o.customerId)));
      const requestIds = Array.from(
        new Set(oppRows.map((o) => o.onlineRequestId).filter((v): v is number => v != null)),
      );
      const userIds = Array.from(
        new Set(oppRows.map((o) => o.assignedUserId).filter((v): v is number => v != null)),
      );

      const [custRows, reqRows, userRows, ptRows] = await Promise.all([
        customerIds.length
          ? db.select().from(customers).where(inArray(customers.id, customerIds))
          : Promise.resolve([] as DbCustomer[]),
        requestIds.length
          ? db.select().from(onlineRequests).where(inArray(onlineRequests.id, requestIds))
          : Promise.resolve([] as OnlineRequest[]),
        userIds.length
          ? db.select().from(users).where(inArray(users.id, userIds))
          : Promise.resolve([] as Array<typeof users.$inferSelect>),
        // Priority Translation lookup so we can flag "has Roadmap" on each row
        customerIds.length
          ? db
              .select({
                customerId: portalAccounts.customerId,
                ptId: priorityTranslations.id,
                status: priorityTranslations.status,
              })
              .from(priorityTranslations)
              .innerJoin(portalAccounts, eq(priorityTranslations.portalAccountId, portalAccounts.id))
              .where(inArray(portalAccounts.customerId, customerIds))
          : Promise.resolve([] as Array<{ customerId: string | null; ptId: string; status: string | null }>),
      ]);

      const custById = new Map(custRows.map((c) => [c.id, c]));
      const reqById = new Map(reqRows.map((r) => [r.id, r]));
      const userById = new Map(userRows.map((u) => [u.id, u]));
      const roadmapByCustomer = new Set(
        ptRows.filter((p) => p.customerId).map((p) => p.customerId as string),
      );

      const rows: LeadRow[] = oppRows.map((opp) => {
        const customer = custById.get(opp.customerId) ?? null;
        const request = opp.onlineRequestId ? reqById.get(opp.onlineRequestId) ?? null : null;
        const assignedUser = opp.assignedUserId ? userById.get(opp.assignedUserId) ?? null : null;
        const { source, detail } = deriveSource(opp, customer, request);
        const customerName =
          customer?.displayName?.trim() ||
          [customer?.firstName, customer?.lastName].filter(Boolean).join(" ").trim() ||
          customer?.company?.trim() ||
          customer?.email?.trim() ||
          "(unknown)";

        return {
          id: opp.id,
          customerId: opp.customerId,
          customerName,
          customerCompany: customer?.company ?? "",
          customerEmail: customer?.email ?? "",
          customerPhone: customer?.mobilePhone || customer?.homePhone || customer?.workPhone || "",
          city: customer?.city ?? "",
          state: customer?.state ?? "",
          zip: customer?.zip ?? "",
          title: opp.title ?? "",
          notes: opp.notes ?? "",
          stage: opp.stage ?? "New Lead",
          value: opp.value ?? 0,
          source,
          sourceDetail: detail,
          assignedUserId: opp.assignedUserId ?? null,
          assignedRole: opp.assignedRole ?? null,
          assignedUserName: assignedUser?.email ?? null,
          onlineRequestId: opp.onlineRequestId ?? null,
          onlineRequestTimeline: request?.timeline ?? null,
          onlineRequestPhotoUrls: safeJsonArray(request?.photoUrls),
          onlineRequestReadAt: request?.readAt ? isoOr(request.readAt) : null,
          hasRoadmap: roadmapByCustomer.has(opp.customerId),
          createdAt: isoOr(opp.createdAt),
          updatedAt: isoOr(opp.updatedAt),
        };
      });

      // Server-side post-filter (kept simple — list is bounded by limit).
      return rows.filter((r) => {
        if (input?.source && r.source !== input.source) return false;
        if (input?.stage && r.stage !== input.stage) return false;
        if (input?.assignedUserId != null && r.assignedUserId !== input.assignedUserId) return false;
        return true;
      });
    }),

  /**
   * Counts for the operator dashboard — total active, new in last 24h, unread
   * online-requests still waiting on review.
   */
  counts: protectedProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { total: 0, newLast24h: 0, unreadRequests: 0 };

    const opps = await db
      .select({ id: opportunities.id, createdAt: opportunities.createdAt })
      .from(opportunities)
      .where(and(eq(opportunities.area, "lead"), eq(opportunities.archived, false)));

    const reqs = await db
      .select({ id: onlineRequests.id })
      .from(onlineRequests)
      .where(isNull(onlineRequests.readAt));

    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    const newLast24h = opps.filter((o) => {
      const t = o.createdAt instanceof Date ? o.createdAt.getTime() : new Date(o.createdAt as any).getTime();
      return Number.isFinite(t) && t >= cutoff;
    }).length;

    return {
      total: opps.length,
      newLast24h,
      unreadRequests: reqs.length,
    };
  }),

  /**
   * Mark the underlying online_request (if any) as read when the operator
   * opens the lead. Idempotent — safe to call repeatedly.
   */
  markOnlineRequestRead: protectedProcedure
    .input(z.object({ opportunityId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { success: false };
      const rows = await db
        .select()
        .from(opportunities)
        .where(eq(opportunities.id, input.opportunityId))
        .limit(1);
      const opp = rows[0];
      if (!opp?.onlineRequestId) return { success: true };
      await db
        .update(onlineRequests)
        .set({ readAt: new Date() })
        .where(eq(onlineRequests.id, opp.onlineRequestId));
      return { success: true };
    }),

  /**
   * Pull the Priority Translation (Roadmap) deliverables linked to a specific
   * customer. Drives the Roadmap section of the customer profile.
   */
  roadmapsForCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db
        .select({
          id: priorityTranslations.id,
          status: priorityTranslations.status,
          createdAt: priorityTranslations.createdAt,
          deliveredAt: priorityTranslations.deliveredAt,
          notes: priorityTranslations.notes,
          reportUrl: priorityTranslations.reportUrl,
          pdfStoragePath: priorityTranslations.pdfStoragePath,
          accountEmail: portalAccounts.email,
          accountFirstName: portalAccounts.firstName,
        })
        .from(priorityTranslations)
        .innerJoin(portalAccounts, eq(priorityTranslations.portalAccountId, portalAccounts.id))
        .where(eq(portalAccounts.customerId, input.customerId))
        .orderBy(desc(priorityTranslations.createdAt))
        .limit(10);
      return rows.map((r) => ({
        ...r,
        createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt ?? ""),
        deliveredAt: r.deliveredAt instanceof Date ? r.deliveredAt.toISOString() : (r.deliveredAt ?? null),
      }));
    }),
});

export type LeadsRouter = typeof leadsRouter;
