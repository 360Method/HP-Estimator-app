/**
 * estimateApproval lib tests — the shared approval pipeline must behave
 * identically for the portal channel (zero behavior change from the old
 * inline portal.approveEstimate) and persist the attestation for the
 * in-person channel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../portalDb", () => ({
  getPortalEstimateById: vi.fn(),
  updatePortalEstimateStatus: vi.fn(),
  createPortalInvoice: vi.fn(),
}));
vi.mock("../db", () => ({ updateOpportunity: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../gmail", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));
vi.mock("../storage", () => ({
  storagePut: vi.fn().mockResolvedValue({ url: "https://cdn.example.com/sig.png" }),
}));
vi.mock("../sse", () => ({ broadcastOpportunityUpdate: vi.fn() }));
vi.mock("../automationEngine", () => ({
  runAutomationsForTrigger: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../routers/appSettings", () => ({
  getOrCreateAppSettings: vi.fn().mockResolvedValue(null),
}));

import * as portalDb from "../portalDb";
import { updateOpportunity } from "../db";
import { notifyOwner } from "../_core/notification";
import { broadcastOpportunityUpdate } from "../sse";
import { approvePortalEstimate } from "./estimateApproval";

const customer = { id: 1, name: "Pat Member", email: "pat@example.com", phone: null };

function mockEstimate(overrides: Record<string, unknown> = {}) {
  return {
    id: 10,
    customerId: 1,
    estimateNumber: "EST-001",
    hpOpportunityId: "opp-1",
    title: "Kitchen Reno",
    status: "sent",
    totalAmount: 150000,
    depositAmount: 75000,
    lineItemsJson: null,
    ...overrides,
  } as any;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(portalDb.getPortalEstimateById).mockResolvedValue(mockEstimate());
  vi.mocked(portalDb.createPortalInvoice).mockResolvedValue({ id: 20 } as any);
});

describe("approvePortalEstimate (portal channel)", () => {
  it("approves, creates the deposit invoice, and marks the opportunity Won", async () => {
    const result = await approvePortalEstimate({
      estimateId: 10,
      signerName: "Pat Member",
      signatureDataUrl: "data:image/png;base64,AAAA",
      channel: "portal",
      portalCustomer: customer,
    });

    expect(portalDb.updatePortalEstimateStatus).toHaveBeenCalledWith(10, "approved", expect.objectContaining({
      signerName: "Pat Member",
      approvalChannel: "portal",
    }));
    // Portal approvals carry no attestation
    const extra = vi.mocked(portalDb.updatePortalEstimateStatus).mock.calls[0][2] as any;
    expect(extra.approvalAttestation).toBeUndefined();

    expect(portalDb.createPortalInvoice).toHaveBeenCalledWith(expect.objectContaining({
      invoiceNumber: "DEP-EST-001",
      type: "deposit",
      amountDue: 75000,
    }));
    expect(updateOpportunity).toHaveBeenCalledWith("opp-1", expect.objectContaining({ stage: "Won" }));
    expect(broadcastOpportunityUpdate).toHaveBeenCalledWith("opp-1", expect.objectContaining({ stage: "Won" }));
    expect(result.depositInvoice).toEqual({ id: 20 });
  });

  it("skips the deposit invoice when the deposit is zero", async () => {
    vi.mocked(portalDb.getPortalEstimateById).mockResolvedValue(mockEstimate({ depositAmount: 0 }));
    const result = await approvePortalEstimate({
      estimateId: 10,
      signerName: "Pat Member",
      signatureDataUrl: "data:image/png;base64,AAAA",
      channel: "portal",
      portalCustomer: customer,
    });
    expect(portalDb.createPortalInvoice).not.toHaveBeenCalled();
    expect(result.depositInvoice).toBeNull();
  });

  it("rejects an estimate that is already approved", async () => {
    vi.mocked(portalDb.getPortalEstimateById).mockResolvedValue(mockEstimate({ status: "approved" }));
    await expect(
      approvePortalEstimate({
        estimateId: 10,
        signerName: "Pat Member",
        signatureDataUrl: "data:image/png;base64,AAAA",
        channel: "portal",
        portalCustomer: customer,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when the estimate belongs to a different customer", async () => {
    await expect(
      approvePortalEstimate({
        estimateId: 10,
        signerName: "Pat Member",
        signatureDataUrl: "data:image/png;base64,AAAA",
        channel: "portal",
        portalCustomer: { ...customer, id: 999 },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("approvePortalEstimate (in_person channel)", () => {
  const attestation = {
    witnessUserId: 5,
    witnessName: "Marcin Micek",
    device: "iPad (staging)",
    signedAt: "2026-06-12T18:00:00.000Z",
  };

  it("persists the channel and attestation on the estimate row", async () => {
    await approvePortalEstimate({
      estimateId: 10,
      signerName: "Pat Member",
      signatureDataUrl: "data:image/png;base64,AAAA",
      channel: "in_person",
      attestation,
      portalCustomer: customer,
    });
    expect(portalDb.updatePortalEstimateStatus).toHaveBeenCalledWith(10, "approved", expect.objectContaining({
      approvalChannel: "in_person",
      approvalAttestation: JSON.stringify(attestation),
    }));
  });

  it("names the witness in the owner notification", async () => {
    await approvePortalEstimate({
      estimateId: 10,
      signerName: "Pat Member",
      signatureDataUrl: "data:image/png;base64,AAAA",
      channel: "in_person",
      attestation,
      portalCustomer: customer,
    });
    const call = vi.mocked(notifyOwner).mock.calls[0][0] as any;
    expect(call.content).toContain("signed in person");
    expect(call.content).toContain("Marcin Micek");
  });
});
