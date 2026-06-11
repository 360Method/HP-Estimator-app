/**
 * SOP registry tests — frontmatter parsing, validation defaults, and
 * event/cron matching against the real on-disk library. Pure logic, no DB.
 */
import { describe, it, expect } from "vitest";
import {
  parseSopFile,
  loadSops,
  listSops,
  getSop,
  sopsForEvent,
  sopsWithCron,
} from "./sopRegistry";

const FIXTURE = `---
title: Enrollment follow-through
events: customer.portal_account_created, subscription.renewed
cron: 0 7 * * *
timezone: America/Los_Angeles
tools: customers.search, comms.draftEmail
approval: always
model: claude-haiku-4-5
maxTurns: 4
runLimitDaily: 12
enabled: true
kind: agent
---

# Enrollment follow-through

You are the enrollment concierge. Draft the nudge.
`;

describe("parseSopFile", () => {
  it("parses the flat frontmatter contract", () => {
    const sop = parseSopFile(FIXTURE, "members-360/enrollment-followthrough");
    expect(sop).toBeTruthy();
    expect(sop!.title).toBe("Enrollment follow-through");
    expect(sop!.events).toEqual(["customer.portal_account_created", "subscription.renewed"]);
    expect(sop!.cron).toBe("0 7 * * *");
    expect(sop!.timezone).toBe("America/Los_Angeles");
    expect(sop!.tools).toEqual(["customers.search", "comms.draftEmail"]);
    expect(sop!.approval).toBe("always");
    expect(sop!.model).toBe("claude-haiku-4-5");
    expect(sop!.maxTurns).toBe(4);
    expect(sop!.runLimitDaily).toBe(12);
    expect(sop!.enabled).toBe(true);
    expect(sop!.kind).toBe("agent");
    expect(sop!.body).toContain("enrollment concierge");
  });

  it("handles CRLF line endings (Windows checkouts)", () => {
    const sop = parseSopFile(FIXTURE.replace(/\n/g, "\r\n"), "x/y");
    expect(sop).toBeTruthy();
    expect(sop!.events).toHaveLength(2);
  });

  it("applies safe defaults for missing fields", () => {
    const sop = parseSopFile(`---\ntitle: Bare\n---\nBody.`, "ops/bare");
    expect(sop!.events).toEqual([]);
    expect(sop!.cron).toBeNull();
    expect(sop!.tools).toEqual([]);
    expect(sop!.approval).toBe("default");
    expect(sop!.model).toBeNull();
    expect(sop!.maxTurns).toBe(6);
    expect(sop!.runLimitDaily).toBe(20);
    expect(sop!.enabled).toBe(false); // disabled unless explicitly enabled
    expect(sop!.kind).toBe("agent");
  });

  it("caps maxTurns at the runtime ceiling of 8", () => {
    const sop = parseSopFile(`---\ntitle: X\nmaxTurns: 99\nenabled: true\n---\nB`, "ops/x");
    expect(sop!.maxTurns).toBe(8);
  });

  it("rejects files without frontmatter", () => {
    expect(parseSopFile("# Just markdown, no frontmatter", "ops/none")).toBeNull();
  });

  it("coerces unknown approval/kind values to safe defaults", () => {
    const sop = parseSopFile(`---\ntitle: X\napproval: yolo\nkind: wizard\n---\nB`, "ops/x");
    expect(sop!.approval).toBe("default");
    expect(sop!.kind).toBe("agent");
  });
});

describe("on-disk SOP library", () => {
  it("loads the real registry (folders under server/agents/sops)", () => {
    const sops = loadSops(true);
    expect(sops.size).toBeGreaterThan(0);
    // The Lead Nurturer descriptor ships with the library.
    expect(getSop("leads/roadmap-followup")).toBeTruthy();
  });

  it("excludes _templates from the registry", () => {
    expect(listSops().some((s) => s.sopPath.startsWith("_templates"))).toBe(false);
  });

  it("never routes events or cron to external-worker descriptors", () => {
    const nurturer = getSop("leads/roadmap-followup")!;
    expect(nurturer.kind).toBe("external-worker");
    for (const event of nurturer.events) {
      expect(sopsForEvent(event).map((s) => s.sopPath)).not.toContain(nurturer.sopPath);
    }
    expect(sopsWithCron().map((s) => s.sopPath)).not.toContain(nurturer.sopPath);
  });

  it("only routes enabled agent SOPs for events", () => {
    for (const sop of sopsForEvent("customer.portal_account_created")) {
      expect(sop.enabled).toBe(true);
      expect(sop.kind).toBe("agent");
    }
  });
});
