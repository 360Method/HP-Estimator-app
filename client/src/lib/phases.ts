// ============================================================
// HP Field Estimator v4 — All 17 Phase Groups with Line Items
// Portland Metro Labor Rates (2025/2026) — Mid-to-High-End
// ============================================================

import { PhaseGroup, LineItem, TierData, DimensionOption } from './types';

// Helper to build a TierData set
function tiers(
  goodRate: number, goodName: string, goodDesc: string,
  betterRate: number, betterName: string, betterDesc: string,
  bestRate: number, bestName: string, bestDesc: string,
  photos?: { good?: string; better?: string; best?: string },
  specs?: { good?: string; better?: string; best?: string },
): { good: TierData; better: TierData; best: TierData } {
  return {
    good:   { rate: goodRate,   name: goodName,   desc: goodDesc,   photo: photos?.good,   specs: specs?.good },
    better: { rate: betterRate, name: betterName, desc: betterDesc, photo: photos?.better, specs: specs?.better },
    best:   { rate: bestRate,   name: bestName,   desc: bestDesc,   photo: photos?.best,   specs: specs?.best },
  };
}

// Helper to build a labor-only item (no material tiers)
function laborItem(
  id: string, name: string, shortName: string,
  unitType: LineItem['unitType'],
  hrsPerUnit: number, laborRate: number,
  salesDesc: string, sowTemplate: string,
  flagged = false, flagNote = '',
): LineItem {
  return {
    id, name, shortName, unitType,
    qty: 0, wastePct: 0,
    hasTiers: false,
    tier: 'good',
    tiers: tiers(0,'','', 0,'','', 0,'',''),
    laborMode: 'hr',
    laborRate,
    hrsPerUnit,
    flatRatePerUnit: 0,
    hasPaintPrep: false,
    paintPrep: 'none',
    paintRate: 0,
    flagged, flagNote,
    enabled: true,
    notes: '',
    salesDesc,
    sowTemplate,
    salesSelected: false,
    markupPct: null,
  };
}

// Helper to build a full material + labor item
function matItem(
  id: string, name: string, shortName: string,
  unitType: LineItem['unitType'],
  tierData: { good: TierData; better: TierData; best: TierData },
  hrsPerUnit: number, laborRate: number,
  salesDesc: string, sowTemplate: string,
  wastePct = 10,
  hasPaintPrep = false,
  flagged = false, flagNote = '',
  dimensionOptions?: DimensionOption[],
): LineItem {
  return {
    id, name, shortName, unitType,
    qty: 0, wastePct,
    hasTiers: true,
    tier: 'good',
    tiers: tierData,
    laborMode: 'hr',
    laborRate,
    hrsPerUnit,
    flatRatePerUnit: 0,
    hasPaintPrep,
    paintPrep: 'none',
    paintRate: laborRate,
    flagged, flagNote,
    enabled: true,
    notes: '',
    salesDesc,
    sowTemplate,
    salesSelected: false,
    markupPct: null,
    dimensionOptions,
    selectedDimension: dimensionOptions?.[0]?.value,
  };
}

// ─── PORTLAND METRO LABOR RATES (2025/2026) ───────────────────
// Fully-burdened subcontractor billing rates for mid-to-high-end work
// Sources: Suite Additions, Amplified Renovations, Angi, Portland Contractor Authority
const L_GC       = 125;  // General Contractor / Lead Carpenter
const L_CARP     = 95;   // Journeyman Carpenter / Trim
const L_TILE     = 90;   // Tile Setter (standard)
const L_TILE_ADV = 115;  // Tile Setter (complex patterns / large format)
const L_PLUMB    = 125;  // Licensed Plumber
const L_ELEC     = 110;  // Licensed Electrician
const L_HVAC     = 120;  // HVAC Technician
const L_DRYWALL  = 80;   // Drywall Hanger / Finisher
const L_PAINT    = 80;   // Painter (interior)
const L_FLOOR    = 90;   // Flooring Installer (hardwood/tile)
const L_FLOOR_LVP = 70;  // Flooring Installer (LVP/laminate)
const L_DEMO     = 65;   // Demo / Labor
const L_MASON    = 90;   // Concrete / Masonry
const L_ROOF     = 90;   // Roofing

// ─── PHASE 1: PRE-CONSTRUCTION ────────────────────────────────
const phase1: PhaseGroup = {
  id: 1, name: 'Pre-Construction', icon: '📋',
  description: 'Site assessment, permitting, material procurement, and subcontractor coordination before any work begins.',
  items: [
    laborItem('p1-site', 'Site Assessment / Measurements', 'Site assessment', 'hr', 1, L_GC,
      'Detailed site walk, measurements, and project scoping.',
      'Site assessment and measurements — {qty} hrs'),
    laborItem('p1-permit', 'Permit Pulling', 'Permit pulling', 'unit', 4, L_GC,
      'Permit application, submission, and coordination with the building department.',
      'Permit pulling — {qty} permit(s)'),
    laborItem('p1-material', 'Material Procurement / Lead Time Tracking', 'Material procurement', 'hr', 1, L_GC,
      'Sourcing materials, tracking lead times, and coordinating deliveries.',
      'Material procurement and scheduling — {qty} hrs'),
    laborItem('p1-sub', 'Subcontractor Scheduling', 'Sub scheduling', 'hr', 1, L_GC,
      'Coordinating subcontractor schedules and sequencing.',
      'Subcontractor scheduling — {qty} hrs'),
  ],
};

// ─── PHASE 2: DEMOLITION & ROUGH WORK ─────────────────────────
const phase2: PhaseGroup = {
  id: 2, name: 'Demo & Rough Work', icon: '🔨',
  description: 'Removal of existing materials, debris haul-away, and any hazardous material abatement required to prepare the space.',
  items: [
    matItem('p2-demo-int', 'Interior Demolition', 'Interior demo', 'sqft',
      tiers(
        0.65,'Standard demo','Walls, ceilings, flooring, fixtures',
        1.00,'Selective demo','Careful removal preserving adjacent surfaces',
        1.50,'Precision demo','Detailed selective demo, minimal disruption'
      ),
      0.012, L_DEMO,
      'Removal of existing walls, ceilings, flooring, and fixtures.',
      'Interior demolition — {qty} sq ft', 0),
    matItem('p2-demo-ext', 'Exterior Demolition', 'Exterior demo', 'sqft',
      tiers(
        0.80,'Standard exterior demo','Siding, decking, fencing, roofing',
        1.20,'Selective exterior demo','Careful removal',
        1.75,'Precision exterior demo','Detailed selective removal'
      ),
      0.015, L_DEMO,
      'Removal of existing siding, decking, fencing, or roofing.',
      'Exterior demolition — {qty} sq ft', 0),
    laborItem('p2-haul', 'Haul-Away / Dumpster', 'Debris haul-away', 'load', 3, L_DEMO,
      'Debris removal and dumpster service.',
      'Debris haul-away — {qty} load(s)'),
    laborItem('p2-hazmat', 'Asbestos / Hazmat Testing & Abatement', 'Hazmat abatement', 'unit', 8, L_GC,
      'Testing and abatement of hazardous materials.',
      'Hazmat testing/abatement — {qty} area(s)', true, 'Sub specialty — licensed abatement contractor required'),
    laborItem('p2-struct', 'Structural Work (Beams, Posts, Headers)', 'Structural work', 'unit', 8, L_GC,
      'Beam work, post replacement, and header installation.',
      'Structural work — {qty} location(s)', true, 'Engineer review required'),
  ],
};

// ─── PHASE 3: MECHANICAL ROUGH-IN ─────────────────────────────
const phase3: PhaseGroup = {
  id: 3, name: 'Mechanical Rough-In', icon: '🔧',
  description: 'Rough-in of plumbing, electrical, HVAC, and gas lines before walls are closed — all work performed by licensed contractors.',
  items: [
    laborItem('p3-plumb', 'Plumbing Rough-In', 'Plumbing rough-in', 'fixture', 4, L_PLUMB,
      'Supply lines, DWV, and new drain locations.',
      'Plumbing rough-in — {qty} fixture(s)', true, 'Licensed plumber required'),
    laborItem('p3-elec', 'Electrical Rough-In', 'Electrical rough-in', 'circuit', 3, L_ELEC,
      'Panel work, new circuits, and rough wire.',
      'Electrical rough-in — {qty} circuit(s)', true, 'Licensed electrician required'),
    laborItem('p3-hvac', 'HVAC Rough-In', 'HVAC rough-in', 'unit', 8, L_HVAC,
      'Duct work, new runs, and equipment sizing.',
      'HVAC rough-in — {qty} unit(s)', true, 'Licensed HVAC contractor required'),
    laborItem('p3-gas', 'Gas Lines', 'Gas lines', 'unit', 4, L_PLUMB,
      'New gas runs and appliance stubs.',
      'Gas line work — {qty} location(s)', true, 'Licensed gas contractor required'),
  ],
};

