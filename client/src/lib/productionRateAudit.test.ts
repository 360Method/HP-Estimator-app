import { describe, expect, it } from 'vitest';

import { calcLineItem } from './calc';
import { DEFAULTS, ALL_PHASES } from './phases';
import {
  buildRateBookAuditMatrix,
  calcProductionHours,
  createProductionRateAudit,
  getProductionAudit,
} from './productionRateAudit';

const global = {
  markupPct: DEFAULTS.markupPct,
  laborRate: DEFAULTS.laborRate,
  paintRate: DEFAULTS.paintRate,
  taxEnabled: false,
  taxRateCode: '0603',
  customTaxPct: 8.9,
};

describe('production rate audit', () => {
  it('attaches an audit row to every catalog line item', () => {
    const rows = buildRateBookAuditMatrix(ALL_PHASES);

    expect(ALL_PHASES).toHaveLength(18);
    expect(rows).toHaveLength(129);
    expect(rows.every(row => row.recommendedLaborCostRate >= 0)).toBe(true);
  });

  it('keeps existing gross margin math while using production hard cost', () => {
    const item = {
      ...ALL_PHASES[0].items[0],
      qty: 2,
      hrsPerUnit: 1,
      laborRate: 100,
      productionAudit: {
        ...getProductionAudit(ALL_PHASES[0].items[0]),
        baseHoursPerUnit: 1,
        laborCostRate: 100,
        minChargeHours: 0,
        mobilizationHours: 0,
        disposalProtectionHours: 0,
        subcontractorAllowance: 0,
      },
    };

    const result = calcLineItem(item, global);

    expect(result.hardCost).toBe(200);
    expect(result.price).toBe(Math.ceil(200 / (1 - global.markupPct)));
    expect(Math.round(result.gm * 100)).toBeGreaterThanOrEqual(40);
  });

  it('applies minimum hours for small jobs', () => {
    const audit = createProductionRateAudit({
      itemId: 'test',
      itemName: 'Small fixture',
      phaseId: 18,
      phaseName: 'Handyman & Maintenance',
      unitType: 'fixture',
      hrsPerUnit: 0.25,
      laborRate: 150,
    });

    const result = calcProductionHours(1, audit);

    expect(result.minimumApplied).toBe(true);
    expect(result.totalHours).toBeGreaterThanOrEqual(1);
  });

  it('applies complexity and access factors predictably', () => {
    const audit = {
      ...getProductionAudit(ALL_PHASES[1].items[0]),
      baseHoursPerUnit: 2,
      minChargeHours: 0,
      complexityFactor: 1.5,
      accessFactor: 1.25,
      mobilizationHours: 0.5,
      disposalProtectionHours: 0,
    };

    const result = calcProductionHours(2, audit);

    expect(result.baseHours).toBe(4);
    expect(result.factoredHours).toBe(7.5);
    expect(result.totalHours).toBe(8);
  });

  it('models maintenance $150/hr as sell-rate reference instead of hard cost', () => {
    const maintenanceItem = ALL_PHASES.find(phase => phase.id === 18)!.items[0];
    const audit = getProductionAudit(maintenanceItem);

    expect(maintenanceItem.laborRate).toBe(150);
    expect(audit.laborCostRate).toBe(100);
    expect(audit.recommendedSellRate).toBe(150);
  });

  it('flags specialty work as subcontractor/quote-needed metadata', () => {
    const specialtyItem = ALL_PHASES.flatMap(phase => phase.items).find(item => item.flagged)!;
    const audit = getProductionAudit(specialtyItem);

    expect(audit.pricingMode).toBe('subcontractor');
    expect(audit.auditStatus).toBe('field_validate');
    expect(audit.confidence).toBe('low');
  });
});
