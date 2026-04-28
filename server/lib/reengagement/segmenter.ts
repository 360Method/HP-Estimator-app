/**
 * Reactivation segmentation.
 *
 * Buckets every customer into one of:
 *   HOT   last paid invoice within 6 months
 *   WARM  last paid invoice 6–24 months ago
 *   COLD  last paid invoice 24+ months ago, or no invoice at all (created in HCP era)
 *
 * Skip rules (returned as { skipped: true, reason }):
 *   doNotService = true                  hard opt-out
 *   sendMarketingOptIn = false AND email/phone empty
 *   no email AND no phone
 */
import { getDb } from "../../db";
import { customers, invoices, invoiceLineItems, opportunities } from "../../../drizzle/schema";
import { and, desc, eq, inArray, isNotNull, ne, sql } from "drizzle-orm";

export type Segment = "hot" | "warm" | "cold";

export type CustomerHistory = {
  customerId: string;
  firstName: string;
  lastName: string;
  email: string;
  mobilePhone: string;
  segment: Segment;
  lastWorkDate: string | null; // ISO date of most recent paid invoice
  lastWorkSummary: string; // short human description of last work
  lifetimeValueCents: number;
  invoiceCount: number;
  /** Up to 5 line-item descriptions across the customer's history, newest first */
  pastWorkBullets: string[];
  /** Recent opportunity titles (estimates / jobs) for additional context */
  recentProjects: { title: string; stage: string; date: string }[];
};

export type SkipResult = { skipped: true; reason: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const SIX_MONTHS_MS = 182 * DAY_MS;
const TWENTY_FOUR_MONTHS_MS = 730 * DAY_MS;

function bucketize(lastWorkMs: number | null): Segment {
  if (lastWorkMs === null) return "cold";
  const age = Date.now() - lastWorkMs;
  if (age <= SIX_MONTHS_MS) return "hot";
  if (age <= TWENTY_FOUR_MONTHS_MS) return "warm";
  return "cold";
}

/**
 * Loads full history for a single customer and returns either the segmented
 * record or a skip reason.
 */
export async function buildCustomerHistory(
  customerId: string,
): Promise<CustomerHistory | SkipResult> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  const [customer] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerId))
    .limit(1);
  if (!customer) return { skipped: true, reason: "customer not found" };

  if (customer.doNotService) return { skipped: true, reason: "doNotService" };
  if (!customer.email && !customer.mobilePhone) {
    return { skipped: true, reason: "no email and no phone" };
  }

  // Most recent paid invoices for this customer, newest first
  const paidInvoices = await db
    .select()
    .from(invoices)
    .where(and(eq(invoices.customerId, customerId), eq(invoices.status, "paid")))
    .orderBy(desc(invoices.issuedAt))
    .limit(20);

  let lastWorkMs: number | null = null;
  let lastWorkDate: string | null = null;
  let lastWorkSummary = "";
  let lifetimeValueCents = 0;
  for (const inv of paidInvoices) {
    lifetimeValueCents += inv.total ?? 0;
    if (lastWorkMs === null && inv.paidAt) {
      const ms = Date.parse(inv.paidAt);
      if (!Number.isNaN(ms)) {
        lastWorkMs = ms;
        lastWorkDate = inv.paidAt;
      }
    }
  }
  // Fall back to any invoice issuedAt if no paid date
  if (lastWorkMs === null && paidInvoices.length > 0) {
    const ms = Date.parse(paidInvoices[0]!.issuedAt);
    if (!Number.isNaN(ms)) {
      lastWorkMs = ms;
      lastWorkDate = paidInvoices[0]!.issuedAt;
    }
  }

  // Pull line items from the 3 most recent invoices for past-work bullets
  const recentInvoiceIds = paidInvoices.slice(0, 3).map((i) => i.id);
  let pastWorkBullets: string[] = [];
  if (recentInvoiceIds.length > 0) {
    const lineRows = await db
      .select()
      .from(invoiceLineItems)
      .where(inArray(invoiceLineItems.invoiceId, recentInvoiceIds))
      .limit(15);
    pastWorkBullets = lineRows
      .map((li) => (li.description ?? "").trim())
      .filter((s) => s.length > 0)
      .slice(0, 5);
  }

  if (pastWorkBullets[0]) lastWorkSummary = pastWorkBullets[0].slice(0, 200);

  // Opportunities (jobs / estimates) — gives us project titles even when no invoice exists
  const opps = await db
    .select()
    .from(opportunities)
    .where(eq(opportunities.customerId, customerId))
    .orderBy(desc(opportunities.createdAt))
    .limit(5);
  const recentProjects = opps.map((o) => ({
    title: o.title || "Project",
    stage: o.stage || "",
    date: (o.wonAt ?? o.sentAt ?? "").toString(),
  }));

  // If we still have nothing, fall back to opportunity title for last-work summary
  if (!lastWorkSummary && recentProjects[0]) {
    lastWorkSummary = recentProjects[0].title;
  }
  if (!lastWorkDate && opps[0]?.wonAt) {
    lastWorkDate = opps[0].wonAt;
    lastWorkMs = Date.parse(opps[0].wonAt);
    if (Number.isNaN(lastWorkMs)) lastWorkMs = null;
  }

  const segment = bucketize(lastWorkMs);

  return {
    customerId,
    firstName: customer.firstName,
    lastName: customer.lastName,
    email: customer.email,
    mobilePhone: customer.mobilePhone,
    segment,
    lastWorkDate,
    lastWorkSummary: lastWorkSummary || "previous home services",
    lifetimeValueCents,
    invoiceCount: paidInvoices.length,
    pastWorkBullets,
    recentProjects,
  };
}

/**
 * Segments every customer (or a filtered subset) and returns counts per bucket.
 * Use ?leadSource='HCP'/'hcp'/'housecall' to filter to the imported cohort.
 */
export async function segmentAll(opts?: {
  leadSourceLike?: string;
  customerIds?: string[];
}): Promise<{
  hot: CustomerHistory[];
  warm: CustomerHistory[];
  cold: CustomerHistory[];
  skipped: { customerId: string; reason: string }[];
}> {
  const db = await getDb();
  if (!db) throw new Error("Database not available");

  let rows;
  if (opts?.customerIds && opts.customerIds.length > 0) {
    rows = await db.select({ id: customers.id }).from(customers).where(inArray(customers.id, opts.customerIds));
  } else if (opts?.leadSourceLike) {
    rows = await db
      .select({ id: customers.id })
      .from(customers)
      .where(sql`LOWER(${customers.leadSource}) LIKE ${"%" + opts.leadSourceLike.toLowerCase() + "%"}`);
  } else {
    rows = await db.select({ id: customers.id }).from(customers);
  }

  const out = {
    hot: [] as CustomerHistory[],
    warm: [] as CustomerHistory[],
    cold: [] as CustomerHistory[],
    skipped: [] as { customerId: string; reason: string }[],
  };

  for (const r of rows) {
    const h = await buildCustomerHistory(r.id);
    if ("skipped" in h) {
      out.skipped.push({ customerId: r.id, reason: h.reason });
      continue;
    }
    out[h.segment].push(h);
  }
  return out;
}
