// HP Field Estimator — State Context
// Lifecycle: Lead → Estimate → Job → Archive
// ============================================================

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import {
  EstimatorState, JobInfo, GlobalSettings, AppSection,
  LineItem, CustomLineItem, EstimateLineOverride,
  Opportunity, PipelineArea, CustomerProfile, ActivityEvent, CustomerProfileTab,
  OpportunityStage,
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
  // CRM pipeline
  opportunities: [],
  activePipelineArea: 'lead' as PipelineArea,
  // Customer profile
  customerProfile: {
    notificationsEnabled: true,
    smsConsent: false,
    smsMarketingConsent: false,
    emailMarketingConsent: false,
    paymentMethodOnFile: false,
    paymentMethodLast4: '',
    tags: [],
    leadSource: '',
    portalInviteSent: false,
    portalInvitedAt: null,
    privateNotes: '',
    createdAt: new Date().toISOString(),
    lifetimeValue: 0,
    outstandingBalance: 0,
  } as CustomerProfile,
  activityFeed: [] as ActivityEvent[],
  activeCustomerTab: 'profile' as CustomerProfileTab,
};

// ── Helper: build an ActivityEvent without id/timestamp ──────
function makeEvent(
  type: ActivityEvent['type'],
  title: string,
  description: string,
  linkedId?: string,
): Omit<ActivityEvent, 'id' | 'timestamp'> {
  return { type, title, description, ...(linkedId ? { linkedId } : {}) };
}

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
  | { type: 'ADD_OPPORTUNITY'; payload: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_OPPORTUNITY'; id: string; payload: Partial<Opportunity> }
  | { type: 'REMOVE_OPPORTUNITY'; id: string }
  | { type: 'SET_PIPELINE_AREA'; payload: PipelineArea }
  | { type: 'SET_CUSTOMER_PROFILE'; payload: Partial<CustomerProfile> }
  | { type: 'ADD_ACTIVITY_EVENT'; payload: Omit<ActivityEvent, 'id' | 'timestamp'> }
  | { type: 'SET_CUSTOMER_TAB'; payload: CustomerProfileTab }
  // ── Lifecycle actions ──────────────────────────────────────
  | {
      type: 'CONVERT_LEAD_TO_ESTIMATE';
      leadId: string;
      newEstimateId: string;
      newEstimateTitle: string;
      value: number;
    }
  | {
      type: 'CONVERT_ESTIMATE_TO_JOB';
      estimateId: string;
      newJobId: string;
      newJobTitle: string;
      value: number;
    }
  | {
      type: 'ARCHIVE_JOB';
      jobId: string;
      value: number;
    }
  | { type: 'RESET' };

function makeActivity(
  type: ActivityEvent['type'],
  title: string,
  description: string,
  linkedId?: string,
): ActivityEvent {
  return {
    id: nanoid(8),
    type,
    title,
    description,
    timestamp: new Date().toISOString(),
    ...(linkedId ? { linkedId } : {}),
  };
}

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

    case 'ADD_OPPORTUNITY':
      return {
        ...state,
        opportunities: [...state.opportunities, {
          ...action.payload,
          id: nanoid(8),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        }],
      };

    case 'UPDATE_OPPORTUNITY': {
      const prev = state.opportunities.find(o => o.id === action.id);
      const stageChanged = prev && action.payload.stage && prev.stage !== action.payload.stage;
      const newOpps = state.opportunities.map(o =>
        o.id === action.id ? { ...o, ...action.payload, updatedAt: new Date().toISOString() } : o
      );
      if (stageChanged) {
        const event = makeActivity(
          'stage_changed',
          `Stage updated: ${prev!.title}`,
          `${prev!.stage} → ${action.payload.stage}`,
          action.id,
        );
        return {
          ...state,
          opportunities: newOpps,
          activityFeed: [event, ...state.activityFeed],
        };
      }
      return { ...state, opportunities: newOpps };
    }

    case 'REMOVE_OPPORTUNITY':
      return {
        ...state,
        opportunities: state.opportunities.filter(o => o.id !== action.id),
      };

    case 'SET_PIPELINE_AREA':
      return { ...state, activePipelineArea: action.payload };

    case 'SET_CUSTOMER_PROFILE':
      return { ...state, customerProfile: { ...state.customerProfile, ...action.payload } };

    case 'ADD_ACTIVITY_EVENT':
      return {
        ...state,
        activityFeed: [{
          ...action.payload,
          id: nanoid(8),
          timestamp: new Date().toISOString(),
        }, ...state.activityFeed],
      };

    case 'SET_CUSTOMER_TAB':
      return { ...state, activeCustomerTab: action.payload };

    // ── Lead → Estimate ───────────────────────────────────────
    case 'CONVERT_LEAD_TO_ESTIMATE': {
      const lead = state.opportunities.find(o => o.id === action.leadId);
      if (!lead) return state;

      // Mark lead as Won and stamp conversion
      const updatedLead: Opportunity = {
        ...lead,
        stage: 'Won' as OpportunityStage,
        convertedToEstimateAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create new Estimate opportunity
      const newEstimate: Opportunity = {
        id: action.newEstimateId,
        area: 'estimate',
        stage: 'Draft' as OpportunityStage,
        title: action.newEstimateTitle,
        value: action.value,
        notes: lead.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sourceLeadId: action.leadId,
        archived: false,
        clientSnapshot: lead.clientSnapshot,
      };

      const event = makeActivity(
        'estimate_created',
        'Lead converted to Estimate',
        `"${lead.title}" → Estimate: "${action.newEstimateTitle}"`,
        action.newEstimateId,
      );

      return {
        ...state,
        opportunities: state.opportunities
          .map(o => o.id === action.leadId ? updatedLead : o)
          .concat(newEstimate),
        activePipelineArea: 'estimate',
        activeCustomerTab: 'estimates',
        activeSection: 'calculator',
        activityFeed: [event, ...state.activityFeed],
      };
    }

    // ── Estimate → Job ────────────────────────────────────────
    case 'CONVERT_ESTIMATE_TO_JOB': {
      const estimate = state.opportunities.find(o => o.id === action.estimateId);
      if (!estimate) return state;

      // Mark estimate as Approved and stamp conversion
      const updatedEstimate: Opportunity = {
        ...estimate,
        stage: 'Approved' as OpportunityStage,
        convertedToJobAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Create new Job opportunity
      const newJob: Opportunity = {
        id: action.newJobId,
        area: 'job',
        stage: 'New Job' as OpportunityStage,
        title: action.newJobTitle,
        value: action.value,
        notes: estimate.notes,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sourceEstimateId: action.estimateId,
        sourceLeadId: estimate.sourceLeadId,
        archived: false,
        clientSnapshot: estimate.clientSnapshot,
      };

      const event = makeActivity(
        'job_created',
        'Estimate converted to Job',
        `"${estimate.title}" → Job: "${action.newJobTitle}"`,
        action.newJobId,
      );

      return {
        ...state,
        opportunities: state.opportunities
          .map(o => o.id === action.estimateId ? updatedEstimate : o)
          .concat(newJob),
        activePipelineArea: 'job',
        activeCustomerTab: 'jobs',
        activityFeed: [event, ...state.activityFeed],
      };
    }

    // ── Job → Archive ─────────────────────────────────────────
    case 'ARCHIVE_JOB': {
      const job = state.opportunities.find(o => o.id === action.jobId);
      if (!job) return state;

      const archivedJob: Opportunity = {
        ...job,
        stage: 'Invoice Paid' as OpportunityStage,
        archived: true,
        archivedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const newLifetimeValue = state.customerProfile.lifetimeValue + action.value;

      const event = makeActivity(
        'payment_received',
        'Job archived — Invoice Paid',
        `"${job.title}" marked complete. +${fmtDollarSimple(action.value)} added to lifetime value.`,
        action.jobId,
      );

      return {
        ...state,
        opportunities: state.opportunities.map(o => o.id === action.jobId ? archivedJob : o),
        customerProfile: {
          ...state.customerProfile,
          lifetimeValue: newLifetimeValue,
        },
        activityFeed: [event, ...state.activityFeed],
      };
    }

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

// Simple dollar formatter used inside reducer (no Intl dependency)
function fmtDollarSimple(n: number) {
  return '$' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

interface EstimatorContextValue {
  state: EstimatorState;
  setCustomerProfile: (payload: Partial<CustomerProfile>) => void;
  addActivityEvent: (payload: Omit<ActivityEvent, 'id' | 'timestamp'>) => void;
  setCustomerTab: (tab: CustomerProfileTab) => void;
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
  addOpportunity: (payload: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateOpportunity: (id: string, payload: Partial<Opportunity>) => void;
  removeOpportunity: (id: string) => void;
  setPipelineArea: (area: PipelineArea) => void;
  // ── Lifecycle ──────────────────────────────────────────────
  convertLeadToEstimate: (leadId: string, estimateTitle: string, value: number) => void;
  convertEstimateToJob: (estimateId: string, jobTitle: string, value: number) => void;
  archiveJob: (jobId: string, value: number) => void;
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
  const addOpportunity = useCallback((payload: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'>) =>
    dispatch({ type: 'ADD_OPPORTUNITY', payload }), []);
  const updateOpportunity = useCallback((id: string, payload: Partial<Opportunity>) =>
    dispatch({ type: 'UPDATE_OPPORTUNITY', id, payload }), []);
  const removeOpportunity = useCallback((id: string) =>
    dispatch({ type: 'REMOVE_OPPORTUNITY', id }), []);
  const setPipelineArea = useCallback((area: PipelineArea) =>
    dispatch({ type: 'SET_PIPELINE_AREA', payload: area }), []);
  const setCustomerProfile = useCallback((payload: Partial<CustomerProfile>) =>
    dispatch({ type: 'SET_CUSTOMER_PROFILE', payload }), []);
  const addActivityEvent = useCallback((payload: Omit<ActivityEvent, 'id' | 'timestamp'>) =>
    dispatch({ type: 'ADD_ACTIVITY_EVENT', payload }), []);
  const setCustomerTab = useCallback((tab: CustomerProfileTab) =>
    dispatch({ type: 'SET_CUSTOMER_TAB', payload: tab }), []);

  // ── Lifecycle callbacks ────────────────────────────────────
  const convertLeadToEstimate = useCallback((leadId: string, estimateTitle: string, value: number) => {
    dispatch({
      type: 'CONVERT_LEAD_TO_ESTIMATE',
      leadId,
      newEstimateId: nanoid(8),
      newEstimateTitle: estimateTitle,
      value,
    });
  }, []);

  const convertEstimateToJob = useCallback((estimateId: string, jobTitle: string, value: number) => {
    dispatch({
      type: 'CONVERT_ESTIMATE_TO_JOB',
      estimateId,
      newJobId: nanoid(8),
      newJobTitle: jobTitle,
      value,
    });
  }, []);

  const archiveJob = useCallback((jobId: string, value: number) => {
    dispatch({ type: 'ARCHIVE_JOB', jobId, value });
  }, []);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  return (
    <EstimatorContext.Provider value={{
      state, setSection, setJobInfo, setGlobal, updateItem,
      addCustomItem, updateCustomItem, removeCustomItem,
      setFieldNotes, setSummaryNotes, setEstimatorNotes, setClientNote,
      upsertEstimateOverride, removeEstimateOverride,
      setSignature, clearSignature,
      addOpportunity, updateOpportunity, removeOpportunity, setPipelineArea,
      setCustomerProfile, addActivityEvent, setCustomerTab,
      convertLeadToEstimate, convertEstimateToJob, archiveJob,
      reset,
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
