// ============================================================
// HP Field Estimator — State Types
// ============================================================

import { Tier, LaborMode, PaintPrep } from './data';

export interface JobInfo {
  client: string;
  address: string;
  date: string;
  jobType: string;
  estimator: string;
  jobNumber: string;
  scope: string;
}

export interface TradeState {
  enabled: boolean;
  style: string;
  size: string;
  tier: Tier;
  // Quantity
  lf: number;          // For baseboard: linear feet; for casing: computed from count × lfPer
  count: number;       // For door/window casing: number of openings/units
  lfPer: number;       // lf per opening/unit
  wastePct: number;    // waste factor %
  // Labor
  laborMode: LaborMode;
  laborRate: number;   // $/hr (hard cost)
  hrsPerUnit: number;  // hrs/lf (baseboard) or hrs/opening (casing)
  ratePerUnit: number; // $/lf or $/opening (flat rate mode)
  // Paint prep
  paintPrep: PaintPrep;
  paintRate: number;   // $/hr for paint prep labor
  // Notes
  notes: string;
}

export interface GlobalSettings {
  markupPct: number;
  laborRate: number;
  paintRate: number;
}

export interface EstimatorState {
  jobInfo: JobInfo;
  global: GlobalSettings;
  bb: TradeState;
  dc: TradeState;
  wc: TradeState;
  fieldNotes: string;
  summaryNotes: string;
}

export type TradeKey = 'bb' | 'dc' | 'wc';

export const TRADE_LABELS: Record<TradeKey, string> = {
  bb: 'Baseboard',
  dc: 'Door Casing',
  wc: 'Window Casing',
};

export const JOB_TYPES = [
  'Interior remodel',
  'Exterior project',
  'Interior + Exterior',
  'Bathroom remodel',
  'Kitchen remodel',
  'Trim / finish carpentry only',
  'Punch list / misc',
];
