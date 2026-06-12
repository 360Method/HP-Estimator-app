import { describe, expect, it } from 'vitest';
import * as method from './threeSixtyMethod';
import {
  THREE_SIXTY_METHOD_STEPS,
  THREE_SIXTY_METHOD_PHASES,
  currentSeason,
  nextSeasonStart,
  getThreeSixtyStepByKey,
} from './threeSixtyMethod';

describe('360 Method canon', () => {
  it('has exactly 9 steps in canonical order with canonical names', () => {
    expect(THREE_SIXTY_METHOD_STEPS.map(s => s.name)).toEqual([
      'Baseline',
      'Inspect',
      'Track',
      'Prioritize',
      'Schedule',
      'Execute',
      'Preserve',
      'Upgrade',
      'Scale',
    ]);
    expect(THREE_SIXTY_METHOD_STEPS.map(s => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('groups steps into the three canonical phases', () => {
    expect(THREE_SIXTY_METHOD_PHASES.map(p => p.id)).toEqual(['aware', 'act', 'advance']);
    expect(THREE_SIXTY_METHOD_PHASES.map(p => p.subtitle)).toEqual([
      'Know Before You Need',
      "Fix Small Before It's Big",
      'Build Wealth Through Property Care',
    ]);
    for (const phase of THREE_SIXTY_METHOD_PHASES) {
      expect(phase.steps).toHaveLength(3);
      for (const step of phase.steps) expect(step.phase).toBe(phase.id);
    }
  });

  it('maps every step to its S-numbered SOP doc', () => {
    const expected: Record<string, string> = {
      baseline: 'HP-SOP-101',
      inspect: 'HP-SOP-102',
      track: 'HP-SOP-103',
      prioritize: 'HP-SOP-104',
      schedule: 'HP-SOP-105',
      execute: 'HP-SOP-106',
      preserve: 'HP-SOP-107',
      upgrade: 'HP-SOP-108',
      scale: 'HP-SOP-109',
    };
    for (const step of THREE_SIXTY_METHOD_STEPS) {
      expect(step.sopDocId).toBe(expected[step.key]);
    }
  });

  it('marks the Advance steps as year two and the cycle steps as recurring', () => {
    for (const step of THREE_SIXTY_METHOD_STEPS) {
      expect(step.yearTwoPlus).toBe(step.phase === 'advance');
    }
    expect(THREE_SIXTY_METHOD_STEPS.find(s => s.key === 'baseline')!.cadence).toBe('once');
    expect(THREE_SIXTY_METHOD_STEPS.find(s => s.key === 'track')!.cadence).toBe('continuous');
    for (const key of ['inspect', 'prioritize', 'schedule', 'execute']) {
      expect(THREE_SIXTY_METHOD_STEPS.find(s => s.key === key)!.cadence).toBe('seasonal');
    }
  });

  it('contains no em or en dashes anywhere in the module copy', () => {
    const everyString = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(everyString);
      if (value && typeof value === 'object') return Object.values(value).flatMap(everyString);
      return [];
    };
    const offenders = everyString(method).filter(s => /[–—]/.test(s));
    expect(offenders).toEqual([]);
  });

  it('resolves seasons matching work order type values', () => {
    expect(currentSeason(new Date(2026, 2, 15))).toBe('spring');
    expect(currentSeason(new Date(2026, 5, 12))).toBe('summer');
    expect(currentSeason(new Date(2026, 9, 1))).toBe('fall');
    expect(currentSeason(new Date(2026, 11, 25))).toBe('winter');
    expect(currentSeason(new Date(2026, 0, 5))).toBe('winter');
    // December rolls forward to next year's spring; January stays in this year.
    expect(nextSeasonStart(new Date(2026, 11, 25)).getFullYear()).toBe(2027);
    expect(nextSeasonStart(new Date(2026, 0, 5)).getFullYear()).toBe(2026);
  });

  it('keeps legacy step key aliases working', () => {
    expect(getThreeSixtyStepByKey('cfo_intelligence')?.key).toBe('scale');
    expect(getThreeSixtyStepByKey('scope_price_approve')?.key).toBe('prioritize');
    expect(getThreeSixtyStepByKey('nope')).toBeNull();
  });
});
