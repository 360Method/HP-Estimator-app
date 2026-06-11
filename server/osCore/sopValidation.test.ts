/**
 * Publish-time SOP validation tests: every gate that keeps a bad edit from
 * going live, with the plain-language messages the Library UI shows.
 */
import { describe, it, expect } from "vitest";
import { validateSopForPublish, type SopCandidate } from "./sopValidation";

const VALID_AGENT: SopCandidate = {
  kind: "agent",
  body: "Gather the numbers, write the brief.",
  events: null,
  cron: "0 7 * * *",
  tools: "kpis.record",
  approval: "default",
  maxTurns: 6,
  runLimitDaily: 2,
  taskTitleTemplate: null,
  taskDueOffsetHours: null,
};

const VALID_HUMAN: SopCandidate = {
  kind: "human",
  body: "## Margin audit\nCheck every line.",
  events: "invoice.created",
  cron: null,
  tools: null,
  approval: "default",
  maxTurns: 6,
  runLimitDaily: 20,
  taskTitleTemplate: "Run margin audit for {{customerName}}",
  taskDueOffsetHours: 24,
};

describe("validateSopForPublish", () => {
  it("passes a valid agent SOP", () => {
    expect(validateSopForPublish(VALID_AGENT)).toEqual({ ok: true, errors: [] });
  });

  it("passes a valid human SOP", () => {
    expect(validateSopForPublish(VALID_HUMAN)).toEqual({ ok: true, errors: [] });
  });

  it("rejects a malformed cron in plain language", () => {
    const r = validateSopForPublish({ ...VALID_AGENT, cron: "every morning" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/not a valid five-part cron/);
  });

  it("rejects an event the system never fires", () => {
    const r = validateSopForPublish({ ...VALID_HUMAN, events: "estimate.teleported" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/never fires/);
  });

  it("rejects an SOP with no trigger at all", () => {
    const r = validateSopForPublish({ ...VALID_AGENT, cron: null, events: null });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/no trigger/);
  });

  it("rejects an agent SOP naming a tool that does not exist", () => {
    const r = validateSopForPublish({ ...VALID_AGENT, tools: "comms.sendmail" });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/comms\.sendmail.*does not exist/);
  });

  it("accepts the HP-OS tools (docs, ostasks, decisions)", () => {
    const r = validateSopForPublish({
      ...VALID_AGENT,
      tools: "docs.search, docs.read, ostasks.create, decisions.append",
    });
    expect(r).toEqual({ ok: true, errors: [] });
  });

  it("rejects an agent SOP with an empty body", () => {
    const r = validateSopForPublish({ ...VALID_AGENT, body: "   " });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/needs instructions/);
  });

  it("clamps turn and run limits", () => {
    expect(validateSopForPublish({ ...VALID_AGENT, maxTurns: 99 }).ok).toBe(false);
    expect(validateSopForPublish({ ...VALID_AGENT, runLimitDaily: 0 }).ok).toBe(false);
  });

  it("bounds the human task due offset", () => {
    const r = validateSopForPublish({ ...VALID_HUMAN, taskDueOffsetHours: 99999 });
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/due offset/);
  });
});
