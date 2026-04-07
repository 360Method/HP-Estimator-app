// HP Field Estimator — State Context
// Lifecycle: Lead → Estimate → Job → Archive
// ============================================================

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  EstimatorState, JobInfo, GlobalSettings, AppSection,
  LineItem, CustomLineItem, EstimateLineOverride,
  Opportunity, PipelineArea, CustomerProfile, ActivityEvent, CustomerProfileTab,
  OpportunityStage, Customer, Invoice, InvoiceLineItem, ScheduleEvent,
  EstimateSnapshot, CustomerAddress, JobTask, JobAttachment,
} from '@/lib/types';
import { ALL_PHASES, DEFAULTS } from '@/lib/phases';
import { generateProjectSchedule } from '@/lib/generateProjectSchedule';
import { nanoid } from 'nanoid';

const initialState: EstimatorState = {
  activeSection: 'dashboard',
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
  scheduleEvents: [],
  scheduleCounter: 1,
  // Deposit configuration (default: 50%)
  depositType: 'pct' as const,
  depositValue: 50,
  // Schedule deep-link filter
  scheduleFilterJobId: null,
  // User profile
  userProfile: {
    firstName: 'Handy',
    lastName: 'Pioneers',
    email: 'help@handypioneers.com',
    phone: '(360) 555-0100',
    teamColor: '#e07b39',
    avatarUrl: null,
    role: 'Owner',
    bio: '',
  },
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
  | { type: 'NAVIGATE_TO_TOP_LEVEL'; payload: AppSection }  // Atomically navigates to a top-level section, clearing customer/opportunity
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
  | { type: 'ADD_CUSTOMER_ADDRESS'; customerId: string; address: CustomerAddress }
  | { type: 'UPDATE_CUSTOMER_ADDRESS'; customerId: string; addressId: string; payload: Partial<CustomerAddress> }
  | { type: 'REMOVE_CUSTOMER_ADDRESS'; customerId: string; addressId: string }
  | { type: 'SET_PRIMARY_ADDRESS'; customerId: string; addressId: string }
  // ── Job task actions ─────────────────────────────────────────
  | { type: 'ADD_JOB_TASK'; oppId: string; task: JobTask }
  | { type: 'UPDATE_JOB_TASK'; oppId: string; taskId: string; payload: Partial<JobTask> }
  | { type: 'REMOVE_JOB_TASK'; oppId: string; taskId: string }
  // ── Job attachment actions ────────────────────────────────────
  | { type: 'ADD_JOB_ATTACHMENT'; oppId: string; attachment: JobAttachment }
  | { type: 'REMOVE_JOB_ATTACHMENT'; oppId: string; attachmentId: string }
  // ── Job activity actions ──────────────────────────────────────
  | { type: 'ADD_JOB_ACTIVITY'; oppId: string; event: ActivityEvent }
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
  | { type: 'RESET' }
  // ── Schedule actions ──────────────────────────────────────
  | { type: 'ADD_SCHEDULE_EVENT'; payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'> }
  | { type: 'UPDATE_SCHEDULE_EVENT'; id: string; payload: Partial<ScheduleEvent> }
  | { type: 'REMOVE_SCHEDULE_EVENT'; id: string }
  | { type: 'UPDATE_OPPORTUNITY_SCHEDULE'; id: string; scheduledDate?: string; scheduledEndDate?: string; scheduledDuration?: number; assignedTo?: string; scheduleNotes?: string }
  | { type: 'SET_DEPOSIT'; depositType: 'pct' | 'flat'; depositValue: number }
  | { type: 'SET_SCHEDULE_FILTER'; jobId: string | null }
  | {
      type: 'APPROVE_ESTIMATE';
      estimateId: string;           // the estimate opportunity being approved
      jobMode: 'new' | 'existing';  // create new job or link to existing
      existingJobId?: string;       // set when jobMode = 'existing'
      newJobTitle: string;          // title for new job (ignored if existing)
      newJobId: string;             // pre-generated ID for new job
      totalPrice: number;           // signed estimate total
      depositAmount: number;        // computed deposit amount
      depositLabel: string;         // e.g. "50% Deposit" or "Fixed Deposit"
      balanceAmount: number;        // totalPrice - depositAmount
      signedEstimateDataUrl?: string;
      signedEstimateFilename?: string;
      sowDocument?: string;           // generated SOW text to attach to job
      jobStartDate?: string;          // ISO date string for project start (defaults to today+7)
    }
  | { type: 'UPDATE_USER_PROFILE'; payload: Partial<import('@/lib/types').UserProfile> };

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

    case 'NAVIGATE_TO_TOP_LEVEL':
      // Single atomic action: clear customer/opportunity and set the top-level section
      return {
        ...state,
        activeSection: action.payload,
        activeCustomerId: null,
        activeOpportunityId: null,
      };

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

    case 'SET_ACTIVE_OPPORTUNITY': {
      // ── Save current working state into the outgoing opportunity's snapshot ──
      let updatedOpportunities = state.opportunities;
      if (state.activeOpportunityId) {
        const outgoingSnapshot: EstimateSnapshot = {
          jobInfo: state.jobInfo,
          global: state.global,
          phases: state.phases,
          customItems: state.customItems,
          fieldNotes: state.fieldNotes,
          summaryNotes: state.summaryNotes,
          estimatorNotes: state.estimatorNotes,
          clientNote: state.clientNote,
          estimateOverrides: state.estimateOverrides,
          signature: state.signature,
          signedAt: state.signedAt,
          signedBy: state.signedBy,
          depositType: state.depositType,
          depositValue: state.depositValue,
        };
        updatedOpportunities = state.opportunities.map(o =>
          o.id === state.activeOpportunityId
            ? { ...o, estimateSnapshot: outgoingSnapshot }
            : o
        );
      }

      if (!action.payload) {
        // Closing — return to customer profile with clean working state
        return {
          ...state,
          opportunities: updatedOpportunities,
          activeOpportunityId: null,
          activeSection: 'customer',
        };
      }

      // ── Restore the incoming opportunity's snapshot ──
      const incoming = updatedOpportunities.find(o => o.id === action.payload);
      const snap = incoming?.estimateSnapshot;

      // Build a clean default snapshot for new/unseen opportunities
      const freshJobInfo: JobInfo = {
        client: incoming?.clientSnapshot?.client ?? '',
        companyName: incoming?.clientSnapshot?.companyName ?? '',
        address: incoming?.clientSnapshot?.address ?? '',
        city: incoming?.clientSnapshot?.city ?? 'Vancouver',
        state: incoming?.clientSnapshot?.state ?? 'WA',
        zip: incoming?.clientSnapshot?.zip ?? '',
        phone: incoming?.clientSnapshot?.phone ?? '',
        email: incoming?.clientSnapshot?.email ?? '',
        date: new Date().toISOString().split('T')[0],
        expiresDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        servicedDate: '',
        jobType: incoming?.clientSnapshot?.jobType ?? 'Full residential remodel',
        estimator: '',
        jobNumber: `HP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 900) + 100)}`,
        scope: incoming?.clientSnapshot?.scope ?? '',
      };

      return {
        ...state,
        opportunities: updatedOpportunities,
        activeOpportunityId: action.payload,
        activeSection: state.activeSection,
        // Restore snapshot or start fresh
        jobInfo: snap?.jobInfo ?? freshJobInfo,
        global: snap?.global ?? { markupPct: DEFAULTS.markupPct, laborRate: DEFAULTS.laborRate, paintRate: DEFAULTS.paintRate },
        phases: snap?.phases ?? ALL_PHASES,
        customItems: snap?.customItems ?? [],
        fieldNotes: snap?.fieldNotes ?? '',
        summaryNotes: snap?.summaryNotes ?? '',
        estimatorNotes: snap?.estimatorNotes ?? '',
        clientNote: snap?.clientNote ?? '',
        estimateOverrides: snap?.estimateOverrides ?? [],
        signature: snap?.signature ?? null,
        signedAt: snap?.signedAt ?? null,
        signedBy: snap?.signedBy ?? null,
        depositType: snap?.depositType ?? 'pct',
        depositValue: snap?.depositValue ?? 50,
      };
    }

    case 'ADD_CUSTOMER':
      return { ...state, customers: [action.payload, ...state.customers] };

    case 'UPDATE_CUSTOMER':
      return {
        ...state,
        customers: state.customers.map(c =>
          c.id === action.id ? { ...c, ...action.payload } : c
        ),
      };

    case 'ADD_CUSTOMER_ADDRESS':
      return {
        ...state,
        customers: state.customers.map(c => {
          if (c.id !== action.customerId) return c;
          const existing = c.addresses ?? [];
          const newAddr = action.address.isPrimary
            ? { ...action.address }
            : action.address;
          // If this is primary, demote others
          const updated = action.address.isPrimary
            ? existing.map(a => ({ ...a, isPrimary: false }))
            : existing;
          const newAddresses = [...updated, newAddr];
          // Sync flat fields to primary
          const primary = newAddresses.find(a => a.isPrimary) ?? newAddresses[0];
          return {
            ...c,
            addresses: newAddresses,
            street: primary?.street ?? c.street,
            unit: primary?.unit ?? c.unit,
            city: primary?.city ?? c.city,
            state: primary?.state ?? c.state,
            zip: primary?.zip ?? c.zip,
          };
        }),
      };

    case 'UPDATE_CUSTOMER_ADDRESS':
      return {
        ...state,
        customers: state.customers.map(c => {
          if (c.id !== action.customerId) return c;
          const newAddresses = (c.addresses ?? []).map(a =>
            a.id === action.addressId ? { ...a, ...action.payload } : a
          );
          const primary = newAddresses.find(a => a.isPrimary) ?? newAddresses[0];
          return {
            ...c,
            addresses: newAddresses,
            street: primary?.street ?? c.street,
            unit: primary?.unit ?? c.unit,
            city: primary?.city ?? c.city,
            state: primary?.state ?? c.state,
            zip: primary?.zip ?? c.zip,
          };
        }),
      };

    case 'REMOVE_CUSTOMER_ADDRESS':
      return {
        ...state,
        customers: state.customers.map(c => {
          if (c.id !== action.customerId) return c;
          const remaining = (c.addresses ?? []).filter(a => a.id !== action.addressId);
          // If removed was primary, promote first remaining
          if (remaining.length > 0 && !remaining.some(a => a.isPrimary)) {
            remaining[0] = { ...remaining[0], isPrimary: true };
          }
          const primary = remaining.find(a => a.isPrimary) ?? remaining[0];
          return {
            ...c,
            addresses: remaining,
            street: primary?.street ?? '',
            unit: primary?.unit ?? '',
            city: primary?.city ?? '',
            state: primary?.state ?? '',
            zip: primary?.zip ?? '',
          };
        }),
      };

    case 'SET_PRIMARY_ADDRESS':
      return {
        ...state,
        customers: state.customers.map(c => {
          if (c.id !== action.customerId) return c;
          const newAddresses = (c.addresses ?? []).map(a => ({
            ...a,
            isPrimary: a.id === action.addressId,
          }));
          const primary = newAddresses.find(a => a.isPrimary);
          return {
            ...c,
            addresses: newAddresses,
            street: primary?.street ?? c.street,
            unit: primary?.unit ?? c.unit,
            city: primary?.city ?? c.city,
            state: primary?.state ?? c.state,
            zip: primary?.zip ?? c.zip,
          };
        }),
      };

    case 'ADD_JOB_TASK':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, tasks: [...(o.tasks ?? []), action.task] }
        ),
      };

    case 'UPDATE_JOB_TASK':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : {
            ...o,
            tasks: (o.tasks ?? []).map(t =>
              t.id !== action.taskId ? t : { ...t, ...action.payload }
            ),
          }
        ),
      };

    case 'REMOVE_JOB_TASK':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, tasks: (o.tasks ?? []).filter(t => t.id !== action.taskId) }
        ),
      };

    case 'ADD_JOB_ATTACHMENT':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, attachments: [...(o.attachments ?? []), action.attachment] }
        ),
      };

    case 'REMOVE_JOB_ATTACHMENT':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, attachments: (o.attachments ?? []).filter(a => a.id !== action.attachmentId) }
        ),
      };

    case 'ADD_JOB_ACTIVITY':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, jobActivity: [action.event, ...(o.jobActivity ?? [])] }
        ),
      };

    case 'SET_ACTIVE_CUSTOMER': {
      if (!action.payload) {
        // Preserve the current section if navigating to a top-level page (dashboard, pipeline, jobs)
        // Only fall back to 'customers' if we were inside a customer-specific section
        const topLevelSections: AppSection[] = ['dashboard', 'pipeline', 'jobs', 'customers'];
        const nextSection: AppSection = topLevelSections.includes(state.activeSection)
          ? state.activeSection
          : 'customers';
        return {
          ...state,
          activeCustomerId: null,
          activeSection: nextSection,
          activeOpportunityId: null,
        };
      }
      // ── Flush current working opportunities (with snapshots) back to the outgoing customer ──
      let flushedCustomers = state.customers;
      if (state.activeCustomerId && state.opportunities.length > 0) {
        // Also save the active opportunity's snapshot before flushing
        let oppsToFlush = state.opportunities;
        if (state.activeOpportunityId) {
          const outSnap: EstimateSnapshot = {
            jobInfo: state.jobInfo,
            global: state.global,
            phases: state.phases,
            customItems: state.customItems,
            fieldNotes: state.fieldNotes,
            summaryNotes: state.summaryNotes,
            estimatorNotes: state.estimatorNotes,
            clientNote: state.clientNote,
            estimateOverrides: state.estimateOverrides,
            signature: state.signature,
            signedAt: state.signedAt,
            signedBy: state.signedBy,
            depositType: state.depositType,
            depositValue: state.depositValue,
          };
          oppsToFlush = state.opportunities.map(o =>
            o.id === state.activeOpportunityId ? { ...o, estimateSnapshot: outSnap } : o
          );
        }
        flushedCustomers = state.customers.map(c =>
          c.id === state.activeCustomerId ? { ...c, opportunities: oppsToFlush } : c
        );
      }

      const customer = flushedCustomers.find(c => c.id === action.payload);
      if (!customer) {
        return {
          ...state,
          customers: flushedCustomers,
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
        customers: flushedCustomers,
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

    // ── Approve Estimate → Won + Job + Invoices ─────────────
    case 'APPROVE_ESTIMATE': {
      const estimate = state.opportunities.find(o => o.id === action.estimateId);
      if (!estimate) return state;

      const now = new Date().toISOString();
      const year = new Date().getFullYear();

      // 1. Mark estimate as Won
      const wonEstimate: Opportunity = {
        ...estimate,
        stage: 'Approved' as OpportunityStage,
        wonAt: now,
        convertedToJobAt: now,
        updatedAt: now,
        ...(action.signedEstimateDataUrl ? { signedEstimateDataUrl: action.signedEstimateDataUrl } : {}),
        ...(action.signedEstimateFilename ? { signedEstimateFilename: action.signedEstimateFilename } : {}),
      };

      // 2. Determine job opportunity
      let jobOpp: Opportunity;
      if (action.jobMode === 'existing' && action.existingJobId) {
        // Link estimate to existing job — update the existing job to reference this estimate
        const existingJob = state.opportunities.find(o => o.id === action.existingJobId);
        if (!existingJob) return state;
        jobOpp = {
          ...existingJob,
          sourceEstimateId: action.estimateId,
          value: action.totalPrice,
          updatedAt: now,
        };
      } else {
        // Create new job
        const allJobsSoFar = state.opportunities.filter(o => o.area === 'job').length;
        const generatedJobNumber = `JOB-${year}-${String(allJobsSoFar + 1).padStart(3, '0')}`;
        jobOpp = {
          id: action.newJobId,
          area: 'job',
          stage: 'Deposit Needed' as OpportunityStage,
          title: action.newJobTitle,
          value: action.totalPrice,
          jobNumber: generatedJobNumber,
          notes: estimate.notes || '',
          createdAt: now,
          updatedAt: now,
          sourceEstimateId: action.estimateId,
          sourceLeadId: estimate.sourceLeadId,
          archived: false,
          clientSnapshot: estimate.clientSnapshot,
          // Attach signed estimate and SOW to the new job
          ...(action.signedEstimateDataUrl ? { jobSignedEstimateDataUrl: action.signedEstimateDataUrl } : {}),
          ...(action.signedEstimateFilename ? { jobSignedEstimateFilename: action.signedEstimateFilename } : {}),
          ...(action.sowDocument ? { sowDocument: action.sowDocument, sowGeneratedAt: now } : {}),
        };
      }

      // 3. Build invoices
      const existingInvoices = state.activeCustomerId
        ? (state.customers.find(c => c.id === state.activeCustomerId)?.invoices ?? [])
        : [];
      const globalInvoiceCount = state.customers.reduce(
        (sum, c) => sum + (c.invoices?.length ?? 0), 0
      );

      // Deposit invoice
      const depositInvNum = `INV-${year}-${String(globalInvoiceCount + 1).padStart(3, '0')}`;
      const depositInvoice: Invoice = {
        id: nanoid(8),
        type: 'deposit',
        status: 'draft',
        invoiceNumber: depositInvNum,
        customerId: state.activeCustomerId ?? '',
        opportunityId: jobOpp.id,
        sourceEstimateId: action.estimateId,
        subtotal: action.depositAmount,
        taxRate: 0,
        taxAmount: 0,
        total: action.depositAmount,
        depositPercent: state.depositType === 'pct' ? state.depositValue : undefined,
        issuedAt: now,
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        payments: [],
        amountPaid: 0,
        balance: action.depositAmount,
        lineItems: [{
          id: nanoid(8),
          description: action.depositLabel,
          qty: 1,
          unitPrice: action.depositAmount,
          total: action.depositAmount,
          notes: `Deposit required to schedule work. Estimate #${state.jobInfo.jobNumber}`,
        }],
        notes: 'Deposit required to schedule work.',
        internalNotes: `Auto-generated from approved Estimate #${state.jobInfo.jobNumber}`,
        paymentTerms: 'Due upon receipt',
      };

      // Balance invoice (only if there is a remaining balance)
      const balanceInvoices: Invoice[] = [];
      if (action.balanceAmount > 0) {
        const balanceInvNum = `INV-${year}-${String(globalInvoiceCount + 2).padStart(3, '0')}`;
        const balanceInvoice: Invoice = {
          id: nanoid(8),
          type: 'final',
          status: 'draft',
          invoiceNumber: balanceInvNum,
          customerId: state.activeCustomerId ?? '',
          opportunityId: jobOpp.id,
          sourceEstimateId: action.estimateId,
          subtotal: action.balanceAmount,
          taxRate: 0,
          taxAmount: 0,
          total: action.balanceAmount,
          issuedAt: now,
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          payments: [],
          amountPaid: 0,
          balance: action.balanceAmount,
          lineItems: [{
            id: nanoid(8),
            description: `Balance Due — ${estimate.title || 'Project'}`,
            qty: 1,
            unitPrice: action.balanceAmount,
            total: action.balanceAmount,
            notes: `Remaining balance after deposit. Estimate #${state.jobInfo.jobNumber}`,
          }],
          notes: 'Balance due upon project completion.',
          internalNotes: `Auto-generated from approved Estimate #${state.jobInfo.jobNumber}`,
          paymentTerms: 'Due upon project completion',
        };
        balanceInvoices.push(balanceInvoice);
      }

      const updatedInvoices = [...existingInvoices, depositInvoice, ...balanceInvoices];

      // 4. Generate project schedule from estimate phases
      const projectStartDate = action.jobStartDate
        ? new Date(action.jobStartDate)
        : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // default: 1 week from now

      const scheduleResult = generateProjectSchedule({
        phases: state.phases,
        jobStartDate: projectStartDate,
        jobId: jobOpp.id,
        customerId: state.activeCustomerId ?? '',
        estimateId: action.estimateId,
        estimateTitle: estimate.title || 'Project',
        assignedTo: [],
      });

      const newScheduleEvents: ScheduleEvent[] = [
        ...state.scheduleEvents,
        ...scheduleResult.events,
      ];

      // 5. Build activity events
      const approvalEvent = makeActivity(
        'estimate_approved',
        'Estimate Approved — Won!',
        `"${estimate.title}" signed by ${state.signedBy || 'client'}. ${action.jobMode === 'new' ? `Job ${jobOpp.jobNumber} created.` : `Linked to existing job.`}`,
        action.estimateId,
      );
      const jobEvent = makeActivity(
        'job_created',
        action.jobMode === 'new' ? 'New Job Created' : 'Estimate Linked to Job',
        `"${jobOpp.title}" — ${fmtDollarSimple(action.totalPrice)}`,
        jobOpp.id,
      );
      const newFeed = [jobEvent, approvalEvent, ...state.activityFeed];

      // 5. Update opportunities list
      let updatedOpps: Opportunity[];
      if (action.jobMode === 'existing' && action.existingJobId) {
        updatedOpps = state.opportunities
          .map(o => o.id === action.estimateId ? wonEstimate : o)
          .map(o => o.id === action.existingJobId ? jobOpp : o);
      } else {
        updatedOpps = state.opportunities
          .map(o => o.id === action.estimateId ? wonEstimate : o)
          .concat(jobOpp);
      }

      // 6. Sync to customer record
      const syncedCustomers = state.activeCustomerId
        ? state.customers.map(c =>
            c.id === state.activeCustomerId
              ? { ...c, opportunities: updatedOpps, activityFeed: newFeed, invoices: updatedInvoices }
              : c
          )
        : state.customers;

      return {
        ...state,
        opportunities: updatedOpps,
        activityFeed: newFeed,
        customers: syncedCustomers,
        scheduleEvents: newScheduleEvents,
        activePipelineArea: 'job',
        activeCustomerTab: 'jobs',
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

    case 'ADD_SCHEDULE_EVENT': {
      const now = new Date().toISOString();
      const newEvent: ScheduleEvent = {
        ...action.payload,
        id: nanoid(8),
        createdAt: now,
        updatedAt: now,
      };
      return { ...state, scheduleEvents: [...state.scheduleEvents, newEvent], scheduleCounter: state.scheduleCounter + 1 };
    }

    case 'UPDATE_SCHEDULE_EVENT': {
      const now = new Date().toISOString();
      return {
        ...state,
        scheduleEvents: state.scheduleEvents.map(e =>
          e.id === action.id ? { ...e, ...action.payload, updatedAt: now } : e
        ),
      };
    }

    case 'REMOVE_SCHEDULE_EVENT':
      return { ...state, scheduleEvents: state.scheduleEvents.filter(e => e.id !== action.id) };

    case 'SET_DEPOSIT':
      return { ...state, depositType: action.depositType, depositValue: action.depositValue };

    case 'SET_SCHEDULE_FILTER':
      return { ...state, scheduleFilterJobId: action.jobId };

    case 'UPDATE_USER_PROFILE':
      return { ...state, userProfile: { ...state.userProfile, ...action.payload } };

    case 'UPDATE_OPPORTUNITY_SCHEDULE': {
      const now = new Date().toISOString();
      const updatedOpps = state.opportunities.map(o =>
        o.id === action.id
          ? {
              ...o,
              ...(action.scheduledDate !== undefined ? { scheduledDate: action.scheduledDate } : {}),
              ...(action.scheduledEndDate !== undefined ? { scheduledEndDate: action.scheduledEndDate } : {}),
              ...(action.scheduledDuration !== undefined ? { scheduledDuration: action.scheduledDuration } : {}),
              ...(action.assignedTo !== undefined ? { assignedTo: action.assignedTo } : {}),
              ...(action.scheduleNotes !== undefined ? { scheduleNotes: action.scheduleNotes } : {}),
              updatedAt: now,
            }
          : o
      );
      const syncedCustomers = state.activeCustomerId
        ? state.customers.map(c =>
            c.id === state.activeCustomerId ? { ...c, opportunities: updatedOpps } : c
          )
        : state.customers;
      return { ...state, opportunities: updatedOpps, customers: syncedCustomers };
    }

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
  addCustomerAddress: (customerId: string, address: CustomerAddress) => void;
  updateCustomerAddress: (customerId: string, addressId: string, payload: Partial<CustomerAddress>) => void;
  removeCustomerAddress: (customerId: string, addressId: string) => void;
  setPrimaryAddress: (customerId: string, addressId: string) => void;
  reset: () => void;
  navigateToTopLevel: (section: AppSection) => void;
  // Schedule
  addScheduleEvent: (payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'>) => void;
  updateScheduleEvent: (id: string, payload: Partial<ScheduleEvent>) => void;
  removeScheduleEvent: (id: string) => void;
  updateOpportunitySchedule: (id: string, fields: { scheduledDate?: string; scheduledEndDate?: string; scheduledDuration?: number; assignedTo?: string; scheduleNotes?: string }) => void;
  // Deposit
  setDeposit: (depositType: 'pct' | 'flat', depositValue: number) => void;
  // Schedule deep-link filter
  setScheduleFilter: (jobId: string | null) => void;
  // Approve Estimate
  approveEstimate: (params: {
    estimateId: string;
    jobMode: 'new' | 'existing';
    existingJobId?: string;
    newJobTitle: string;
    totalPrice: number;
    depositAmount: number;
    depositLabel: string;
    balanceAmount: number;
    signedEstimateDataUrl?: string;
    signedEstimateFilename?: string;
    sowDocument?: string;
    jobStartDate?: string;
  }) => void;
  // Job tasks
  addJobTask: (oppId: string, task: JobTask) => void;
  updateJobTask: (oppId: string, taskId: string, payload: Partial<JobTask>) => void;
  removeJobTask: (oppId: string, taskId: string) => void;
  // Job attachments
  addJobAttachment: (oppId: string, attachment: JobAttachment) => void;
  removeJobAttachment: (oppId: string, attachmentId: string) => void;
  // Job activity
  addJobActivity: (oppId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>) => void;
  // User profile
  updateUserProfile: (payload: Partial<import('@/lib/types').UserProfile>) => void;
}

const EstimatorContext = createContext<EstimatorContextValue | null>(null);

const STORAGE_KEY = 'hp-field-estimator-v1';

const SIGNED_EST_PREFIX = 'hp-signed-est-';

/** Save a signed estimate PNG to its own localStorage key (keyed by opportunity ID). */
export function persistSignedEstimate(oppId: string, dataUrl: string): void {
  try { localStorage.setItem(`${SIGNED_EST_PREFIX}${oppId}`, dataUrl); } catch { /* quota */ }
}

/** Retrieve a signed estimate PNG by opportunity ID. */
export function loadSignedEstimate(oppId: string): string | null {
  try { return localStorage.getItem(`${SIGNED_EST_PREFIX}${oppId}`); } catch { return null; }
}

function loadPersistedState(): EstimatorState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initialState;
    const parsed = JSON.parse(raw) as Partial<EstimatorState>;
    // Restore signed estimate PNGs from their separate localStorage keys
    const restoreOpp = (o: any) => {
      if ((o as any).hasJobSignedEstimate) {
        const png = loadSignedEstimate(o.id);
        if (png) return { ...o, jobSignedEstimateDataUrl: png };
      }
      return o;
    };
    const restoredOpps = (parsed.opportunities ?? []).map(restoreOpp);
    const restoredCustomers = (parsed.customers ?? []).map((c: any) => ({
      ...c,
      opportunities: (c.opportunities ?? []).map(restoreOpp),
    }));
    // Merge with initialState so new fields added in code are always present
    return {
      ...initialState,
      ...parsed,
      opportunities: restoredOpps,
      customers: restoredCustomers,
      // Always reset transient UI state on reload
      activeSection: parsed.activeSection ?? 'dashboard',
      activeOpportunityId: null,
    };
  } catch {
    return initialState;
  }
}

export function EstimatorProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, loadPersistedState);

  // Persist state to localStorage on every change
  // Strip large binary fields (data URLs, SOW text) to avoid quota errors
  useEffect(() => {
    try {
      const sanitized = {
        ...state,
        // Strip large binary fields from the working state
        signature: null,
        // Strip large fields from each opportunity in the working set
        opportunities: state.opportunities.map(o => ({
          ...o,
          // Strip PNG data URLs (50-200KB each) — stored separately to avoid quota issues
          signedEstimateDataUrl: undefined,
          jobSignedEstimateDataUrl: undefined,
          hasJobSignedEstimate: o.jobSignedEstimateDataUrl ? true : (o as any).hasJobSignedEstimate ?? false,
          estimateSnapshot: o.estimateSnapshot ? {
            ...o.estimateSnapshot,
            signature: null,
          } : undefined,
        })),
        // Strip large fields from customer records too
        customers: state.customers.map(c => ({
          ...c,
          opportunities: (c.opportunities ?? []).map(o => ({
            ...o,
            signedEstimateDataUrl: undefined,
            jobSignedEstimateDataUrl: undefined,
            hasJobSignedEstimate: o.jobSignedEstimateDataUrl ? true : (o as any).hasJobSignedEstimate ?? false,
            estimateSnapshot: o.estimateSnapshot ? {
              ...o.estimateSnapshot,
              signature: null,
            } : undefined,
          })),
          invoices: (c.invoices ?? []).map(inv => ({
            ...inv,
            completionSignature: inv.completionSignature
              ? '[signature-stored]'
              : undefined,
          })),
        })),
      };
      const serialized = JSON.stringify(sanitized);
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch (err) {
      // Log quota errors so they are visible in the browser console
      console.warn('[HP Estimator] localStorage persist failed (quota exceeded?). State lives in memory only for this session.', err);
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

  const addCustomerAddress = useCallback((customerId: string, address: CustomerAddress) => {
    dispatch({ type: 'ADD_CUSTOMER_ADDRESS', customerId, address });
  }, []);

  const updateCustomerAddress = useCallback((customerId: string, addressId: string, payload: Partial<CustomerAddress>) => {
    dispatch({ type: 'UPDATE_CUSTOMER_ADDRESS', customerId, addressId, payload });
  }, []);

  const removeCustomerAddress = useCallback((customerId: string, addressId: string) => {
    dispatch({ type: 'REMOVE_CUSTOMER_ADDRESS', customerId, addressId });
  }, []);

  const setPrimaryAddress = useCallback((customerId: string, addressId: string) => {
    dispatch({ type: 'SET_PRIMARY_ADDRESS', customerId, addressId });
  }, []);

  const setActiveCustomer = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_CUSTOMER', payload: id });
  }, []);

  const navigateToTopLevel = useCallback((section: AppSection) => {
    dispatch({ type: 'NAVIGATE_TO_TOP_LEVEL', payload: section });
  }, []);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  // ── Schedule callbacks ────────────────────────────────────
  const addScheduleEvent = useCallback((payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'>) => {
    dispatch({ type: 'ADD_SCHEDULE_EVENT', payload });
  }, []);

  const updateScheduleEvent = useCallback((id: string, payload: Partial<ScheduleEvent>) => {
    dispatch({ type: 'UPDATE_SCHEDULE_EVENT', id, payload });
  }, []);

  const removeScheduleEvent = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_SCHEDULE_EVENT', id });
  }, []);

  const updateOpportunitySchedule = useCallback((id: string, fields: { scheduledDate?: string; scheduledEndDate?: string; scheduledDuration?: number; assignedTo?: string; scheduleNotes?: string }) => {
    dispatch({ type: 'UPDATE_OPPORTUNITY_SCHEDULE', id, ...fields });
  }, []);

  const setDeposit = useCallback((depositType: 'pct' | 'flat', depositValue: number) => {
    dispatch({ type: 'SET_DEPOSIT', depositType, depositValue });
  }, []);

  const approveEstimate = useCallback((params: {
    estimateId: string;
    jobMode: 'new' | 'existing';
    existingJobId?: string;
    newJobTitle: string;
    totalPrice: number;
    depositAmount: number;
    depositLabel: string;
    balanceAmount: number;
    signedEstimateDataUrl?: string;
    signedEstimateFilename?: string;
    sowDocument?: string;
    jobStartDate?: string;
  }) => {
    const newJobId = nanoid(8);
    // Persist the signed estimate PNG to its own localStorage key so the main
    // state JSON stays small and doesn't hit the 5MB quota limit.
    if (params.signedEstimateDataUrl) {
      const targetId = (params.jobMode === 'existing' && params.existingJobId)
        ? params.existingJobId
        : newJobId;
      persistSignedEstimate(targetId, params.signedEstimateDataUrl);
    }
    dispatch({
      type: 'APPROVE_ESTIMATE',
      newJobId,
      ...params,
    });
  }, []);

  const setScheduleFilter = useCallback((jobId: string | null) => {
    dispatch({ type: 'SET_SCHEDULE_FILTER', jobId });
  }, []);

  // ── Job task / attachment / activity helpers ─────────────────────
  const addJobTask = useCallback((oppId: string, task: JobTask) => {
    dispatch({ type: 'ADD_JOB_TASK', oppId, task });
  }, []);

  const updateJobTask = useCallback((oppId: string, taskId: string, payload: Partial<JobTask>) => {
    dispatch({ type: 'UPDATE_JOB_TASK', oppId, taskId, payload });
  }, []);

  const removeJobTask = useCallback((oppId: string, taskId: string) => {
    dispatch({ type: 'REMOVE_JOB_TASK', oppId, taskId });
  }, []);

  const addJobAttachment = useCallback((oppId: string, attachment: JobAttachment) => {
    dispatch({ type: 'ADD_JOB_ATTACHMENT', oppId, attachment });
  }, []);

  const removeJobAttachment = useCallback((oppId: string, attachmentId: string) => {
    dispatch({ type: 'REMOVE_JOB_ATTACHMENT', oppId, attachmentId });
  }, []);

  const addJobActivity = useCallback((oppId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    dispatch({
      type: 'ADD_JOB_ACTIVITY',
      oppId,
      event: { ...event, id: nanoid(8), timestamp: new Date().toISOString() },
    });
  }, []);

  const updateUserProfile = useCallback((payload: Partial<import('@/lib/types').UserProfile>) => {
    dispatch({ type: 'UPDATE_USER_PROFILE', payload });
  }, []);

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
      addCustomerAddress, updateCustomerAddress, removeCustomerAddress, setPrimaryAddress,
      navigateToTopLevel,
      reset,
      addScheduleEvent, updateScheduleEvent, removeScheduleEvent, updateOpportunitySchedule,
      setDeposit,
      setScheduleFilter,
      approveEstimate,
      addJobTask, updateJobTask, removeJobTask,
      addJobAttachment, removeJobAttachment,
      addJobActivity,
      updateUserProfile,
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