// ─── PHASE 4: INSULATION & WEATHERPROOFING ────────────────────
const phase4: PhaseGroup = {
  id: 4, name: 'Insulation & Weatherproofing', icon: '🏠',
  description: 'Insulation installation and weather barrier application to improve energy efficiency, comfort, and moisture protection.',
  items: [
    matItem('p4-batt', 'Batt Insulation', 'Batt insulation', 'sqft',
      tiers(
        0.65,'R-13 fiberglass batt','Standard 2×4 wall insulation',
        1.00,'R-19 fiberglass batt','Upgraded 2×6 wall/ceiling insulation',
        1.60,'R-21 mineral wool','Premium sound + thermal insulation'
      ),
      0.004, L_CARP,
      'Fiberglass or mineral wool batt insulation for walls and ceilings.',
      'Batt insulation — {qty} sq ft', 5,
      false, false, '',
      [
        { label: 'R-13 (2×4 wall)', value: 'r13', rateMultiplier: 0.85 },
        { label: 'R-15 (2×4 wall, dense)', value: 'r15', rateMultiplier: 1.0 },
        { label: 'R-19 (2×6 wall)', value: 'r19', rateMultiplier: 1.15 },
        { label: 'R-21 (2×6 wall, mineral wool)', value: 'r21', rateMultiplier: 1.35 },
        { label: 'R-38 (attic)', value: 'r38', rateMultiplier: 1.60 },
        { label: 'R-49 (attic, deep)', value: 'r49', rateMultiplier: 1.90 },
      ]),
    matItem('p4-foam', 'Spray Foam Insulation', 'Spray foam', 'sqft',
      tiers(
        1.80,'Open-cell spray foam','Air sealing, rim joist, 0.5 lb',
        3.00,'Closed-cell spray foam','Superior moisture barrier, 2 lb',
        4.50,'2-lb closed-cell foam','Maximum R-value per inch'
      ),
      0.005, L_CARP,
      'Spray foam insulation for rim joists and air sealing.',
      'Spray foam insulation — {qty} sq ft', 5,
      false, false, '',
      [
        { label: '1" thickness (R-3.7 open / R-6.5 closed)', value: '1in' },
        { label: '2" thickness (R-7.4 open / R-13 closed)', value: '2in', rateMultiplier: 1.8 },
        { label: '3" thickness (R-11 open / R-19 closed)', value: '3in', rateMultiplier: 2.5 },
        { label: '4" thickness (R-14 open / R-26 closed)', value: '4in', rateMultiplier: 3.2 },
      ]),
    matItem('p4-wrap', 'House Wrap / Weather Barrier', 'House wrap', 'sqft',
      tiers(
        0.28,'Standard house wrap','Tyvek HomeWrap',
        0.45,'Premium house wrap','Tyvek DrainWrap',
        0.75,'Fluid-applied WRB','Superior air/water barrier'
      ),
      0.003, L_CARP,
      'Exterior weather barrier installation.',
      'House wrap / weather barrier — {qty} sq ft', 10),
    matItem('p4-vapor', 'Vapor Barrier (Crawl Space)', 'Vapor barrier', 'sqft',
      tiers(
        0.22,'6-mil poly','Standard crawl space vapor barrier',
        0.38,'10-mil poly','Heavy-duty vapor barrier',
        0.65,'20-mil reinforced','Commercial-grade encapsulation'
      ),
      0.003, L_CARP,
      'Crawl space vapor barrier installation.',
      'Vapor barrier — {qty} sq ft', 5),
  ],
};

// ─── PHASE 5: DRYWALL ─────────────────────────────────────────
const phase5: PhaseGroup = {
  id: 5, name: 'Drywall', icon: '🧱',
  description: 'Drywall installation, taping, mudding, and finishing to the specified level — ready for paint or texture.',
  items: [
    matItem('p5-hang', 'Hang Drywall', 'Drywall hang', 'sqft',
      tiers(
        0.55,'1/2" standard drywall','Walls and ceilings',
        0.70,'5/8" Type X drywall','Fire-rated, ceilings',
        0.95,'5/8" soundboard','Sound-dampening drywall'
      ),
      0.006, L_DRYWALL,
      'Drywall installation on walls and ceilings.',
      'Drywall hang — {qty} sq ft', 10,
      false, false, '',
      [
        { label: '4×8 sheet (1/2" standard)', value: '4x8-half', note: 'Most common' },
        { label: '4×10 sheet (1/2" standard)', value: '4x10-half', rateMultiplier: 1.05 },
        { label: '4×12 sheet (1/2" standard)', value: '4x12-half', rateMultiplier: 1.08 },
        { label: '4×8 sheet (5/8" Type X fire-rated)', value: '4x8-fire', rateMultiplier: 1.15 },
        { label: '4×12 sheet (5/8" Type X fire-rated)', value: '4x12-fire', rateMultiplier: 1.22 },
        { label: '4×8 sheet (1/2" moisture-resistant)', value: '4x8-mr', rateMultiplier: 1.20 },
        { label: '4×8 sheet (cement board tile backer)', value: '4x8-cement', rateMultiplier: 1.45 },
      ]),
    matItem('p5-tape', 'Tape, Mud & Finish', 'Tape & mud', 'sqft',
      tiers(
        0.80,'Level 3 finish','Standard residential finish',
        1.20,'Level 4 finish','Smooth, ready for flat paint',
        1.80,'Level 5 finish','Skim coat, premium smooth finish'
      ),
      0.010, L_DRYWALL,
      'Taping, mudding, and finishing drywall to specified level.',
      'Tape, mud & finish — {qty} sq ft (Level {tier})', 0),
    matItem('p5-texture', 'Texture', 'Drywall texture', 'sqft',
      tiers(
        0.45,'Knockdown texture','Standard spray knockdown',
        0.65,'Orange peel texture','Fine spray texture',
        1.00,'Skip trowel texture','Hand-applied artisan texture'
      ),
      0.005, L_DRYWALL,
      'Spray or hand-applied texture to match existing or new finish.',
      'Drywall texture — {qty} sq ft', 0),
    matItem('p5-repair', 'Drywall Repair / Patch', 'Drywall repair', 'patch',
      tiers(
        65,'Small patch repair','Up to 6" patch',
        120,'Medium patch repair','6"–12" patch',
        200,'Large patch repair','12"+ patch, full float'
      ),
      0.75, L_DRYWALL,
      'Patching and repairing existing drywall.',
      'Drywall repair — {qty} patch(es)', 0),
  ],
};

// ─── PHASE 6: FLOORING ────────────────────────────────────────
const phase6: PhaseGroup = {
  id: 6, name: 'Flooring', icon: '🪵',
  description: 'Flooring supply and installation including subfloor preparation, material installation, transitions, and cleanup.',
  items: [
    matItem('p6-subfloor', 'Subfloor Prep', 'Subfloor prep', 'sqft',
      tiers(
        0.65,'Basic leveling','Self-leveler, minor repairs',
        1.20,'Subfloor repair','Sheathing replacement, sistering',
        2.00,'Full subfloor replacement','New 3/4" T&G sheathing'
      ),
      0.008, L_CARP,
      'Subfloor leveling, repair, or replacement.',
      'Subfloor prep — {qty} sq ft', 0),
    matItem('p6-lvp', 'LVP / LVT Flooring', 'LVP flooring', 'sqft',
      tiers(
        3.50,'Good LVP — 4mm','Entry-level luxury vinyl plank, 4mm wear layer',
        5.50,'Better LVP — 6mm','Mid-grade with attached underlayment, 6mm',
        8.50,'Best LVP — 8mm','Commercial-grade, waterproof core, 8mm'
      ),
      0.012, L_FLOOR_LVP,
      'Luxury vinyl plank or tile flooring — waterproof, durable, and stylish.',
      'LVP flooring — {qty} sq ft ({tier} grade)', 12,
      false, false, '',
      [
        { label: '4" wide plank (4mm)', value: '4in-4mm' },
        { label: '5" wide plank (6mm)', value: '5in-6mm', rateMultiplier: 1.10 },
        { label: '6" wide plank (6mm)', value: '6in-6mm', rateMultiplier: 1.15, note: 'Most popular' },
        { label: '7" wide plank (8mm)', value: '7in-8mm', rateMultiplier: 1.25 },
        { label: '9" wide plank (8mm)', value: '9in-8mm', rateMultiplier: 1.35 },
        { label: '12" wide plank (12mm)', value: '12in-12mm', rateMultiplier: 1.55 },
      ]),
    matItem('p6-tile', 'Tile Flooring', 'Floor tile', 'sqft',
      tiers(
        4.00,'Ceramic tile','Standard floor tile',
        7.50,'Porcelain tile','Premium porcelain',
        14.00,'Large format tile','Designer large format / natural stone'
      ),
      0.020, L_TILE,
      'Ceramic or porcelain floor tile with backer and grout.',
      'Floor tile — {qty} sq ft ({tier} grade)', 15,
      false, false, '',
      [
        { label: '4×4 ceramic', value: '4x4' },
        { label: '6×6 ceramic', value: '6x6' },
        { label: '12×12 ceramic/porcelain', value: '12x12', note: 'Most popular' },
        { label: '12×24 porcelain', value: '12x24', rateMultiplier: 1.15 },
        { label: '18×18 porcelain', value: '18x18', rateMultiplier: 1.20 },
        { label: '24×24 porcelain', value: '24x24', rateMultiplier: 1.30 },
        { label: '24×48 large format', value: '24x48', rateMultiplier: 1.50 },
        { label: '36×36 large format', value: '36x36', rateMultiplier: 1.65 },
      ]),
    matItem('p6-hardwood', 'Hardwood Flooring', 'Hardwood', 'sqft',
      tiers(
        6.50,'Engineered hardwood','Floating or glue-down, 3/8"–1/2"',
        10.00,'Solid hardwood 3/4"','Nail-down, can be refinished multiple times',
        16.00,'Wide-plank hardwood','Premium 5"–7" solid or engineered'
      ),
      0.018, L_FLOOR,
      'Hardwood flooring — nail-down or glue-down installation.',
      'Hardwood flooring — {qty} sq ft ({tier} grade)', 12,
      false, false, '',
      [
        { label: '2.25" strip (solid oak)', value: '2.25in' },
        { label: '3.25" strip (solid oak)', value: '3.25in', note: 'Most popular' },
        { label: '4" plank (engineered)', value: '4in-eng' },
        { label: '5" plank (solid/engineered)', value: '5in', rateMultiplier: 1.10 },
        { label: '6" plank (solid/engineered)', value: '6in', rateMultiplier: 1.18 },
        { label: '7" wide plank', value: '7in', rateMultiplier: 1.28 },
        { label: '8"+ wide plank', value: '8in-plus', rateMultiplier: 1.40 },
      ]),
    matItem('p6-carpet', 'Carpet', 'Carpet', 'sqft',
      tiers(
        2.80,'Builder-grade carpet','Standard residential carpet + 6lb pad',
        4.50,'Mid-grade carpet','Better texture and durability + 8lb pad',
        7.50,'Premium carpet','Plush or patterned, thick 10lb pad'
      ),
      0.010, L_FLOOR_LVP,
      'Carpet with pad — supply and installation.',
      'Carpet — {qty} sq ft ({tier} grade)', 10,
      false, false, '',
      [
        { label: 'Cut pile (plush/textured)', value: 'cut-pile', note: 'Most popular' },
        { label: 'Loop pile (Berber)', value: 'loop-pile' },
        { label: 'Cut & loop (pattern)', value: 'cut-loop', rateMultiplier: 1.10 },
        { label: 'Frieze (shag/twist)', value: 'frieze', rateMultiplier: 1.05 },
        { label: 'Patterned (repeat match)', value: 'patterned', rateMultiplier: 1.20, note: 'Extra waste for pattern match' },
      ]),
    matItem('p6-trans', 'Transitions & Thresholds', 'Transitions', 'unit',
      tiers(
        18,'Standard transition strip','T-molding or reducer',
        32,'Hardwood transition','Matching wood threshold',
        55,'Custom threshold','Solid wood or metal custom'
      ),
      0.25, L_FLOOR,
      'Transition strips and thresholds between flooring types.',
      'Transitions/thresholds — {qty} piece(s)', 0),
    matItem('p6-demo', 'Floor Demo / Removal', 'Floor removal', 'sqft',
      tiers(
        0.45,'Standard floor removal','Carpet, vinyl, LVP',
        0.75,'Tile floor removal','Ceramic/porcelain removal',
        1.20,'Hardwood removal','Nail-down hardwood removal'
      ),
      0.008, L_DEMO,
      'Removal of existing flooring.',
      'Floor removal — {qty} sq ft', 0),
  ],
};

