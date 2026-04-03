// ============================================================
// HP Field Estimator — State Context
// ============================================================

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { EstimatorState, TradeState, JobInfo, GlobalSettings, TradeKey } from '@/lib/types';
import { DEFAULTS } from '@/lib/data';
import { BB, DC, WC } from '@/lib/data';

function defaultTradeState(key: TradeKey): TradeState {
  const profileSets = { bb: BB, dc: DC, wc: WC };
  const ps = profileSets[key];
  const firstStyle = Object.keys(ps)[0];
  const firstSize = ps[firstStyle].sizes[0];

  const lfPer = key === 'bb' ? 1 : key === 'dc' ? DEFAULTS.dcLfPerOpening : DEFAULTS.wcLfPerUnit;
  const hrsPerUnit = key === 'bb' ? DEFAULTS.bbHrsPerLf : key === 'dc' ? DEFAULTS.dcHrsPerOpening : DEFAULTS.wcHrsPerUnit;

  return {
    enabled: true,
    style: firstStyle,
    size: firstSize,
    tier: 'good',
    lf: 0,
    count: 0,
    lfPer,
    wastePct: 10,
    laborMode: 'hr',
    laborRate: DEFAULTS.laborRate,
    hrsPerUnit,
    ratePerUnit: key === 'bb' ? 1.50 : key === 'dc' ? 65 : 55,
    paintPrep: 'none',
    paintRate: DEFAULTS.paintRate,
    notes: '',
  };
}

const initialState: EstimatorState = {
  jobInfo: {
    client: '',
    address: '',
    date: new Date().toISOString().split('T')[0],
    jobType: 'Trim / finish carpentry only',
    estimator: '',
    jobNumber: '',
    scope: '',
  },
  global: {
    markupPct: DEFAULTS.markupPct,
    laborRate: DEFAULTS.laborRate,
    paintRate: DEFAULTS.paintRate,
  },
  bb: defaultTradeState('bb'),
  dc: defaultTradeState('dc'),
  wc: defaultTradeState('wc'),
  fieldNotes: '',
  summaryNotes: '',
};

type Action =
  | { type: 'SET_JOB_INFO'; payload: Partial<JobInfo> }
  | { type: 'SET_GLOBAL'; payload: Partial<GlobalSettings> }
  | { type: 'SET_TRADE'; key: TradeKey; payload: Partial<TradeState> }
  | { type: 'SET_FIELD_NOTES'; payload: string }
  | { type: 'SET_SUMMARY_NOTES'; payload: string }
  | { type: 'RESET' };

function reducer(state: EstimatorState, action: Action): EstimatorState {
  switch (action.type) {
    case 'SET_JOB_INFO':
      return { ...state, jobInfo: { ...state.jobInfo, ...action.payload } };
    case 'SET_GLOBAL': {
      const newGlobal = { ...state.global, ...action.payload };
      // Sync labor rate to all trades if changed
      const syncLaborRate = action.payload.laborRate !== undefined;
      const syncPaintRate = action.payload.paintRate !== undefined;
      return {
        ...state,
        global: newGlobal,
        bb: {
          ...state.bb,
          laborRate: syncLaborRate ? newGlobal.laborRate : state.bb.laborRate,
          paintRate: syncPaintRate ? newGlobal.paintRate : state.bb.paintRate,
        },
        dc: {
          ...state.dc,
          laborRate: syncLaborRate ? newGlobal.laborRate : state.dc.laborRate,
          paintRate: syncPaintRate ? newGlobal.paintRate : state.dc.paintRate,
        },
        wc: {
          ...state.wc,
          laborRate: syncLaborRate ? newGlobal.laborRate : state.wc.laborRate,
          paintRate: syncPaintRate ? newGlobal.paintRate : state.wc.paintRate,
        },
      };
    }
    case 'SET_TRADE': {
      const current = state[action.key];
      const updated = { ...current, ...action.payload };
      // If style changed, reset size to first available
      if (action.payload.style && action.payload.style !== current.style) {
        const profileSets = { bb: BB, dc: DC, wc: WC };
        const ps = profileSets[action.key];
        const newStyle = action.payload.style;
        const sizes = ps[newStyle]?.sizes ?? [];
        if (!sizes.includes(updated.size)) {
          updated.size = sizes[0] ?? updated.size;
        }
      }
      return { ...state, [action.key]: updated };
    }
    case 'SET_FIELD_NOTES':
      return { ...state, fieldNotes: action.payload };
    case 'SET_SUMMARY_NOTES':
      return { ...state, summaryNotes: action.payload };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

interface EstimatorContextValue {
  state: EstimatorState;
  setJobInfo: (payload: Partial<JobInfo>) => void;
  setGlobal: (payload: Partial<GlobalSettings>) => void;
  setTrade: (key: TradeKey, payload: Partial<TradeState>) => void;
  setFieldNotes: (v: string) => void;
  setSummaryNotes: (v: string) => void;
  reset: () => void;
}

const EstimatorContext = createContext<EstimatorContextValue | null>(null);

export function EstimatorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setJobInfo = useCallback((payload: Partial<JobInfo>) => dispatch({ type: 'SET_JOB_INFO', payload }), []);
  const setGlobal = useCallback((payload: Partial<GlobalSettings>) => dispatch({ type: 'SET_GLOBAL', payload }), []);
  const setTrade = useCallback((key: TradeKey, payload: Partial<TradeState>) => dispatch({ type: 'SET_TRADE', key, payload }), []);
  const setFieldNotes = useCallback((v: string) => dispatch({ type: 'SET_FIELD_NOTES', payload: v }), []);
  const setSummaryNotes = useCallback((v: string) => dispatch({ type: 'SET_SUMMARY_NOTES', payload: v }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return (
    <EstimatorContext.Provider value={{ state, setJobInfo, setGlobal, setTrade, setFieldNotes, setSummaryNotes, reset }}>
      {children}
    </EstimatorContext.Provider>
  );
}

export function useEstimator() {
  const ctx = useContext(EstimatorContext);
  if (!ctx) throw new Error('useEstimator must be used within EstimatorProvider');
  return ctx;
}
