/**
 * Tests for generateProjectSchedule utility
 */
import { describe, it, expect } from 'vitest';
import { generateProjectSchedule } from './generateProjectSchedule';
import type { PhaseGroup } from './types';

function makePhase(id: number, name: string, hrsPerUnit: number, qty: number): PhaseGroup {
  return {
    id,
    name,
    icon: '🔨',
    description: name,
    items: [
      {
        id: `item-${id}`,
        name: `${name} item`,
        unit: 'sf',
        qty,
        hrsPerUnit,
        laborRate: 80,
        tiers: { good: { mat: 5, labor: 80 }, better: { mat: 8, labor: 90 }, best: { mat: 12, labor: 100 } },
        selectedTier: 'better',
        salesSelected: true,
        enabled: true,
        markup: 0,
        notes: '',
        dimensionOptions: [],
        selectedDimension: null,
      },
    ],
  };
}

const MONDAY = new Date('2026-04-06T07:00:00.000Z'); // Monday

describe('generateProjectSchedule', () => {
  it('returns empty events for phases with no active items', () => {
    const emptyPhase: PhaseGroup = {
      id: 1,
      name: 'Empty Phase',
      icon: '🔨',
      description: '',
      items: [],
    };
    const result = generateProjectSchedule({
      phases: [emptyPhase],
      jobStartDate: MONDAY,
      jobId: 'job-1',
      customerId: 'cust-1',
      estimateId: 'est-1',
      estimateTitle: 'Test Project',
    });
    expect(result.events).toHaveLength(0);
    expect(result.totalWorkingDays).toBe(0);
  });

  it('generates one event per active phase', () => {
    const phases = [
      makePhase(1, 'Demo', 4, 1),       // 4 hrs = 0.5 days
      makePhase(2, 'Framing', 16, 1),   // 16 hrs = 2 days
      makePhase(3, 'Drywall', 8, 1),    // 8 hrs = 1 day
    ];
    const result = generateProjectSchedule({
      phases,
      jobStartDate: MONDAY,
      jobId: 'job-1',
      customerId: 'cust-1',
      estimateId: 'est-1',
      estimateTitle: 'Test',
    });
    expect(result.events).toHaveLength(3);
    expect(result.phaseEvents[0].phaseName).toBe('Demo');
    expect(result.phaseEvents[1].phaseName).toBe('Framing');
    expect(result.phaseEvents[2].phaseName).toBe('Drywall');
  });

  it('sequences phases sequentially — each starts after the previous ends', () => {
    const phases = [
      makePhase(1, 'Phase A', 8, 1),   // 1 day
      makePhase(2, 'Phase B', 8, 1),   // 1 day
      makePhase(3, 'Phase C', 8, 1),   // 1 day
    ];
    const result = generateProjectSchedule({
      phases,
      jobStartDate: MONDAY,
      jobId: 'job-1',
      customerId: 'cust-1',
      estimateId: 'est-1',
      estimateTitle: 'Test',
    });
    const events = result.events;
    for (let i = 1; i < events.length; i++) {
      const prevEnd = new Date(events[i - 1].end).getTime();
      const curStart = new Date(events[i].start).getTime();
      expect(curStart).toBeGreaterThan(prevEnd);
    }
  });

  it('skips weekends when advancing dates', () => {
    // Start on Friday — next phase should start on Monday
    const FRIDAY = new Date('2026-04-10T07:00:00.000Z');
    const phases = [
      makePhase(1, 'Phase A', 8, 1),   // 1 day (Friday)
      makePhase(2, 'Phase B', 8, 1),   // should start Monday
    ];
    const result = generateProjectSchedule({
      phases,
      jobStartDate: FRIDAY,
      jobId: 'job-1',
      customerId: 'cust-1',
      estimateId: 'est-1',
      estimateTitle: 'Test',
    });
    const secondStart = new Date(result.events[1].start);
    const dow = secondStart.getDay();
    expect(dow).not.toBe(0); // not Sunday
    expect(dow).not.toBe(6); // not Saturday
  });

  it('clamps duration to minimum 0.5 days for very small phases', () => {
    const phases = [makePhase(1, 'Quick Task', 1, 1)]; // 1 hr = 0.125 days → clamped to 0.5
    const result = generateProjectSchedule({
      phases,
      jobStartDate: MONDAY,
      jobId: 'job-1',
      customerId: 'cust-1',
      estimateId: 'est-1',
      estimateTitle: 'Test',
    });
    expect(result.phaseEvents[0].workingDays).toBe(0.5);
  });

  it('clamps duration to maximum 14 days for very large phases', () => {
    const phases = [makePhase(1, 'Big Phase', 8, 20)]; // 160 hrs = 20 days → clamped to 14
    const result = generateProjectSchedule({
      phases,
      jobStartDate: MONDAY,
      jobId: 'job-1',
      customerId: 'cust-1',
      estimateId: 'est-1',
      estimateTitle: 'Test',
    });
    expect(result.phaseEvents[0].workingDays).toBe(14);
  });

  it('assigns the correct color per phase id', () => {
    const phases = [makePhase(11, 'Painting', 8, 1)]; // phase 11 = rose #f43f5e
    const result = generateProjectSchedule({
      phases,
      jobStartDate: MONDAY,
      jobId: 'job-1',
      customerId: 'cust-1',
      estimateId: 'est-1',
      estimateTitle: 'Test',
    });
    expect(result.events[0].color).toBe('#f43f5e');
  });

  it('links events to the provided jobId and customerId', () => {
    const phases = [makePhase(1, 'Demo', 8, 1)];
    const result = generateProjectSchedule({
      phases,
      jobStartDate: MONDAY,
      jobId: 'job-xyz',
      customerId: 'cust-abc',
      estimateId: 'est-1',
      estimateTitle: 'Test',
    });
    expect(result.events[0].opportunityId).toBe('job-xyz');
    expect(result.events[0].customerId).toBe('cust-abc');
  });

  it('calculates totalWorkingDays as the sum of all phase durations', () => {
    const phases = [
      makePhase(1, 'A', 8, 1),   // 1 day
      makePhase(2, 'B', 16, 1),  // 2 days
      makePhase(3, 'C', 4, 1),   // 0.5 days
    ];
    const result = generateProjectSchedule({
      phases,
      jobStartDate: MONDAY,
      jobId: 'job-1',
      customerId: 'cust-1',
      estimateId: 'est-1',
      estimateTitle: 'Test',
    });
    expect(result.totalWorkingDays).toBe(3.5);
  });
});
