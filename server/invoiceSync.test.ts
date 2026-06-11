/**
 * invoiceSync unit tests — Phase F #3: portal payment → internal invoice.
 * Covers the two money-safety decisions: which internal invoice a portal
 * payment lands on, and what unit the amount is recorded in.
 */
import { describe, it, expect } from "vitest";
import { matchInternalInvoice, convertPaidCentsToInternalUnit } from "./lib/invoiceSync";

const inv = (id: string, invoiceNumber: string, type: string, status: string) => ({
  id,
  invoiceNumber,
  type,
  status,
});

describe("matchInternalInvoice", () => {
  it("matches a mirrored invoice by number", () => {
    const candidates = [inv("a", "INV-2026-001", "final", "due"), inv("b", "INV-2026-002", "final", "due")];
    expect(matchInternalInvoice(candidates, { invoiceNumber: "inv-2026-002", type: "final" })?.id).toBe("b");
  });

  it("falls back to the type when exactly one open invoice of that type exists", () => {
    const candidates = [inv("a", "INV-001", "deposit", "due"), inv("b", "INV-002", "final", "due")];
    expect(matchInternalInvoice(candidates, { invoiceNumber: "DEP-EST-001", type: "deposit" })?.id).toBe("a");
  });

  it("treats portal 'balance' type as internal 'final'", () => {
    const candidates = [inv("a", "INV-001", "final", "due")];
    expect(matchInternalInvoice(candidates, { invoiceNumber: "BAL-EST-001", type: "balance" })?.id).toBe("a");
  });

  it("returns null when the type match is ambiguous", () => {
    const candidates = [inv("a", "INV-001", "deposit", "due"), inv("b", "INV-002", "deposit", "due")];
    expect(matchInternalInvoice(candidates, { invoiceNumber: "DEP-EST-001", type: "deposit" })).toBeNull();
  });

  it("ignores paid and void invoices", () => {
    const candidates = [
      inv("a", "INV-001", "deposit", "paid"),
      inv("b", "INV-002", "deposit", "void"),
      inv("c", "INV-003", "deposit", "due"),
    ];
    expect(matchInternalInvoice(candidates, { invoiceNumber: "DEP-EST-001", type: "deposit" })?.id).toBe("c");
  });

  it("returns null when nothing is open", () => {
    const candidates = [inv("a", "INV-001", "final", "paid")];
    expect(matchInternalInvoice(candidates, { invoiceNumber: "INV-001", type: "final" })).toBeNull();
  });
});

describe("convertPaidCentsToInternalUnit", () => {
  it("converts cents to dollars when the internal invoice is in dollars", () => {
    // internal total $1,500.00 (dollars) vs portal 150000 cents
    expect(convertPaidCentsToInternalUnit(1500, 150000, 150000)).toBe(1500);
    // partial payment
    expect(convertPaidCentsToInternalUnit(1500, 150000, 75000)).toBe(750);
  });

  it("keeps cents when the internal invoice is in cents", () => {
    expect(convertPaidCentsToInternalUnit(150000, 150000, 150000)).toBe(150000);
  });

  it("returns null when totals don't reconcile under either unit", () => {
    // internal says 999 (dollars? cents?) but portal says 150000 cents
    expect(convertPaidCentsToInternalUnit(999, 150000, 150000)).toBeNull();
  });

  it("returns null on zero or negative inputs", () => {
    expect(convertPaidCentsToInternalUnit(0, 150000, 150000)).toBeNull();
    expect(convertPaidCentsToInternalUnit(1500, 0, 150000)).toBeNull();
    expect(convertPaidCentsToInternalUnit(1500, 150000, 0)).toBeNull();
  });

  it("preserves sub-dollar precision in dollar mode", () => {
    // $1,234.56 internal, 123456 cents portal, paid in full
    expect(convertPaidCentsToInternalUnit(1234.56, 123456, 123456)).toBe(1234.56);
  });
});
