// ============================================================
// HP Field Estimator — Detailed SOW Generator
// Produces a full plain-text Statement of Work from an approved
// estimate snapshot. Covers: materials sourcing, site prep,
// client brief, labor steps, clean-up, and job walk.
// ============================================================

import { EstimateSnapshot, CustomLineItem } from './types';
import { calcPhase, calcCustomItem, fmtDollar } from './calc';
import { ALL_PHASES } from './phases';

// ─── Phase-level labor step templates ─────────────────────────
// Maps phase ID → array of ordered labor steps
const PHASE_LABOR_STEPS: Record<number, string[]> = {
  1: [ // Pre-Construction
    'Conduct full site walk-through with client to confirm scope and access points.',
    'Photograph existing conditions in all work areas.',
    'Confirm utility shut-off locations (water, gas, electrical panels).',
    'Obtain required permits and post on-site before work begins.',
    'Establish material staging area and protect finished surfaces with drop cloths.',
  ],
  2: [ // Demo & Rough Work
    'Shut off utilities to affected areas and verify with non-contact tester.',
    'Protect adjacent finished surfaces with poly sheeting and painter\'s tape.',
    'Perform selective demolition per scope — remove only what is specified.',
    'Haul debris to designated dumpster or staging area; do not block egress.',
    'Inspect sub-surfaces for moisture, rot, or structural issues; document and report.',
    'Sweep and HEPA-vacuum work area before closing for the day.',
  ],
  3: [ // Mechanical Rough-In
    'Coordinate rough-in sequence with plumbing, HVAC, and electrical trades.',
    'Mark all rough-in locations on framing per approved plans.',
    'Install blocking for fixtures, fans, and wall-mounted equipment.',
    'Pressure-test rough plumbing before closing walls.',
    'Verify rough electrical passes inspection before insulation.',
  ],
  4: [ // Insulation & Weatherproofing
    'Air-seal all penetrations with fire-rated caulk or spray foam before insulating.',
    'Install vapor barrier per local code (WA: warm side of insulation).',
    'Install batt or blown insulation to specified R-value.',
    'Inspect for gaps, compression, or voids; correct before drywall.',
    'Install weatherstripping and door sweeps on all exterior doors in scope.',
  ],
  5: [ // Drywall
    'Verify framing is plumb, level, and free of protruding fasteners.',
    'Hang drywall starting from ceiling; stagger seams and minimize butt joints.',
    'Tape, bed, and apply minimum three coats of joint compound.',
    'Sand smooth between coats; final sand to 120-grit for paint-ready surface.',
    'Prime all new drywall before finish paint.',
  ],
  6: [ // Flooring
    'Acclimate flooring material on-site for 48–72 hours per manufacturer specs.',
    'Verify subfloor is flat to within 3/16″ per 10 ft; grind or shim as needed.',
    'Install appropriate underlayment for product type.',
    'Install flooring per manufacturer pattern and direction requirements.',
    'Install transitions and base shoe; caulk perimeter expansion gap.',
    'Clean and inspect finished floor before moving furniture back.',
  ],
  7: [ // Tile Work
    'Confirm substrate is solid, flat, and free of deflection.',
    'Waterproof wet areas (shower, tub surround) with membrane; inspect seams.',
    'Snap layout lines; dry-lay first course to confirm pattern and minimize cuts.',
    'Set tile with appropriate thinset; back-butter large-format tiles.',
    'Allow full cure before grouting (minimum 24 hours).',
    'Apply grout; clean haze within 30 minutes; seal grout after full cure.',
    'Caulk all inside corners and transitions — no grout in movement joints.',
  ],
  8: [ // Framing & Carpentry
    'Verify all lumber is dry and straight before cutting.',
    'Frame walls plumb and square; check diagonals.',
    'Install blocking for future fixtures, grab bars, and shelving.',
    'Inspect framing before closing with drywall.',
  ],
  9: [ // Exterior Work
    'Inspect existing sheathing and flashing; replace any damaged sections.',
    'Install housewrap or building paper with 6″ overlaps, lapped shingle-style.',
    'Install flashing at all windows, doors, and penetrations before cladding.',
    'Install siding/trim per manufacturer fastening schedule.',
    'Caulk and prime all exposed end-grain and joints.',
    'Final inspection for gaps, nail pops, and sealant continuity.',
  ],
  10: [ // Doors & Windows
    'Verify rough opening is plumb, level, and square before installation.',
    'Install sill pan flashing on all exterior openings.',
    'Set unit in opening; shim level and plumb; fasten per manufacturer specs.',
    'Install exterior trim and flash head; seal all penetrations.',
    'Adjust hardware for smooth operation; verify weatherstripping contact.',
    'Install interior casing and adjust door stop for proper latch engagement.',
  ],
  11: [ // Trim & Finish Carpentry
    'Acclimate trim material on-site for 24 hours minimum.',
    'Install base, case, and crown in sequence; cope inside corners.',
    'Fill nail holes and sand smooth; caulk trim-to-wall joints.',
    'Prime and spot-paint filled areas before final coat.',
  ],
  12: [ // Cabinetry & Countertops
    'Verify walls are plumb and floor is level; scribe or shim as needed.',
    'Install upper cabinets first; secure to wall studs with 3″ screws.',
    'Install base cabinets; level, align, and fasten together.',
    'Install countertop; scribe to wall; fasten from below.',
    'Install sink cutout, undermount clips, and silicone seal.',
    'Install hardware, adjust hinges and drawer slides for smooth operation.',
  ],
  13: [ // Plumbing Finish
    'Install fixtures per manufacturer instructions; use plumber\'s putty or silicone as specified.',
    'Connect supply lines with proper shut-off valves at each fixture.',
    'Test all connections under pressure; check for leaks at 24 hours.',
    'Install p-traps and drain connections; verify slope to drain.',
    'Caulk fixtures to wall/floor with mold-resistant silicone.',
  ],
  14: [ // Electrical Finish
    'Install devices and covers per approved electrical plan.',
    'Label all breakers in panel directory.',
    'Test all outlets with outlet tester; verify GFCI protection in wet areas.',
    'Install light fixtures and ceiling fans per manufacturer instructions.',
    'Verify all circuits are energized and functional before sign-off.',
  ],
  15: [ // Painting
    'Mask all trim, hardware, and surfaces not to be painted.',
    'Fill holes, sand, and prime bare surfaces.',
    'Apply minimum two finish coats; allow full dry time between coats.',
    'Remove masking before paint fully cures to avoid tearing.',
    'Touch up any holidays or thin spots; inspect under raking light.',
  ],
  16: [ // Appliances & Specialties
    'Verify rough-in dimensions match appliance specs before delivery.',
    'Slide appliance into position; level and secure anti-tip bracket.',
    'Connect utilities per manufacturer requirements.',
    'Test all functions; verify door/drawer clearances.',
    'Register appliance warranty with manufacturer.',
  ],
  17: [ // Final Cleaning & Closeout
    'Remove all tools, materials, and debris from job site.',
    'HEPA-vacuum all surfaces; wipe down cabinets, counters, and fixtures.',
    'Clean windows and mirrors; remove paint overspray.',
    'Touch up any scuffs or dings from move-out.',
    'Conduct final walk-through with client; document punch list items.',
    'Obtain client sign-off on completion form.',
    'Deliver all warranties, manuals, and permit close-out documents.',
  ],
};

