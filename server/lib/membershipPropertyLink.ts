/**
 * Picks which of a customer's CRM property records a new 360 membership
 * should link to. Pure so the webhook's linking choice is unit-testable.
 *
 * Precedence: an explicit metadata.propertyId from checkout (staff-driven
 * enrollment names the exact property) beats the legacy street-string match
 * (funnel enrollments only carry a typed address). Returns null when neither
 * resolves; the caller then creates a fresh property record.
 */
export interface CandidateProperty {
  id: string;
  street: string | null;
}

export function pickPropertyForMembership(
  candidates: CandidateProperty[],
  metadataPropertyId: string | null | undefined,
  serviceAddress: string | null | undefined,
): { propertyId: string; via: "metadata" | "street" } | null {
  if (metadataPropertyId) {
    const byId = candidates.find((p) => p.id === metadataPropertyId);
    if (byId) return { propertyId: byId.id, via: "metadata" };
  }
  const wanted = (serviceAddress ?? "").toLowerCase().trim();
  if (wanted) {
    const byStreet = candidates.find(
      (p) => (p.street ?? "").toLowerCase().trim() === wanted,
    );
    if (byStreet) return { propertyId: byStreet.id, via: "street" };
  }
  return null;
}
