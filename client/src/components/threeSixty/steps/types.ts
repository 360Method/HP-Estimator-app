/**
 * Shared bits for the nine step panels (the property step subpages).
 * StepContentItem mirrors the server's shape in threeSixtyJourney.ts.
 */

export type StepContentItem = {
  kind: "scan" | "workorder" | "visit" | "spot" | "opportunity" | "document" | "info";
  refId: string | null;
  label: string;
  note: string;
  dateMs: number | null;
};

export const fmtStepDate = (ms: number | null | undefined) =>
  ms == null ? "" : new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const hairline = { borderColor: "var(--hp-hairline)" } as const;

export const fmtMoney = (n: number | null | undefined) =>
  n == null ? "" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
