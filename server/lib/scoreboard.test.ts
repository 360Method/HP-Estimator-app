import { describe, expect, it } from "vitest";
import { computeScoreboard } from "./scoreboard";

const base = {
  marketValueEstimate: null,
  mortgageBalance: null,
  completedJobValues: [],
  findingsResolved: 0,
  scoreReadings: [],
};

describe("scoreboard", () => {
  it("equity is null when either input is missing", () => {
    expect(computeScoreboard({ ...base, marketValueEstimate: 650000 }).equityPosition).toBeNull();
    expect(computeScoreboard({ ...base, mortgageBalance: 380000 }).equityPosition).toBeNull();
    expect(computeScoreboard(base).equityPosition).toBeNull();
  });

  it("equity is simple arithmetic on the provided inputs", () => {
    const r = computeScoreboard({ ...base, marketValueEstimate: 650000, mortgageBalance: 380000 });
    expect(r.equityPosition).toBe(270000);
  });

  it("underwater equity stays negative, never clamped", () => {
    const r = computeScoreboard({ ...base, marketValueEstimate: 300000, mortgageBalance: 350000 });
    expect(r.equityPosition).toBe(-50000);
  });

  it("maintenance invested sums completed job values and ignores junk", () => {
    const r = computeScoreboard({ ...base, completedJobValues: [1200, 800, NaN, 0] });
    expect(r.maintenanceInvested).toBe(2000);
  });

  it("home score trend drops null scores and sorts oldest first", () => {
    const r = computeScoreboard({
      ...base,
      scoreReadings: [
        { dateMs: 300, score: 82 },
        { dateMs: 100, score: 74 },
        { dateMs: 200, score: null },
        { dateMs: null, score: 90 },
      ],
    });
    expect(r.homeScoreTrend.map((t) => t.score)).toEqual([74, 82, 90]);
  });
});