// ─── PHASE 7: TILE WORK ───────────────────────────────────────
const phase7: PhaseGroup = {
  id: 7, name: 'Tile Work', icon: '🚿',
  description: 'Tile supply and installation for showers, tub surrounds, backsplashes, and feature walls — including waterproofing, grouting, and sealing.',
  items: [
    matItem('p7-shower', 'Shower Wall Tile', 'Shower tile', 'sqft',
      tiers(
        5.50,'Ceramic subway tile','3×6 classic subway, standard layout',
        9.00,'Porcelain wall tile','12×24 porcelain, stacked or offset',
        16.00,'Natural stone tile','Marble, travertine, or slate'
      ),
      0.025, L_TILE,
      'Shower wall tile — supply and installation including waterproofing.',
      'Shower wall tile — {qty} sq ft ({tier} grade)', 15,
      false, false, '',
      [
        { label: '3×6 subway (horizontal stack)', value: '3x6-stack', note: 'Classic look' },
        { label: '3×6 subway (vertical stack)', value: '3x6-vert', rateMultiplier: 1.05 },
        { label: '3×6 subway (herringbone)', value: '3x6-herring', rateMultiplier: 1.20, note: 'Complex pattern — extra labor' },
        { label: '4×8 subway', value: '4x8' },
        { label: '4×12 subway', value: '4x12', rateMultiplier: 1.05 },
        { label: '6×12 tile', value: '6x12', rateMultiplier: 1.08 },
        { label: '12×24 porcelain', value: '12x24', rateMultiplier: 1.15, note: 'Most popular upgrade' },
        { label: '24×48 large format', value: '24x48', rateMultiplier: 1.35, note: 'Requires extra prep' },
        { label: '2×2 mosaic (on 12×12 sheet)', value: '2x2-mosaic', rateMultiplier: 1.50 },
        { label: '1×1 mosaic (on 12×12 sheet)', value: '1x1-mosaic', rateMultiplier: 1.65, note: 'High labor — complex grout lines' },
        { label: 'Marble slab (book-matched)', value: 'marble-slab', rateMultiplier: 2.20 },
      ]),
    matItem('p7-tub', 'Tub Surround Tile', 'Tub surround', 'sqft',
      tiers(
        4.50,'Ceramic subway tile','3×6 classic subway',
        7.50,'Porcelain wall tile','12×24 porcelain',
        13.00,'Natural stone tile','Marble or travertine'
      ),
      0.022, L_TILE,
      'Tub surround tile — supply and installation.',
      'Tub surround tile — {qty} sq ft ({tier} grade)', 15,
      false, false, '',
      [
        { label: '3×6 subway', value: '3x6', note: 'Classic' },
        { label: '4×8 subway', value: '4x8' },
        { label: '4×12 subway', value: '4x12' },
        { label: '6×6 tile', value: '6x6' },
        { label: '12×12 tile', value: '12x12', rateMultiplier: 1.10 },
        { label: '12×24 tile', value: '12x24', rateMultiplier: 1.18 },
        { label: '3×6 herringbone', value: '3x6-herring', rateMultiplier: 1.25, note: 'Complex pattern' },
      ]),
    matItem('p7-backsplash', 'Backsplash Tile', 'Backsplash', 'sqft',
      tiers(
        6.00,'Ceramic subway tile','3×6 or 4×4 ceramic',
        11.00,'Glass mosaic tile','Glass or mixed mosaic',
        18.00,'Natural stone mosaic','Marble or travertine mosaic'
      ),
      0.030, L_TILE_ADV,
      'Kitchen or bath backsplash tile — supply and installation.',
      'Backsplash tile — {qty} sq ft ({tier} grade)', 10,
      false, false, '',
      [
        { label: '3×6 subway (horizontal)', value: '3x6-horiz', note: 'Most popular' },
        { label: '3×6 subway (vertical)', value: '3x6-vert', rateMultiplier: 1.05 },
        { label: '3×6 subway (herringbone)', value: '3x6-herring', rateMultiplier: 1.20 },
        { label: '4×4 ceramic', value: '4x4' },
        { label: '4×8 tile', value: '4x8' },
        { label: '2×2 mosaic sheet', value: '2x2-mosaic', rateMultiplier: 1.35 },
        { label: '1×1 mosaic sheet', value: '1x1-mosaic', rateMultiplier: 1.55 },
        { label: '12×24 large format', value: '12x24', rateMultiplier: 1.20 },
        { label: 'Penny tile (on sheet)', value: 'penny', rateMultiplier: 1.45, note: 'High grout labor' },
        { label: 'Arabesque / decorative shape', value: 'arabesque', rateMultiplier: 1.60 },
      ]),
    matItem('p7-feature', 'Feature Wall / Fireplace Tile', 'Feature wall tile', 'sqft',
      tiers(
        7.50,'Ceramic feature tile','Decorative ceramic',
        14.00,'Porcelain feature tile','Large format porcelain',
        22.00,'Natural stone feature','Ledger stone or marble'
      ),
      0.035, L_TILE_ADV,
      'Decorative feature wall or fireplace tile.',
      'Feature wall tile — {qty} sq ft ({tier} grade)', 10,
      false, false, '',
      [
        { label: '12×24 porcelain', value: '12x24' },
        { label: '24×24 porcelain', value: '24x24', rateMultiplier: 1.15 },
        { label: '24×48 large format', value: '24x48', rateMultiplier: 1.30 },
        { label: 'Ledger stone (4×16 stacked)', value: 'ledger', rateMultiplier: 1.25 },
        { label: 'Brick veneer', value: 'brick-veneer', rateMultiplier: 1.20 },
        { label: 'Marble tile (12×12)', value: 'marble-12x12', rateMultiplier: 1.40 },
        { label: 'Marble tile (24×24)', value: 'marble-24x24', rateMultiplier: 1.60 },
      ]),
    matItem('p7-waterproof', 'Waterproofing / Membrane', 'Waterproofing', 'sqft',
      tiers(
        1.20,'Liquid waterproofing','Redgard or similar',
        1.80,'Sheet membrane','Schluter Kerdi or similar',
        2.80,'Full system waterproofing','Schluter system + corners + curb'
      ),
      0.006, L_TILE,
      'Waterproofing membrane for wet areas.',
      'Waterproofing membrane — {qty} sq ft', 10),
    laborItem('p7-grout', 'Grout, Caulk & Sealing', 'Grout & caulk', 'sqft', 0.004, L_TILE,
      'Grouting all tile joints, caulking transitions, and sealing.',
      'Grout, caulk & sealing — {qty} sq ft'),
  ],
};

// ─── PHASE 8: FRAMING & CARPENTRY ─────────────────────────────
const phase8: PhaseGroup = {
  id: 8, name: 'Framing & Carpentry', icon: '🪚',
  description: 'Structural framing for new walls, ceilings, openings, and subfloor repairs — the backbone of any remodel.',
  items: [
    matItem('p8-wall', 'New Wall Framing', 'Wall framing', 'lf',
      tiers(
        7.00,'2×4 stud wall','Standard interior partition, 16" OC',
        10.00,'2×6 stud wall','Exterior or plumbing wall, 16" OC',
        14.00,'Steel stud framing','Commercial-grade metal framing'
      ),
      0.08, L_CARP,
      'New interior partition wall framing.',
      'Wall framing — {qty} lf', 10,
      false, false, '',
      [
        { label: '2×4 @ 16" OC (interior partition)', value: '2x4-16oc', note: 'Standard interior' },
        { label: '2×4 @ 12" OC (extra rigid)', value: '2x4-12oc', rateMultiplier: 1.15 },
        { label: '2×6 @ 16" OC (exterior / plumbing wall)', value: '2x6-16oc', rateMultiplier: 1.30 },
        { label: '2×6 @ 12" OC (high load)', value: '2x6-12oc', rateMultiplier: 1.45 },
        { label: '2×8 @ 16" OC (structural)', value: '2x8-16oc', rateMultiplier: 1.60 },
        { label: '3-5/8" steel stud @ 16" OC', value: 'steel-3.5-16oc', rateMultiplier: 1.55 },
        { label: '6" steel stud @ 16" OC', value: 'steel-6-16oc', rateMultiplier: 1.70 },
      ]),
    matItem('p8-ceiling', 'Ceiling Framing', 'Ceiling framing', 'sqft',
      tiers(
        3.50,'Simple soffit','Basic drop or soffit',
        5.50,'Tray ceiling framing','Stepped tray ceiling',
        9.00,'Coffered ceiling','Full coffered framing'
      ),
      0.015, L_CARP,
      'Soffit, drop, or tray ceiling framing.',
      'Ceiling framing — {qty} sq ft', 10),
    laborItem('p8-block', 'Blocking (Grab Bars, TV, Cabinets)', 'Blocking', 'unit', 1.5, L_CARP,
      'Structural backing for grab bars, TV mounts, and cabinets.',
      'Blocking — {qty} location(s)'),
    matItem('p8-joist', 'Subfloor Framing Repair', 'Joist repair', 'lf',
      tiers(
        12,'Joist sistering','Sister existing joists',
        20,'Rim joist repair','Rim joist replacement',
        32,'Full joist replacement','New joist installation'
      ),
      0.12, L_CARP,
      'Joist sistering, rim joist, and subfloor framing repair.',
      'Subfloor framing repair — {qty} lf', 5,
      false, false, '',
      [
        { label: '2×6 joist', value: '2x6' },
        { label: '2×8 joist', value: '2x8', rateMultiplier: 1.10 },
        { label: '2×10 joist', value: '2x10', rateMultiplier: 1.20, note: 'Most common' },
        { label: '2×12 joist', value: '2x12', rateMultiplier: 1.30 },
        { label: 'LVL beam (3.5×9.5)', value: 'lvl-9.5', rateMultiplier: 1.80 },
        { label: 'LVL beam (3.5×11.25)', value: 'lvl-11.25', rateMultiplier: 2.00 },
        { label: 'LVL beam (3.5×14)', value: 'lvl-14', rateMultiplier: 2.30 },
        { label: 'LVL beam (3.5×16)', value: 'lvl-16', rateMultiplier: 2.60 },
      ]),
    laborItem('p8-opening', 'Exterior Framing (New Openings)', 'New openings', 'opening', 6, L_CARP,
      'New window or door openings with headers.',
      'New exterior openings — {qty} opening(s)', true, 'Structural review recommended'),
  ],
};

