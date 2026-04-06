// ============================================================
// Phase Order Tests
// Verifies ALL_PHASES follows the correct construction sequence
// ============================================================

import { describe, it, expect } from 'vitest';
import { ALL_PHASES } from './phases';

describe('Construction phase order', () => {
  // Helper: get position (0-based) of a phase by its ID
  const pos = (id: number) => ALL_PHASES.findIndex(p => p.id === id);

  it('has exactly 17 phases', () => {
    expect(ALL_PHASES).toHaveLength(17);
  });

  it('Pre-Construction comes first', () => {
    expect(pos(1)).toBe(0);
  });

  it('Demo & Rough Work comes before Framing', () => {
    expect(pos(2)).toBeLessThan(pos(8));
  });

  it('Framing & Carpentry comes before Mechanical Rough-In', () => {
    // You cannot run plumbing/electrical before walls are framed
    expect(pos(8)).toBeLessThan(pos(3));
  });

  it('Framing & Carpentry comes before Insulation', () => {
    expect(pos(8)).toBeLessThan(pos(4));
  });

  it('Framing & Carpentry comes before Drywall', () => {
    expect(pos(8)).toBeLessThan(pos(5));
  });

  it('Mechanical Rough-In comes before Insulation', () => {
    // Insulation goes in after rough-in is inspected
    expect(pos(3)).toBeLessThan(pos(4));
  });

  it('Insulation comes before Drywall', () => {
    expect(pos(4)).toBeLessThan(pos(5));
  });

  it('Drywall comes before Painting', () => {
    expect(pos(5)).toBeLessThan(pos(15));
  });

  it('Cabinetry comes before Painting (cabinets installed on bare drywall)', () => {
    expect(pos(12)).toBeLessThan(pos(15));
  });

  it('Painting comes before Trim & Finish Carpentry', () => {
    // Trim is caulked and painted after installation, but base coat goes on before trim
    expect(pos(15)).toBeLessThan(pos(11));
  });

  it('Trim & Finish Carpentry comes before Flooring', () => {
    // Flooring goes in last to avoid damage from other trades
    expect(pos(11)).toBeLessThan(pos(6));
  });

  it('Drywall comes before Flooring', () => {
    expect(pos(5)).toBeLessThan(pos(6));
  });

  it('Tile Work comes after Drywall', () => {
    // Tile is applied to finished drywall/cement board
    expect(pos(5)).toBeLessThan(pos(7));
  });

  it('Plumbing Finish comes after Drywall', () => {
    expect(pos(5)).toBeLessThan(pos(13));
  });

  it('Electrical Finish comes after Drywall', () => {
    expect(pos(5)).toBeLessThan(pos(14));
  });

  it('Appliances & Specialties comes after Cabinetry', () => {
    expect(pos(12)).toBeLessThan(pos(16));
  });

  it('Final Cleaning & Closeout is last', () => {
    expect(pos(17)).toBe(ALL_PHASES.length - 1);
  });

  it('all phase IDs are unique', () => {
    const ids = ALL_PHASES.map(p => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('all phases have a name and icon', () => {
    ALL_PHASES.forEach(p => {
      expect(p.name).toBeTruthy();
      expect(p.icon).toBeTruthy();
    });
  });
});
