/**
 * generateProjectSchedule
 * ──────────────────────────────────────────────────────────────
 * Converts an approved estimate's active phases into a sequenced
 * set of ScheduleEvents — one per phase — with smart duration
 * estimation and weekend-skipping.
 *
 * Duration model:
 *   totalLaborHours = sum of (item.laborHrs * item.qty) across all
 *                     enabled items in the phase
 *   workingDays     = ceil(totalLaborHours / 8)   (1 crew, 8-hr day)
 *   Minimum: 0.5 day (half-day visit)
 *   Maximum: 14 calendar days per phase
 *
 * Phase color palette (matches SchedulePage type colors):
 *   Rough / structural → slate  (#64748b)
 *   MEP rough-in       → blue   (#3b82f6)
 *   Envelope           → amber  (#f59e0b)
 *   Drywall / insul    → orange (#f97316)
 *   Finish carpentry   → violet (#8b5cf6)
 *   Tile / flooring    → teal   (#14b8a6)
 *   Painting           → rose   (#f43f5e)
 *   Cabinets / CTops   → indigo (#6366f1)
 *   Plumbing finish    → cyan   (#06b6d4)
 *   Electrical finish  → yellow (#eab308)
 *   Appliances         → green  (#22c55e)
 *   Cleaning / close   → gray   (#6b7280)
 *   Default            → green  (#22c55e)
 */

import { nanoid } from 'nanoid';
import type { PhaseGroup, LineItem, ScheduleEvent } from './types';

// ── Phase → color map (keyed on phase id from phases.ts) ──────
const PHASE_COLORS: Record<number, string> = {
  1:  '#94a3b8', // Pre-Construction — slate-400
  2:  '#f97316', // Demo & Rough Work — orange
  3:  '#64748b', // Framing & Carpentry — slate
  4:  '#f59e0b', // Exterior Work — amber
  5:  '#f59e0b', // Doors & Windows — amber
  6:  '#3b82f6', // Mechanical Rough-In — blue
  7:  '#f97316', // Insulation — orange-500
  8:  '#fb923c', // Drywall — orange-400
  9:  '#14b8a6', // Tile Work — teal
  10: '#6366f1', // Cabinetry & Countertops — indigo
  11: '#f43f5e', // Painting — rose
  12: '#8b5cf6', // Trim & Finish Carpentry — violet
  13: '#14b8a6', // Flooring — teal
  14: '#06b6d4', // Plumbing Finish — cyan
  15: '#eab308', // Electrical Finish — yellow
  16: '#22c55e', // Appliances & Specialties — green
  17: '#6b7280', // Final Cleaning & Closeout — gray
};

// ── Phase → readable category label ───────────────────────────
const PHASE_CATEGORY: Record<number, string> = {
  1:  'Pre-Construction',
  2:  'Demo',
  3:  'Framing',
  4:  'Exterior',
  5:  'Doors & Windows',
  6:  'MEP Rough-In',
  7:  'Insulation',
  8:  'Drywall',
  9:  'Tile',
  10: 'Cabinets',
  11: 'Painting',
  12: 'Trim',
  13: 'Flooring',
  14: 'Plumbing Finish',
  15: 'Electrical Finish',
  16: 'Appliances',
  17: 'Closeout',
};

/** Add N working days to a date, skipping weekends. */
function addWorkingDays(date: Date, days: number): Date {
  const result = new Date(date);
  let remaining = days;
  while (remaining > 0) {
    result.setDate(result.getDate() + 1);
    const dow = result.getDay();
    if (dow !== 0 && dow !== 6) remaining--;
  }
  return result;
}

/** Round up to the nearest half-day (0.5). */
function ceilHalfDay(days: number): number {
  return Math.ceil(days * 2) / 2;
}

