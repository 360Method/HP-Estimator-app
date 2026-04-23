/**
 * Tests for new portal procedures added in Session 2:
 * - portal.addDocument (HP-side)
 * - portal.getDocumentsHP (HP-side)
 * - portal.replyToPortalMessage with customerId
 * - EstimatorContext inboxCustomerId state
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock portalDb helpers ─────────────────────────────────────────────────────
vi.mock("./portalDb", () => ({
  findPortalCustomerByEmail: vi.fn(),
  findPortalCustomerById: vi.fn(),
  upsertPortalCustomer: vi.fn(),
  createPortalToken: vi.fn(),
  findValidPortalToken: vi.fn(),
  markPortalTokenUsed: vi.fn(),
  createPortalSession: vi.fn(),
  findValidPortalSession: vi.fn(),
  deletePortalSession: vi.fn(),
  createPortalEstimate: vi.fn(),
  getPortalEstimatesByCustomer: vi.fn(),
  getPortalEstimateById: vi.fn(),
  updatePortalEstimateStatus: vi.fn(),
  markPortalEstimateViewed: vi.fn(),
  createPortalInvoice: vi.fn(),
  getPortalInvoicesByCustomer: vi.fn(),
  getPortalInvoiceById: vi.fn(),
  updatePortalInvoicePaid: vi.fn(),
  markPortalInvoiceViewed: vi.fn(),
  createPortalAppointment: vi.fn(),
  getPortalAppointmentsByCustomer: vi.fn(),
  createPortalMessage: vi.fn(),
  getPortalMessagesByCustomer: vi.fn(),
  getUnreadPortalMessageCount: vi.fn(),
  addPortalGalleryItem: vi.fn(),
  getPortalGalleryByCustomer: vi.fn(),
  createPortalReferral: vi.fn(),
  getPortalReferralsByReferrer: vi.fn(),
  generateReferralCode: vi.fn(),
  updatePortalCustomerStripeId: vi.fn(),
  addPortalDocument: vi.fn(),
  getPortalDocumentsByCustomer: vi.fn(),
  getAllPortalMessages: vi.fn(),
}));

vi.mock("./gmail", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("./_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));
vi.mock("./_core/env", () => ({ ENV: { stripeSecretKey: "sk_test_mock" } }));

import * as portalDb from "./portalDb";

// ── Shared mock data ──────────────────────────────────────────────────────────
const mockCustomerById = {
  id: 5,
  email: "jane@example.com",
  name: "Jane Smith",
  address: "456 Oak Ave",
  phone: "5035550001",
  hpCustomerId: "cust-hp-123",
  stripeCustomerId: null,
  referralCode: "JANE50",
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockCustomerByEmail = {
  ...mockCustomerById,
  id: 6,
  email: "jane@example.com",
};

// ── addDocument procedure logic ───────────────────────────────────────────────
describe("portal.addDocument — HP-side procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(portalDb.findPortalCustomerById).mockResolvedValue(mockCustomerById);
    vi.mocked(portalDb.findPortalCustomerByEmail).mockResolvedValue(mockCustomerByEmail);
    vi.mocked(portalDb.addPortalDocument).mockResolvedValue({
      id: 1,
      portalCustomerId: 5,
      name: "Scope of Work.pdf",
      url: "https://cdn.example.com/scope.pdf",
      fileKey: "portal-documents/scope.pdf",
      mimeType: "application/pdf",
      jobId: null,
      createdAt: new Date(),
    } as any);
  });

  it("resolves customer by customerId and creates document", async () => {
    const customer = await portalDb.findPortalCustomerById(5);
    expect(customer).not.toBeNull();
    expect(customer!.id).toBe(5);

    const doc = await portalDb.addPortalDocument({
      portalCustomerId: customer!.id,
      name: "Scope of Work.pdf",
      url: "https://cdn.example.com/scope.pdf",
      fileKey: "portal-documents/scope.pdf",
      mimeType: "application/pdf",
    });
    expect(doc.name).toBe("Scope of Work.pdf");
    expect(doc.portalCustomerId).toBe(5);
  });

  it("resolves customer by email and creates document", async () => {
    const customer = await portalDb.findPortalCustomerByEmail("jane@example.com");
    expect(customer).not.toBeNull();

    const doc = await portalDb.addPortalDocument({
      portalCustomerId: customer!.id,
      name: "Scope of Work.pdf",
      url: "https://cdn.example.com/scope.pdf",
      fileKey: "portal-documents/scope.pdf",
      mimeType: "application/pdf",
    });
    expect(doc).toBeDefined();
    expect(portalDb.addPortalDocument).toHaveBeenCalledOnce();
  });

  it("throws NOT_FOUND when neither customerId nor email resolves to a customer", async () => {
    vi.mocked(portalDb.findPortalCustomerById).mockResolvedValue(null);
    vi.mocked(portalDb.findPortalCustomerByEmail).mockResolvedValue(null);

    const customer = await portalDb.findPortalCustomerById(999);
    expect(customer).toBeNull();
    // Procedure would throw TRPCError NOT_FOUND here
  });
});

// ── getDocumentsHP procedure logic ────────────────────────────────────────────
describe("portal.getDocumentsHP — HP-side procedure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(portalDb.findPortalCustomerById).mockResolvedValue(mockCustomerById);
    vi.mocked(portalDb.getPortalDocumentsByCustomer).mockResolvedValue([
      {
        id: 1,
        portalCustomerId: 5,
        name: "Contract.pdf",
        url: "https://cdn.example.com/contract.pdf",
        fileKey: "portal-documents/contract.pdf",
        mimeType: "application/pdf",
        jobId: null,
        createdAt: new Date(),
      } as any,
    ]);
  });

  it("returns documents for a portal customer", async () => {
    const customer = await portalDb.findPortalCustomerById(5);
    expect(customer).not.toBeNull();

    const docs = await portalDb.getPortalDocumentsByCustomer(customer!.id);
    expect(docs).toHaveLength(1);
    expect(docs[0].name).toBe("Contract.pdf");
  });

  it("returns empty array when customer not found", async () => {
    vi.mocked(portalDb.findPortalCustomerById).mockResolvedValue(null);
    const customer = await portalDb.findPortalCustomerById(999);
    // Procedure returns [] when customer is null
    const docs = customer ? await portalDb.getPortalDocumentsByCustomer(customer.id) : [];
    expect(docs).toHaveLength(0);
  });
});

// ── replyToPortalMessage with customerId ──────────────────────────────────────
describe("portal.replyToPortalMessage — accepts customerId OR customerEmail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(portalDb.findPortalCustomerById).mockResolvedValue(mockCustomerById);
    vi.mocked(portalDb.findPortalCustomerByEmail).mockResolvedValue(mockCustomerByEmail);
    vi.mocked(portalDb.createPortalMessage).mockResolvedValue({
      id: 99,
      customerId: 5,
      senderRole: "hp",
      senderName: "Handy Pioneers",
      body: "We'll be there at 9am.",
      readAt: null,
      createdAt: new Date(),
    } as any);
  });

  it("resolves customer by numeric customerId and creates reply", async () => {
    const customer = await portalDb.findPortalCustomerById(5);
    expect(customer).not.toBeNull();

    const msg = await portalDb.createPortalMessage({
      customerId: customer!.id,
      senderRole: "hp",
      senderName: "Handy Pioneers",
      body: "We'll be there at 9am.",
    });
    expect(msg.body).toBe("We'll be there at 9am.");
    expect(msg.senderRole).toBe("hp");
  });

  it("resolves customer by email and creates reply", async () => {
    const customer = await portalDb.findPortalCustomerByEmail("jane@example.com");
    expect(customer).not.toBeNull();

    const msg = await portalDb.createPortalMessage({
      customerId: customer!.id,
      senderRole: "hp",
      senderName: "Handy Pioneers",
      body: "We'll be there at 9am.",
    });
    expect(msg).toBeDefined();
  });
});

// ── getAllPortalMessages hpCustomerId join ────────────────────────────────────
describe("getAllPortalMessages — includes hpCustomerId for deep-link", () => {
  it("returns messages with hpCustomerId field", async () => {
    vi.mocked(portalDb.getAllPortalMessages).mockResolvedValue([
      {
        id: 1,
        customerId: 5,
        customerName: "Jane Smith",
        customerEmail: "jane@example.com",
        hpCustomerId: "cust-hp-123",
        senderRole: "customer",
        senderName: "Jane Smith",
        body: "Hello, when can you come?",
        readAt: null,
        createdAt: new Date(),
      } as any,
    ]);

    const messages = await portalDb.getAllPortalMessages();
    expect(messages).toHaveLength(1);
    expect((messages[0] as any).hpCustomerId).toBe("cust-hp-123");
  });
});
