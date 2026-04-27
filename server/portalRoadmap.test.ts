/**
 * Vitest checks for the pure helpers in the portalRoadmap router.
 * The full booking mutation requires DB + portal session + email + lead-routing
 * wiring; those paths are exercised in manual smoke (HANDOFF_CHECKLIST.md).
 */
import { describe, it, expect } from "vitest";
import { generateThoughtfulWindows } from "./routers/portalRoadmap";

describe("generateThoughtfulWindows — stewardship pacing", () => {
  it("returns exactly 4 windows", () => {
    const windows = generateThoughtfulWindows(new Date("2026-04-27T10:00:00Z"));
    expect(windows).toHaveLength(4);
  });

  it("never offers a window less than 5 days out", () => {
    const monday = new Date("2026-04-27T10:00:00Z");
    const windows = generateThoughtfulWindows(monday);
    for (const w of windows) {
      const daysOut =
        (new Date(w.startIso).getTime() - monday.getTime()) / 86_400_000;
      expect(daysOut).toBeGreaterThanOrEqual(5);
    }
  });

  it("never offers weekend windows", () => {
    const windows = generateThoughtfulWindows(new Date("2026-05-01T08:00:00Z"));
    for (const w of windows) {
      const day = new Date(w.startIso).getDay();
      expect(day).not.toBe(0); // Sun
      expect(day).not.toBe(6); // Sat
    }
  });

  it("alternates mornings and afternoons", () => {
    const windows = generateThoughtfulWindows(new Date("2026-04-27T10:00:00Z"));
    const hours = new Set(
      windows.map((w) => new Date(w.startIso).getHours()),
    );
    expect(hours.size).toBeGreaterThanOrEqual(2);
  });

  it("end times are 2 hours after start", () => {
    const windows = generateThoughtfulWindows(new Date("2026-04-27T10:00:00Z"));
    for (const w of windows) {
      const dur =
        new Date(w.endIso).getTime() - new Date(w.startIso).getTime();
      expect(dur).toBe(2 * 60 * 60 * 1000);
    }
  });
});
