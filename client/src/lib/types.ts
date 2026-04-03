// ============================================================
// HP Field Estimator v2 — Type Definitions
// ============================================================

export type UnitType =
  | 'lf'        // linear feet
  | 'sqft'      // square feet
  | 'unit'      // per unit / each
  | 'hr'        // hours
  | 'opening'   // door/window openings
  | 'load'      // dumpster loads
  | 'patch'     // drywall patches
  | 'step'      // stair steps
  | 'closet'    // closet systems
  | 'fixture'   // plumbing/electrical fixtures
  | 'circuit'   // electrical circuits
  | 'can'       // recessed lights
  | 'door'      // doors
  | 'box'       // cabinet boxes
  | 'window'    // windows
  | 'fan'       // fans
  | 'device';   // electrical devices

export type Tier = 'good' | 'better' | 'best';
export type LaborMode = 'hr' | 'flat';
export type PaintPrep = 'none' | 'caulk' | 'full';

export interface TierData {
  rate: number;   // $/unit hard cost
  name: string;   // material name shown to customer
  desc: string;   // short description
  photo?: string; // Unsplash URL for visual sales card
  specs?: string; // e.g. "4mm wear layer · waterproof core"
}

export interface LineItem {
  id: string;
  name: string;
  shortName: string;       // for SOW bullets
  unitType: UnitType;
  qty: number;
  wastePct: number;
  hasTiers: boolean;       // false = labor-only items
  tier: Tier;
  tiers: { good: TierData; better: TierData; best: TierData };
  laborMode: LaborMode;
  laborRate: number;
  hrsPerUnit: number;      // when laborMode = 'hr'
  flatRatePerUnit: number; // when laborMode = 'flat'
  hasPaintPrep: boolean;
  paintPrep: PaintPrep;
  paintRate: number;
  flagged: boolean;        // requires licensed sub — excluded from GM calc
  flagNote: string;        // e.g. "Licensed plumber required"
  enabled: boolean;
  notes: string;
  salesDesc: string;       // customer-facing description
  sowTemplate: string;     // template for SOW bullet
  salesSelected: boolean;  // tier chosen in Sales View
}

// Custom line item added by estimator outside normal scope
export interface CustomLineItem {
  id: string;
  phaseId: number;
  description: string;     // customer-facing description
  unitType: UnitType;
  qty: number;
  matCostPerUnit: number;  // hard cost $/unit
  laborHrsPerUnit: number;
  laborRate: number;
  notes: string;
}

export interface PhaseGroup {
  id: number;
  name: string;
  icon: string;
  items: LineItem[];
}

export interface JobInfo {
  client: string;
  address: string;
  city: string;
  phone: string;
  email: string;
  date: string;
  jobType: string;
  estimator: string;
  jobNumber: string;
  scope: string;
}

export interface GlobalSettings {
  markupPct: number;
  laborRate: number;
  paintRate: number;
}

export type AppSection = 'customer' | 'sales' | 'calculator' | 'estimate';

export interface EstimatorState {
  activeSection: AppSection;
  jobInfo: JobInfo;
  global: GlobalSettings;
  phases: PhaseGroup[];
  customItems: CustomLineItem[];
  fieldNotes: string;
  summaryNotes: string;
  estimatorNotes: string;
}

export const JOB_TYPES = [
  'Full residential remodel',
  'Kitchen remodel',
  'Bathroom remodel',
  'Interior remodel',
  'Exterior project',
  'Interior + Exterior',
  'Trim / finish carpentry only',
  'Flooring only',
  'Painting only',
  'Punch list / misc',
];

export const UNIT_LABELS: Record<UnitType, string> = {
  lf: 'lf',
  sqft: 'sq ft',
  unit: 'unit',
  hr: 'hr',
  opening: 'opening',
  load: 'load',
  patch: 'patch',
  step: 'step',
  closet: 'closet',
  fixture: 'fixture',
  circuit: 'circuit',
  can: 'can',
  door: 'door',
  box: 'box',
  window: 'window',
  fan: 'fan',
  device: 'device',
};