// ─── PHASE 9: EXTERIOR WORK ───────────────────────────────────
const phase9: PhaseGroup = {
  id: 9, name: 'Exterior Work', icon: '🏡',
  description: 'Exterior improvements including siding, roofing, gutters, decks, fencing, and concrete flatwork.',
  items: [
    matItem('p9-siding', 'Siding Installation', 'Siding', 'sqft',
      tiers(
        4.00,'LP SmartSide lap','Engineered wood lap siding',
        6.00,'Fiber cement (HardiePlank)','James Hardie lap siding',
        9.50,'Cedar siding','Natural wood siding'
      ),
      0.015, L_CARP,
      'New siding installation — lap, shingle, board & batten, or T1-11.',
      'Siding installation — {qty} sq ft ({tier} grade)', 10,
      false, false, '',
      [
        { label: 'LP SmartSide lap (7.25" exposure)', value: 'lp-lap-7.25' },
        { label: 'LP SmartSide lap (5.5" exposure)', value: 'lp-lap-5.5', rateMultiplier: 1.10 },
        { label: 'LP SmartSide board & batten', value: 'lp-bb', rateMultiplier: 1.15 },
        { label: 'HardiePlank lap (7.25" exposure)', value: 'hardie-lap-7.25', note: 'Most popular' },
        { label: 'HardiePlank lap (5.25" exposure)', value: 'hardie-lap-5.25', rateMultiplier: 1.12 },
        { label: 'HardiePanel vertical', value: 'hardie-panel', rateMultiplier: 1.08 },
        { label: 'HardieShingle (staggered)', value: 'hardie-shingle', rateMultiplier: 1.25 },
        { label: 'Cedar bevel lap (4" exposure)', value: 'cedar-bevel-4', rateMultiplier: 1.40 },
        { label: 'Cedar board & batten (1×6 + 1×2)', value: 'cedar-bb', rateMultiplier: 1.45 },
        { label: 'T1-11 plywood panel', value: 't1-11', rateMultiplier: 0.85 },
      ]),
    matItem('p9-siding-paint', 'Siding Paint / Stain', 'Siding paint', 'sqft',
      tiers(
        0.40,'1-coat exterior paint','Primer + 1 finish coat',
        0.65,'2-coat exterior paint','Primer + 2 finish coats',
        1.00,'Solid stain','Premium solid stain system'
      ),
      0.006, L_PAINT,
      'Exterior siding paint or stain.',
      'Siding paint/stain — {qty} sq ft', 0, true),
    matItem('p9-soffit', 'Soffit & Fascia', 'Soffit & fascia', 'lf',
      tiers(
        7.00,'Vinyl soffit & fascia','Standard vinyl',
        11.00,'Aluminum soffit & fascia','Commercial aluminum',
        16.00,'Cedar soffit & fascia','Natural wood'
      ),
      0.06, L_CARP,
      'Soffit and fascia replacement or repainting.',
      'Soffit & fascia — {qty} lf', 10),
    matItem('p9-gutter', 'Gutters', 'Gutters', 'lf',
      tiers(
        5.50,'5" aluminum gutters','Standard K-style aluminum',
        8.00,'6" aluminum gutters','Oversized K-style',
        14.00,'Copper gutters','Premium copper gutters'
      ),
      0.04, L_CARP,
      'Gutter installation or replacement.',
      'Gutters — {qty} lf', 5,
      false, false, '',
      [
        { label: '5" K-style aluminum', value: '5k-alum', note: 'Standard residential' },
        { label: '6" K-style aluminum', value: '6k-alum', rateMultiplier: 1.20 },
        { label: '5" half-round aluminum', value: '5hr-alum', rateMultiplier: 1.15 },
        { label: '6" half-round aluminum', value: '6hr-alum', rateMultiplier: 1.30 },
        { label: '5" K-style copper', value: '5k-copper', rateMultiplier: 2.20 },
        { label: '6" K-style copper', value: '6k-copper', rateMultiplier: 2.50 },
      ]),
    laborItem('p9-roof', 'Roofing', 'Roofing', 'sqft', 0.008, L_ROOF,
      'Shingle, flat, or metal roofing.',
      'Roofing — {qty} sq ft', true, 'Sub specialty — roofing contractor required'),
    matItem('p9-deck', 'Deck — New Build', 'New deck', 'sqft',
      tiers(
        18,'Pressure-treated deck','PT framing + decking',
        28,'Composite deck','Trex or similar composite',
        42,'Hardwood deck','Ipe or cedar decking'
      ),
      0.025, L_CARP,
      'New deck construction — framing and decking.',
      'New deck — {qty} sq ft ({tier} grade)', 10,
      false, false, '',
      [
        { label: '5/4×6 PT decking (standard)', value: 'pt-5x4x6' },
        { label: '2×6 PT decking (heavy)', value: 'pt-2x6', rateMultiplier: 1.10 },
        { label: 'Trex Select composite (1")', value: 'trex-select', rateMultiplier: 1.30 },
        { label: 'Trex Transcend composite (1.25")', value: 'trex-transcend', rateMultiplier: 1.55 },
        { label: 'Fiberon composite', value: 'fiberon', rateMultiplier: 1.45 },
        { label: 'Cedar 5/4×6 decking', value: 'cedar-5x4x6', rateMultiplier: 1.60 },
        { label: 'Ipe hardwood decking', value: 'ipe', rateMultiplier: 2.00 },
      ]),
    matItem('p9-deck-repair', 'Deck Refinish / Repair', 'Deck repair', 'sqft',
      tiers(
        2.00,'Deck clean & seal','Power wash + sealer',
        4.00,'Deck refinish','Sand, stain, and seal',
        8.00,'Board replacement','Replace damaged boards'
      ),
      0.010, L_CARP,
      'Deck refinishing, repair, or board replacement.',
      'Deck refinish/repair — {qty} sq ft', 0),
    matItem('p9-fence', 'Fence — New Install', 'New fence', 'lf',
      tiers(
        28,'Dog-ear cedar fence','6\' dog-ear cedar',
        42,'Shadowbox cedar fence','Shadowbox style',
        65,'Cedar privacy fence','Custom cedar privacy'
      ),
      0.06, L_CARP,
      'New fence installation.',
      'New fence — {qty} lf ({tier} grade)', 5,
      false, false, '',
      [
        { label: '4\' cedar dog-ear', value: '4ft-cedar' },
        { label: '6\' cedar dog-ear', value: '6ft-cedar', note: 'Most popular' },
        { label: '6\' cedar shadowbox', value: '6ft-shadowbox', rateMultiplier: 1.20 },
        { label: '6\' cedar board-on-board', value: '6ft-bob', rateMultiplier: 1.25 },
        { label: '8\' cedar privacy', value: '8ft-cedar', rateMultiplier: 1.40 },
        { label: '6\' vinyl privacy', value: '6ft-vinyl', rateMultiplier: 1.15 },
        { label: '4\' aluminum/steel picket', value: '4ft-metal', rateMultiplier: 1.30 },
      ]),
    matItem('p9-fence-repair', 'Fence Repair', 'Fence repair', 'unit',
      tiers(
        50,'Post reset / board replace','Standard repair',
        95,'Section rebuild','Rebuild damaged section',
        175,'Full panel replacement','Replace full fence panel'
      ),
      1.5, L_CARP,
      'Fence repair — post reset, board replacement, or section rebuild.',
      'Fence repair — {qty} repair(s)', 0),
    matItem('p9-concrete', 'Concrete / Flatwork', 'Concrete', 'sqft',
      tiers(
        9.00,'Standard broom finish','Driveway, walkway, patio',
        14.00,'Exposed aggregate','Decorative exposed aggregate',
        20.00,'Stamped concrete','Stamped pattern concrete'
      ),
      0.015, L_MASON,
      'Concrete flatwork — driveway, walkway, or patio.',
      'Concrete/flatwork — {qty} sq ft ({tier} grade)', 5,
      false, false, '',
      [
        { label: '4" slab (walkway/patio)', value: '4in-slab', note: 'Standard residential' },
        { label: '4" slab with wire mesh', value: '4in-mesh', rateMultiplier: 1.08 },
        { label: '4" slab with rebar', value: '4in-rebar', rateMultiplier: 1.15 },
        { label: '6" slab (driveway)', value: '6in-slab', rateMultiplier: 1.35 },
        { label: '6" slab with rebar (heavy driveway)', value: '6in-rebar', rateMultiplier: 1.50 },
        { label: 'Stamped pattern (standard)', value: 'stamped-std', rateMultiplier: 1.80 },
        { label: 'Stamped pattern (complex)', value: 'stamped-complex', rateMultiplier: 2.20 },
      ]),
    laborItem('p9-landscape', 'Landscaping / Cleanup', 'Landscaping', 'hr', 1, L_DEMO,
      'Landscaping, grading, and site cleanup.',
      'Landscaping/cleanup — {qty} hrs'),
  ],
};

