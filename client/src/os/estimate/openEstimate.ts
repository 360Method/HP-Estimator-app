/**
 * Wizard-first routing for estimates.
 *
 * Estimate-area opportunities that haven't gone to the customer yet open in
 * the guided wizard (/os/estimate/:oppId) — it can resume any draft. Sent or
 * approved estimates and jobs keep the classic detail panel. The old builder
 * stays reachable via the wizard's "Open full calculator" escape hatch.
 */
const LOCKED_STAGES = new Set(["sent", "verbal acceptance", "approved", "rejected", "won"]);

export function wizardPathFor(o: {
  id: string;
  area?: string | null;
  stage?: string | null;
  sentAt?: string | null;
}): string | null {
  if (o.area !== "estimate") return null;
  if (o.sentAt) return null;
  if (LOCKED_STAGES.has((o.stage ?? "").toLowerCase())) return null;
  return `/os/estimate/${o.id}`;
}