// ─── Phase-level cleanup steps ────────────────────────────────
const PHASE_CLEANUP_STEPS: Record<number, string[]> = {
  2: ['Remove all demo debris; haul off-site or to dumpster.', 'HEPA-vacuum framing cavities.'],
  5: ['Collect and bag drywall scraps; vacuum joint compound dust.', 'Wipe down adjacent surfaces.'],
  6: ['Remove all flooring offcuts and packaging.', 'Sweep and damp-mop finished floor.'],
  7: ['Remove tile spacers and excess thinset.', 'Buff grout haze from tile surface.'],
  9: ['Collect all siding offcuts and fastener packaging.', 'Sweep exterior work area.'],
  15: ['Remove all masking tape and paper.', 'Wipe down adjacent surfaces for paint overspray.'],
};

// ─── Sourcing / procurement notes per phase ───────────────────
const PHASE_SOURCING_NOTES: Record<number, string> = {
  6:  'Flooring: order with 10–15% overage; confirm dye lot matches before cutting.',
  7:  'Tile: order with 10% overage for cuts; confirm grout color and joint size with client.',
  10: 'Doors/windows: lead time 2–6 weeks for special orders; confirm rough opening before ordering.',
  11: 'Trim: order 15% overage for waste; prime all cut ends before installation.',
  12: 'Cabinets: verify lead time (stock vs. semi-custom vs. custom); inspect for damage on delivery.',
  15: 'Paint: confirm sheen and color with client; order sample quarts for approval before full purchase.',
  16: 'Appliances: confirm delivery date and access route; inspect on delivery before installer arrival.',
};