// ─── PHASE 10: DOORS & WINDOWS ────────────────────────────────
const phase10: PhaseGroup = {
  id: 10, name: 'Doors & Windows', icon: '🚪',
  description: 'Interior and exterior door and window installation, including hardware, weatherstripping, and exterior trim.',
  items: [
    matItem('p10-int-door', 'Interior Doors', 'Interior doors', 'door',
      tiers(
        180,'Hollow-core prehung','Standard hollow-core',
        320,'Solid-core prehung','Solid-core 1-3/4"',
        550,'Solid wood prehung','Knotty alder or pine'
      ),
      1.5, L_CARP,
      'Interior prehung or slab door installation.',
      'Interior doors — {qty} door(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: '2/0×6/8 (24"×80")', value: '2068' },
        { label: '2/4×6/8 (28"×80")', value: '2468' },
        { label: '2/6×6/8 (32"×80")', value: '2668', note: 'Most common' },
        { label: '2/8×6/8 (34"×80")', value: '2868' },
        { label: '3/0×6/8 (36"×80")', value: '3068' },
        { label: '3/0×8/0 (36"×96")', value: '3080', rateMultiplier: 1.15 },
        { label: 'Double door (5/0×6/8)', value: 'dbl-5068', rateMultiplier: 1.80 },
        { label: 'Double door (6/0×6/8)', value: 'dbl-6068', rateMultiplier: 1.90 },
      ]),
    matItem('p10-ext-door', 'Exterior Doors', 'Exterior doors', 'door',
      tiers(
        450,'Fiberglass entry door','Standard fiberglass prehung',
        750,'Steel entry door','Heavy-duty steel prehung',
        1200,'Wood entry door','Solid wood entry door'
      ),
      2.5, L_CARP,
      'Exterior prehung door with weatherstripping and threshold.',
      'Exterior doors — {qty} door(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: '2/8×6/8 (34"×80")', value: '2868' },
        { label: '3/0×6/8 (36"×80")', value: '3068', note: 'Most common' },
        { label: '3/0×8/0 (36"×96")', value: '3080', rateMultiplier: 1.15 },
        { label: '3/6×8/0 (42"×96")', value: '3680', rateMultiplier: 1.25 },
        { label: 'Double 6/0×6/8 (72"×80")', value: 'dbl-6068', rateMultiplier: 1.85 },
        { label: 'Double 6/0×8/0 (72"×96")', value: 'dbl-6080', rateMultiplier: 2.00 },
        { label: 'French door 5/0×6/8', value: 'french-5068', rateMultiplier: 1.90 },
        { label: 'French door 6/0×8/0', value: 'french-6080', rateMultiplier: 2.10 },
      ]),
    matItem('p10-pocket', 'Sliding / Pocket Doors', 'Pocket doors', 'door',
      tiers(
        280,'Hollow-core pocket','Standard pocket door kit',
        480,'Solid-core pocket','Solid-core pocket door',
        800,'Barn door','Sliding barn door hardware + door'
      ),
      3, L_CARP,
      'Sliding or pocket door installation.',
      'Sliding/pocket doors — {qty} door(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: '2/6×6/8 pocket door', value: '2668-pocket' },
        { label: '2/8×6/8 pocket door', value: '2868-pocket', note: 'Most common' },
        { label: '3/0×6/8 pocket door', value: '3068-pocket' },
        { label: 'Double pocket 5/0×6/8', value: 'dbl-5068-pocket', rateMultiplier: 1.80 },
        { label: '3/0×8/0 barn door', value: '3080-barn' },
        { label: '4/0×8/0 barn door', value: '4080-barn', rateMultiplier: 1.15 },
        { label: 'Double barn door 6/0×8/0', value: 'dbl-6080-barn', rateMultiplier: 1.90 },
      ]),
    matItem('p10-window', 'Window Replacement', 'Windows', 'window',
      tiers(
        420,'Vinyl double-pane','Standard vinyl replacement',
        650,'Fiberglass window','Premium fiberglass',
        1050,'Wood-clad window','Wood-clad interior/exterior'
      ),
      2.5, L_CARP,
      'Window replacement — vinyl, fiberglass, or wood-clad.',
      'Window replacement — {qty} window(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: '2/0×3/0 (24"×36") small', value: '2030' },
        { label: '2/6×4/0 (30"×48")', value: '2640' },
        { label: '3/0×4/0 (36"×48")', value: '3040', note: 'Common bedroom' },
        { label: '3/0×5/0 (36"×60")', value: '3050' },
        { label: '3/6×5/0 (42"×60")', value: '3650', rateMultiplier: 1.10 },
        { label: '4/0×5/0 (48"×60")', value: '4050', rateMultiplier: 1.15 },
        { label: '4/0×6/0 (48"×72")', value: '4060', rateMultiplier: 1.20 },
        { label: '5/0×5/0 (60"×60") picture', value: '5050-pic', rateMultiplier: 1.25 },
        { label: '6/0×6/0 (72"×72") large picture', value: '6060-pic', rateMultiplier: 1.40 },
        { label: 'Bay window (3-lite)', value: 'bay-3lite', rateMultiplier: 2.50 },
      ]),
    matItem('p10-win-trim', 'Window Trim — Exterior', 'Exterior window trim', 'window',
      tiers(
        65,'PVC exterior trim','Low-maintenance PVC',
        100,'Fiber cement trim','James Hardie trim',
        160,'Cedar exterior trim','Natural cedar trim'
      ),
      1.5, L_CARP,
      'Exterior window trim installation.',
      'Exterior window trim — {qty} window(s) ({tier} grade)', 10),
    matItem('p10-hardware', 'Door Hardware', 'Door hardware', 'door',
      tiers(
        55,'Builder-grade hardware','Kwikset or similar',
        110,'Mid-grade hardware','Schlage or similar',
        220,'Premium hardware','Baldwin or Emtek'
      ),
      0.5, L_CARP,
      'Door knobs, levers, and deadbolts.',
      'Door hardware — {qty} door(s) ({tier} grade)', 0),
    laborItem('p10-garage', 'Garage Door Install / Replace', 'Garage door', 'door', 4, L_CARP,
      'Garage door installation or replacement.',
      'Garage door — {qty} door(s)', true, 'Sub specialty — garage door contractor recommended'),
  ],
};

