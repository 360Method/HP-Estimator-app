/**
 * Vitest stubs for the Roadmap Generator human-checkpoint pipeline.
 *
 * Narrow coverage on the voice + data-shape contracts that are most likely
 * to regress silently if someone edits the templates or the finding mutator.
 * Tests that need a real DB (listPendingReviews, sendToCustomer) are called
 * out as TODO — wire them up once a vitest postgres container is in place.
 */
import { describe, it, expect } from "vitest";

describe("priority translation — email voice", () => {
  it("email template references human involvement in subject + opening", async () => {
    // Dynamic import so vitest doesn't try to resolve this module when the
    // server test suite is booting without env. The template functions are
    // not exported directly — re-import them inline for the assertion.
    const mod = await import("./lib/priorityTranslation/email");
    // renderHtml/renderText are internal; we exercise them via the public
    // sendPriorityTranslationReady contract by stubbing fetch.
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "stub" }), { status: 200 });
    }) as any;
    try {
      await mod.sendPriorityTranslationReady({
        apiKey: "stub",
        to: "test@example.com",
        firstName: "Alex",
        magicLinkUrl: "https://example.com/portal/authenticate?token=abc",
        pdfBuffer: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        propertyAddress: "123 Main St, Vancouver, WA 98660",
        reviewNote: "Start with the roof flashing before fall rain hits.",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(capturedBody).not.toBeNull();
    expect(capturedBody.subject).toContain("personally reviewed");
    expect(capturedBody.html).toContain("I reviewed your inspection report findings myself");
    expect(capturedBody.html).toContain("— Marcin");
    expect(capturedBody.html).not.toContain("— The Handy Pioneers Team");
    // Personal note should appear verbatim
    expect(capturedBody.html).toContain("Start with the roof flashing");
  });

  it("email template omits the note block when no review note is provided", async () => {
    const mod = await import("./lib/priorityTranslation/email");
    const originalFetch = globalThis.fetch;
    let capturedBody: any = null;
    globalThis.fetch = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return new Response(JSON.stringify({ id: "stub" }), { status: 200 });
    }) as any;
    try {
      await mod.sendPriorityTranslationReady({
        apiKey: "stub",
        to: "test@example.com",
        firstName: "Alex",
        magicLinkUrl: "https://example.com/portal/authenticate?token=abc",
        pdfBuffer: new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        propertyAddress: "123 Main St, Vancouver, WA 98660",
      });
    } finally {
      globalThis.fetch = originalFetch;
    }
    expect(capturedBody.html).not.toContain("A note from Marcin");
  });
});

// TODO: add integration tests against a test postgres for:
//   - listPendingReviews returns only draft_awaiting_review rows
//   - updateFinding / addFinding / removeFinding idempotence
//   - sendToCustomer flips status → sent, stamps sentAt + reviewedAt
//   - worker tickDraftScheduler picks up draft_awaiting_claude rows
//   - worker tickReminderScheduler respects the 48h cutoff and reminder_sent_at
