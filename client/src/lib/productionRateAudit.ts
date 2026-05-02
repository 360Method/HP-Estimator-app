import type {
  CustomLineItem,
  LineItem,
  PhaseGroup,
  PricingMode,
  ProductionAuditStatus,
  ProductionConfidence,
  ProductionRateAudit,
  UnitType,
} from './types';

export const DEFAULT_INTERNAL_LABOR_COST_RATE = 100;
export const PREMIUM_MAINTENANCE_SELL_RATE = 150;

export interface ProductionRateAuditInput {
  itemId: string;
  itemName: string;
  phaseId: number;
  phaseName: string;
  unitType: UnitType;
  hrsPerUnit: number;
  laborRate: number;
  flagged?: boolean;
  flagNote?: string;
}

export interface ProductionHoursResult {
  baseHours: number;
  minimumApplied: boolean;
  factoredHours: number;
  totalHours: number;
}

export interface RateBookAuditRow {
  phaseId: number;
  phase: string;
  itemId: string;
  item: string;
  unitType: UnitType;
  currentHoursPerUnit: number;
  recommendedHoursPerUnit: number;
  currentLaborRate: number;
  recommendedLaborCostRate: number;
  minimumHours: number;
  complexityNotes: string;
  materialPricingConfidence: ProductionConfidence;
  licensedSubcontractorHandling: string;
  auditStatus: ProductionAuditStatus;
  pricingMode: PricingMode;
}

export interface CalculatorAuditFlag {
  id: string;
  severity: 'blocking' | 'review' | 'info';
  title: string;
  message: string;
}

const LICENSED_KEYWORDS = [
  'plumb',
  'electrical',
  'electric',
  'hvac',
  'gas',
  'panel',
  'circuit',
  'water heater',
  'roof',
  'fireplace',
  'dedicated',
  'permit',
];

const PROTECTION_KEYWORDS = ['demo', 'remove', 'tear', 'disposal', 'floor', 'tile', 'drywall', 'paint'];
const SMALL_JOB_UNITS = new Set<UnitType>(['unit', 'fixture', 'device', 'fan', 'door', 'window', 'opening', 'patch', 'can', 'circuit']);

function includesAny(value: string, needles: string[]): boolean {
  const haystack = value.toLowerCase();
  return needles.some(needle => haystack.includes(needle));
}

function defaultMinChargeHours(unitType: UnitType, phaseId: number, itemName: string): number {
  if (unitType === 'hr') return 0;
  if (phaseId === 18) return 1;
  if (SMALL_JOB_UNITS.has(unitType)) return includesAny(itemName, ['door', 'window', 'fixture', 'fan']) ? 2 : 1;
  if (unitType === 'load') return 2;
  if (unitType === 'lf' || unitType === 'sqft') return 0.5;
  return 1;
}

function inferPricingMode(input: ProductionRateAuditInput): PricingMode {
  const text = `${input.phaseName} ${input.itemName} ${input.flagNote ?? ''}`;
  if (input.flagged || includesAny(text, LICENSED_KEYWORDS)) return 'subcontractor';
  return 'self_performed';
}

function inferStatus(input: ProductionRateAuditInput, pricingMode: PricingMode): ProductionAuditStatus {
  if (pricingMode === 'subcontractor') return 'field_validate';
  if (input.phaseId === 18 && input.laborRate >= PREMIUM_MAINTENANCE_SELL_RATE) return 'adjust';
  if (input.laborRate > 125 || input.laborRate < 70) return 'field_validate';
  if (input.unitType === 'sqft' && input.hrsPerUnit > 1) return 'field_validate';
  return 'keep';
}

function inferConfidence(input: ProductionRateAuditInput, pricingMode: PricingMode): ProductionConfidence {
  if (pricingMode === 'subcontractor') return 'low';
  if (input.flagged || input.laborRate > 125 || input.laborRate < 70) return 'medium';
  return 'high';
}