// ─── PHASE 11: TRIM & FINISH CARPENTRY ────────────────────────
const phase11: PhaseGroup = {
  id: 11, name: 'Trim & Finish Carpentry', icon: '📐',
  description: 'Finish carpentry including baseboard, door and window casing, crown molding, wainscoting, built-ins, and stair work — the details that make a home feel finished.',
  items: [
    matItem('p11-bb', 'Baseboard', 'Baseboard', 'lf',
      tiers(
        1.20,'Finger-joint pine, primed','Colonial 3.5" — paint-grade',
        1.80,'MDF colonial base, primed','Colonial 4.25" — smooth MDF',
        3.20,'Solid poplar, unfinished','Colonial 5.5" — stain-grade'
      ),
      0.04, L_CARP,
      'Baseboard installation — colonial, ranch, craftsman, or farmhouse profiles.',
      'Baseboard — {qty} lf ({tier} grade)', 10, true,
      false, '',
      [
        { label: '2.5" ranch / colonial (paint-grade)', value: '2.5in' },
        { label: '3.5" colonial (most popular)', value: '3.5in', note: 'Most popular' },
        { label: '4.25" colonial MDF', value: '4.25in', rateMultiplier: 1.15 },
        { label: '5.5" craftsman / farmhouse', value: '5.5in', rateMultiplier: 1.35 },
        { label: '7.25" tall base (high-end)', value: '7.25in', rateMultiplier: 1.65 },
        { label: 'Built-up base (2-piece)', value: '2piece', rateMultiplier: 1.80, note: 'Extra labor for 2-piece' },
      ]),
    matItem('p11-dc', 'Door Casing', 'Door casing', 'opening',
      tiers(
        // Rate is per OPENING (both sides of door) — each opening ≈ 26–32 LF of casing
        // (2 faces × (2 × door height + door width) ÷ 12 ≈ 26–32 LF)
        // Good: ~26 LF × $3.20/lf mat + labor ≈ $85
        // Better: ~26 LF × $4.50/lf mat + labor ≈ $130
        // Best: ~26 LF × $7.50/lf mat + labor ≈ $220
        85,'Finger-joint pine, primed','Colonial 2.5" — paint-grade, both sides',
        130,'MDF colonial casing, primed','Colonial 3.5" — smooth MDF, both sides',
        220,'Solid poplar, unfinished','Colonial 3.5" — stain-grade, both sides'
      ),
      1.5, L_CARP,
      'Door casing installation — colonial or craftsman profiles. Rate is per opening (both sides of door).',
      'Door casing — {qty} opening(s) ({tier} grade)', 10, true,
      false, '',
      [
        { label: '2/0–2/4 (narrow door, 24–28")', value: 'narrow', note: '~24 LF per opening', rateMultiplier: 0.90 },
        { label: '2/6×6/8 (32"×80") — most common', value: '2668', note: '~26 LF per opening' },
        { label: '2/8×6/8 (34"×80")', value: '2868', note: '~27 LF per opening' },
        { label: '3/0×6/8 (36"×80")', value: '3068', note: '~28 LF per opening' },
        { label: '3/0×8/0 (36"×96")', value: '3080', note: '~30 LF per opening', rateMultiplier: 1.12 },
        { label: '3.5" craftsman flat casing', value: '3.5in-craft', rateMultiplier: 1.10 },
        { label: '4.5" craftsman (wider reveal)', value: '4.5in-craft', rateMultiplier: 1.25 },
        { label: 'Double door (5/0–6/0)', value: 'dbl', note: '~40 LF per opening', rateMultiplier: 1.55 },
        { label: 'Rosette & plinth block set', value: 'rosette-plinth', rateMultiplier: 1.40, note: 'Traditional style' },
      ]),
    matItem('p11-wc', 'Window Casing', 'Window casing', 'window',
      tiers(
        1.20,'Finger-joint pine, primed','Colonial 2.5" — paint-grade',
        1.80,'MDF colonial casing, primed','Colonial 3.5" — smooth MDF',
        3.50,'Solid poplar, unfinished','Colonial 3.5" — stain-grade'
      ),
      1.5, L_CARP,
      'Window casing installation — colonial or craftsman profiles.',
      'Window casing — {qty} window(s) ({tier} grade)', 10, true,
      false, '',
      [
        { label: '2.5" colonial (paint-grade)', value: '2.5in' },
        { label: '3.5" colonial (most popular)', value: '3.5in', note: 'Most popular' },
        { label: '3.5" craftsman flat casing', value: '3.5in-craft', rateMultiplier: 1.10 },
        { label: 'Apron + stool + casing set', value: 'apron-stool', rateMultiplier: 1.45, note: 'Full window trim package' },
      ]),
    matItem('p11-crown', 'Crown Molding', 'Crown molding', 'lf',
      tiers(
        2.00,'Finger-joint pine crown','3.5" colonial crown — paint-grade',
        3.00,'MDF crown molding','4.5" MDF — smooth finish',
        5.00,'Solid poplar crown','5.5" solid — stain-grade'
      ),
      0.06, L_CARP,
      'Crown molding installation.',
      'Crown molding — {qty} lf ({tier} grade)', 15, true,
      false, '',
      [
        { label: '3.5" colonial crown', value: '3.5in' },
        { label: '4.5" MDF crown', value: '4.5in', note: 'Most popular' },
        { label: '5.5" solid crown', value: '5.5in', rateMultiplier: 1.25 },
        { label: '7.25" large crown', value: '7.25in', rateMultiplier: 1.55 },
        { label: 'Built-up crown (2-piece)', value: '2piece', rateMultiplier: 1.90, note: 'Extra labor for 2-piece' },
        { label: 'Built-up crown (3-piece)', value: '3piece', rateMultiplier: 2.40, note: 'High-end — 3 separate pieces' },
      ]),
    matItem('p11-chair', 'Chair Rail', 'Chair rail', 'lf',
      tiers(
        0.90,'Finger-joint pine','2.5" chair rail — paint-grade',
        1.40,'MDF chair rail','3" MDF — smooth finish',
        2.40,'Solid poplar','3" solid — stain-grade'
      ),
      0.04, L_CARP,
      'Chair rail installation.',
      'Chair rail — {qty} lf ({tier} grade)', 10, true,
      false, '',
      [
        { label: '2.5" chair rail', value: '2.5in' },
        { label: '3" chair rail', value: '3in', note: 'Most popular' },
        { label: '3.5" chair rail', value: '3.5in', rateMultiplier: 1.10 },
      ]),
    matItem('p11-wains', 'Wainscoting / Board & Batten', 'Wainscoting', 'sqft',
      tiers(
        4.00,'MDF board & batten','Standard board & batten',
        6.00,'Beadboard wainscoting','Classic beadboard panels',
        8.50,'Solid wood wainscoting','Raised panel solid wood'
      ),
      0.018, L_CARP,
      'Wainscoting or board and batten installation.',
      'Wainscoting/board & batten — {qty} sq ft ({tier} grade)', 10, true,
      false, '',
      [
        { label: 'Board & batten (1×4 + 1×2)', value: 'bb-1x4' },
        { label: 'Board & batten (1×6 + 1×2)', value: 'bb-1x6', rateMultiplier: 1.10 },
        { label: 'Beadboard panel (4×8 sheet)', value: 'beadboard-sheet' },
        { label: 'Beadboard individual planks (3")', value: 'beadboard-plank', rateMultiplier: 1.20 },
        { label: 'Raised panel wainscoting', value: 'raised-panel', rateMultiplier: 1.50, note: 'High-end traditional' },
        { label: 'Shiplap (1×6 horizontal)', value: 'shiplap-1x6', rateMultiplier: 1.15 },
        { label: 'Shiplap (1×8 horizontal)', value: 'shiplap-1x8', rateMultiplier: 1.20 },
      ]),
    matItem('p11-shelf', 'Built-In Shelving', 'Built-in shelving', 'lf',
      tiers(
        50,'Melamine shelving','Standard melamine built-ins',
        95,'Plywood shelving','Paint-grade plywood built-ins',
        160,'Solid wood built-ins','Solid wood custom built-ins'
      ),
      0.5, L_CARP,
      'Built-in shelving installation.',
      'Built-in shelving — {qty} lf ({tier} grade)', 5),
    matItem('p11-stair', 'Stair Treads & Risers', 'Stair treads', 'step',
      tiers(
        65,'Pine treads & risers','Paint-grade pine',
        125,'Oak treads, pine risers','Stain-grade oak treads',
        220,'Solid oak treads & risers','Full stain-grade oak'
      ),
      1.5, L_CARP,
      'Stair tread and riser installation.',
      'Stair treads & risers — {qty} step(s) ({tier} grade)', 5,
      false, false, '',
      [
        { label: '36" wide stair (standard)', value: '36in' },
        { label: '42" wide stair (wider)', value: '42in', rateMultiplier: 1.15 },
        { label: '48" wide stair (open staircase)', value: '48in', rateMultiplier: 1.30 },
        { label: 'Curved/winder tread', value: 'winder', rateMultiplier: 1.65, note: 'Complex cut — extra labor' },
      ]),
    matItem('p11-rail', 'Handrail & Balusters', 'Handrail', 'lf',
      tiers(
        28,'Pine handrail + wood balusters','Standard wood',
        48,'Oak handrail + wood balusters','Stain-grade oak',
        80,'Oak handrail + metal balusters','Premium iron balusters'
      ),
      0.12, L_CARP,
      'Handrail and baluster installation.',
      'Handrail & balusters — {qty} lf ({tier} grade)', 10),
    matItem('p11-mantel', 'Fireplace Mantel', 'Fireplace mantel', 'unit',
      tiers(
        380,'MDF mantel surround','Paint-grade MDF mantel',
        680,'Poplar mantel surround','Stain-grade poplar',
        1200,'Custom wood mantel','Custom built solid wood mantel'
      ),
      6, L_CARP,
      'Fireplace mantel installation.',
      'Fireplace mantel — {qty} unit(s) ({tier} grade)', 0),
    matItem('p11-closet', 'Closet Systems', 'Closet systems', 'closet',
      tiers(
        250,'Wire shelving system','ClosetMaid wire system',
        550,'Melamine closet system','Modular melamine system',
        1100,'Custom closet system','Custom built-in closet'
      ),
      4, L_CARP,
      'Closet organization system installation.',
      'Closet systems — {qty} closet(s) ({tier} grade)', 0),
    laborItem('p11-attic', 'Attic Access / Pull-Down Stair', 'Attic access', 'unit', 3, L_CARP,
      'Attic access hatch or pull-down stair installation.',
      'Attic access/pull-down stair — {qty} unit(s)'),
  ],
};

// ─── PHASE 12: CABINETRY & COUNTERTOPS ────────────────────────
const phase12: PhaseGroup = {
  id: 12, name: 'Cabinetry & Countertops', icon: '🍳',
  description: 'Kitchen and bathroom cabinetry, countertops, and hardware — supply and installation.',
  items: [
    matItem('p12-cab', 'Kitchen Cabinets', 'Kitchen cabinets', 'lf',
      tiers(
        280,'Stock cabinets','Home Depot/Lowe\'s stock, basic finish',
        500,'Semi-custom cabinets','IKEA or semi-custom, soft-close',
        900,'Custom cabinets','Full custom cabinetry, dovetail joints'
      ),
      1.5, L_CARP,
      'Kitchen cabinet supply and installation — base and upper.',
      'Kitchen cabinets — {qty} lf ({tier} grade)', 5,
      false, false, '',
      [
        { label: 'Base cabinets only (34.5" H)', value: 'base-only' },
        { label: 'Upper cabinets only (30" H)', value: 'upper-30h' },
        { label: 'Upper cabinets only (36" H)', value: 'upper-36h', rateMultiplier: 1.08 },
        { label: 'Upper cabinets only (42" H)', value: 'upper-42h', rateMultiplier: 1.15 },
        { label: 'Base + upper (standard kitchen)', value: 'base-upper', note: 'Most common' },
        { label: 'Base + upper + tall pantry', value: 'full-kitchen', rateMultiplier: 1.20 },
        { label: 'Island base cabinets', value: 'island', rateMultiplier: 1.25, note: 'Island — extra labor' },
      ]),
    matItem('p12-vanity', 'Bathroom Vanity', 'Bathroom vanity', 'unit',
      tiers(
        380,'Stock vanity','Standard stock vanity',
        700,'Semi-custom vanity','Upgraded semi-custom',
        1200,'Custom vanity','Custom built vanity'
      ),
      3, L_CARP,
      'Bathroom vanity supply and installation.',
      'Bathroom vanity — {qty} unit(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: '24" single vanity', value: '24in' },
        { label: '30" single vanity', value: '30in' },
        { label: '36" single vanity', value: '36in', note: 'Most popular' },
        { label: '42" single vanity', value: '42in', rateMultiplier: 1.10 },
        { label: '48" single vanity', value: '48in', rateMultiplier: 1.15 },
        { label: '60" double vanity', value: '60in-dbl', rateMultiplier: 1.40 },
        { label: '72" double vanity', value: '72in-dbl', rateMultiplier: 1.60 },
        { label: '84" double vanity', value: '84in-dbl', rateMultiplier: 1.80 },
      ]),
    matItem('p12-counter', 'Countertops', 'Countertops', 'sqft',
      tiers(
        28,'Laminate countertop','Formica or similar',
        80,'Quartz countertop','Engineered quartz (Silestone, Cambria)',
        120,'Granite/Marble countertop','Natural stone slab'
      ),
      0.025, L_CARP,
      'Countertop supply and installation.',
      'Countertops — {qty} sq ft ({tier} grade)', 5,
      false, false, '',
      [
        { label: 'Laminate (post-form edge)', value: 'laminate-postform' },
        { label: 'Laminate (custom edge)', value: 'laminate-custom', rateMultiplier: 1.15 },
        { label: 'Butcher block (1.5" thick)', value: 'butcher-1.5in', rateMultiplier: 1.60 },
        { label: 'Quartz (2cm / 3/4")', value: 'quartz-2cm' },
        { label: 'Quartz (3cm / 1.25")', value: 'quartz-3cm', rateMultiplier: 1.15, note: 'Most popular' },
        { label: 'Granite (2cm)', value: 'granite-2cm' },
        { label: 'Granite (3cm)', value: 'granite-3cm', rateMultiplier: 1.15 },
        { label: 'Marble (2cm)', value: 'marble-2cm', rateMultiplier: 1.35 },
        { label: 'Marble (3cm)', value: 'marble-3cm', rateMultiplier: 1.50 },
        { label: 'Concrete (1.5" poured)', value: 'concrete-1.5in', rateMultiplier: 1.80 },
        { label: 'Porcelain slab (12mm)', value: 'porcelain-slab', rateMultiplier: 1.45 },
      ]),
    matItem('p12-hardware', 'Cabinet Hardware', 'Cabinet hardware', 'unit',
      tiers(
        6,'Builder-grade pulls','Basic bar pulls',
        18,'Mid-grade hardware','Brushed nickel or matte black',
        42,'Premium hardware','Emtek, Top Knobs, or similar'
      ),
      0.15, L_CARP,
      'Cabinet pulls, knobs, and hinges.',
      'Cabinet hardware — {qty} piece(s) ({tier} grade)', 0),
    matItem('p12-shelf', 'Shelving (Pantry / Laundry)', 'Pantry shelving', 'lf',
      tiers(
        18,'Wire shelving','Standard wire shelving',
        32,'Melamine shelving','Melamine fixed shelving',
        55,'Solid wood shelving','Solid wood pantry shelving'
      ),
      0.3, L_CARP,
      'Pantry or laundry room shelving.',
      'Pantry/laundry shelving — {qty} lf ({tier} grade)', 5),
  ],
};

