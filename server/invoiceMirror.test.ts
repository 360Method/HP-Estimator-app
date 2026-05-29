import { describe, expect, it } from "vitest";
import { buildMirroredPortalInvoice, mapInvoiceStatus } from "./lib/invoiceMirror";

const proFinal = {
  id: "inv_123",
  type: "final" as const,
  status: "due",
  invoiceNumber: "INV-2026-007",
  total: 480000,
  amountPaid: 0,
  dueDate: "2026-06-15",
  paidAt: null,
};

describe("mapInvoiceStatus", () => {
  it("passes through portal-valid statuses", () => {
    expect(mapInvoiceStatus("paid")).toBe("paid");
    expect(mapInvoiceStatus("partial")).toBe("partial");
    expect(mapInvoiceStatus("due")).toBe("due");
  });
  it("maps pending_signoff (pro-only) to sent", () => {
    expect(mapInvoiceStatus("pending_signoff")).toBe("sent");
  });
  it("falls back unknown statuses to sent", () => {
    expect(mapInvoiceStatus("weird")).toBe("sent");
  });
});

describe("buildMirroredPortalInvoice", () => {
  it("maps a pro final invoice to a portal invoice linked by hpInvoiceId", () => {
    const out = buildMirroredPortalInvoice(proFinal, 55, "Smith bathroom");
    expect(out.hpInvoiceId).toBe("inv_123");
    expect(out.customerId).toBe(55);
    expect(out.type).toBe("final");
    expect(out.invoiceNumber).toBe("INV-2026-007");
    expect(out.amountDue).toBe(480000);
    expect(out.amountPaid).toBe(0);
    expect(out.status).toBe("due");
    expect(out.jobTitle).toBe("Smith bathroom");
    expect(out.dueDate).toBeInstanceOf(Date);
    expect(out.paidAt).toBeUndefined();
  });
  it("carries paid state through", () => {
    const out = buildMirroredPortalInvoice(
      { ...proFinal, status: "paid", amountPaid: 480000, paidAt: "2026-06-10" },
      55,
    );
    expect(out.status).toBe("paid");
    expect(out.amountPaid).toBe(480000);
    expect(out.paidAt).toBeInstanceOf(Date);
  });
});
