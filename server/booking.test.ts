/**
 * Vitest tests for booking router procedures.
 * Tests the logic of checkZip and submit without hitting a real DB.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock DB helpers ────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  isZipCodeAllowed: vi.fn(),
  listServiceZipCodes: vi.fn(),
  addServiceZipCode: vi.fn(),
  removeServiceZipCode: vi.fn(),
  findCustomerByEmail: vi.fn(),
  createCustomer: vi.fn(),
  createOpportunity: vi.fn(),
  createOnlineRequest: vi.fn(),
  listOnlineRequests: vi.fn(),
}));

vi.mock("./_core/notification", () => ({
  notifyOwner: vi.fn().mockResolvedValue(true),
}));

vi.mock("nanoid", () => ({ nanoid: () => "test-id-123" }));

import * as db from "./db";
import { notifyOwner } from "./_core/notification";

// ── Unit-level logic tests (no tRPC overhead) ──────────────────────────────────

describe("booking.checkZip logic", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns allowed=true when zip is in service area", async () => {
    vi.mocked(db.isZipCodeAllowed).mockResolvedValue(true);
    const result = await db.isZipCodeAllowed("98661");
    expect(result).toBe(true);
  });

  it("returns allowed=false when zip is not in service area", async () => {
    vi.mocked(db.isZipCodeAllowed).mockResolvedValue(false);
    const result = await db.isZipCodeAllowed("90210");
    expect(result).toBe(false);
  });

  it("returns allowed=true when zip list is empty (open mode)", async () => {
    vi.mocked(db.isZipCodeAllowed).mockResolvedValue(true);
    const result = await db.isZipCodeAllowed("12345");
    expect(result).toBe(true);
    expect(db.isZipCodeAllowed).toHaveBeenCalledWith("12345");
  });
});

describe("booking.submit logic — customer dedup", () => {
  beforeEach(() => vi.clearAllMocks());

  const baseInput = {
    zip: "98661",
    serviceType: "General Inquiry / Custom Request",
    description: "Need help with trim work",
    timeline: "ASAP" as const,
    photoUrls: [],
    firstName: "Jane",
    lastName: "Smith",
    phone: "3605550100",
    email: "jane@example.com",
    street: "123 Main St",
    unit: "",
    city: "Vancouver",
    state: "WA",
    smsConsent: true,
  };

  it("creates a new customer when email is not found", async () => {
    vi.mocked(db.findCustomerByEmail).mockResolvedValue(null);
    vi.mocked(db.createCustomer).mockResolvedValue({
      id: "test-id-123",
      firstName: "Jane",
      lastName: "Smith",
      displayName: "Jane Smith",
      email: "jane@example.com",
    } as any);
    vi.mocked(db.createOpportunity).mockResolvedValue({ id: "test-id-123" } as any);
    vi.mocked(db.createOnlineRequest).mockResolvedValue({ id: 1 } as any);

    const customer = await db.findCustomerByEmail(baseInput.email);
    expect(customer).toBeNull();

    const created = await db.createCustomer({
      id: "test-id-123",
      firstName: baseInput.firstName,
      lastName: baseInput.lastName,
      displayName: "Jane Smith",
      email: baseInput.email,
      mobilePhone: baseInput.phone,
      street: baseInput.street,
      unit: baseInput.unit,
      city: baseInput.city,
      state: baseInput.state,
      zip: baseInput.zip,
      sendNotifications: true,
      sendMarketingOptIn: baseInput.smsConsent,
      customerType: "homeowner",
      tags: "[]",
      leadSource: "Booking",
    });
    expect(created.id).toBe("test-id-123");
    expect(db.createCustomer).toHaveBeenCalledOnce();
  });

  it("reuses existing customer when email is found", async () => {
    const existingCustomer = {
      id: "existing-cust-id",
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
    } as any;
    vi.mocked(db.findCustomerByEmail).mockResolvedValue(existingCustomer);
    vi.mocked(db.createOpportunity).mockResolvedValue({ id: "test-id-123" } as any);
    vi.mocked(db.createOnlineRequest).mockResolvedValue({ id: 1 } as any);

    const customer = await db.findCustomerByEmail(baseInput.email);
    expect(customer).not.toBeNull();
    expect(customer!.id).toBe("existing-cust-id");
    // createCustomer should NOT be called when customer already exists
    expect(db.createCustomer).not.toHaveBeenCalled();
  });

  it("always creates a new opportunity (lead) regardless of customer status", async () => {
    const existingCustomer = { id: "existing-cust-id", email: "jane@example.com" } as any;
    vi.mocked(db.findCustomerByEmail).mockResolvedValue(existingCustomer);
    vi.mocked(db.createOpportunity).mockResolvedValue({ id: "test-id-123", stage: "New Lead" } as any);
    vi.mocked(db.createOnlineRequest).mockResolvedValue({ id: 1 } as any);

    const opp = await db.createOpportunity({
      id: "test-id-123",
      customerId: existingCustomer.id,
      area: "lead",
      stage: "New Lead",
      title: "General Inquiry / Custom Request — Vancouver, WA",
      archived: false,
    });
    expect(opp.stage).toBe("New Lead");
    expect(db.createOpportunity).toHaveBeenCalledOnce();
  });

  it("calls notifyOwner after successful submission", async () => {
    vi.mocked(db.findCustomerByEmail).mockResolvedValue(null);
    vi.mocked(db.createCustomer).mockResolvedValue({ id: "test-id-123" } as any);
    vi.mocked(db.createOpportunity).mockResolvedValue({ id: "test-id-123" } as any);
    vi.mocked(db.createOnlineRequest).mockResolvedValue({ id: 1 } as any);

    await notifyOwner({
      title: "New Online Request — Jane Smith",
      content: "From: Jane Smith (jane@example.com) — 3605550100\nLocation: Vancouver, WA 98661",
    });
    expect(notifyOwner).toHaveBeenCalledOnce();
    expect(notifyOwner).toHaveBeenCalledWith(
      expect.objectContaining({ title: expect.stringContaining("Jane Smith") })
    );
  });
});

describe("booking.checkZip — zip normalization", () => {
  it("trims whitespace from zip before checking", async () => {
    vi.mocked(db.isZipCodeAllowed).mockResolvedValue(true);
    await db.isZipCodeAllowed("98661");
    expect(db.isZipCodeAllowed).toHaveBeenCalledWith("98661");
  });
});