// ─── PHASE 13: PLUMBING FINISH ────────────────────────────────
const phase13: PhaseGroup = {
  id: 13, name: 'Plumbing Finish', icon: '🚰',
  description: 'Plumbing fixture installation including faucets, sinks, toilets, tubs, shower systems, and appliance hookups.',
  items: [
    matItem('p13-faucet', 'Fixture Swap (Faucet / Showerhead)', 'Fixture swap', 'fixture',
      tiers(
        120,'Builder-grade fixture','Standard chrome fixture',
        280,'Mid-grade fixture','Brushed nickel or matte black',
        580,'Premium fixture','Kohler, Moen, or Delta premium'
      ),
      1.5, L_PLUMB,
      'Faucet, showerhead, or hose bib replacement.',
      'Fixture swap — {qty} fixture(s) ({tier} grade)', 0),
    matItem('p13-toilet', 'Toilet Supply & Install', 'Toilet', 'unit',
      tiers(
        280,'Standard toilet','Elongated 2-piece toilet',
        480,'Comfort height toilet','ADA comfort height, 1-piece',
        850,'Wall-hung toilet','Wall-mounted toilet + carrier'
      ),
      2, L_PLUMB,
      'Toilet supply and installation.',
      'Toilet — {qty} unit(s) ({tier} grade)', 0),
    matItem('p13-sink', 'Sink Supply & Install', 'Sink', 'unit',
      tiers(
        180,'Drop-in sink','Standard drop-in basin',
        320,'Undermount sink','Undermount stainless or porcelain',
        650,'Farmhouse sink','Apron-front farmhouse sink'
      ),
      2, L_PLUMB,
      'Sink supply and installation.',
      'Sink — {qty} unit(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: 'Single bowl drop-in', value: 'single-dropin' },
        { label: 'Double bowl drop-in', value: 'double-dropin', rateMultiplier: 1.20 },
        { label: 'Single bowl undermount', value: 'single-undermount', note: 'Most popular' },
        { label: 'Double bowl undermount', value: 'double-undermount', rateMultiplier: 1.25 },
        { label: 'Farmhouse 30" single', value: 'farmhouse-30' },
        { label: 'Farmhouse 33" single', value: 'farmhouse-33', rateMultiplier: 1.10 },
        { label: 'Farmhouse 36" double', value: 'farmhouse-36-dbl', rateMultiplier: 1.30 },
        { label: 'Vessel sink (above-counter)', value: 'vessel', rateMultiplier: 1.15 },
      ]),
    matItem('p13-tub', 'Tub Supply & Install', 'Tub', 'unit',
      tiers(
        580,'Alcove tub','Standard 60" alcove tub',
        1050,'Freestanding tub','Freestanding soaking tub',
        2200,'Jetted tub','Jetted or air tub'
      ),
      4, L_PLUMB,
      'Bathtub supply and installation.',
      'Tub — {qty} unit(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: '60" alcove (standard)', value: '60in-alcove', note: 'Most common' },
        { label: '66" alcove (longer)', value: '66in-alcove', rateMultiplier: 1.10 },
        { label: '60" freestanding soaking', value: '60in-fs' },
        { label: '66" freestanding soaking', value: '66in-fs', rateMultiplier: 1.10 },
        { label: '71" freestanding soaking', value: '71in-fs', rateMultiplier: 1.20 },
        { label: '60" drop-in tub', value: '60in-dropin', rateMultiplier: 1.15 },
        { label: '72" drop-in tub', value: '72in-dropin', rateMultiplier: 1.25 },
        { label: '60" jetted tub', value: '60in-jetted', rateMultiplier: 1.50 },
        { label: '72" jetted tub', value: '72in-jetted', rateMultiplier: 1.80 },
      ]),
    matItem('p13-shower', 'Shower System (Valve, Head, Trim)', 'Shower system', 'unit',
      tiers(
        280,'Standard shower valve','Pressure-balance valve + head',
        580,'Thermostatic valve','Thermostatic shower system',
        1200,'Multi-function system','Rain head + handheld + body sprays'
      ),
      3, L_PLUMB,
      'Shower valve, head, and trim kit.',
      'Shower system — {qty} unit(s) ({tier} grade)', 0),
    laborItem('p13-wh', 'Water Heater Replacement', 'Water heater', 'unit', 4, L_PLUMB,
      'Water heater replacement.',
      'Water heater — {qty} unit(s)', true, 'Licensed plumber required'),
    laborItem('p13-dw', 'Dishwasher Hookup', 'Dishwasher hookup', 'unit', 1.5, L_PLUMB,
      'Dishwasher hookup and installation.',
      'Dishwasher hookup — {qty} unit(s)'),
    laborItem('p13-disp', 'Garbage Disposal', 'Garbage disposal', 'unit', 1.5, L_PLUMB,
      'Garbage disposal installation.',
      'Garbage disposal — {qty} unit(s)'),
    laborItem('p13-washer', 'Washer Hookup', 'Washer hookup', 'unit', 1, L_PLUMB,
      'Washer supply and drain hookup.',
      'Washer hookup — {qty} unit(s)'),
  ],
};

// ─── PHASE 14: ELECTRICAL FINISH ──────────────────────────────
const phase14: PhaseGroup = {
  id: 14, name: 'Electrical Finish', icon: '💡',
  description: 'Electrical finish work including light fixtures, ceiling fans, outlets, recessed lighting, and smart devices.',
  items: [
    matItem('p14-light', 'Light Fixture Swap', 'Light fixtures', 'fixture',
      tiers(
        65,'Builder-grade fixture','Standard light fixture',
        180,'Mid-grade fixture','Brushed nickel or matte black',
        420,'Designer fixture','Premium designer fixture'
      ),
      0.75, L_ELEC,
      'Light fixture replacement.',
      'Light fixtures — {qty} fixture(s) ({tier} grade)', 0),
    matItem('p14-fan', 'Ceiling Fan Install', 'Ceiling fans', 'fan',
      tiers(
        120,'Builder-grade fan','Standard ceiling fan',
        280,'Mid-grade fan','Remote-control fan, 52"',
        580,'Premium fan','Hunter or Minka premium fan'
      ),
      1.5, L_ELEC,
      'Ceiling fan installation.',
      'Ceiling fans — {qty} fan(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: '42" fan (small room)', value: '42in' },
        { label: '52" fan (standard)', value: '52in', note: 'Most popular' },
        { label: '60" fan (large room)', value: '60in', rateMultiplier: 1.10 },
        { label: '72" fan (great room)', value: '72in', rateMultiplier: 1.20 },
        { label: 'Flush-mount (low ceiling)', value: 'flush', rateMultiplier: 0.95 },
        { label: 'Downrod 12" extension', value: 'downrod-12', rateMultiplier: 1.05 },
        { label: 'Downrod 24" extension', value: 'downrod-24', rateMultiplier: 1.08 },
      ]),
    laborItem('p14-outlet', 'Outlet / Switch Replacement', 'Outlets/switches', 'device', 0.5, L_ELEC,
      'Outlet and switch replacement.',
      'Outlets/switches — {qty} device(s)'),
    laborItem('p14-gfci', 'GFCI Outlet Install', 'GFCI outlets', 'device', 0.75, L_ELEC,
      'GFCI outlet installation.',
      'GFCI outlets — {qty} outlet(s)'),
    matItem('p14-undercab', 'Under-Cabinet Lighting', 'Under-cabinet lighting', 'lf',
      tiers(
        18,'Plug-in LED strip','Basic LED strip',
        32,'Hardwired LED strip','Hardwired LED system',
        55,'Premium LED system','Kichler or similar premium'
      ),
      0.3, L_ELEC,
      'Under-cabinet lighting installation.',
      'Under-cabinet lighting — {qty} lf ({tier} grade)', 5),
    matItem('p14-can', 'Recessed Can Lights', 'Recessed lights', 'can',
      tiers(
        28,'Standard 6" can','Basic recessed can',
        48,'LED retrofit can','Integrated LED can',
        85,'Premium LED can','Halo or Lutron premium'
      ),
      1, L_ELEC,
      'Recessed can light installation.',
      'Recessed lights — {qty} can(s) ({tier} grade)', 0,
      false, false, '',
      [
        { label: '4" can (accent/tight spaces)', value: '4in' },
        { label: '5" can (standard)', value: '5in' },
        { label: '6" can (most popular)', value: '6in', note: 'Most popular' },
        { label: '6" gimbal/adjustable', value: '6in-gimbal', rateMultiplier: 1.10 },
        { label: '6" wafer (ultra-slim, no housing)', value: '6in-wafer', rateMultiplier: 0.90, note: 'No housing needed' },
        { label: '8" can (large space)', value: '8in', rateMultiplier: 1.15 },
      ]),
    laborItem('p14-exhaust', 'Exhaust Fan (Bath)', 'Exhaust fans', 'fan', 1.5, L_ELEC,
      'Bathroom exhaust fan installation.',
      'Exhaust fans — {qty} fan(s)'),
    laborItem('p14-circuit', 'Dedicated Appliance Circuits', 'Appliance circuits', 'circuit', 3, L_ELEC,
      'Dedicated circuits for range, dryer, EV charger.',
      'Appliance circuits — {qty} circuit(s)', true, 'Licensed electrician required'),
    laborItem('p14-smart', 'Smart Switch / Dimmer', 'Smart switches', 'device', 0.75, L_ELEC,
      'Smart switch and dimmer installation.',
      'Smart switches/dimmers — {qty} device(s)'),
    laborItem('p14-doorbell', 'Doorbell / Camera Rough-In', 'Doorbell/camera', 'unit', 1.5, L_ELEC,
      'Doorbell and security camera rough-in.',
      'Doorbell/camera rough-in — {qty} location(s)'),
  ],
};

