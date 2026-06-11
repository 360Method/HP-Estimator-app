/**
 * server/_core/portalLeakGuard.ts
 *
 * tRPC middleware that scans every portal (customer-facing) response for
 * internal-only economics before it leaves the server. Attach it to the portal
 * procedures (portal.ts, portalRoadmap.ts).
 *
 * Failure mode is deliberately asymmetric:
 *   - Anywhere that is NOT the live production service (local, tests, and the
 *     staging service) it THROWS, so a leak is caught loudly the moment it is
 *     introduced — including during staging verification.
 *   - On the live production service it STRIPS the offending keys and logs an
 *     error, so a regression scrubs the data rather than 500-ing a real
 *     customer. The log line is the alert to fix it.
 *
 * Staging runs with NODE_ENV=production, so we can't use NODE_ENV alone to tell
 * staging from prod — we also check the Railway service name.
 */
import { middleware } from "./trpc";
import {
  findForbiddenKeys,
  stripForbiddenKeys,
} from "@shared/portalSerializers";

/** True only on the live production service (fail-open there; fail-loud elsewhere). */
function isLiveProd(): boolean {
  if (process.env.NODE_ENV !== "production") return false;
  const service = (process.env.RAILWAY_SERVICE_NAME ?? "").toLowerCase();
  if (service.includes("staging")) return false;
  return true;
}

export const portalLeakGuard = middleware(async ({ next, path }) => {
  const result = await next();
  if (!result.ok) return result;

  const hits = findForbiddenKeys(result.data);
  if (hits.length === 0) return result;

  const where = `portal.${path}`;
  if (isLiveProd()) {
    console.error(
      `[portalLeakGuard] STRIPPED internal-only field(s) from ${where}: ${hits.join(", ")}. ` +
        `Fix the procedure to serialize an explicit allowlist (shared/portalSerializers.ts).`,
    );
    stripForbiddenKeys(result.data);
    return result;
  }

  throw new Error(
    `[portalLeakGuard] ${where} would leak internal-only field(s) to the customer ` +
      `portal: ${hits.join(", ")}. Serialize an explicit allowlist instead of ` +
      `returning internal rows (shared/portalSerializers.ts).`,
  );
});
