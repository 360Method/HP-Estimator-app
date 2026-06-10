/**
 * Server-side render smoke tests for the two new client-umbrella tabs.
 * No jsdom needed: renderToString surfaces any render-time crash with the
 * exact error, which a browser would swallow into an error boundary.
 */
import { describe, it, expect } from "vitest";
import * as React from "react";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

// vitest transforms JSX with the classic runtime (React.createElement) while
// the real Vite build uses the automatic runtime, so the components under
// test don't import React themselves. Provide the global the classic
// transform expects.
(globalThis as any).React = React;
import ClientUmbrellaContext from "@/components/clients/ClientUmbrellaContext";
import CustomerScheduleTab from "@/pages/clients/tabs/CustomerScheduleTab";
import CustomerRoadmapTab from "@/pages/clients/tabs/CustomerRoadmapTab";

function renderWith(ctx: any, component: any) {
  return renderToString(
    createElement(ClientUmbrellaContext.Provider, { value: ctx }, createElement(component)),
  );
}

const richContext: any = {
  customerFullName: "Matthew Yates",
  displayName: "Matthew Yates",
  customerContextLoading: false,
  customerContext: {
    scheduleEvents: [
      { id: "ev1", type: "job", title: "Install", start: "2026-06-12T09:00:00Z", end: "2026-06-12T12:00:00Z", allDay: false, opportunityId: "opp1", assignedTo: '["Alex"]', completed: false },
      { id: "ev2", type: "task", title: "Old task", start: "2026-05-01T09:00:00Z", end: "2026-05-01T10:00:00Z", allDay: true, opportunityId: null, assignedTo: null, completed: true },
    ],
    portal: {
      appointments: [
        { id: 1, title: "Walkthrough", type: "estimate", scheduledAt: new Date("2026-06-15T15:00:00Z"), scheduledEndAt: null, techName: "Sam", status: "scheduled" },
      ],
      invoices: [],
      estimates: [],
      serviceRequests: [],
    },
    opportunities: [
      { id: "opp1", area: "job", stage: "Scheduled", title: "Kitchen", archived: false, scheduledDate: "2026-06-12T09:00:00Z", assignedTo: "Alex" },
      { id: "opp2", area: "job", stage: "Scheduled", title: "Bath", archived: false, scheduledDate: "2026-06-20T09:00:00Z", scheduledEndDate: null, assignedTo: null },
    ],
    roadmap: {
      accountId: "acct1",
      properties: [{ id: "p1", street: "123 Main St", unit: "", city: "Vancouver" }],
      reports: [
        { id: "r1", propertyId: "p1", status: "completed", hasReport: true, reportUrl: "https://x", summary: "Summary text", findings: [{}, {}], deliveredAt: new Date(), createdAt: new Date() },
      ],
      healthRecords: [
        {
          id: "h1", propertyId: "p1", summary: "Overall solid",
          findings: [
            { source: "manual", source_id: "s", category: "Roof", finding: "Flashing wear", interpretation: "Watch it", urgency: "SOON", investment_range_low_usd: 300, investment_range_high_usd: 800, reasoning: "", status: "open", added_at: "2026-06-01" },
            { source: "manual", source_id: "s2", category: "Gutters", finding: "Clogged", urgency: "NOW", investment_range_low_usd: 0, investment_range_high_usd: 0, reasoning: "", status: "resolved", added_at: "2026-05-01" },
          ],
        },
      ],
    },
  },
};

const emptyContext: any = {
  customerFullName: "",
  displayName: "New Customer",
  customerContextLoading: false,
  customerContext: { scheduleEvents: [], portal: null, opportunities: [], roadmap: null },
};

const loadingContext: any = {
  customerFullName: "",
  displayName: "",
  customerContextLoading: true,
  customerContext: undefined,
};

describe("CustomerScheduleTab render", () => {
  it("renders with full data", () => {
    const html = renderWith(richContext, CustomerScheduleTab);
    expect(html).toContain("Client Schedule");
    expect(html).toContain("Walkthrough");
    expect(html).toContain("Install");
    expect(html).toContain("Bath"); // unlinked scheduled job included
    expect(html).not.toContain(">Kitchen<"); // deduped: linked event supersedes
  });

  it("renders with no data", () => {
    const html = renderWith(emptyContext, CustomerScheduleTab);
    expect(html).toContain("Nothing scheduled");
  });

  it("renders while context is loading", () => {
    const html = renderWith(loadingContext, CustomerScheduleTab);
    expect(html).toContain("Client Schedule");
  });
});

describe("CustomerRoadmapTab render", () => {
  it("renders with full data", () => {
    const html = renderWith(richContext, CustomerRoadmapTab);
    expect(html).toContain("Home Roadmap");
    expect(html).toContain("Flashing wear");
    expect(html).toContain("Roadmap reports");
  });

  it("renders the empty state when no roadmap", () => {
    const html = renderWith(emptyContext, CustomerRoadmapTab);
    expect(html).toContain("No Home Roadmap yet");
  });

  it("renders while context is loading", () => {
    const html = renderWith(loadingContext, CustomerRoadmapTab);
    expect(html).toContain("No Home Roadmap yet");
  });
});
