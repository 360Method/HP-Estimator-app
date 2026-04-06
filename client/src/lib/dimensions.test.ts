// ============================================================
// Dimension Rate Multiplier Tests
// Verifies that dimension options correctly adjust material rates
// ============================================================

import { describe, it, expect } from 'vitest';
import { calcLineItem } from './calc';
import { LineItem, GlobalSettings } from './types';

const GLOBAL: GlobalSettings = { markupPct: 0.40, laborRate: 125, paintRate: 80 };

function makeItem(overrides: Partial<LineItem> = {}): LineItem {
  return {
    id: 'test-item',
    name: 'Test Item',
    shortName: 'Test',
    unitType: 'sqft',
    qty: 100,
    wastePct: 10,
    hasTiers: true,
    tier: 'good',
    tiers: {
      good:   { rate: 4.00, name: 'Good', desc: 'Good material' },
      better: { rate: 7.50, name: 'Better', desc: 'Better material' },
      best:   { rate: 14.00, name: 'Best', desc: 'Best material' },
    },
    laborMode: 'hr',
    laborRate: 90,
    hrsPerUnit: 0.02,
    flatRatePerUnit: 0,
    hasPaintPrep: false,
    paintPrep: 'none',
    paintRate: 80,
    flagged: false,
    flagNote: '',
    enabled: true,
    notes: '',
    salesDesc: '',
    sowTemplate: '',
    salesSelected: false,
    markupPct: null,
    ...overrides,
  };
}

describe('Dimension rate multiplier', () => {
  it('uses base tier rate when no dimension is selected', () => {
    const item = makeItem();
    const result = calcLineItem(item, GLOBAL);
    // matRate should be 4.00 (good tier)
    expect(result.matRate).toBeCloseTo(4.00);
    // matCost = 100 * 1.10 * 4.00 = 440
    expect(result.matCost).toBeCloseTo(440);
  });

  it('applies rateMultiplier when a dimension is selected', () => {
    const item = makeItem({
      dimensionOptions: [
        { label: '12×24', value: '12x24', rateMultiplier: 1.15 },
        { label: '24×48', value: '24x48', rateMultiplier: 1.35 },
      ],
      selectedDimension: '12x24',
    });
    const result = calcLineItem(item, GLOBAL);
    // matRate should be 4.00 * 1.15 = 4.60
    expect(result.matRate).toBeCloseTo(4.60);
    // matCost = 100 * 1.10 * 4.60 = 506
    expect(result.matCost).toBeCloseTo(506);
  });

  it('applies rateOverride when dimension has absolute override', () => {
    const item = makeItem({
      dimensionOptions: [
        { label: 'Marble slab', value: 'marble', rateOverride: 22.00 },
      ],
      selectedDimension: 'marble',
    });
    const result = calcLineItem(item, GLOBAL);
    // matRate should be 22.00 (override ignores tier rate)
    expect(result.matRate).toBeCloseTo(22.00);
    // matCost = 100 * 1.10 * 22.00 = 2420
    expect(result.matCost).toBeCloseTo(2420);
  });

  it('rateOverride takes precedence over rateMultiplier', () => {
    const item = makeItem({
      dimensionOptions: [
        { label: 'Override wins', value: 'override', rateMultiplier: 2.0, rateOverride: 10.00 },
      ],
      selectedDimension: 'override',
    });
    const result = calcLineItem(item, GLOBAL);
    // rateOverride = 10.00 should win over rateMultiplier
    expect(result.matRate).toBeCloseTo(10.00);
  });

  it('falls back to base rate when selectedDimension does not match any option', () => {
    const item = makeItem({
      dimensionOptions: [
        { label: '12×24', value: '12x24', rateMultiplier: 1.15 },
      ],
      selectedDimension: 'nonexistent',
    });
    const result = calcLineItem(item, GLOBAL);
    // Should fall back to base tier rate 4.00
    expect(result.matRate).toBeCloseTo(4.00);
  });

  it('dimension multiplier applies across all tiers', () => {
    const item = makeItem({
      tier: 'best',
      dimensionOptions: [
        { label: '24×48 large format', value: '24x48', rateMultiplier: 1.30 },
      ],
      selectedDimension: '24x48',
    });
    const result = calcLineItem(item, GLOBAL);
    // matRate should be 14.00 * 1.30 = 18.20
    expect(result.matRate).toBeCloseTo(18.20);
  });

  it('dimension label is appended to matName', () => {
    const item = makeItem({
      dimensionOptions: [
        { label: '12×24 porcelain', value: '12x24', rateMultiplier: 1.15 },
      ],
      selectedDimension: '12x24',
    });
    const result = calcLineItem(item, GLOBAL);
    expect(result.matName).toContain('12×24 porcelain');
  });

  it('no dimension options → matName is just the tier name', () => {
    const item = makeItem();
    const result = calcLineItem(item, GLOBAL);
    expect(result.matName).toBe('Good');
  });
});
