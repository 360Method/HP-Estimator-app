// ============================================================
// HP Field Estimator v2 — State Context
// ============================================================

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { EstimatorState, JobInfo, GlobalSettings, AppSection, LineItem } from '@/lib/types';
import { ALL_PHASES, DEFAULTS } from '@/lib/phases';

const initialState: EstimatorState = {
  activeSection: 'customer',
  jobInfo: {
    client: '',
    address: '',
    city: 'Vancouver, WA',
    phone: '',
    email: '',
    date: new Date().toISOString().split('T')[0],
    jobType: 'Full residential remodel',
    estimator: '',
    jobNumber: '',
    scope: '',
  },
  global: {
    markupPct: DEFAULTS.markupPct,
    laborRate: DEFAULTS.laborRate,
    paintRate: DEFAULTS.paintRate,
  },
  phases: ALL_PHASES,
  fieldNotes: '',
  summaryNotes: '',
  estimatorNotes: '',
};

type Action =
  | { type: 'SET_SECTION'; payload: AppSection }
  | { type: 'SET_JOB_INFO'; payload: Partial<JobInfo> }
  | { type: 'SET_GLOBAL'; payload: Partial<GlobalSettings> }
  | { type: 'UPDATE_ITEM'; phaseId: number; itemId: string; payload: Partial<LineItem> }
  | { type: 'SET_FIELD_NOTES'; payload: string }
  | { type: 'SET_SUMMARY_NOTES'; payload: string }
  | { type: 'SET_ESTIMATOR_NOTES'; payload: string }
  | { type: 'RESET' };

function reducer(state: EstimatorState, action: Action): EstimatorState {
  switch (action.type) {
    case 'SET_SECTION':
      return { ...state, activeSection: action.payload };

    case 'SET_JOB_INFO':
      return { ...state, jobInfo: { ...state.jobInfo, ...action.payload } };

    case 'SET_GLOBAL': {
      const newGlobal = { ...state.global, ...action.payload };
      // Sync labor rate and paint rate to all items
      const syncLabor = action.payload.laborRate !== undefined;
      const syncPaint = action.payload.paintRate !== undefined;
      const phases = state.phases.map(phase => ({
        ...phase,
        items: phase.items.map(item => ({
          ...item,
          laborRate: syncLabor ? newGlobal.laborRate : item.laborRate,
          paintRate: syncPaint ? newGlobal.paintRate : item.paintRate,
        })),
      }));
      return { ...state, global: newGlobal, phases };
    }

    case 'UPDATE_ITEM': {
      const phases = state.phases.map(phase => {
        if (phase.id !== action.phaseId) return phase;
        return {
          ...phase,
          items: phase.items.map(item => {
            if (item.id !== action.itemId) return item;
            return { ...item, ...action.payload };
          }),
        };
      });
      return { ...state, phases };
    }

    case 'SET_FIELD_NOTES':
      return { ...state, fieldNotes: action.payload };
    case 'SET_SUMMARY_NOTES':
      return { ...state, summaryNotes: action.payload };
    case 'SET_ESTIMATOR_NOTES':
      return { ...state, estimatorNotes: action.payload };
    case 'RESET':
      return { ...initialState, phases: ALL_PHASES.map(p => ({
        ...p,
        items: p.items.map(i => ({ ...i, qty: 0, notes: '' })),
      })) };
    default:
      return state;
  }
}

interface EstimatorContextValue {
  state: EstimatorState;
  setSection: (s: AppSection) => void;
  setJobInfo: (payload: Partial<JobInfo>) => void;
  setGlobal: (payload: Partial<GlobalSettings>) => void;
  updateItem: (phaseId: number, itemId: string, payload: Partial<LineItem>) => void;
  setFieldNotes: (v: string) => void;
  setSummaryNotes: (v: string) => void;
  setEstimatorNotes: (v: string) => void;
  reset: () => void;
}

const EstimatorContext = createContext<EstimatorContextValue | null>(null);

export function EstimatorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setSection = useCallback((s: AppSection) => dispatch({ type: 'SET_SECTION', payload: s }), []);
  const setJobInfo = useCallback((payload: Partial<JobInfo>) => dispatch({ type: 'SET_JOB_INFO', payload }), []);
  const setGlobal = useCallback((payload: Partial<GlobalSettings>) => dispatch({ type: 'SET_GLOBAL', payload }), []);
  const updateItem = useCallback((phaseId: number, itemId: string, payload: Partial<LineItem>) =>
    dispatch({ type: 'UPDATE_ITEM', phaseId, itemId, payload }), []);
  const setFieldNotes = useCallback((v: string) => dispatch({ type: 'SET_FIELD_NOTES', payload: v }), []);
  const setSummaryNotes = useCallback((v: string) => dispatch({ type: 'SET_SUMMARY_NOTES', payload: v }), []);
  const setEstimatorNotes = useCallback((v: string) => dispatch({ type: 'SET_ESTIMATOR_NOTES', payload: v }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return (
    <EstimatorContext.Provider value={{
      state, setSection, setJobInfo, setGlobal, updateItem,
      setFieldNotes, setSummaryNotes, setEstimatorNotes, reset,
    }}>
      {children}
    </EstimatorContext.Provider>
  );
}

export function useEstimator() {
  const ctx = useContext(EstimatorContext);
  if (!ctx) throw new Error('useEstimator must be used within EstimatorProvider');
  return ctx;
}
