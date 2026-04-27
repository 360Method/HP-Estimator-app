/**
 * scripts/generate-roadmap-sample.mjs
 *
 * Generate a sample 360° Priority Roadmap PDF from a hand-crafted Claude
 * response. Used to:
 *   • diff the deliverable visually against the design vision
 *   • include a versioned reference PDF in docs/samples/
 *   • smoke-test the renderer without needing an Anthropic API key
 *
 * Usage:  pnpm tsx scripts/generate-roadmap-sample.mjs
 * Output: docs/samples/roadmap-sample-<YYYY-MM-DD>.pdf
 *
 * The fixture is a realistic, voice-compliant Claude response for a
 * Vancouver, WA two-story craftsman built in 1992 with 18 findings across
 * NOW / SOON / WAIT. Edit MOCK_RESPONSE below to test new content shapes.
 */

import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { renderPriorityTranslationPdf } from "../server/lib/priorityTranslation/pdf.ts";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..");

const MOCK_RESPONSE = {
  executive_summary: [
    "Margaret, your home at 4218 NW Riverstone Court reads as a well-kept 1992 craftsman that has been quietly accumulating the kind of envelope and drainage attention that Pacific Northwest homes always do as they cross thirty. The inspector's report is thorough and, in our reading, fair — there is no single finding that should give you pause on the property, but there is a coherent story across the report that we'd like to walk you through.",
    "Three findings rise to the top. The composition roof is mid-life with localized flashing wear at the chimney and rear penetrations, and we'd address that this season before the next rain cycle. The original water heater is at 14 years and presenting the early-leak markers a careful inspector flags before they fail — that is a now item in our reading. The exterior trim and rake boards on the south and west elevations are showing the moisture cycle that PNW paint windows always show in year three or four post-paint, and we'd plan that into a single restoration visit next spring.",
    "Everything else organizes calmly into the next 6 to 18 months or onto a 3 to 5 year monitoring rhythm. Your portal is the living health record for this property — every finding here, every return visit, every written scope of work lives there, in one place. We've built this roadmap to be a calm reference, not a bid.",
  ].join("\n\n"),
  property_character: "A 1992 two-story craftsman in Vancouver's Felida district sits in the wettest band of Clark County's micro-climate — annual rainfall here trends 6 to 8 inches above the Vancouver downtown average, and gutter discipline matters more than it would two zip codes south. Homes of this era and configuration tend to age first at the south and west elevations (UV plus prevailing weather), then at the roof penetrations, then at the original mechanicals as they cross 12 to 15 years. The standard of care we're proposing reflects that rhythm.",
  closing: "This roadmap is the starting standard of care for your property — a calm reference, not a bid. When you're ready, the natural next step is a complimentary baseline walkthrough so we can see the home in person, confirm what's here, surface what isn't, and shape a written scope of work to the year ahead. We're glad you've trusted us with the read.",
  findings: [
    // ─── NOW ─────────────────────────────────────────────────────────────────
    {
      category: "Plumbing — water heater replacement (50 gal gas)",
      finding: "The original 50-gallon natural gas water heater shows minor corrosion at the cold-water inlet and a faint mineral trail on the south side of the tank. The inspector noted manufacture date 2011 and recommended proactive replacement.",
      interpretation: "At 14 years on a 10-to-12-year-rated tank in PNW water chemistry, this is squarely in the window where we see the silent slow leak that ruins a finished basement on a Tuesday morning. The mineral trail is the early signal, not yet a failure. Addressing this on a planned visit — rather than as an emergency — is the meaningful difference between a calm Saturday and a remediation project.",
      recommended_approach: "Restoration is not the right framing here; this is end-of-life replacement. We'd schedule a single morning visit, drain and remove the existing unit, install a same-footprint 50-gal high-efficiency replacement with a new expansion tank and seismic strapping, and haul the old unit. If you've ever considered moving to a tankless system, we'd happily quote that path as the alternate scope.",
      urgency: "NOW",
      investment_range_low_usd: 2400,
      investment_range_high_usd: 4200,
      reasoning: "Lifecycle exceeded with early leak markers; range matches the anchor for 50-gal gas replacement and assumes same-footprint swap.",
    },
    {
      category: "Roof — flashing restoration at chimney and penetrations",
      finding: "Inspector identified lifted step flashing at the masonry chimney's south face and degraded boot seals at two roof penetrations (plumbing vent and bath fan). Roof field appears mid-life with no widespread granule loss.",
      interpretation: "Penetrations and chimney flashing are where PNW roofs leak first — usually three to five years before the field itself shows distress. The boots in particular are in their failure window. Addressing this now buys the field roof another five to seven years of calm service before a full replacement conversation.",
      recommended_approach: "We'd combine this with the gutter discipline below into a single roof-and-envelope visit so the scaffolding sets up once. Restoration of the step flashing, replacement of both penetration boots, and a re-seal of the chimney crown perimeter. Two-day visit, one mobilization fee.",
      urgency: "NOW",
      investment_range_low_usd: 1400,
      investment_range_high_usd: 3600,
      reasoning: "Anchor: chimney crown and flashing restoration. Range narrowed because penetration boots are included and chimney crown itself appears intact.",
    },
    {
      category: "Electrical — GFCI restoration at exterior and garage circuits",
      finding: "Three exterior outlets and the garage circuit lacked working GFCI protection. One outlet on the rear deck failed the inspector's trip test.",
      interpretation: "This is a code-of-the-day finding — homes of this era were not required to have GFCI on these circuits when built — but it matters because the rear deck outlet is the one most likely to see weather, holiday lighting load, and bare feet on a wet evening.",
      recommended_approach: "Single-visit restoration. Replace the four affected receptacles with weather-resistant GFCI units; verify upstream wiring is intact at each rough-in. Roughly a half-day visit by our vetted electrician.",
      urgency: "NOW",
      investment_range_low_usd: 425,
      investment_range_high_usd: 950,
      reasoning: "Anchor: GFCI/AFCI per circuit × ~3 affected; safety category, conservative bucket.",
    },
    // ─── SOON ────────────────────────────────────────────────────────────────
    {
      category: "Gutter system — re-pitch and downspout extension",
      finding: "Inspector noted standing water at three gutter sections after recent rain and downspouts terminating within 18 inches of the foundation on the south and west elevations.",
      interpretation: "In Felida's rain band, every inch of standing water in a gutter and every foot a downspout falls short of the drip line is foundation moisture you'll pay for at year ten. The framing here is not urgency, it is discipline — getting the water 6 feet away from the home is the single highest-leverage stewardship move on this property.",
      recommended_approach: "We'd pair this with the roof flashing work above for a single envelope visit. Re-pitch the three sagging sections, add splash blocks plus 6-foot downspout extensions on the four critical drops, and document the discharge points in the portal so we can monitor at the next assessment.",
      urgency: "SOON",
      investment_range_low_usd: 425,
      investment_range_high_usd: 950,
      reasoning: "Anchor: gutter cleaning and re-pitch; assumes existing gutters are sound and only labor + drop accessories.",
    },
    {
      category: "Exterior trim — restoration on south and west elevations",
      finding: "The inspector flagged paint film failure and early wood-fiber lift on rake boards, fascia returns, and two window casings on the south and west elevations.",
      interpretation: "Year three or four post-paint is exactly when the south and west elevations of a 1992 craftsman start showing the cycle — the paint window is closing. Addressing trim restoration as a standalone scope before re-paint extends the next paint cycle by three to five years and prevents the wood-rot conversation that this otherwise becomes at year seven.",
      recommended_approach: "A single restoration visit. Selective wood-replacement at the four worst lift points, prime and feather, plot in the bordering trim for full continuity, and finish-paint the affected elevations only. We'd plan this for late spring when the moisture content is right.",
      urgency: "SOON",
      investment_range_low_usd: 1200,
      investment_range_high_usd: 5500,
      reasoning: "Anchor: exterior trim restoration and paint; range reflects which elevations are scoped — left wide because the inspector's photos suggest mid-range scope.",
    },
    {
      category: "HVAC — furnace tune-up and ductwork balance",
      finding: "Inspector noted the 80%-AFUE forced-air furnace (2008) is operating but has dust accumulation in the supply plenum and uneven supply temperatures across the second floor.",
      interpretation: "The furnace itself has serviceable years left — it is the duct balance that is creating the second-floor temperature swing the inspector flagged. This is a comfort-and-efficiency item, not a safety item, and the right window is before the heating season starts in earnest.",
      recommended_approach: "Combined visit: full tune-up, supply plenum cleaning, and a duct balance with manometer readings at every register. We'd note any leakage findings in the portal so we can sequence a sealing scope into the next year if needed.",
      urgency: "SOON",
      investment_range_low_usd: 285,
      investment_range_high_usd: 475,
      reasoning: "Anchor: HVAC maintenance tune-up. Balance work fits within the typical visit; not a separate ductwork rebuild.",
    },
    {
      category: "Crawlspace — vapor barrier renewal",
      finding: "Inspector observed the original 6-mil vapor barrier is torn at access points and gapped along the perimeter; relative humidity reading was 68% on the day of inspection.",
      interpretation: "68% in the crawl is on the high side for a PNW summer reading and tells us the barrier is doing meaningfully less than its job. Crawlspace humidity is the quiet driver of subfloor and joist health on homes of this era — this is a stewardship item, addressed now to prevent a much larger conversation in the 5-to-7-year horizon.",
      recommended_approach: "Single-day restoration: remove the existing barrier, prep the substrate, install a continuous 10-mil reinforced barrier with mechanical fastening at the perimeter, and seal at access points. We'd recommend humidity monitoring for the first 90 days and document baseline in the portal.",
      urgency: "SOON",
      investment_range_low_usd: 2200,
      investment_range_high_usd: 6400,
      reasoning: "Anchor: crawlspace vapor barrier and drainage. Range left wide because perimeter linear footage was not stated in the report.",
    },
    {
      category: "Window — weatherstrip restoration on operable sashes",
      finding: "Inspector tested 8 operable windows; weatherstripping was compressed or missing on 5 sashes, with visible condensation lines on two living-room windows.",
      interpretation: "These are the original 1992 vinyl windows, mid-life and serviceable — replacement is not the right framing. The weatherstrip is what's failing, and that drives both comfort and the condensation lines the inspector noted. A targeted restoration extends the useful life of the existing windows by another 8 to 10 years.",
      recommended_approach: "Half-day visit. Replace weatherstrip on the five affected sashes, verify operating hardware, and clean the weep paths. We'd document remaining sashes in the portal so we can return for a second pass if needed.",
      urgency: "SOON",
      investment_range_low_usd: 285,
      investment_range_high_usd: 750,
      reasoning: "Anchor: window weatherstrip and glazing restoration. Range covers 5 sashes plus a small materials buffer.",
    },
    {
      category: "Foundation — minor crack monitoring",
      finding: "Two hairline cracks (under 1/16 inch) in the north foundation wall, neither displaced or stepped. Inspector recommended monitoring.",
      interpretation: "Cracks of this character on a 1992 foundation are almost always thermal-cycling settlement, not structural movement. The inspector's call to monitor is the right one. We'd document baseline measurements in the portal and revisit at every assessment.",
      recommended_approach: "No immediate work. We'd photograph and tag both cracks with reference scale on the next walkthrough, log them in the portal, and re-measure at the 12-month return.",
      urgency: "WAIT",
      investment_range_low_usd: 0,
      investment_range_high_usd: 0,
      reasoning: "Monitoring item — no investment range applicable. Documented in the portal for tracking only.",
    },
    {
      category: "HVAC — heat pump replacement (3-ton)",
      finding: "The 2008 outdoor condenser unit (3-ton) is operating within spec. Inspector noted age-of-equipment as a planning consideration.",
      interpretation: "At 17 years, the unit is past the typical service-life midpoint but operating well. This is a planning item for the 3-to-5-year horizon, not the 18-month horizon. When replacement does come, the window before the next heating season is the right time to schedule.",
      recommended_approach: "No work today. We'd track operating performance at every annual visit and flag for active planning when the condenser shows the second sign of decline (refrigerant top-off, capacitor replacement, etc.).",
      urgency: "WAIT",
      investment_range_low_usd: 9500,
      investment_range_high_usd: 16500,
      reasoning: "Anchor: heat pump replacement (3-ton). Listed for transparency on future budgeting; not scheduled.",
    },
  ],
  summary_1_paragraph: "Margaret, your home at 4218 NW Riverstone Court reads as a well-kept 1992 craftsman that has been quietly accumulating the kind of envelope and drainage attention that Pacific Northwest homes always do as they cross thirty. The inspector's report is thorough and, in our reading, fair — there is no single finding that should give you pause on the property, but there is a coherent story across the report that we'd like to walk you through.",
};

