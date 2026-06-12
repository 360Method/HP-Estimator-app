/**
 * scoreboard — pure math for Step 9, the equity scoreboard.
 *
 * Inputs are deliberately humble: market value and mortgage are numbers a
 * staff member typed in, never a valuation we computed. Equity is simple
 * arithmetic on those inputs and is null whenever either is missing; the
 * UI must show the not-financial-advice disclaimer wherever these numbers
 * render.
 */

export interface ScoreboardInput {
  /** Staff-entered whole dollars; null = not provided. */
  marketValueEstimate: number | null;
  /** Staff-entered whole dollars; null = not provided. */
  mortgageBalance: number | null;
  /** Dollar values of completed jobs in this property's scope. */
  completedJobValues: number[];
  /** Resolved findings count across this property's health records. */
  findingsResolved: number;
  /** Home Score readings, any order; null scores are dropped. */
  scoreReadings: { dateMs: number | null; score: number | null }[];
}

export interface ScoreboardResult {
  /** marketValue - mortgage, or null when either input is missing. */
  equityPosition: number | null;
  /** Sum of completed job values (dollars). */
  maintenanceInvested: number;
  findingsResolved: number;
  /** Non-null scores, oldest first (null dates sort last). */
  homeScoreTrend: { dateMs: number | null; score: number }[];
}

export function computeScoreboard(input: ScoreboardInput): ScoreboardResult {
  const { marketValueEstimate, mortgageBalance } = input;
  const equityPosition =
    marketValueEstimate == null || mortgageBalance == null
      ? null
      : marketValueEstimate - mortgageBalance;

  const maintenanceInvested = input.completedJobValues.reduce(
    (sum, v) => sum + (Number.isFinite(v) ? v : 0),
    0,
  );

  const homeScoreTrend = input.scoreReadings
    .filter((r): r is { dateMs: number | null; score: number } => r.score != null)
    .sort((a, b) => (a.dateMs ?? Number.MAX_SAFE_INTEGER) - (b.dateMs ?? Number.MAX_SAFE_INTEGER));

  return {
    equityPosition,
    maintenanceInvested,
    findingsResolved: input.findingsResolved,
    homeScoreTrend,
  };
}
