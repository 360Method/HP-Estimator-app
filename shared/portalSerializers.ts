/**
 * shared/portalSerializers.ts
 *
 * Hard guardrail against leaking internal HP economics to the customer portal.
 *
 * Background: the portal and the staff app share one tRPC server and one DB.
 * Customer-facing data is kept in separate `portal*` tables that carry retail
 * figures only, while the internal `opportunities` table carries cost / markup /
 * margin fields (hardCostCents, grossMarginBps, …) plus the raw estimate/client
 * JSON snapshots. Today the separation is enforced only by table + router
 * discipline — nothing structurally stops a future portal procedure from
 * returning an internal row. These helpers add two layers:
 *
 *   1. Design-time: serialize* functions return an explicit allowlist of fields,
 *      so new portal responses opt in to exactly what the customer may see.
 *   2. Runtime backstop: findForbiddenKeys / assertNoForbiddenKeys deep-scan any
 *      value for a known-dangerous key. The portal tRPC middleware runs this on
 *      every portal response (throw in non-prod, strip + log in prod).
 *
 * Margin/cost data on a client surface is a direct breach of the rule "never
 * expose hard cost, markup, or margin math to clients."
 */

/**
 * Exact object keys that must never appear in a portal (customer-facing)
 * response. Matched case-sensitively and exactly (not by substring) so we don't
 * trip on legitimate retail fields like `totalAmount` or `depositAmount`.
 *
 * Mirrors the internal-only columns on `opportunities` (drizzle/schema.ts) plus
 * a few defensive nested names that should never reach a customer.
 */
export const PORTAL_FORBIDDEN_KEYS: readonly string[] = [
  // opportunities margin-floor + audit columns
  "hardCostCents",
  "hardCost",
  "grossMarginBps",
  "grossMargin",
  "minGmBps",
  "isSmallJob",
  "belowFloor",
  "marginAuditedAt",
  // raw internal JSON blobs (carry cost breakdowns + private notes)
  "estimateSnapshot",
  "clientSnapshot",
  // defensive: cost / markup names that may appear on nested line items
  "laborCostCents",
  "costCents",
  "markupPercent",
  "markupBps",
];

const FORBIDDEN = new Set<string>(PORTAL_FORBIDDEN_KEYS);

/**
 * Deep-walk a value and return the dotted paths of every forbidden key found.
 * Empty array means clean. Handles nested objects and arrays; ignores key order
 * and non-enumerable props. Guards against cycles.
 */
export function findForbiddenKeys(value: unknown, basePath = "$"): string[] {
  const hits: string[] = [];
  const seen = new WeakSet<object>();

  const walk = (val: unknown, path: string): void => {
    if (val === null || typeof val !== "object") return;
    if (seen.has(val as object)) return;
    seen.add(val as object);

    if (Array.isArray(val)) {
      val.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }

    for (const [key, child] of Object.entries(val as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;
      if (FORBIDDEN.has(key)) hits.push(childPath);
      walk(child, childPath);
    }
  };

  walk(value, basePath);
  return hits;
}

/**
 * Delete every forbidden key from a value, in place, at any depth. Used as the
 * prod fail-open path so a leak is scrubbed rather than 500-ing a customer.
 * Returns the same reference for convenience.
 */
export function stripForbiddenKeys<T>(value: T): T {
  const seen = new WeakSet<object>();

  const walk = (val: unknown): void => {
    if (val === null || typeof val !== "object") return;
    if (seen.has(val as object)) return;
    seen.add(val as object);

    if (Array.isArray(val)) {
      val.forEach(walk);
      return;
    }

    const obj = val as Record<string, unknown>;
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN.has(key)) {
        delete obj[key];
        continue;
      }
      walk(obj[key]);
    }
  };

  walk(value);
  return value;
}

/**
 * Throw if a value contains any forbidden key. Use in tests and non-prod runtime
 * to fail loud the moment internal economics reach a customer surface.
 */
export function assertNoForbiddenKeys(value: unknown, label = "portal response"): void {
  const hits = findForbiddenKeys(value);
  if (hits.length > 0) {
    throw new Error(
      `Portal leak guard: ${label} contains internal-only field(s): ${hits.join(", ")}. ` +
        `These must never reach the customer portal. Serialize with an explicit ` +
        `allowlist (shared/portalSerializers.ts) instead of returning internal rows.`,
    );
  }
}
