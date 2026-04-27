/**
 * Synthetic test for the Portal Roadmap router. Exercises the pure helper
 * functions that don't need a DB or session — proves the booking funnel's
 * stewardship pacing rules hold.
 *
 * Run: npx tsx scripts/synth-roadmap-test.mjs
 */
import { generateThoughtfulWindows } from "../server/routers/portalRoadmap.ts";

const fail = (msg) => {
  console.error("FAIL:", msg);
  process.exit(1);
};
const ok = (msg) => console.log("OK:", msg);

// 1. Window generator pacing — 4 weekday windows, all 5+ days out.
const monday = new Date("2026-04-27T10:00:00Z");
const windows = generateThoughtfulWindows(monday);

if (windows.length !== 4) fail(`expected 4 windows, got ${windows.length}`);
for (const w of windows) {
  const d = new Date(w.startIso);
  const day = d.getDay();
  if (day === 0 || day === 6) fail(`weekend slot offered: ${w.label}`);
  const daysOut = (d.getTime() - monday.getTime()) / 86_400_000;
  if (daysOut < 5) fail(`slot less than 5 days out: ${w.label}`);
  if (![10, 14].includes(d.getUTCHours()) && ![10, 14].includes(d.getHours()))
    fail(`unexpected hour: ${w.label}`);
}
ok("4 weekday windows, all 5+ days out, mornings & afternoons");

// 2. Mix of mornings and afternoons (visual variety).
const hours = new Set(windows.map((w) => new Date(w.startIso).getHours()));
if (hours.size < 2) fail("expected mix of AM/PM windows");
ok("mix of morning and afternoon windows");

// 3. Friday boundary — generator from Friday morning should still skip weekend.
const friday = new Date("2026-05-01T08:00:00Z");
const fridayWindows = generateThoughtfulWindows(friday);
for (const w of fridayWindows) {
  const day = new Date(w.startIso).getDay();
  if (day === 0 || day === 6) fail(`weekend slot offered from Friday seed: ${w.label}`);
}
ok("weekend skip holds when seed is Friday");

console.log("\nAll synthetic checks passed.");
