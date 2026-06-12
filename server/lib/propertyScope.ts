/**
 * propertyScope — the pure rules for which client records belong to which
 * property when a client umbrella holds more than one home.
 *
 * The rules (also enforced by threeSixtyJourney.forProperty):
 *  1. A property view only ever shows records of its own customer; the
 *     caller verifies property.customerId before building a scope.
 *  2. Membership-bound records (scans, work orders, visits, systems, labor
 *     bank) attach only through property.membershipId. No membership on the
 *     property = non-member view, even if the customer has a membership on
 *     another property.
 *  3. Opportunities in scope: opportunities.propertyId equals the property,
 *     OR the link is NULL and this property is treated as primary.
 *  4. Spot inspections in scope: priorityTranslations.crmPropertyId equals
 *     the property, OR it is NULL and this property is treated as primary.
 *     (priorityTranslations.propertyId is PORTAL-namespace; never use it
 *     for CRM scoping.)
 *  5. treatAsPrimary = property.isPrimary OR the customer has exactly one
 *     property. Legacy unlinked records show under the primary without any
 *     backfill, and single-property clients (the majority) see everything.
 *  6. Customer-level artifacts with no property column (S8 remodel
 *     consultation docs) show under the primary only.
 */

export interface PropertyScope {
  propertyId: string;
  /** isPrimary OR the customer's only property — see rule 5. */
  treatAsPrimary: boolean;
}

export function buildPropertyScope(property: { id: string; isPrimary: boolean | null }, customerPropertyCount: number): PropertyScope {
  return {
    propertyId: property.id,
    treatAsPrimary: !!property.isPrimary || customerPropertyCount === 1,
  };
}

/** Rule 3 — also rule 4, since both link columns carry the same semantics. */
export function recordInScope(linkedPropertyId: string | null | undefined, scope: PropertyScope): boolean {
  if (linkedPropertyId === scope.propertyId) return true;
  return linkedPropertyId == null && scope.treatAsPrimary;
}

/** Rule 6 — customer-level artifacts surface under the primary only. */
export function customerLevelInScope(scope: PropertyScope): boolean {
  return scope.treatAsPrimary;
}
