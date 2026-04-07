// ============================================================
// Tests for AI estimate unit mapping logic
// ============================================================

import { describe, it, expect } from 'vitest';

// Replicate the mapUnit function from AIEstimateChat
const UNIT_MAP: Record<string, string> = {
  lf: 'lf', 'linear feet': 'lf', 'linear foot': 'lf',
  sqft: 'sqft', 'sq ft': 'sqft', 'square feet': 'sqft', 'square foot': 'sqft',
  hr: 'hr', hrs: 'hr', hour: 'hr', hours: 'hr',
  unit: 'unit', each: 'unit', ea: 'unit',
  opening: 'opening', openings: 'opening',
  door: 'door', doors: 'door',
  window: 'window', windows: 'window',
  fixture: 'fixture', fixtures: 'fixture',
  circuit: 'circuit', circuits: 'circuit',
  can: 'can', cans: 'can',
  fan: 'fan', fans: 'fan',
  device: 'device', devices: 'device',
  step: 'step', steps: 'step',
  load: 'load', loads: 'load',
  patch: 'patch', patches: 'patch',
  box: 'box', boxes: 'box',
  closet: 'closet', closets: 'closet',
};

function mapUnit(unit: string): string {
  return UNIT_MAP[unit.toLowerCase()] ?? 'unit';
}

describe('mapUnit', () => {
  it('maps lf variants correctly', () => {
    expect(mapUnit('lf')).toBe('lf');
    expect(mapUnit('linear feet')).toBe('lf');
    expect(mapUnit('Linear Foot')).toBe('lf');
  });

  it('maps sqft variants correctly', () => {
    expect(mapUnit('sqft')).toBe('sqft');
    expect(mapUnit('sq ft')).toBe('sqft');
    expect(mapUnit('Square Feet')).toBe('sqft');
  });

  it('maps hr variants correctly', () => {
    expect(mapUnit('hr')).toBe('hr');
    expect(mapUnit('hrs')).toBe('hr');
    expect(mapUnit('Hours')).toBe('hr');
  });

  it('maps door/window/fixture correctly', () => {
    expect(mapUnit('door')).toBe('door');
    expect(mapUnit('doors')).toBe('door');
    expect(mapUnit('window')).toBe('window');
    expect(mapUnit('Windows')).toBe('window');
    expect(mapUnit('fixture')).toBe('fixture');
    expect(mapUnit('Fixtures')).toBe('fixture');
  });

  it('defaults unknown units to unit', () => {
    expect(mapUnit('unknown')).toBe('unit');
    expect(mapUnit('xyz')).toBe('unit');
    expect(mapUnit('')).toBe('unit');
  });

  it('maps opening variants correctly', () => {
    expect(mapUnit('opening')).toBe('opening');
    expect(mapUnit('openings')).toBe('opening');
  });

  it('maps can/fan/device correctly', () => {
    expect(mapUnit('can')).toBe('can');
    expect(mapUnit('cans')).toBe('can');
    expect(mapUnit('fan')).toBe('fan');
    expect(mapUnit('fans')).toBe('fan');
    expect(mapUnit('device')).toBe('device');
    expect(mapUnit('devices')).toBe('device');
  });
});
