/**
 * Seed script: 360 Method — PNW Seasonal Checklist Tasks
 * Run once: node server/seed-360-checklists.mjs
 *
 * Idempotent: clears existing PNW checklist rows before inserting.
 */

import "dotenv/config";
import mysql from "mysql2/promise";

const db = await mysql.createConnection(process.env.DATABASE_URL);

// Clear existing PNW rows so re-runs are safe
await db.execute(
  "DELETE FROM threeSixtyChecklist WHERE region = 'PNW'"
);

const tasks = [
  // ─── SPRING ──────────────────────────────────────────────────────────────
  // Inspect
  { season: "spring", category: "inspect", taskName: "Roof — moss colonies, lifted shingles, cracked flashing", description: "Use binoculars from ground or ladder. Check around chimneys, skylights, and valleys. Moss rhizoids lift shingles and cause leaks.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 10 },
  { season: "spring", category: "inspect", taskName: "Gutters & downspouts — pine needle/moss clogs, sag, fascia separation", description: "Douglas Fir needles and moss are the primary PNW clog culprits. Check for sag and separation from fascia board.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 20 },
  { season: "spring", category: "inspect", taskName: "Fascia & soffit — rot from winter moisture wicking", description: "Probe fascia with a screwdriver. Soft spots indicate rot. Common where gutters overflow or downspouts are clogged.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 30 },
  { season: "spring", category: "inspect", taskName: "Crawl space — vapor barrier, standing water, mold, wood rot", description: "PNW clay soil holds water. Check vapor barrier integrity, look for standing water, inspect floor joists for mold or rot.", estimatedMinutes: 30, isUpsellTrigger: true, sortOrder: 40 },
  { season: "spring", category: "inspect", taskName: "Foundation perimeter — soil slope, cracks, efflorescence", description: "Ground should slope away from foundation. Efflorescence (white mineral deposits) indicates hydrostatic pressure and water intrusion.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 50 },
  { season: "spring", category: "inspect", taskName: "Exterior siding — algae/moss staining, paint peeling, caulk failure", description: "PNW moisture causes algae and moss on north-facing siding. Check caulk at all seams, corners, and window/door frames.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 60 },
  { season: "spring", category: "inspect", taskName: "Deck & fence — board rot, post rot, fastener rust, ledger board moisture", description: "Ledger board connection to house is highest-risk rot point. Check post bases for ground contact rot. Probe soft boards.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 70 },
  { season: "spring", category: "inspect", taskName: "Driveway & walkways — freeze-thaw crack propagation", description: "PNW freeze-thaw cycles widen cracks each winter. Document new cracks and flag for sealing during dry summer window.", estimatedMinutes: 10, isUpsellTrigger: false, sortOrder: 80 },
  { season: "spring", category: "inspect", taskName: "Window & door seals — caulk shrinkage, frame swelling/sticking", description: "Wood frames swell in wet winters and may stick or warp. Check caulk for gaps at all exterior penetrations.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 90 },
  { season: "spring", category: "inspect", taskName: "Pest entry points — carpenter ants, moisture ants", description: "Carpenter ants and moisture ants are common after wet PNW winters. Look for frass (sawdust), trails, and soft wood near moisture.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 100 },
  // Service
  { season: "spring", category: "service", taskName: "Clean gutters & flush downspouts", description: "Remove all debris. Flush with hose. Confirm water exits at downspout base away from foundation.", estimatedMinutes: 45, isUpsellTrigger: false, sortOrder: 110 },
  { season: "spring", category: "service", taskName: "Apply zinc-based moss inhibitor to roof (soft-application)", description: "Spray-apply zinc sulfate or liquid zinc solution. Do NOT pressure wash — granule loss shortens roof life.", estimatedMinutes: 30, isUpsellTrigger: false, sortOrder: 120 },
  { season: "spring", category: "service", taskName: "Test all GFCI outlets (exterior, garage, bathrooms)", description: "Press test/reset on each GFCI. Replace any that fail to trip or reset.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 130 },
  { season: "spring", category: "service", taskName: "Test smoke & CO detectors — replace batteries", description: "Test each unit. Replace batteries. Units older than 10 years (smoke) or 7 years (CO) should be replaced.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 140 },
  { season: "spring", category: "service", taskName: "Test sump pump operation (if present)", description: "Pour water into pit to trigger float. Confirm pump activates and discharges properly.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 150 },
  { season: "spring", category: "service", taskName: "Service heat pump / HVAC — replace filter", description: "Replace air filter. Clean accessible coils. Schedule professional tune-up if flagged.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 160 },
  { season: "spring", category: "service", taskName: "Lubricate garage door — hinges, rollers, test auto-reverse", description: "Apply silicone spray to hinges and rollers. Test auto-reverse with a 2x4 on the floor.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 170 },
  { season: "spring", category: "service", taskName: "Restart irrigation system — check heads, test zones", description: "Turn on system, walk all zones, adjust heads for coverage. Repair broken heads.", estimatedMinutes: 30, isUpsellTrigger: true, sortOrder: 180 },
  { season: "spring", category: "service", taskName: "Inspect & clean dryer vent", description: "Disconnect vent from dryer, clean full length with brush kit. Lint buildup is a fire hazard and reduces efficiency.", estimatedMinutes: 30, isUpsellTrigger: false, sortOrder: 190 },

  // ─── SUMMER ──────────────────────────────────────────────────────────────
  // Inspect
  { season: "summer", category: "inspect", taskName: "Roof — moss treatment effectiveness, flagged spring areas", description: "Confirm zinc treatment is working. Re-inspect any areas flagged in spring. Best dry-weather access window.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 10 },
  { season: "summer", category: "inspect", taskName: "Deck & fence — spring repair effectiveness, new rot or fastener failure", description: "Follow up on spring flags. Check any new boards or posts installed. Look for new fastener rust.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 20 },
  { season: "summer", category: "inspect", taskName: "Exterior paint — peeling, chalking, cracking on siding and trim", description: "Dry summer is the only window to paint in PNW. Flag areas for repainting before fall rains return.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 30 },
  { season: "summer", category: "inspect", taskName: "Attic — ventilation adequacy, insulation condition, condensation signs", description: "Check soffit and ridge vents for blockage. Look for dark staining on roof decking (condensation/mold from prior winter).", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 40 },
  { season: "summer", category: "inspect", taskName: "Trees — dead limbs over roof, limbs within 6 ft of roof surface", description: "Douglas Fir and big-leaf maple are common culprits. Dead limbs can fall during summer wind events.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 50 },
  { season: "summer", category: "inspect", taskName: "Driveway & walkways — crack sealing opportunity while dry", description: "Summer is the only reliable window for crack sealing in PNW. Flag and schedule before September.", estimatedMinutes: 10, isUpsellTrigger: false, sortOrder: 60 },
  { season: "summer", category: "inspect", taskName: "Window screens — tears, bent frames, missing screens", description: "Check all screens. PNW summers are the primary window-open season.", estimatedMinutes: 10, isUpsellTrigger: false, sortOrder: 70 },
  // Service
  { season: "summer", category: "service", taskName: "Soft-wash siding & walkways (algae/moss removal)", description: "Low-pressure soft wash with appropriate cleaner. Critical for PNW homes — algae returns every winter.", estimatedMinutes: 60, isUpsellTrigger: false, sortOrder: 80 },
  { season: "summer", category: "service", taskName: "Reseal deck surface (if flagged from spring inspection)", description: "Apply water-repellent sealer to clean, dry deck. Only effective when wood moisture content is below 15%.", estimatedMinutes: 90, isUpsellTrigger: false, sortOrder: 90 },
  { season: "summer", category: "service", taskName: "HVAC filter replacement (2nd of year)", description: "Replace air filter. Check condensate drain line for algae blockage (more common in humid PNW summers).", estimatedMinutes: 15, isUpsellTrigger: false, sortOrder: 100 },
  { season: "summer", category: "service", taskName: "Clean window tracks & screens", description: "Remove screens, wash with mild soap. Clean tracks and weep holes. Reinstall.", estimatedMinutes: 30, isUpsellTrigger: false, sortOrder: 110 },
  { season: "summer", category: "service", taskName: "Test all smoke & CO detectors", description: "Mid-year test. Replace any units that fail.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 120 },
  { season: "summer", category: "service", taskName: "Check & tighten all exterior hose bib connections", description: "Inspect for drips at connection points. Tighten packing nut or replace washers.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 130 },
  { season: "summer", category: "service", taskName: "Inspect & clean range hood filter", description: "Remove and degrease filter. Replace if damaged. Check fan operation.", estimatedMinutes: 20, isUpsellTrigger: false, sortOrder: 140 },
  { season: "summer", category: "service", taskName: "Check attic access hatch seal", description: "Inspect weatherstripping on attic hatch. Unsealed hatches are a major heat loss and moisture pathway.", estimatedMinutes: 10, isUpsellTrigger: false, sortOrder: 150 },
  { season: "summer", category: "service", taskName: "Lubricate all door hinges & hardware", description: "Apply silicone spray or 3-in-1 oil to all interior and exterior door hinges, locks, and deadbolts.", estimatedMinutes: 20, isUpsellTrigger: false, sortOrder: 160 },

  // ─── FALL ─────────────────────────────────────────────────────────────────
  // Inspect
  { season: "fall", category: "inspect", taskName: "Roof — final pre-rain inspection, moss re-growth since spring treatment", description: "Last chance before 5 months of rain. Check spring treatment effectiveness. Flag any new damage.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 10 },
  { season: "fall", category: "inspect", taskName: "Gutters — leaf accumulation (Douglas Fir, big-leaf maple, alder)", description: "PNW leaf drop is heavy and fast. Gutters can fill in days during peak drop. Check twice in October.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 20 },
  { season: "fall", category: "inspect", taskName: "Chimney & fireplace — cap, flashing, firebox (if wood-burning)", description: "Check chimney cap for damage. Inspect flashing for gaps. Look for creosote buildup in firebox.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 30 },
  { season: "fall", category: "inspect", taskName: "Crawl space — vapor barrier & drainage before saturation season", description: "Re-inspect before heavy rains. Confirm vapor barrier is intact and drainage is clear.", estimatedMinutes: 25, isUpsellTrigger: true, sortOrder: 40 },
  { season: "fall", category: "inspect", taskName: "Foundation drainage — downspout extensions, French drain inlets, storm drains", description: "Confirm all downspouts extend at least 6 ft from foundation. Clear French drain inlets of debris.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 50 },
  { season: "fall", category: "inspect", taskName: "Exterior caulk — windows, doors, penetrations (last dry chance)", description: "September/October is the last reliable dry window. Flag all gaps for immediate sealing.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 60 },
  { season: "fall", category: "inspect", taskName: "Sump pump — test before first major rain event", description: "Test float and pump cycle. Confirm discharge line is clear and directed away from foundation.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 70 },
  { season: "fall", category: "inspect", taskName: "Heating system — furnace or heat pump readiness for winter load", description: "Check filter, test operation, listen for unusual sounds. Schedule professional service if flagged.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 80 },
  { season: "fall", category: "inspect", taskName: "Walkways & driveway — algae growth, crack sealing before freeze", description: "Algae returns in fall. Cracks must be sealed before freeze-thaw cycles begin (typically December).", estimatedMinutes: 15, isUpsellTrigger: false, sortOrder: 90 },
  // Service
  { season: "fall", category: "service", taskName: "Clean gutters & flush downspouts (most critical PNW task)", description: "Remove all debris. Flush with hose. High-flow test for underground clogs. Schedule second clean if heavy leaf drop continues.", estimatedMinutes: 60, isUpsellTrigger: false, sortOrder: 100 },
  { season: "fall", category: "service", taskName: "High-flow test downspouts for underground clogs", description: "Run hose at full pressure through each downspout. Watch for slow drain or backup indicating underground blockage.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 110 },
  { season: "fall", category: "service", taskName: "Winterize all exterior hose bibs — disconnect hoses, install covers", description: "Disconnect all garden hoses. Install insulated faucet covers. Shut off interior valve if present.", estimatedMinutes: 20, isUpsellTrigger: false, sortOrder: 120 },
  { season: "fall", category: "service", taskName: "Apply weatherstripping to exterior doors showing daylight gaps", description: "Hold a flashlight inside at night to find gaps. Replace foam, V-strip, or door sweep as needed.", estimatedMinutes: 30, isUpsellTrigger: false, sortOrder: 130 },
  { season: "fall", category: "service", taskName: "Replace HVAC filter (3rd of year)", description: "Replace air filter before heating season begins. Check thermostat batteries.", estimatedMinutes: 15, isUpsellTrigger: false, sortOrder: 140 },
  { season: "fall", category: "service", taskName: "Test sump pump — run full cycle", description: "Pour water into pit to trigger float. Confirm pump activates and discharges properly before rain season.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 150 },
  { season: "fall", category: "service", taskName: "Test smoke & CO detectors — replace batteries", description: "Annual battery replacement. Test each unit. Replace units older than 10 years (smoke) or 7 years (CO).", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 160 },
  { season: "fall", category: "service", taskName: "Clear debris from storm drains adjacent to property", description: "Leaf-clogged street drains cause flooding that backs up to foundations. Clear within 10 ft of property.", estimatedMinutes: 15, isUpsellTrigger: false, sortOrder: 170 },
  { season: "fall", category: "service", taskName: "Store or cover outdoor furniture & equipment", description: "Clean and store or cover patio furniture, grills, and outdoor equipment before November rains.", estimatedMinutes: 30, isUpsellTrigger: false, sortOrder: 180 },
  { season: "fall", category: "service", taskName: "Seal visible walkway cracks before freeze season", description: "Use polyurethane or epoxy crack filler. Must be applied in dry conditions above 40°F.", estimatedMinutes: 30, isUpsellTrigger: false, sortOrder: 190 },

  // ─── WINTER ───────────────────────────────────────────────────────────────
  // Inspect
  { season: "winter", category: "inspect", taskName: "Attic — condensation on roof decking, insulation settlement", description: "Dark staining on decking indicates condensation from inadequate ventilation. Common in PNW homes with poor soffit/ridge vent balance.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 10 },
  { season: "winter", category: "inspect", taskName: "Crawl space — standing water after fall rains, vapor barrier displacement", description: "Check after first major rain events. Standing water indicates drainage failure. Displaced vapor barrier allows moisture into floor system.", estimatedMinutes: 25, isUpsellTrigger: true, sortOrder: 20 },
  { season: "winter", category: "inspect", taskName: "Pipes in unheated spaces — garage, crawl space, exterior walls", description: "PNW homes rarely have pipe insulation. Arctic outflow events (rare but severe) can freeze pipes in garages and crawl spaces.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 30 },
  { season: "winter", category: "inspect", taskName: "Roof — ice dam risk areas (north-facing, low-pitch, valleys)", description: "Ice dams are uncommon in PNW but devastating when they occur. Check north-facing sections and valleys after any snow/freeze event.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 40 },
  { season: "winter", category: "inspect", taskName: "Window condensation — persistent interior condensation, failed seals", description: "Some condensation is normal in PNW winters. Persistent condensation between panes indicates failed seal. Interior condensation indicates high humidity.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 50 },
  { season: "winter", category: "inspect", taskName: "Trees — limbs at risk of snow/ice load failure over roof or power lines", description: "PNW ice storms are rare but cause significant tree damage. Identify limbs that could fall on roof, car, or power lines.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 60 },
  { season: "winter", category: "inspect", taskName: "Walkways — algae & moss re-growth creating slip hazard", description: "Algae and moss return quickly on shaded PNW walkways. Wet moss is extremely slippery.", estimatedMinutes: 10, isUpsellTrigger: false, sortOrder: 70 },
  // Service
  { season: "winter", category: "service", taskName: "Test all smoke & CO detectors", description: "Mid-winter test. Heating season increases CO risk. Replace any units that fail.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 80 },
  { season: "winter", category: "service", taskName: "Replace HVAC filter (4th of year — if needed)", description: "Check filter condition. Replace if dirty. PNW homes with wood stoves may need more frequent replacement.", estimatedMinutes: 15, isUpsellTrigger: false, sortOrder: 90 },
  { season: "winter", category: "service", taskName: "Reverse ceiling fans to push warm air down", description: "Switch fan direction to clockwise (when viewed from below) to push warm air down from ceiling. Reduces heating costs.", estimatedMinutes: 10, isUpsellTrigger: false, sortOrder: 100 },
  { season: "winter", category: "service", taskName: "Inspect & clean bathroom exhaust fans (moisture management)", description: "Remove cover, vacuum motor and blades. Confirm fan vents to exterior (not attic). Critical for PNW moisture control.", estimatedMinutes: 20, isUpsellTrigger: true, sortOrder: 110 },
  { season: "winter", category: "service", taskName: "Check pipe insulation in crawl space & garage", description: "Inspect existing insulation for gaps or damage. Add foam pipe insulation to any exposed pipes in unheated spaces.", estimatedMinutes: 25, isUpsellTrigger: true, sortOrder: 120 },
  { season: "winter", category: "service", taskName: "Test GFCI outlets (interior — kitchen, bathrooms)", description: "Press test/reset on each interior GFCI. Replace any that fail.", estimatedMinutes: 15, isUpsellTrigger: true, sortOrder: 130 },
  { season: "winter", category: "service", taskName: "Check emergency water shutoff valve — confirm location & operation", description: "Locate main shutoff. Turn off and on to confirm it operates freely. Seized shutoffs are a major emergency risk.", estimatedMinutes: 10, isUpsellTrigger: true, sortOrder: 140 },
  { season: "winter", category: "service", taskName: "Inspect & clean range hood filter", description: "Remove and degrease filter. Replace if damaged. Check fan operation.", estimatedMinutes: 20, isUpsellTrigger: false, sortOrder: 150 },
  { season: "winter", category: "service", taskName: "Check weatherstripping on all exterior doors", description: "Inspect for compression failure, tears, or gaps. Replace as needed. Critical for heating efficiency in PNW winters.", estimatedMinutes: 20, isUpsellTrigger: false, sortOrder: 160 },
  { season: "winter", category: "service", taskName: "Walkway algae treatment (zinc or copper-based, PNW-safe formula)", description: "Apply zinc sulfate or copper-based algae inhibitor. Use PNW-approved formula safe for stormwater runoff.", estimatedMinutes: 20, isUpsellTrigger: false, sortOrder: 170 },
];

let inserted = 0;
for (const task of tasks) {
  await db.execute(
    `INSERT INTO threeSixtyChecklist 
      (season, category, region, taskName, description, estimatedMinutes, isUpsellTrigger, sortOrder, active)
     VALUES (?, ?, 'PNW', ?, ?, ?, ?, ?, 1)`,
    [
      task.season,
      task.category,
      task.taskName,
      task.description,
      task.estimatedMinutes,
      task.isUpsellTrigger ? 1 : 0,
      task.sortOrder,
    ]
  );
  inserted++;
}

console.log(`✓ Seeded ${inserted} PNW checklist tasks across 4 seasons.`);
await db.end();
