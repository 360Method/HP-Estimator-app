/**
 * Server-side render smoke tests for ClientPortalPreview (Phase G
 * view-as-client). Same pattern as scheduleRoadmapRender.test.ts:
 * renderToString surfaces render-time crashes that a browser error
 * boundary would swallow.
 */
import { describe, it, expect } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

(globalThis as any).React = React;
import ClientUmbrellaContext from "@/components/clients/ClientUmbrellaContext";
import ClientPortalPreview from "@/components/clients/ClientPortalPreview";

function renderWith(ctx: any) {
  return renderToString(
    createElement(
      ClientUmbrellaContext.Provider,
      { value: ctx },
      createElement(ClientPortalPreview, { onClose: () => {} }),
    ),
    // SSR separates adjacent text nodes with <!-- --> comments; strip them so
    // assertions can match across interpolation boundaries.
  ).replace(/<!-- -->/g, "");
}

const richContext: any = {
  customerFullName: "Matthew Yates",
  displayName: "Matthew Yates",
  customerContext: {
    portal: {
      customer: { id: 7, name: "Matthew Yates", email: "m@example.com" },
      estimates: [
        { id: 1, estimateNumber: "EST-1042", title: "Kitchen remodel", status: "sent", totalAmount: 1250000, sentAt: "2026-06-01" },
        { id: 2, estimateNumber: "EST-1043", title: "Deck repair", status: "approved", totalAmount: 480000, sentAt: "2026-05-20" },
      ],
      invoices: [
        { id: 1, invoiceNumber: "INV-2001", jobTitle: "Deck repair", type: "deposit", status: "sent", amountDue: 240000, amountPaid: 0, dueDate: "2026-06-20" },
      ],
      appointments: [
        { id: 1, title: "Baseline Walkthrough", status: "scheduled", scheduledAt: "2099-06-15T15:00:00Z", techName: "Sam" },
      ],
      messages: [
        { id: 1, senderRole: "customer", body: "When can you start?", readAt: null, createdAt: "2026-06-08T10:00:00Z" },
        { id: 2, senderRole: "staff", body: "Next Tuesday works.", readAt: "2026-06-08T11:00:00Z", createdAt: "2026-06-08T10:30:00Z" },
      ],
      documents: [
        { id: 1, title: "Signed contract", createdAt: "2026-06-02" },
      ],
      serviceRequests: [],
      changeOrders: [],
    },
    roadmap: {
      healthRecords: [
        {
          id: "h1",
          findings: [
            { finding: "Flashing wear", interpretation: "Watch it", urgency: "SOON", investment_range_low_usd: 300, investment_range_high_usd: 800, status: "open" },
          ],
        },
      ],
    },
  },
};

const noPortalContext: any = {
  customerFullName: "New Customer",
  displayName: "New Customer",
  customerContext: { portal: null, roadmap: null },
};

describe("ClientPortalPreview render", () => {
  it("renders the home section with full data", () => {
    const html = renderWith(richContext);
    expect(html).toContain("Welcome home, Matthew");
    expect(html).toContain("Read-only preview");
    expect(html).toContain("LOGGED IN AS: MATTHEW YATES");
    expect(html).toContain("Estimates to review");
    expect(html).toContain("Baseline Walkthrough"); // next-visit card
  });

  it("renders the empty state when no portal account", () => {
    const html = renderWith(noPortalContext);
    expect(html).toContain("no portal account yet");
  });
});
