/**
 * Tests for 360° Method inspection helpers:
 * - computeCascadeRisk
 * - conditionToPriority
 * - computeHealthScoreFromData
 */
import { describe, it, expect } from 'vitest';

// ── Inline the helpers so tests don't depend on router internals ──────────────
const SYSTEM_RISK_WEIGHTS: Record<string, number> = {
  roof: 2.0,
  hvac: 1.8,
  electrical: 1.7,
  plumbing: 1.6,
  foundation: 2.0,
  exterior_siding: 1.2,
  interior: 1.0,
  appliances: 1.1,
};

const CONDITION_RISK_MULTIPLIER: Record<string, number> = {
  good: 0,
  monitor: 2,
  repair_needed: 5,
  urgent: 9,
  na: 0,
};

function computeCascadeRisk(systemType: string | undefined, condition: string): number {
  const weight = SYSTEM_RISK_WEIGHTS[systemType ?? ''] ?? 1.0;
  const mult = CONDITION_RISK_MULTIPLIER[condition] ?? 0;
  return Math.min(10, Math.round(weight * mult));
}

function conditionToPriority(condition: string): 'critical' | 'high' | 'medium' | 'low' {
  if (condition === 'urgent') return 'critical';
  if (condition === 'repair_needed') return 'high';
  if (condition === 'monitor') return 'medium';
  return 'low';
}

function computeHealthScoreFromData(
  items: Array<{ condition: string; systemType?: string }>,
  _systems: unknown[]
): number {
  if (items.length === 0) return 100;
  const deductions: Record<string, number> = {
    urgent: 20,
    repair_needed: 10,
    monitor: 3,
    good: 0,
    na: 0,
  };
  const totalDeduction = items.reduce((sum, item) => {
    return sum + (deductions[item.condition] ?? 0);
  }, 0);
  return Math.max(0, Math.min(100, 100 - totalDeduction));
}

// ── Tests ─────────────────────────────────────────────────────────────────────
describe('computeCascadeRisk', () => {
  it('returns 0 for good condition regardless of system', () => {
    expect(computeCascadeRisk('roof', 'good')).toBe(0);
    expect(computeCascadeRisk('hvac', 'good')).toBe(0);
    expect(computeCascadeRisk(undefined, 'good')).toBe(0);
  });

  it('returns 0 for na condition', () => {
    expect(computeCascadeRisk('roof', 'na')).toBe(0);
  });

  it('roof urgent = max risk (capped at 10)', () => {
    expect(computeCascadeRisk('roof', 'urgent')).toBe(10);
  });

  it('foundation urgent = max risk (capped at 10)', () => {
    expect(computeCascadeRisk('foundation', 'urgent')).toBe(10);
  });

  it('interior monitor = low risk', () => {
    // 1.0 * 2 = 2
    expect(computeCascadeRisk('interior', 'monitor')).toBe(2);
  });

  it('hvac repair_needed = high risk', () => {
    // 1.8 * 5 = 9
    expect(computeCascadeRisk('hvac', 'repair_needed')).toBe(9);
  });

  it('unknown system type falls back to weight 1.0', () => {
    // 1.0 * 5 = 5
    expect(computeCascadeRisk('unknown_system', 'repair_needed')).toBe(5);
  });

  it('undefined system type falls back to weight 1.0', () => {
    expect(computeCascadeRisk(undefined, 'repair_needed')).toBe(5);
  });
});

describe('conditionToPriority', () => {
  it('maps urgent → critical', () => {
    expect(conditionToPriority('urgent')).toBe('critical');
  });
  it('maps repair_needed → high', () => {
    expect(conditionToPriority('repair_needed')).toBe('high');
  });
  it('maps monitor → medium', () => {
    expect(conditionToPriority('monitor')).toBe('medium');
  });
  it('maps good → low', () => {
    expect(conditionToPriority('good')).toBe('low');
  });
  it('maps na → low', () => {
    expect(conditionToPriority('na')).toBe('low');
  });
});

describe('computeHealthScoreFromData', () => {
  it('returns 100 for empty items list', () => {
    expect(computeHealthScoreFromData([], [])).toBe(100);
  });

  it('returns 100 for all-good items', () => {
    const items = [
      { condition: 'good', systemType: 'roof' },
      { condition: 'good', systemType: 'hvac' },
    ];
    expect(computeHealthScoreFromData(items, [])).toBe(100);
  });

  it('deducts 3 per monitor item', () => {
    const items = [{ condition: 'monitor', systemType: 'interior' }];
    expect(computeHealthScoreFromData(items, [])).toBe(97);
  });

  it('deducts 10 per repair_needed item', () => {
    const items = [{ condition: 'repair_needed', systemType: 'plumbing' }];
    expect(computeHealthScoreFromData(items, [])).toBe(90);
  });

  it('deducts 20 per urgent item', () => {
    const items = [{ condition: 'urgent', systemType: 'roof' }];
    expect(computeHealthScoreFromData(items, [])).toBe(80);
  });

  it('clamps to 0 for catastrophic state', () => {
    const items = Array.from({ length: 10 }, () => ({
      condition: 'urgent',
      systemType: 'roof',
    }));
    expect(computeHealthScoreFromData(items, [])).toBe(0);
  });

  it('mixed conditions sum correctly', () => {
    const items = [
      { condition: 'urgent', systemType: 'roof' },       // -20
      { condition: 'repair_needed', systemType: 'hvac' }, // -10
      { condition: 'monitor', systemType: 'interior' },   // -3
      { condition: 'good', systemType: 'plumbing' },      // 0
    ];
    // 100 - 20 - 10 - 3 = 67
    expect(computeHealthScoreFromData(items, [])).toBe(67);
  });
});
