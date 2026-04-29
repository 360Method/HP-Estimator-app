/**
 * Integrator weekly brief — pure-function tests. The Anthropic call + DB
 * paths are exercised in integration; here we pin (a) bullet normalization
 * always returns 5 buckets in the canonical order with a deterministic
 * fallback, (b) the JSON parser tolerates fenced + bare responses, and (c)
 * the Pacific-time gate fires only at Mon 06:xx PT.
 */
import { describe, it, expect } from "vitest";
import { _internal } from "./integratorBrief";
import { pacificDateKey, pacificIsoWeekKey } from "./cronRuns";

describe("integratorBrief.normalizeBullets", () => {
  const order = ["Done", "In Progress", "Blocked", "Decisions Needed", "Risk Flags"] as const;

  it("returns 5 buckets in the canonical order", () => {
    const out = _internal.normalizeBullets({
      bullets: [
        { bucket: "Risk Flags", text: "B" },
        { bucket: "Done", text: "A" },
      ],
    });
    expect(out.map((x) => x.bucket)).toEqual([...order]);
    expect(out[0].text).toBe("A");
    expect(out[4].text).toBe("B");
  });

  it("fills missing buckets with the fallback line", () => {
    const out = _internal.normalizeBullets({ bullets: [] });
    expect(out).toHaveLength(5);
    expect(out.every((b) => b.text === "Nothing material this week.")).toBe(true);
  });

  it("ignores duplicate bucket entries (first wins)", () => {
    const out = _internal.normalizeBullets({
      bullets: [
        { bucket: "Done", text: "first" },
        { bucket: "Done", text: "second" },
      ],
    });
    expect(out.find((b) => b.bucket === "Done")?.text).toBe("first");
  });

  it("matches buckets case-insensitively", () => {
    const out = _internal.normalizeBullets({
      bullets: [{ bucket: "  done  ", text: "ok" }],
    });
    expect(out.find((b) => b.bucket === "Done")?.text).toBe("ok");
  });

  it("ignores malformed entries", () => {
    const out = _internal.normalizeBullets({
      bullets: [
        null,
        { bucket: 7, text: "x" },
        { bucket: "Done", text: 42 },
        { bucket: "Done", text: "real" },
      ] as unknown as { bullets: unknown[] }["bullets"],
    });
    expect(out.find((b) => b.bucket === "Done")?.text).toBe("real");
  });
});

describe("integratorBrief.parseBriefJson", () => {
  it("parses a bare JSON object", () => {
    const out = _internal.parseBriefJson('{"bullets":[{"bucket":"Done","text":"ok"}]}');
    expect((out as { bullets: unknown[] }).bullets).toHaveLength(1);
  });

  it("strips ```json fences", () => {
    const out = _internal.parseBriefJson(
      '```json\n{"bullets":[{"bucket":"Done","text":"hi"}]}\n```',
    );
    expect((out as { bullets: unknown[] }).bullets).toHaveLength(1);
  });

  it("tolerates leading prose before the JSON object", () => {
    const out = _internal.parseBriefJson(
      'Here you go:\n{"bullets":[{"bucket":"Done","text":"hi"}]}',
    );
    expect((out as { bullets: unknown[] }).bullets).toHaveLength(1);
  });

  it("throws when no object is present", () => {
    expect(() => _internal.parseBriefJson("nothing here")).toThrow();
  });
});

describe("integratorBrief.isPacificMondayBriefHour", () => {
  // Picking calendar dates and converting them to UTC so the test is robust
  // to whatever TZ the test runner sits in. 2026-04-27 was a Monday; PT was
  // PDT (UTC-7) on that date.
  it("fires for a Monday 06:xx PT moment", () => {
    // 2026-04-27 06:30 PT == 2026-04-27 13:30 UTC during PDT.
    const monday6amPt = new Date("2026-04-27T13:30:00Z");
    expect(_internal.isPacificMondayBriefHour(monday6amPt)).toBe(true);
  });

  it("does not fire for a Monday 05:59 PT", () => {
    // 2026-04-27 05:59 PT == 2026-04-27 12:59 UTC during PDT.
    const justBefore = new Date("2026-04-27T12:59:00Z");
    expect(_internal.isPacificMondayBriefHour(justBefore)).toBe(false);
  });

  it("does not fire for a Tuesday 06:00 PT", () => {
    // 2026-04-28 06:00 PT == 2026-04-28 13:00 UTC during PDT.
    const tuesday = new Date("2026-04-28T13:00:00Z");
    expect(_internal.isPacificMondayBriefHour(tuesday)).toBe(false);
  });
});

describe("cronRuns date helpers", () => {
  it("pacificDateKey returns YYYY-MM-DD in PT", () => {
    // 2026-04-28 03:00 UTC == 2026-04-27 20:00 PT (during PDT) — should
    // bucket to the prior Pacific day.
    const out = pacificDateKey(new Date("2026-04-28T03:00:00Z"));
    expect(out).toBe("2026-04-27");
  });

  it("pacificIsoWeekKey returns ISO-week format YYYY-Www", () => {
    const out = pacificIsoWeekKey(new Date("2026-04-27T13:30:00Z"));
    expect(out).toMatch(/^2026-W\d{2}$/);
  });

  it("two weekday timestamps in the same Pacific week share an isoWeekKey", () => {
    // Monday 2026-04-27 and Wednesday 2026-04-29 are the same ISO week.
    const mon = pacificIsoWeekKey(new Date("2026-04-27T13:30:00Z"));
    const wed = pacificIsoWeekKey(new Date("2026-04-29T20:00:00Z"));
    expect(mon).toBe(wed);
  });
});