// ─── Main SOW generator ───────────────────────────────────────
export function generateSOW(snapshot: EstimateSnapshot): string {
  const { jobInfo, phases, customItems, global } = snapshot;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  // Compute active phases and custom items
  const phaseResults = phases.map(p => calcPhase(p, global));
  const activePhaseResults = phaseResults.filter(p => p.hasData);
  const customResults = customItems.map(ci => calcCustomItem(ci, global)).filter(c => c.hasData);

  // Group custom items by phase
  const customByPhase: Record<number, typeof customResults> = {};
  for (const c of customResults) {
    if (!customByPhase[c.phaseId]) customByPhase[c.phaseId] = [];
    customByPhase[c.phaseId].push(c);
  }

  // Orphan custom items (not tied to an active standard phase)
  const activePhaseIds = new Set(activePhaseResults.map(p => p.phaseId));
  const orphanCustom = customResults.filter(c => !activePhaseIds.has(c.phaseId));

  const lines: string[] = [];

  // ── Header ──────────────────────────────────────────────────
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('         HANDY PIONEERS — STATEMENT OF WORK (SOW)');
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('');
  lines.push(`Job Number  : ${jobInfo.jobNumber || '—'}`);
  lines.push(`Client      : ${jobInfo.client || '—'}`);
  if (jobInfo.companyName) lines.push(`Company     : ${jobInfo.companyName}`);
  lines.push(`Address     : ${[jobInfo.address, jobInfo.city, jobInfo.state, jobInfo.zip].filter(Boolean).join(', ')}`);
  if (jobInfo.phone) lines.push(`Phone       : ${jobInfo.phone}`);
  if (jobInfo.email) lines.push(`Email       : ${jobInfo.email}`);
  lines.push(`Date        : ${dateStr}`);
  lines.push(`Job Type    : ${jobInfo.jobType || '—'}`);
  if (jobInfo.estimator) lines.push(`Assigned To : ${jobInfo.estimator}`);
  lines.push('');

  // ── Scope Summary ────────────────────────────────────────────
  if (jobInfo.scope) {
    lines.push('───────────────────────────────────────────────────────────');
    lines.push('PROJECT SCOPE SUMMARY');
    lines.push('───────────────────────────────────────────────────────────');
    lines.push(jobInfo.scope);
    lines.push('');
  }

  // ── Materials to Source ──────────────────────────────────────
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('SECTION 1 — MATERIALS TO SOURCE & PROCURE');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('Review all items below before the job start date. Confirm');
  lines.push('quantities, lead times, and client selections in advance.');
  lines.push('');

  let hasMaterials = false;
  for (const pr of activePhaseResults) {
    const phase = phases.find(p => p.id === pr.phaseId);
    if (!phase) continue;
    const matItems = pr.items.filter(i => i.hasData && i.matCost > 0);
    const phaseCustom = customByPhase[pr.phaseId] ?? [];
    const customMatItems = phaseCustom.filter(c => c.matCost > 0);

    if (matItems.length === 0 && customMatItems.length === 0) continue;
    hasMaterials = true;

    lines.push(`  ${phase.icon} ${phase.name.toUpperCase()}`);
    for (const item of matItems) {
      const phaseItem = phase.items.find(i => i.id === item.id);
      const tierLabel = phaseItem ? (phaseItem.tier.charAt(0).toUpperCase() + phaseItem.tier.slice(1)) : '';
      const matLabel = item.matName && item.matName !== '—' ? item.matName : tierLabel + ' grade';
      lines.push(`    • ${item.name}: ${item.purchaseQty.toFixed(1)} ${item.unitType} — ${matLabel}`);
    }
    for (const ci of customMatItems) {
      lines.push(`    • ${ci.description}: ${ci.qty} ${ci.unitType} (custom)`);
    }
    if (PHASE_SOURCING_NOTES[pr.phaseId]) {
      lines.push(`    ℹ  ${PHASE_SOURCING_NOTES[pr.phaseId]}`);
    }
    lines.push('');
  }

  // Orphan custom material items
  if (orphanCustom.some(c => c.matCost > 0)) {
    lines.push('  ADDITIONAL MATERIALS (unassigned phase)');
    for (const ci of orphanCustom.filter(c => c.matCost > 0)) {
      lines.push(`    • ${ci.description}: ${ci.qty} ${ci.unitType}`);
    }
    lines.push('');
  }

  if (!hasMaterials) {
    lines.push('  No materials to source for this project (labor-only scope).');
    lines.push('');
  }

  // ── Pickup & Drop-Off ────────────────────────────────────────
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('SECTION 2 — MATERIAL PICKUP & DROP-OFF');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('• Coordinate material delivery or pickup schedule with supplier');
  lines.push('  at least 48 hours before the scheduled start date.');
  lines.push('• Designate a staging area on-site that does not block egress,');
  lines.push('  HVAC returns, or the electrical panel.');
  lines.push('• Inspect all deliveries for damage before signing; document');
  lines.push('  any defects with photos and notify supplier immediately.');
  lines.push('• Store moisture-sensitive materials (flooring, drywall, trim)');
  lines.push('  indoors and off the slab on pallets or blocking.');
  lines.push('• Confirm client has cleared the work area of personal items');
  lines.push('  and furniture before materials arrive.');
  lines.push('');

  // ── Site Prep ────────────────────────────────────────────────
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('SECTION 3 — SITE PREPARATION');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('• Walk all work areas with lead technician before starting.');
  lines.push('• Protect flooring, counters, and fixtures not in scope with');
  lines.push('  drop cloths, ram board, or poly sheeting.');
  lines.push('• Mask adjacent painted surfaces with painter\'s tape.');
  lines.push('• Confirm utility shut-offs: water main, circuit breakers,');
  lines.push('  and gas valves for affected areas.');
  lines.push('• Set up dust containment barriers at doorways to unaffected');
  lines.push('  areas (zip wall or poly + tape).');
  lines.push('• Confirm emergency egress is clear at all times.');
  lines.push('');

  // ── Client Brief ─────────────────────────────────────────────
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('SECTION 4 — CLIENT BRIEF (PRE-START)');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('Before work begins, review the following with the client:');
  lines.push('• Confirm scope of work matches the signed estimate.');
  lines.push('• Identify any last-minute changes or concerns.');
  lines.push('• Establish daily work hours and access arrangements.');
  lines.push('• Confirm client contact number for questions during the job.');
  lines.push('• Review noise/dust expectations and any pet/child safety needs.');
  lines.push('• Confirm deposit has been received before mobilizing crew.');
  lines.push('• Walk through the project sequence so client understands');
  lines.push('  the order of trades and expected milestones.');
  lines.push('');

  // ── Phase-by-Phase Labor Steps ───────────────────────────────
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('SECTION 5 — LABOR STEPS BY PHASE');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('');

  let phaseNum = 1;
  for (const pr of activePhaseResults) {
    const phase = phases.find(p => p.id === pr.phaseId);
    if (!phase) continue;
    const phaseCustom = customByPhase[pr.phaseId] ?? [];

    lines.push(`  5.${phaseNum} ${phase.icon} ${phase.name.toUpperCase()}`);
    lines.push(`  ${phase.description || ''}`);
    lines.push('');

    // Standard line items
    const activeItems = pr.items.filter(i => i.hasData);
    if (activeItems.length > 0) {
      lines.push('  Materials / Scope Items:');
      for (const item of activeItems) {
        lines.push(`    • ${item.sowLine || item.name} (${item.qty} ${item.unitType})`);
      }
      lines.push('');
    }

    // Custom items for this phase
    if (phaseCustom.length > 0) {
      lines.push('  Additional Custom Items:');
      for (const ci of phaseCustom) {
        lines.push(`    • ${ci.description} — ${ci.qty} ${ci.unitType}`);
      }
      lines.push('');
    }

    // Labor steps
    const steps = PHASE_LABOR_STEPS[pr.phaseId];
    if (steps && steps.length > 0) {
      lines.push('  Labor Steps:');
      steps.forEach((step, idx) => {
        lines.push(`    ${idx + 1}. ${step}`);
      });
      lines.push('');
    }

    // Cleanup steps
    const cleanup = PHASE_CLEANUP_STEPS[pr.phaseId];
    if (cleanup && cleanup.length > 0) {
      lines.push('  Phase Clean-Up:');
      cleanup.forEach(step => lines.push(`    • ${step}`));
      lines.push('');
    }

    phaseNum++;
  }

  // Orphan custom items (not tied to any active standard phase)
  if (orphanCustom.length > 0) {
    lines.push(`  5.${phaseNum} ⚙️ ADDITIONAL CUSTOM SCOPE`);
    lines.push('');
    lines.push('  Custom Items:');
    for (const ci of orphanCustom) {
      lines.push(`    • ${ci.description} — ${ci.qty} ${ci.unitType}`);
    }
    lines.push('');
    phaseNum++;
  }

  // ── Clean-Up & Restoration ───────────────────────────────────
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('SECTION 6 — FINAL CLEAN-UP & SITE RESTORATION');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('• Remove all tools, equipment, and unused materials from site.');
  lines.push('• HEPA-vacuum all work areas, including inside cabinets and');
  lines.push('  closets affected by the work.');
  lines.push('• Wipe down all surfaces: counters, fixtures, windows, and');
  lines.push('  hardware installed as part of this project.');
  lines.push('• Remove all protective coverings; inspect for damage.');
  lines.push('• Touch up any scuffs, dings, or paint marks on adjacent');
  lines.push('  surfaces caused during the project.');
  lines.push('• Restore furniture and personal items to original positions');
  lines.push('  (if moved by crew).');
  lines.push('• Dispose of all waste in accordance with local regulations;');
  lines.push('  no materials left on curb without client approval.');
  lines.push('');

  // ── Job Walk & Sign-Off ──────────────────────────────────────
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('SECTION 7 — JOB WALK & CLIENT SIGN-OFF');
  lines.push('───────────────────────────────────────────────────────────');
  lines.push('Conduct a final walk-through with the client before requesting');
  lines.push('final payment. Review each item in the signed estimate:');
  lines.push('');
  lines.push('  Walk-Through Checklist:');
  for (const pr of activePhaseResults) {
    const phase = phases.find(p => p.id === pr.phaseId);
    if (!phase) continue;
    lines.push(`    ☐ ${phase.name} — all items completed per scope`);
  }
  if (orphanCustom.length > 0) {
    lines.push('    ☐ Additional custom scope items — all completed');
  }
  lines.push('');
  lines.push('  Post-Walk Steps:');
  lines.push('  1. Document any punch list items with photos.');
  lines.push('  2. Complete all punch list items before requesting sign-off.');
  lines.push('  3. Present the final invoice to the client for review.');
  lines.push('  4. Obtain client signature on the Job Completion Sign-Off form.');
  lines.push('  5. Collect final payment per agreed method.');
  lines.push('  6. Deliver all warranties, manuals, and permit close-out docs.');
  lines.push('  7. Submit permit final inspection request if applicable.');
  lines.push('');

  // ── Footer ───────────────────────────────────────────────────
  lines.push('═══════════════════════════════════════════════════════════');
  lines.push('Handy Pioneers LLC | (360) 544-9858 | handypioneers.com');
  lines.push('License #HANDYPL773RN | Vancouver, WA');
  lines.push(`Generated: ${dateStr}`);
  lines.push('═══════════════════════════════════════════════════════════');

  return lines.join('\n');
}
