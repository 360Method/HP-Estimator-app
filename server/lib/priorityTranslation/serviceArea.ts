/**
 * Server-side service-area gate for the Roadmap Generator.
 *
 * The client gates the funnel UI (handy-pioneers-manus lib/serviceArea.ts),
 * but a direct POST to /api/roadmap-generator/submit used to skip that and
 * burn a full Claude run (+ email) for any address on earth. This module is
 * the authoritative server gate:
 *
 *   - If the operator-managed `serviceZipCodes` table has rows, IT decides —
 *     new markets open by adding rows in the admin, no deploy needed.
 *   - If the table is empty, fall back to the Clark County WA constant below
 *     (mirror of the client list — keep the two in sync).
 *   - An unparseable/missing ZIP is treated as NOT served: a roadmap is never
 *     generated for an address we can't even place.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { serviceZipCodes } from "../../../drizzle/schema";

/** Mirror of handy-pioneers-manus client/src/lib/serviceArea.ts CLARK_COUNTY_ZIPS. */
export const CLARK_COUNTY_ZIPS: ReadonlySet<string> = new Set([
  "98601", "98604", "98606", "98607", "98629", "98642",
  "98660", "98661", "98662", "98663", "98664", "98665",
  "98666", "98667", "98668", "98671", "98674", "98675",
  "98682", "98683", "98684", "98685", "98686", "98687",
]);

/** Normalize to a 5-digit ZIP, or null when one can't be extracted. */
export function normalizeZip(raw: string | null | undefined): string | null {
  const m = String(raw ?? "").match(/\b(\d{5})(?:-\d{4})?\b/);
  return m ? m[1] : null;
}

export async function isRoadmapZipServed(zip: string | null | undefined): Promise<boolean> {
  const five = normalizeZip(zip);
  if (!five) return false;
  try {
    const db = await getDb();
    if (db) {
      const any = await db.select({ id: serviceZipCodes.id }).from(serviceZipCodes).limit(1);
      if (any.length > 0) {
        const match = await db
          .select({ id: serviceZipCodes.id })
          .from(serviceZipCodes)
          .where(eq(serviceZipCodes.zip, five))
          .limit(1);
        return match.length > 0;
      }
    }
  } catch (err) {
    console.warn("[roadmap-generator] serviceZipCodes lookup failed, using constant:", err);
  }
  return CLARK_COUNTY_ZIPS.has(five);
}
