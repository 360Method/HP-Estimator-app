import { describe, expect, it } from "vitest";
import {
  SCORECARD_METRICS,
  SCORECARD_METRICS_BY_KEY,
  computeGyr,
  statusForMetric,
} from "./scorecard";

describe("scorecard catalog", () => {
  it("has unique keys and covers the BOS groups", () => {
    const keys = SCORECARD_METRICS.map((m) => m.key);
    expect(new Set(keys).size).toBe(keys.length);
    const groups = new Set(SCORECARD_METRICS.map((m) => m.group));
    expect(groups).toEqual(new Set(["pp_sales", "delivery", "finance", "marketing", "ids"]));
  });
  it("anchors the headline 2026 targets", () => {
    expect(SCORECARD_METRICS_BY_KEY["pp_clients_active"].target).toBe(20);
    expect(SCORECARD_METRICS_BY_KEY["pp_arr_cents"].target).toBe(2_000_000);
    expect(SCORECARD_METRICS_BY_KEY["pp_conversion_rate"].target).toBe(0.4);
    expect(SCORECARD_METRICS_BY_KEY["jobs_below_floor"].target).toBe(0);
  });
});

describe("computeGyr — higher is better", () => {
  it("green at/above target, yellow within 80%, red below", () => {
    expect(computeGyr(20, 20, "higher")).toBe("green");
    expect(computeGyr(25, 20, "higher")).toBe("green");
    expect(computeGyr(17, 20, "higher")).toBe("yellow"); // 85%
    expect(computeGyr(10, 20, "higher")).toBe("red"); // 50%
  });
});

describe("computeGyr — lower is better", () => {
  it("green at/below target", () => {
    expect(computeGyr(0, 0, "lower")).toBe("green");
    expect(computeGyr(0, 0.4, "lower")).toBe("green");
  });
  it("count target of 0: one over is yellow, more is red", () => {
    expect(computeGyr(1, 0, "lower")).toBe("yellow");
    expect(computeGyr(3, 0, "lower")).toBe("red");
  });
});

describe("computeGyr — unknown", () => {
  it("returns unknown for null/NaN", () => {
    expect(computeGyr(null, 20, "higher")).toBe("unknown");
    expect(computeGyr(undefined, 20, "higher")).toBe("unknown");
    expect(computeGyr(NaN, 20, "higher")).toBe("unknown");
  });
});

describe("statusForMetric", () => {
  it("uses the catalog target/direction", () => {
    expect(statusForMetric("jobs_below_floor", 0)).toBe("green");
    expect(statusForMetric("jobs_below_floor", 2)).toBe("red");
    expect(statusForMetric("pp_clients_active", 20)).toBe("green");
    expect(statusForMetric("unknown_key", 5)).toBe("unknown");
  });
});