function recommendedLaborCostRate(input: ProductionRateAuditInput, pricingMode: PricingMode): number {
  if (input.phaseId === 18) return DEFAULT_INTERNAL_LABOR_COST_RATE;
  if (pricingMode === 'subcontractor') return Math.min(Math.max(input.laborRate, DEFAULT_INTERNAL_LABOR_COST_RATE), 150);
  return input.laborRate;
}

export function createProductionRateAudit(input: ProductionRateAuditInput): ProductionRateAudit {
  const pricingMode = inferPricingMode(input);
  const auditStatus = inferStatus(input, pricingMode);
  const confidence = inferConfidence(input, pricingMode);
  const minChargeHours = defaultMinChargeHours(input.unitType, input.phaseId, input.itemName);
  const needsProtection = input.phaseId === 2 || includesAny(`${input.phaseName} ${input.itemName}`, PROTECTION_KEYWORDS);
  const laborCostRate = recommendedLaborCostRate(input, pricingMode);
  const recommendedSellRate = input.phaseId === 18 ? PREMIUM_MAINTENANCE_SELL_RATE : undefined;

  const notes: string[] = [];
  if (pricingMode === 'subcontractor') {
    notes.push('Licensed/specialty trade: capture a quote or allowance before sending to customer.');
  }
  if (input.phaseId === 18) {
    notes.push('$150/hr is treated as a premium service sell-rate reference; hard cost starts at $100/hr.');
  }
  if (needsProtection) {
    notes.push('Confirm protection, dust control, access, and disposal before customer-ready approval.');
  }
  if (minChargeHours > 0) {
    notes.push(`Small-job minimum modeled at ${minChargeHours} hr${minChargeHours === 1 ? '' : 's'}.`);
  }

  return {
    baseHoursPerUnit: input.hrsPerUnit,
    recommendedHoursPerUnit: input.hrsPerUnit,
    laborCostRate,
    recommendedSellRate,
    minChargeHours,
    mobilizationHours: input.phaseId === 18 && input.unitType !== 'hr' ? 0.5 : 0,
    complexityFactor: 1,
    accessFactor: 1,
    disposalProtectionHours: needsProtection ? 0.5 : 0,
    subcontractorAllowance: 0,
    pricingMode,
    confidence,
    auditStatus,
    auditNotes: notes.join(' '),
    overrideReason: '',
  };
}

export function getProductionAudit(item: LineItem | CustomLineItem): ProductionRateAudit {
  const existing = item.productionAudit;
  const itemName = 'name' in item ? item.name : item.description;
  const base = createProductionRateAudit({
    itemId: item.id,
    itemName,
    phaseId: 'phaseId' in item ? item.phaseId : 0,
    phaseName: '',
    unitType: item.unitType,
    hrsPerUnit: 'hrsPerUnit' in item ? item.hrsPerUnit : item.laborHrsPerUnit,
    laborRate: item.laborRate,
    flagged: 'flagged' in item ? item.flagged : false,
    flagNote: 'flagNote' in item ? item.flagNote : '',
  });

  return {
    ...base,
    ...existing,
    recommendedSellRate: existing?.recommendedSellRate ?? base.recommendedSellRate,
  };
}

export function withProductionAudit(item: LineItem, phase: Pick<PhaseGroup, 'id' | 'name'>): LineItem {
  const catalogAudit = createProductionRateAudit({
    itemId: item.id,
    itemName: item.name,
    phaseId: phase.id,
    phaseName: phase.name,
    unitType: item.unitType,
    hrsPerUnit: item.hrsPerUnit,
    laborRate: item.laborRate,
    flagged: item.flagged,
    flagNote: item.flagNote,
  });

  return {
    ...item,
    productionAudit: {
      ...catalogAudit,
      ...item.productionAudit,
    },
  };
}