async function main() {
  console.log("[sample] rendering 360° Priority Roadmap PDF...");
  const pdfBuffer = await renderPriorityTranslationPdf({
    firstName: "Margaret",
    propertyAddress: "4218 NW Riverstone Court, Vancouver, WA 98685",
    claudeResponse: MOCK_RESPONSE,
    editionDate: new Date("2026-04-26T00:00:00Z"),
  });

  const today = new Date().toISOString().slice(0, 10);
  const outDir = resolve(REPO_ROOT, "docs", "samples");
  mkdirSync(outDir, { recursive: true });
  // Write both the dated v2 file AND the canonical "latest" file the funnel
  // site embeds. Keeping the dated file lets us diff visually against past
  // editions; the canonical file lets the marketing site link to a stable URL.
  const versionTag = process.env.ROADMAP_SAMPLE_VERSION || "v2";
  const datedPath = resolve(outDir, `roadmap-sample-${today}-${versionTag}.pdf`);
  const canonicalPath = resolve(outDir, `roadmap-sample-latest.pdf`);
  writeFileSync(datedPath, pdfBuffer);
  writeFileSync(canonicalPath, pdfBuffer);
  const outPath = datedPath;

  const sizeKb = (pdfBuffer.byteLength / 1024).toFixed(1);
  console.log(`[sample] wrote ${outPath} (${sizeKb} KB, ${MOCK_RESPONSE.findings.length} findings)`);
}

main().catch((err) => {
  console.error("[sample] failed:", err);
  process.exit(1);
});
