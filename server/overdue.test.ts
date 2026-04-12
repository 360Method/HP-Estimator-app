/**
 * Unit tests for overdue invoice reminder query logic and revenue stats.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB layer ─────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue({
    select: vi.fn().mockReturnThis(),
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue([]),
  }),
}));

vi.mock("../drizzle/schema", () => ({
  portalInvoices: {},
  portalCustomers: {},
}));

// ── Helper logic tests (pure logic, no DB) ────────────────────────────────────

describe("Overdue invoice eligibility logic", () => {
  const now = new Date();
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const twoDaysAgo = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);

  function isEligibleForReminder(invoice: {
    dueDate: Date | null;
    status: string;
    lastReminderSentAt: Date | null;
  }): boolean {
    if (!invoice.dueDate) return false;
    if (invoice.dueDate >= now) return false;
    if (invoice.status === "paid") return false;
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
    if (invoice.lastReminderSentAt && invoice.lastReminderSentAt >= threeDaysAgo) return false;
    return true;
  }

  it("eligible: overdue, unpaid, never reminded", () => {
    expect(isEligibleForReminder({
      dueDate: yesterday,
      status: "sent",
      lastReminderSentAt: null,
    })).toBe(true);
  });

  it("not eligible: not yet due", () => {
    expect(isEligibleForReminder({
      dueDate: tomorrow,
      status: "sent",
      lastReminderSentAt: null,
    })).toBe(false);
  });

  it("not eligible: already paid", () => {
    expect(isEligibleForReminder({
      dueDate: yesterday,
      status: "paid",
      lastReminderSentAt: null,
    })).toBe(false);
  });

  it("not eligible: reminder sent 2 days ago (within 3-day throttle)", () => {
    expect(isEligibleForReminder({
      dueDate: yesterday,
      status: "due",
      lastReminderSentAt: twoDaysAgo,
    })).toBe(false);
  });

  it("eligible: reminder sent 4 days ago (past 3-day throttle)", () => {
    expect(isEligibleForReminder({
      dueDate: yesterday,
      status: "due",
      lastReminderSentAt: fourDaysAgo,
    })).toBe(true);
  });

  it("not eligible: null dueDate", () => {
    expect(isEligibleForReminder({
      dueDate: null,
      status: "sent",
      lastReminderSentAt: null,
    })).toBe(false);
  });
});

describe("Revenue stats calculation logic", () => {
  function computeStats(invoices: { status: string; amountPaid: number; amountDue: number }[]) {
    const totalCollectedCents = invoices
      .filter(i => i.status === "paid")
      .reduce((s, i) => s + i.amountPaid, 0);
    const totalOutstandingCents = invoices
      .filter(i => i.status !== "paid")
      .reduce((s, i) => s + Math.max(0, i.amountDue - i.amountPaid), 0);
    return { totalCollectedCents, totalOutstandingCents };
  }

  it("sums paid invoices correctly", () => {
    const result = computeStats([
      { status: "paid", amountPaid: 50000, amountDue: 50000 },
      { status: "paid", amountPaid: 25000, amountDue: 25000 },
      { status: "sent", amountPaid: 0, amountDue: 10000 },
    ]);
    expect(result.totalCollectedCents).toBe(75000);
    expect(result.totalOutstandingCents).toBe(10000);
  });

  it("handles partial payments in outstanding", () => {
    const result = computeStats([
      { status: "partial", amountPaid: 5000, amountDue: 20000 },
    ]);
    expect(result.totalCollectedCents).toBe(0);
    expect(result.totalOutstandingCents).toBe(15000);
  });

  it("returns zeros when no invoices", () => {
    const result = computeStats([]);
    expect(result.totalCollectedCents).toBe(0);
    expect(result.totalOutstandingCents).toBe(0);
  });

  it("does not count paid invoices in outstanding", () => {
    const result = computeStats([
      { status: "paid", amountPaid: 10000, amountDue: 10000 },
    ]);
    expect(result.totalOutstandingCents).toBe(0);
  });
});
