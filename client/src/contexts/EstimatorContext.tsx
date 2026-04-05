// HP Field Estimator — State Context
// Lifecycle: Lead → Estimate → Job → Archive
// ============================================================

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  EstimatorState, JobInfo, GlobalSettings, AppSection,
  LineItem, CustomLineItem, EstimateLineOverride,
  Opportunity, PipelineArea, CustomerProfile, ActivityEvent, CustomerProfileTab,
  OpportunityStage, Customer, Invoice, InvoiceLineItem,
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
  activeOpportunityId: null,
  customers: [] as Customer[],
  activeCustomerId: null,
  invoices: [],
  invoiceCounter: 1,
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
  | { type: 'SET_ACTIVE_OPPORTUNITY'; payload: string | null }
  | { type: 'ADD_CUSTOMER'; payload: Customer }
  | { type: 'UPDATE_CUSTOMER'; id: string; payload: Partial<Customer> }
  | { type: 'SET_ACTIVE_CUSTOMER'; payload: string | null }
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

    case 'SET_JOB_INFO': {
      const newJobInfo = { ...state.jobInfo, ...action.payload };
      // Sync contact fields back to the active customer record
      if (state.activeCustomerId) {
        const nameParts = newJobInfo.client.trim().split(/\s+/);
        const firstName = nameParts[0] || '';
        const lastName = nameParts.slice(1).join(' ') || '';
        const syncedCustomers = state.customers.map(c =>
          c.id === state.activeCustomerId
            ? {
                ...c,
                firstName,
                lastName,
                displayName: newJobInfo.client,
                company: newJobInfo.companyName,
                mobilePhone: newJobInfo.phone,
                email: newJobInfo.email,
                street: newJobInfo.address,
                city: newJobInfo.city,
                state: newJobInfo.state,
                zip: newJobInfo.zip,
              }
            : c
        );
        return { ...state, jobInfo: newJobInfo, customers: syncedCustomers };
      }
      return { ...state, jobInfo: newJobInfo };
    }

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

    case 'ADD_OPPORTUNITY': {
      const newOpp: Opportunity = {
        ...action.payload,
        id: nanoid(8),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      const newOpps = [...state.opportunities, newOpp];
      if (state.activeCustomerId) {
        const syncedCustomers = state.customers.map(c =>
          c.id === state.activeCustomerId ? { ...c, opportunities: newOpps } : c
        );
        return { ...state, opportunities: newOpps, customers: syncedCustomers };
      }
      return { ...state, opportunities: newOpps };
    }

    case 'UPDATE_OPPORTUNITY': {
      const prev = state.opportunities.find(o => o.id === action.id);
      const stageChanged = prev && action.payload.stage && prev.stage !== action.payload.stage;
      const newOpps = state.opportunities.map(o =>
        o.id === action.id ? { ...o, ...action.payload, updatedAt: new Date().toISOString() } : o
      );
      const syncOpps = (opps: Opportunity[], feed: ActivityEvent[]) => {
        if (state.activeCustomerId) {
          return state.customers.map(c =>
            c.id === state.activeCustomerId ? { ...c, opportunities: opps, activityFeed: feed } : c
          );
        }
        return state.customers;
      };
      if (stageChanged) {
        const event = makeActivity(
          'stage_changed',
          `Stage updated: ${prev!.title}`,
          `${prev!.stage} → ${action.payload.stage}`,
          action.id,
        );
        const newFeed = [event, ...state.activityFeed];
        return {
          ...state,
          opportunities: newOpps,
          activityFeed: newFeed,
          customers: syncOpps(newOpps, newFeed),
        };
      }
      return { ...state, opportunities: newOpps, customers: syncOpps(newOpps, state.activityFeed) };
    }

    case 'REMOVE_OPPORTUNITY':
      return {
        ...state,
        opportunities: state.opportunities.filter(o => o.id !== action.id),
      };

    case 'SET_PIPELINE_AREA':
      return { ...state, activePipelineArea: action.payload };

    case 'SET_CUSTOMER_PROFILE': {
      const newProfile = { ...state.customerProfile, ...action.payload };
      if (state.activeCustomerId) {
        const syncedCustomers = state.customers.map(c =>
          c.id === state.activeCustomerId
            ? { ...c, profile: newProfile, lifetimeValue: newProfile.lifetimeValue, outstandingBalance: newProfile.outstandingBalance, tags: newProfile.tags, leadSource: newProfile.leadSource, customerNotes: newProfile.privateNotes }
            : c
        );
        return { ...state, customerProfile: newProfile, customers: syncedCustomers };
      }
      return { ...state, customerProfile: newProfile };
    }

    case 'ADD_ACTIVITY_EVENT': {
      const newEvent: ActivityEvent = {
        ...action.payload,
        id: nanoid(8),
        timestamp: new Date().toISOString(),
      };
      const newFeed = [newEvent, ...state.activityFeed];
      if (state.activeCustomerId) {
        const syncedCustomers = state.customers.map(c =>
          c.id === state.activeCustomerId ? { ...c, activityFeed: newFeed } : c
        );
        return { ...state, activityFeed: newFeed, customers: syncedCustomers };
      }
      return { ...state, activityFeed: newFeed };
    }

    case 'SET_CUSTOMER_TAB':
      return { ...state, activeCustomerTab: action.payload };

    case 'SET_ACTIVE_OPPORTUNITY':
      return {
        ...state,
        activeOpportunityId: action.payload,
        // When opening an opportunity, switch to customer section first (then caller can navigate)
        // When closing (null), return to customer profile
        activeSection: action.payload ? state.activeSection : 'customer',
      };

    case 'ADD_CUSTOMER':
      return { ...state, customers: [action.payload, ...state.customers] };

    case 'UPDATE_CUSTOMER':
      return {
        ...state,
        customers: state.customers.map(c =>
          c.id === action.id ? { ...c, ...action.payload } : c
        ),
      };

    case 'SET_ACTIVE_CUSTOMER': {
      if (!action.payload) {
        return {
          ...state,
          activeCustomerId: null,
          activeSection: 'customers',
          activeOpportunityId: null,
        };
      }
      const customer = state.customers.find(c => c.id === action.payload);
      if (!customer) {
        return {
          ...state,
          activeCustomerId: action.payload,
          activeSection: 'customer',
          activeOpportunityId: null,
        };
      }
      // Load customer data into working state
      const loadedJobInfo: JobInfo = {
        ...state.jobInfo,
        client: [customer.firstName, customer.lastName].filter(Boolean).join(' ') || customer.displayName || '',
        companyName: customer.company || '',
        address: customer.street || '',
        city: customer.city || '',
        state: customer.state || '',
        zip: customer.zip || '',
        phone: customer.mobilePhone || customer.homePhone || customer.workPhone || '',
        email: customer.email || '',
      };
      const loadedProfile: CustomerProfile = customer.profile
        ? { ...customer.profile }
        : {
            ...state.customerProfile,
            tags: customer.tags || [],
            leadSource: customer.leadSource || '',
            createdAt: customer.createdAt || state.customerProfile.createdAt,
            lifetimeValue: customer.lifetimeValue || 0,
            outstandingBalance: customer.outstandingBalance || 0,
            notificationsEnabled: customer.sendNotifications ?? true,
            smsConsent: false,
            smsMarketingConsent: customer.sendMarketingOptIn ?? false,
            emailMarketingConsent: customer.sendMarketingOptIn ?? false,
            paymentMethodOnFile: false,
            paymentMethodLast4: '',
            portalInviteSent: false,
            portalInvitedAt: null,
            privateNotes: customer.customerNotes || '',
          };
      return {
        ...state,
        activeCustomerId: action.payload,
        activeSection: 'customer',
        activeOpportunityId: null,
        jobInfo: loadedJobInfo,
        customerProfile: loadedProfile,
        activityFeed: customer.activityFeed || [],
        opportunities: customer.opportunities || [],
      };
    }

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
      const allJobsSoFar = state.opportunities.filter(o => o.area === 'job').length;
      const jobYear = new Date().getFullYear();
      const generatedJobNumber = `JOB-${jobYear}-${String(allJobsSoFar + 1).padStart(3, '0')}`;

      const newJob: Opportunity = {
        id: action.newJobId,
        area: 'job',
        stage: 'New Job' as OpportunityStage,
        title: action.newJobTitle,
        value: action.value,
        jobNumber: generatedJobNumber,
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

      // Auto-create a deposit invoice (50% default) linked to the new job
      const year = new Date().getFullYear();
      const existingInvoices = state.activeCustomerId
        ? (state.customers.find(c => c.id === state.activeCustomerId)?.invoices ?? [])
        : [];
      // Use a global invoice counter across all customers to avoid duplicates
      const globalInvoiceCount = state.customers.reduce(
        (sum, c) => sum + (c.invoices?.length ?? 0), 0
      );
      const invoiceNum = `INV-${year}-${String(globalInvoiceCount + 1).padStart(3, '0')}`;
      const subtotal = action.value * 0.5;
      const depositLineItem: InvoiceLineItem = {
        id: nanoid(8),
        description: '50% Deposit',
        qty: 1,
        unitPrice: subtotal,
        total: subtotal,
      };
      const depositInvoice: Invoice = {
        id: nanoid(8),
        type: 'deposit',
        status: 'draft',
        invoiceNumber: invoiceNum,
        customerId: state.activeCustomerId ?? '',
        opportunityId: action.newJobId,
        sourceEstimateId: action.estimateId,
        subtotal,
        taxRate: 0,
        taxAmount: 0,
        total: subtotal,
        depositPercent: 50,
        issuedAt: new Date().toISOString(),
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        payments: [],
        amountPaid: 0,
        balance: subtotal,
        lineItems: [depositLineItem],
        notes: 'Deposit required to schedule work.',
        internalNotes: '',
      };

      const updatedInvoices = [...existingInvoices, depositInvoice];
      const syncedCustomers = state.activeCustomerId
        ? state.customers.map(c =>
            c.id === state.activeCustomerId ? { ...c, invoices: updatedInvoices } : c
          )
        : state.customers;

      return {
        ...state,
        opportunities: state.opportunities
          .map(o => o.id === action.estimateId ? updatedEstimate : o)
          .concat(newJob),
        activePipelineArea: 'job',
        activeCustomerTab: 'jobs',
        activityFeed: [event, ...state.activityFeed],
        customers: syncedCustomers,
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

      const archivedOpps = state.opportunities.map(o => o.id === action.jobId ? archivedJob : o);
      const archivedFeed = [event, ...state.activityFeed];
      const newProfile = { ...state.customerProfile, lifetimeValue: newLifetimeValue };
      const syncedCustomers = state.activeCustomerId
        ? state.customers.map(c =>
            c.id === state.activeCustomerId
              ? { ...c, opportunities: archivedOpps, activityFeed: archivedFeed, profile: newProfile, lifetimeValue: newLifetimeValue }
              : c
          )
        : state.customers;
      return {
        ...state,
        opportunities: archivedOpps,
        customerProfile: newProfile,
        activityFeed: archivedFeed,
        customers: syncedCustomers,
      };
    }

    case 'RESET':
      return {
        ...initialState,
        activeOpportunityId: null,
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
   // ── Lifecycle ──────────────────────────────────────────
  convertLeadToEstimate: (leadId: string, estimateTitle: string, value: number) => void;
  convertEstimateToJob: (estimateId: string, jobTitle: string, value: number) => void;
  archiveJob: (jobId: string, value: number) => void;
  setActiveOpportunity: (id: string | null) => void;
  addCustomer: (customer: Customer) => void;
  updateCustomer: (id: string, payload: Partial<Customer>) => void;
  setActiveCustomer: (id: string | null) => void;
  reset: () => void;
}

const EstimatorContext = createContext<EstimatorContextValue | null>(null);

const STORAGE_KEY = 'hp-field-estimator-v1';

function loadPersistedState(): EstimatorState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<EstimatorState>;
    // Merge with initialState so new fields added in code are always present
    return {
      ...initialState,
      ...parsed,
      // Always reset transient UI state on reload
      activeSection: parsed.activeSection ?? 'customers',
      activeOpportunityId: null,
    };
  } catch {
    return initialState;
  }
}

export function EstimatorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadPersistedState);

  // Persist state to localStorage on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore quota errors
    }
  }, [state]);

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

  const setActiveOpportunity = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_OPPORTUNITY', payload: id });
  }, []);

  const addCustomer = useCallback((customer: Customer) => {
    dispatch({ type: 'ADD_CUSTOMER', payload: customer });
  }, []);

  const updateCustomer = useCallback((id: string, payload: Partial<Customer>) => {
    dispatch({ type: 'UPDATE_CUSTOMER', id, payload });
  }, []);

  const setActiveCustomer = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_CUSTOMER', payload: id });
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
      setActiveOpportunity,
      addCustomer, updateCustomer, setActiveCustomer,
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
