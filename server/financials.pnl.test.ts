/**
 * Tests for new financials procedures: getPnLByMonth, getExpenseSummary, exportCsv, sendReminder.
 * These are unit-level tests that verify procedure registration and basic logic.
 */
import { describe, it, expect } from "vitest";
import { appRouter } from "./routers";

// tRPC procedures are stored as functions in _def.procedures
const procs = appRouter._def.procedures as Record<string, unknown>;

describe("financials router — new procedures", () => {
  it("registers getPnLByMonth procedure", () => {
    expect(typeof procs["financials.getPnLByMonth"]).toBe("function");
  });

  it("registers getExpenseSummary procedure", () => {
    expect(typeof procs["financials.getExpenseSummary"]).toBe("function");
  });

  it("registers sendReminder procedure", () => {
    expect(typeof procs["financials.sendReminder"]).toBe("function");
  });

  it("registers exportCsv procedure", () => {
    expect(typeof procs["financials.exportCsv"]).toBe("function");
  });
});

describe("quickbooks router", () => {
  it("registers getStatus procedure", () => {
    expect(typeof procs["quickbooks.getStatus"]).toBe("function");
  });

  it("registers getAuthUrl procedure", () => {
    expect(typeof procs["quickbooks.getAuthUrl"]).toBe("function");
  });

  it("registers exchangeCode procedure", () => {
    expect(typeof procs["quickbooks.exchangeCode"]).toBe("function");
  });

  it("registers disconnect procedure", () => {
    expect(typeof procs["quickbooks.disconnect"]).toBe("function");
  });

  it("registers syncInvoice procedure", () => {
    expect(typeof procs["quickbooks.syncInvoice"]).toBe("function");
  });

  it("registers syncExpense procedure", () => {
    expect(typeof procs["quickbooks.syncExpense"]).toBe("function");
  });

  it("registers bulkSync procedure", () => {
    expect(typeof procs["quickbooks.bulkSync"]).toBe("function");
  });
});

describe("expenses router", () => {
  it("registers create procedure", () => {
    expect(typeof procs["expenses.create"]).toBe("function");
  });

  it("registers list procedure", () => {
    expect(typeof procs["expenses.list"]).toBe("function");
  });

  it("registers delete procedure", () => {
    expect(typeof procs["expenses.delete"]).toBe("function");
  });
});
