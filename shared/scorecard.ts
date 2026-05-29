/**
 * Weekly Scorecard (audit Rec 3) — single source of truth for the BOS L10
 * scorecard metric catalog and the Green/Yellow/Red rule. Pure module shared by
 * the rollup, the API, and the UI.
 *
 * Targets encode the 2026 plan: PP ARR >= $20K / 20 clients (decoupled),
 * conversion > 40%, visits-on-schedule 100%, jobs-below-floor 0, GM 35%, etc.
 */
import { MIN_GM_STANDARD } from "./marginFloor";

export type MetricDirection = "higher" | "lower";
export type GyrStatus = "green" | "yellow" | "red" | "unknown";

export interface ScorecardMetric {
  key: string;
  label: string;
  group: "pp_sales" | "delivery" | "finance" | "marketing" | "ids";
  /** Target value in the metric's unit (ratios 0..1 for percentages, cents for money). */
  target: number;
  direction: MetricDirection;
  unit: "count" | "ratio" | "cents";
  ownerRole: string;
}

/** The BOS scorecard rows. */
export const SCORECARD_METRICS: ScorecardMetric[] = [
  // PP & Sales
  { key: "pp_clients_active", label: "PP clients active", group: "pp_sales", target: 20, direction: "higher", unit: "count", ownerRole: "owner" },
  { key: "pp_arr_cents", label: "PP ARR", group: "pp_sales", target: 2_000_000, direction: "higher", unit: "cents", ownerRole: "owner" },
  { key: "pp_enrollments_week", label: "PP enrollments / week", group: "pp_sales", target: 1, direction: "higher", unit: "count", ownerRole: "owner" },
  { key: "pp_conversion_rate", label: "PP conversion rate", group: "pp_sales", target: 0.4, direction: "higher", unit: "ratio", ownerRole: "owner" },
  { key: "pp_at_risk", label: "PP at-risk clients", group: "pp_sales", target: 0, direction: "lower", unit: "count", ownerRole: "owner" },
  // Delivery / Ops
  { key: "visits_on_schedule_pct", label: "Seasonal visits on schedule", group: "delivery", target: 1, direction: "higher", unit: "ratio", ownerRole: "lead_tech" },
  { key: "portal_current_pct", label: "Portal entries current (<48h)", group: "delivery", target: 1, direction: "higher", unit: "ratio", ownerRole: "lead_tech" },
  { key: "roadmap_now_overdue", label: "Open NOW roadmap items overdue", group: "delivery", target: 0, direction: "lower", unit: "count", ownerRole: "owner" },
  { key: "sub_flags", label: "Sub flags", group: "delivery", target: 0, direction: "lower", unit: "count", ownerRole: "lead_tech" },
  // Finance
  { key: "gross_margin_4wk", label: "Gross margin (rolling 4-wk)", group: "finance", target: 0.35, direction: "higher", unit: "ratio", ownerRole: "owner" },
  { key: "jobs_below_floor", label: "Jobs below margin floor", group: "finance", target: 0, direction: "lower", unit: "count", ownerRole: "owner" },
  { key: "open_receivables_30d_cents", label: "Open receivables >30 days", group: "finance", target: 0, direction: "lower", unit: "cents", ownerRole: "owner" },
  // Marketing
  { key: "reviews_cumulative", label: "Google reviews cumulative", group: "marketing", target: 50, direction: "higher", unit: "count", ownerRole: "owner" },
  { key: "reviews_week", label: "New reviews / week", group: "marketing", target: 1, direction: "higher", unit: "count", ownerRole: "owner" },
  // IDS (ties Rec 2 into the scorecard)
  { key: "ids_open", label: "Open IDS issues", group: "ids", target: 0, direction: "lower", unit: "count", ownerRole: "owner" },
];

export const SCORECARD_METRICS_BY_KEY: Record<string, ScorecardMetric> = Object.fromEntries(
  SCORECARD_METRICS.map((m) => [m.key, m]),
);

/** A sanity anchor so the GM target stays consistent with the floor module. */
export const GROSS_MARGIN_TARGET = Math.max(0.35, MIN_GM_STANDARD);

/**
 * Green/Yellow/Red rule. For "higher is better", green at/above target, yellow
 * within yellowRatio of target. For "lower is better", green at/below target,
 * yellow up to a small band above it (for count targets of 0, one over = yellow).
 */
export function computeGyr(
  value: number | null | undefined,
  target: number,
  direction: MetricDirection,
  opts?: { yellowRatio?: number; yellowAbs?: number },
): GyrStatus {
  if (value == null || !isFinite(value)) return "unknown";
  const yellowRatio = opts?.yellowRatio ?? 0.8;
  if (direction === "higher") {
    if (value >= target) return "green";
    if (target > 0 && value >= target * yellowRatio) return "yellow";
    return "red";
  }
  // lower is better
  if (value <= target) return "green";
  const yellowAbs = opts?.yellowAbs ?? (target > 0 ? target * (2 - yellowRatio) : 1);
  if (value <= yellowAbs) return "yellow";
  return "red";
}

/** Convenience: status for a metric key using its catalog definition. */
export function statusForMetric(key: string, value: number | null | undefined): GyrStatus {
  const m = SCORECARD_METRICS_BY_KEY[key];
  if (!m) return "unknown";
  return computeGyr(value, m.target, m.direction);
}