export interface GenerateScheduleOptions {
  phases: PhaseGroup[];
  jobStartDate: Date;    // first working day of the project
  jobId: string;         // linked opportunity id
  customerId: string;
  estimateId: string;
  estimateTitle: string;
  assignedTo?: string[]; // default crew
}

export interface GeneratedPhaseEvent {
  event: ScheduleEvent;
  phaseName: string;
  workingDays: number;
  laborHours: number;
}

export interface ProjectScheduleResult {
  events: ScheduleEvent[];
  phaseEvents: GeneratedPhaseEvent[];
  totalWorkingDays: number;
  estimatedEndDate: Date;
}

export function generateProjectSchedule(opts: GenerateScheduleOptions): ProjectScheduleResult {
  const {
    phases,
    jobStartDate,
    jobId,
    customerId,
    estimateId,
    estimateTitle,
    assignedTo = [],
  } = opts;

  const now = new Date().toISOString();
  const phaseEvents: GeneratedPhaseEvent[] = [];
  let cursor = new Date(jobStartDate);
  // Skip if start is a weekend
  while (cursor.getDay() === 0 || cursor.getDay() === 6) {
    cursor.setDate(cursor.getDate() + 1);
  }

  for (const phase of phases) {
    // Only include phases that have at least one active item (qty > 0 or salesSelected)
    const activeItems = phase.items.filter(
      (item: LineItem) => (item.qty ?? 0) > 0 || item.salesSelected
    );
    if (activeItems.length === 0) continue;

    // Estimate total labor hours for this phase
    const totalLaborHours = activeItems.reduce((sum: number, item: LineItem) => {
      const qty = item.qty ?? 1;
      const laborHrs = item.hrsPerUnit ?? 0;
      return sum + qty * laborHrs;
    }, 0);

    // Convert to working days (8-hr day), clamp to [0.5, 14]
    const rawDays = totalLaborHours > 0 ? totalLaborHours / 8 : 1;
    const workingDays = Math.min(14, Math.max(0.5, ceilHalfDay(rawDays)));

    // Start = cursor; End = cursor + workingDays working days
    const startDate = new Date(cursor);
    startDate.setHours(7, 0, 0, 0);

    let endDate: Date;
    if (workingDays < 1) {
      // Half-day: same day, end at noon
      endDate = new Date(startDate);
      endDate.setHours(12, 0, 0, 0);
    } else {
      endDate = addWorkingDays(new Date(startDate), Math.floor(workingDays));
      endDate.setHours(17, 0, 0, 0);
    }

    const color = PHASE_COLORS[phase.id] ?? '#22c55e';
    const category = PHASE_CATEGORY[phase.id] ?? phase.name;

    const event: ScheduleEvent = {
      id: nanoid(8),
      type: 'job',
      title: `${phase.name} — ${estimateTitle}`,
      start: startDate.toISOString(),
      end: endDate.toISOString(),
      allDay: false,
      opportunityId: jobId,
      customerId,
      assignedTo,
      notes: `Auto-generated from approved estimate. Phase: ${phase.name}. Estimated ${workingDays} working day${workingDays !== 1 ? 's' : ''} (${totalLaborHours.toFixed(1)} labor hrs).`,
      color,
      completed: false,
      createdAt: now,
      updatedAt: now,
    };

    phaseEvents.push({
      event,
      phaseName: phase.name,
      workingDays,
      laborHours: totalLaborHours,
    });

    // Advance cursor to the next working day after this phase ends
    cursor = addWorkingDays(endDate, 1);
    cursor.setHours(7, 0, 0, 0);
  }

  const totalWorkingDays = phaseEvents.reduce((s, pe) => s + pe.workingDays, 0);
  const estimatedEndDate = phaseEvents.length > 0
    ? new Date(phaseEvents[phaseEvents.length - 1].event.end)
    : new Date(jobStartDate);

  return {
    events: phaseEvents.map(pe => pe.event),
    phaseEvents,
    totalWorkingDays,
    estimatedEndDate,
  };
}
