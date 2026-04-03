// ============================================================
// HP Field Estimator v3 — State Context
// ============================================================

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import {
  EstimatorState, JobInfo, GlobalSettings, AppSection,
  LineItem, CustomLineItem, EstimateLineOverride,
} from '@/lib/types';
import { ALL_PHASES, DEFAULTS } from '@/lib/phases';
import { nanoid } from 'nanoid';

const initialState: EstimatorState = {
  activeSection: 'customer',
  jobInfo: {
    client: '',
    companyName: '',
    address: '',
    city: 'Vancouver',
    state: 'WA',
    zip: '',
    phone: '',
    email: '',
    date: new Date().toISOString().split('T')[0],
    expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    servicedDate: '',
    jobType: 'Full residential remodel',
    estimator: '',
    jobNumber: `HP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
    scope: '',
  },
  global: {
    markupPct: DEFAULTS.markupPct,
    laborRate: DEFAULTS.laborRate,
    paintRate: DEFAULTS.paintRate,
  },
  phases: ALL_PHASES,
  customItems: [],
  fieldNotes: '',
  summaryNotes: '',
  estimatorNotes: '',
  // v3
  clientNote: '',
  estimateOverrides: [],
  signature: null,
  signedAt: null,
  signedBy: null,
};

type Action =
  | { type: 'SET_SECTION'; payload: AppSection }
  | { type: 'SET_JOB_INFO'; payload: Partial<JobInfo> }
  | { type: 'SET_GLOBAL'; payload: Partial<GlobalSettings> }
  | { type: 'UPDATE_ITEM'; phaseId: number; itemId: string; payload: Partial<LineItem> }
  | { type: 'ADD_CUSTOM_ITEM'; payload: Omit<CustomLineItem, 'id'> }
  | { type: 'UPDATE_CUSTOM_ITEM'; id: string; payload: Partial<CustomLineItem> }
  | { type: 'REMOVE_CUSTOM_ITEM'; id: string }
  | { type: 'SET_FIELD_NOTES'; payload: string }
  | { type: 'SET_SUMMARY_NOTES'; payload: string }
  | { type: 'SET_ESTIMATOR_NOTES'; payload: string }
  | { type: 'SET_CLIENT_NOTE'; payload: string }
  | { type: 'UPSERT_ESTIMATE_OVERRIDE'; payload: EstimateLineOverride }
  | { type: 'REMOVE_ESTIMATE_OVERRIDE'; itemId: string }
  | { type: 'SET_SIGNATURE'; payload: { signature: string; signedBy: string } }
  | { type: 'CLEAR_SIGNATURE' }
  | { type: 'RESET' };

function reducer(state: EstimatorState, action: Action): EstimatorState {
  switch (action.type) {
    case 'SET_SECTION':
      return { ...state, activeSection: action.payload };

    case 'SET_JOB_INFO':
      return { ...state, jobInfo: { ...state.jobInfo, ...action.payload } };

    case 'SET_GLOBAL': {
      const newGlobal = { ...state.global, ...action.payload };
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

    case 'ADD_CUSTOM_ITEM':
      return {
        ...state,
        customItems: [...state.customItems, { ...action.payload, id: nanoid(8) }],
      };

    case 'UPDATE_CUSTOM_ITEM':
      return {
        ...state,
        customItems: state.customItems.map(ci =>
          ci.id === action.id ? { ...ci, ...action.payload } : ci
        ),
      };

    case 'REMOVE_CUSTOM_ITEM':
      return {
        ...state,
        customItems: state.customItems.filter(ci => ci.id !== action.id),
      };

    case 'SET_FIELD_NOTES':
      return { ...state, fieldNotes: action.payload };
    case 'SET_SUMMARY_NOTES':
      return { ...state, summaryNotes: action.payload };
    case 'SET_ESTIMATOR_NOTES':
      return { ...state, estimatorNotes: action.payload };
    case 'SET_CLIENT_NOTE':
      return { ...state, clientNote: action.payload };

    case 'UPSERT_ESTIMATE_OVERRIDE': {
      const exists = state.estimateOverrides.find(o => o.itemId === action.payload.itemId);
      if (exists) {
        return {
          ...state,
          estimateOverrides: state.estimateOverrides.map(o =>
            o.itemId === action.payload.itemId ? action.payload : o
          ),
        };
      }
      return { ...state, estimateOverrides: [...state.estimateOverrides, action.payload] };
    }

    case 'REMOVE_ESTIMATE_OVERRIDE':
      return {
        ...state,
        estimateOverrides: state.estimateOverrides.filter(o => o.itemId !== action.itemId),
      };

    case 'SET_SIGNATURE':
      return {
        ...state,
        signature: action.payload.signature,
        signedAt: new Date().toISOString(),
        signedBy: action.payload.signedBy,
      };

    case 'CLEAR_SIGNATURE':
      return { ...state, signature: null, signedAt: null, signedBy: null };

    case 'RESET':
      return {
        ...initialState,
        phases: ALL_PHASES.map(p => ({
          ...p,
          items: p.items.map(i => ({ ...i, qty: 0, notes: '', salesSelected: false, markupPct: null })),
        })),
        customItems: [],
        estimateOverrides: [],
        signature: null,
        signedAt: null,
        signedBy: null,
      };

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
  addCustomItem: (payload: Omit<CustomLineItem, 'id'>) => void;
  updateCustomItem: (id: string, payload: Partial<CustomLineItem>) => void;
  removeCustomItem: (id: string) => void;
  setFieldNotes: (v: string) => void;
  setSummaryNotes: (v: string) => void;
  setEstimatorNotes: (v: string) => void;
  setClientNote: (v: string) => void;
  upsertEstimateOverride: (override: EstimateLineOverride) => void;
  removeEstimateOverride: (itemId: string) => void;
  setSignature: (signature: string, signedBy: string) => void;
  clearSignature: () => void;
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
  const addCustomItem = useCallback((payload: Omit<CustomLineItem, 'id'>) =>
    dispatch({ type: 'ADD_CUSTOM_ITEM', payload }), []);
  const updateCustomItem = useCallback((id: string, payload: Partial<CustomLineItem>) =>
    dispatch({ type: 'UPDATE_CUSTOM_ITEM', id, payload }), []);
  const removeCustomItem = useCallback((id: string) =>
    dispatch({ type: 'REMOVE_CUSTOM_ITEM', id }), []);
  const setFieldNotes = useCallback((v: string) => dispatch({ type: 'SET_FIELD_NOTES', payload: v }), []);
  const setSummaryNotes = useCallback((v: string) => dispatch({ type: 'SET_SUMMARY_NOTES', payload: v }), []);
  const setEstimatorNotes = useCallback((v: string) => dispatch({ type: 'SET_ESTIMATOR_NOTES', payload: v }), []);
  const setClientNote = useCallback((v: string) => dispatch({ type: 'SET_CLIENT_NOTE', payload: v }), []);
  const upsertEstimateOverride = useCallback((override: EstimateLineOverride) =>
    dispatch({ type: 'UPSERT_ESTIMATE_OVERRIDE', payload: override }), []);
  const removeEstimateOverride = useCallback((itemId: string) =>
    dispatch({ type: 'REMOVE_ESTIMATE_OVERRIDE', itemId }), []);
  const setSignature = useCallback((signature: string, signedBy: string) =>
    dispatch({ type: 'SET_SIGNATURE', payload: { signature, signedBy } }), []);
  const clearSignature = useCallback(() => dispatch({ type: 'CLEAR_SIGNATURE' }), []);
  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return (
    <EstimatorContext.Provider value={{
      state, setSection, setJobInfo, setGlobal, updateItem,
      addCustomItem, updateCustomItem, removeCustomItem,
      setFieldNotes, setSummaryNotes, setEstimatorNotes, setClientNote,
      upsertEstimateOverride, removeEstimateOverride,
      setSignature, clearSignature, reset,
    }}>
      {children}
    </EstimatorContext.Provider>
  );
}

export function useEstimator(): EstimatorContextValue {
  const ctx = useContext(EstimatorContext);
  if (!ctx) throw new Error('useEstimator must be used inside EstimatorProvider');
  return ctx;
}