export function calcProductionHours(qty: number, audit: ProductionRateAudit): ProductionHoursResult {
  const baseHours = qty * audit.baseHoursPerUnit;
  const minimumBase = Math.max(baseHours, audit.minChargeHours);
  const minimumApplied = audit.minChargeHours > 0 && minimumBase > baseHours;
  const factoredHours = minimumBase * audit.complexityFactor * audit.accessFactor;
  const totalHours = factoredHours + audit.mobilizationHours + audit.disposalProtectionHours;
  return { baseHours, minimumApplied, factoredHours, totalHours };
}

export function buildRateBookAuditMatrix(phases: PhaseGroup[]): RateBookAuditRow[] {
  return phases.flatMap(phase => phase.items.map(item => {
    const audit = getProductionAudit(item);
    return {
      phaseId: phase.id,
      phase: phase.name,
      itemId: item.id,
      item: item.name,
      unitType: item.unitType,
      currentHoursPerUnit: item.hrsPerUnit,
      recommendedHoursPerUnit: audit.recommendedHoursPerUnit,
      currentLaborRate: item.laborRate,
      recommendedLaborCostRate: audit.laborCostRate,
      minimumHours: audit.minChargeHours,
      complexityNotes: audit.auditNotes,
      materialPricingConfidence: audit.confidence,
      licensedSubcontractorHandling: audit.pricingMode === 'subcontractor'
        ? 'Quote or allowance required before customer-ready approval.'
        : 'Self-performed production rate.',
      auditStatus: audit.auditStatus,
      pricingMode: audit.pricingMode,
    };
  }));
}

export function auditLineItemProduction(item: LineItem, laborHours = 0, hardCost = 0): CalculatorAuditFlag[] {
  const audit = getProductionAudit(item);
  const flags: CalculatorAuditFlag[] = [];

  if (item.enabled && item.qty > 0 && hardCost > 0 && hardCost < 150 && item.unitType !== 'hr') {
    flags.push({
      id: `${item.id}-minimum`,
      severity: 'review',
      title: 'Hard cost below realistic minimum',
      message: 'Confirm service-call minimum, setup time, and occupied-home protection.',
    });
  }

  if (item.enabled && item.qty > 0 && item.laborMode === 'hr' && laborHours < audit.minChargeHours) {
    flags.push({
      id: `${item.id}-hours-low`,
      severity: 'review',
      title: 'Minimum charge not met',
      message: `Modeled hours are below the ${audit.minChargeHours} hour minimum.`,
    });
  }

  if ((audit.pricingMode === 'subcontractor' || audit.pricingMode === 'allowance') && audit.subcontractorAllowance <= 0) {
    flags.push({
      id: `${item.id}-subcontractor`,
      severity: 'blocking',
      title: 'Subcontractor quote needed',
      message: 'Specialty or licensed work needs a quote or allowance before customer-ready approval.',
    });
  }

  if (audit.disposalProtectionHours === 0 && includesAny(`${item.name} ${item.salesDesc}`, PROTECTION_KEYWORDS)) {
    flags.push({
      id: `${item.id}-protection`,
      severity: 'review',
      title: 'Protection/disposal missing',
      message: 'Add protection, dust control, access, or disposal time if this is occupied-home work.',
    });
  }

  if (audit.recommendedSellRate && audit.laborCostRate >= audit.recommendedSellRate) {
    flags.push({
      id: `${item.id}-sell-as-cost`,
      severity: 'review',
      title: 'Sell rate used as hard cost',
      message: 'Maintenance service rate appears to be treated as internal hard cost.',
    });
  }

  return flags;
}

export function summarizeRateBookAudit(phases: PhaseGroup[]) {
  const rows = buildRateBookAuditMatrix(phases);
  return {
    totalItems: rows.length,
    phases: new Set(rows.map(row => row.phaseId)).size,
    keep: rows.filter(row => row.auditStatus === 'keep').length,
    adjust: rows.filter(row => row.auditStatus === 'adjust').length,
    fieldValidate: rows.filter(row => row.auditStatus === 'field_validate').length,
    subcontractor: rows.filter(row => row.pricingMode === 'subcontractor').length,
    lowConfidence: rows.filter(row => row.materialPricingConfidence === 'low').length,
  };
}
