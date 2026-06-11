/**
 * DB-sourced SOP registry tests: an os_documents row maps to the same
 * SopDefinition shape file SOPs parse into, with the same clamps. Pure
 * logic, no DB.
 */
import { describe, it, expect } from "vitest";
import { sopFromDbRow } from "./sopRegistry";

const ROW = {
  docId: "HP-SOP-204",
  title: "Weekly vendor scorecard",
  body: "Score every vendor with completed jobs this week.",
  events: "visit.completed, payment.received",
  cron: "0 6 * * 1",
  timezone: "America/Los_Angeles",
  tools: "vendors.list, kpis.record",
  approval: "always",
  model: "claude-haiku-4-5",
  maxTurns: 4,
  runLimitDaily: 3,
  enabled: true,
};

describe("sopFromDbRow", () => {
  it("maps a full row to a SopDefinition keyed by docId", () => {
    const sop = sopFromDbRow(ROW);
    expect(sop.sopPath).toBe("HP-SOP-204");
    expect(sop.title).toBe("Weekly vendor scorecard");
    expect(sop.events).toEqual(["visit.completed", "payment.received"]);
    expect(sop.cron).toBe("0 6 * * 1");
    expect(sop.tools).toEqual(["vendors.list", "kpis.record"]);
    expect(sop.approval).toBe("always");
    expect(sop.maxTurns).toBe(4);
    expect(sop.runLimitDaily).toBe(3);
    expect(sop.enabled).toBe(true);
    expect(sop.kind).toBe("agent");
    expect(sop.body).toContain("Score every vendor");
  });

  it("applies the same ceilings and coercions as file parsing", () => {
    const sop = sopFromDbRow({ ...ROW, maxTurns: 50, approval: "yolo", runLimitDaily: 0 });
    expect(sop.maxTurns).toBe(8);
    expect(sop.approval).toBe("default");
    expect(sop.runLimitDaily).toBe(20);
  });

  it("handles null list fields and missing timezone", () => {
    const sop = sopFromDbRow({ ...ROW, events: null, tools: null, timezone: null, cron: null });
    expect(sop.events).toEqual([]);
    expect(sop.tools).toEqual([]);
    expect(sop.cron).toBeNull();
    expect(sop.timezone).toBe("America/Los_Angeles");
  });
});