// ─── PHASE 15: PAINTING ───────────────────────────────────────
const phase15: PhaseGroup = {
  id: 15, name: 'Painting', icon: '🎨',
  description: 'Interior and exterior painting — walls, ceilings, trim, cabinets, decks, and fences — prep, prime, and finish coats.',
  items: [
    matItem('p15-int-wall', 'Interior Walls', 'Interior walls', 'sqft',
      tiers(
        0.55,'1-coat paint','Primer + 1 finish coat',
        0.85,'2-coat paint','Primer + 2 finish coats',
        1.25,'Premium paint','Sherwin-Williams Emerald 2-coat'
      ),
      0.008, L_PAINT,
      'Interior wall painting — prep, prime, and finish coats.',
      'Interior walls — {qty} sq ft ({tier} grade)', 0, false),
    matItem('p15-ceiling', 'Interior Ceilings', 'Interior ceilings', 'sqft',
      tiers(
        0.45,'1-coat ceiling paint','Primer + 1 coat flat',
        0.70,'2-coat ceiling paint','Primer + 2 coats flat',
        1.00,'Premium ceiling paint','Sherwin-Williams 2-coat'
      ),
      0.006, L_PAINT,
      'Interior ceiling painting.',
      'Interior ceilings — {qty} sq ft ({tier} grade)', 0),
    matItem('p15-trim', 'Interior Trim & Doors — Paint', 'Trim & door paint', 'lf',
      tiers(
        0.70,'1-coat trim paint','Brush + 1 coat semi-gloss',
        1.10,'2-coat trim paint','Sand + 2 coats semi-gloss',
        1.65,'Spray finish trim','Spray-applied semi-gloss'
      ),
      0.010, L_PAINT,
      'Interior trim and door painting.',
      'Interior trim/doors — {qty} lf ({tier} grade)', 0, false),
    matItem('p15-cab', 'Cabinet Painting', 'Cabinet painting', 'box',
      tiers(
        80,'Brush/roll cabinet paint','Brush-applied cabinet paint',
        130,'Spray cabinet paint','Spray-applied finish',
        200,'Premium spray finish','Fine finish spray + primer'
      ),
      3, L_PAINT,
      'Cabinet painting — spray finish.',
      'Cabinet painting — {qty} door/box ({tier} grade)', 0),
    matItem('p15-ext-wall', 'Exterior Walls / Siding', 'Exterior paint', 'sqft',
      tiers(
        0.60,'1-coat exterior paint','Primer + 1 finish coat',
        0.95,'2-coat exterior paint','Primer + 2 finish coats',
        1.40,'Premium exterior paint','Sherwin-Williams Duration 2-coat'
      ),
      0.008, L_PAINT,
      'Exterior wall and siding painting.',
      'Exterior walls/siding — {qty} sq ft ({tier} grade)', 0),
    matItem('p15-ext-trim', 'Exterior Trim, Fascia, Soffits', 'Exterior trim paint', 'lf',
      tiers(
        0.75,'1-coat exterior trim','Brush + 1 coat',
        1.20,'2-coat exterior trim','Sand + 2 coats',
        1.80,'Premium exterior trim','Spray + 2 coats'
      ),
      0.010, L_PAINT,
      'Exterior trim, fascia, and soffit painting.',
      'Exterior trim/fascia — {qty} lf ({tier} grade)', 0),
    matItem('p15-deck', 'Deck Stain / Paint', 'Deck stain', 'sqft',
      tiers(
        0.55,'Solid deck stain','1-coat solid stain',
        0.85,'Premium solid stain','2-coat solid stain',
        1.20,'Deck paint system','Primer + 2 coats deck paint'
      ),
      0.006, L_PAINT,
      'Deck staining or painting.',
      'Deck stain/paint — {qty} sq ft ({tier} grade)', 0),
    matItem('p15-fence', 'Fence Stain / Paint', 'Fence stain', 'lf',
      tiers(
        0.60,'Solid fence stain','1-coat solid stain',
        0.95,'Premium fence stain','2-coat solid stain',
        1.35,'Fence paint','Primer + 2 coats'
      ),
      0.006, L_PAINT,
      'Fence staining or painting.',
      'Fence stain/paint — {qty} lf ({tier} grade)', 0),
    matItem('p15-epoxy', 'Epoxy Floor Coating (Garage)', 'Epoxy floor', 'sqft',
      tiers(
        2.50,'Single-layer epoxy','Standard epoxy coating',
        4.00,'2-layer epoxy','Base + topcoat epoxy',
        6.50,'Polyaspartic coating','Premium polyaspartic system'
      ),
      0.012, L_PAINT,
      'Garage floor epoxy coating.',
      'Epoxy floor coating — {qty} sq ft ({tier} grade)', 5),
  ],
};

// ─── PHASE 16: APPLIANCES & SPECIALTIES ───────────────────────
const phase16: PhaseGroup = {
  id: 16, name: 'Appliances & Specialties', icon: '🔌',
  description: 'Appliance installation, specialty items, and finishing touches including range hoods, fireplaces, and window treatments.',
  items: [
    laborItem('p16-appliance', 'Appliance Install (Range, Fridge, DW, Microwave)', 'Appliance install', 'unit', 1.5, L_GC,
      'Appliance installation and hookup.',
      'Appliance install — {qty} unit(s)'),
    laborItem('p16-hood', 'Hood Vent Install', 'Hood vent', 'unit', 3, L_GC,
      'Range hood vent installation.',
      'Hood vent — {qty} unit(s)'),
    laborItem('p16-fireplace', 'Fireplace Gas Insert', 'Gas fireplace', 'unit', 6, L_GC,
      'Gas fireplace insert installation.',
      'Gas fireplace insert — {qty} unit(s)', true, 'Sub specialty — gas contractor required'),
    laborItem('p16-bath-acc', 'Bathroom Accessories', 'Bath accessories', 'unit', 0.5, L_CARP,
      'Towel bars, TP holders, mirrors, and accessories.',
      'Bathroom accessories — {qty} piece(s)'),
    laborItem('p16-blinds', 'Window Treatments / Blinds', 'Window treatments', 'window', 0.75, L_CARP,
      'Window blind and treatment installation.',
      'Window treatments — {qty} window(s)'),
  ],
};

// ─── PHASE 17: FINAL CLEANING & CLOSEOUT ──────────────────────
const phase17: PhaseGroup = {
  id: 17, name: 'Final Cleaning & Closeout', icon: '✅',
  description: 'Post-construction cleaning, exterior site cleanup, punch list completion, and final walkthrough with client sign-off.',
  items: [
    laborItem('p17-clean', 'Post-Construction Clean — Interior', 'Post-construction clean', 'sqft', 0.004, L_GC,
      'Final interior post-construction cleaning.',
      'Post-construction clean — {qty} sq ft'),
    laborItem('p17-windows', 'Window Cleaning — Post-Construction', 'Window cleaning', 'window', 0.5, L_GC,
      'Post-construction window cleaning.',
      'Window cleaning — {qty} window(s)'),
    laborItem('p17-ext-clean', 'Exterior Site Cleanup', 'Exterior cleanup', 'hr', 1, L_DEMO,
      'Exterior site cleanup and debris removal.',
      'Exterior site cleanup — {qty} hrs'),
    laborItem('p17-punch', 'Touch-Up Punch List', 'Punch list', 'hr', 1, L_GC,
      'Final touch-up and punch list completion.',
      'Touch-up punch list — {qty} hrs'),
    laborItem('p17-walkthrough', 'Final Walkthrough / Sign-Off', 'Final walkthrough', 'hr', 1, L_GC,
      'Final walkthrough and sign-off documentation.',
      'Final walkthrough — {qty} hrs'),
  ],
};

// ─── EXPORT ALL PHASES ────────────────────────────────────────
// Correct construction sequence:
//  1  Pre-Construction       (permits, scheduling, procurement)
//  2  Demo & Rough Work      (selective demo, rough framing prep)
//  8  Framing & Carpentry    (structural framing, sheathing, subfloor)
//  9  Exterior Work          (roofing, siding, windows rough, waterproofing)
// 10  Doors & Windows        (door/window installation)
//  3  Mechanical Rough-In    (plumbing, electrical, HVAC rough-in)
//  4  Insulation & Weather.  (batt, spray foam, vapor barrier)
//  5  Drywall                (hang, tape, mud, texture)
//  7  Tile Work              (wet areas: shower, bath floor, backsplash)
// 12  Cabinetry & Counters   (cabinet install before trim/paint)
// 15  Painting               (prime + paint walls/ceilings before trim/floor)
// 11  Trim & Finish Carp.    (baseboard, casing, crown after paint)
//  6  Flooring               (hardwood/LVP last — after paint and trim)
// 13  Plumbing Finish        (fixtures, trim-out)
// 14  Electrical Finish      (devices, fixtures, panels)
// 16  Appliances & Special.  (appliances, specialties)
// 17  Final Cleaning & Close (punch list, cleaning, walkthrough)
export const ALL_PHASES: PhaseGroup[] = [
  phase1,   // 1  Pre-Construction
  phase2,   // 2  Demo & Rough Work
  phase8,   // 3  Framing & Carpentry  ← moved up (was 8)
  phase9,   // 4  Exterior Work        ← moved up (was 9)
  phase10,  // 5  Doors & Windows      ← moved up (was 10)
  phase3,   // 6  Mechanical Rough-In  ← moved down (was 3)
  phase4,   // 7  Insulation           ← moved down (was 4)
  phase5,   // 8  Drywall              ← moved down (was 5)
  phase7,   // 9  Tile Work            ← moved down (was 7)
  phase12,  // 10 Cabinetry & Counters ← moved up (was 12)
  phase15,  // 11 Painting             ← moved up (was 15)
  phase11,  // 12 Trim & Finish Carp.  ← moved down (was 11)
  phase6,   // 13 Flooring             ← moved down (was 6)
  phase13,  // 14 Plumbing Finish      (unchanged)
  phase14,  // 15 Electrical Finish    (unchanged)
  phase16,  // 16 Appliances & Special (unchanged)
  phase17,  // 17 Final Cleaning       (unchanged)
];

export const DEFAULTS = {
  markupPct: 0.40,
  laborRate: L_GC,
  paintRate: L_PAINT,
};
