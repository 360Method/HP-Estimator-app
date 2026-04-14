// HP Field Estimator — State Context
// Lifecycle: Lead → Estimate → Job → Archive
// ============================================================

import React, { createContext, useContext, useReducer, useCallback, useEffect } from 'react';
import {
  EstimatorState, JobInfo, GlobalSettings, AppSection,
  LineItem, CustomLineItem, EstimateLineOverride, EstimatePhaseOverride,
  Opportunity, PipelineArea, CustomerProfile, ActivityEvent, CustomerProfileTab,
  OpportunityStage, Customer, Invoice, InvoiceLineItem, ScheduleEvent,
  EstimateSnapshot, CustomerAddress, JobTask, JobAttachment, CustomRole, LeadNote,
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
    taxEnabled: false,
    taxRateCode: '0603', // Vancouver WA default
    customTaxPct: 8.9,
  },
  phases: ALL_PHASES,
  customItems: [],
  fieldNotes: '',
  summaryNotes: '',
  estimatorNotes: '',
  // v3
  clientNote: '',
  estimateOverrides: [],
  phaseOverrides: [],
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
  // Inbox deep-link: pre-select customer in InboxPage
  inboxCustomerId: null,
  // Inbox deep-link: open specific conversation
  inboxConversationId: null,
  // Inbox deep-link: pre-select compose channel
  inboxChannel: null,
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
  // Custom roles (5 system roles pre-built)
  customRoles: [
    {
      id: 'owner', name: 'Owner', description: 'Full access to everything. Cannot be modified.',
      color: '#7c3aed', isSystem: true,
      permissions: Object.fromEntries(
        ['customers','leads','estimates','jobs','invoices','pipeline','schedule','reports','marketing','settings','team','priceBook']
          .map(m => [m, { view: true, create: true, edit: true, delete: true, manage: true }])
      ),
    },
    {
      id: 'admin', name: 'Admin', description: 'Full access except owner-level billing and account deletion.',
      color: '#0ea5e9', isSystem: true,
      permissions: Object.fromEntries(
        ['customers','leads','estimates','jobs','invoices','pipeline','schedule','reports','marketing','settings','team','priceBook']
          .map(m => [m, { view: true, create: true, edit: true, delete: true, manage: m !== 'settings' }])
      ),
    },
    {
      id: 'estimator', name: 'Estimator', description: 'Can create and manage estimates and leads. No access to invoices or settings.',
      color: '#10b981', isSystem: true,
      permissions: {
        customers: { view: true, create: true, edit: true, delete: false, manage: false },
        leads: { view: true, create: true, edit: true, delete: false, manage: false },
        estimates: { view: true, create: true, edit: true, delete: false, manage: false },
        jobs: { view: true, create: false, edit: false, delete: false, manage: false },
        invoices: { view: true, create: false, edit: false, delete: false, manage: false },
        pipeline: { view: true, create: false, edit: false, delete: false, manage: false },
        schedule: { view: true, create: true, edit: true, delete: false, manage: false },
        priceBook: { view: true, create: false, edit: false, delete: false, manage: false },
      },
    },
    {
      id: 'field-tech', name: 'Field Tech', description: 'View assigned jobs and update job status. No financial access.',
      color: '#f59e0b', isSystem: true,
      permissions: {
        customers: { view: true, create: false, edit: false, delete: false, manage: false },
        jobs: { view: true, create: false, edit: true, delete: false, manage: false },
        schedule: { view: true, create: false, edit: false, delete: false, manage: false },
      },
    },
    {
      id: 'office-manager', name: 'Office Manager', description: 'Full access to customers, invoices, and scheduling. Cannot manage settings or team.',
      color: '#ec4899', isSystem: true,
      permissions: {
        customers: { view: true, create: true, edit: true, delete: false, manage: false },
        leads: { view: true, create: true, edit: true, delete: false, manage: false },
        estimates: { view: true, create: false, edit: false, delete: false, manage: false },
        jobs: { view: true, create: false, edit: true, delete: false, manage: false },
        invoices: { view: true, create: true, edit: true, delete: false, manage: true },
        pipeline: { view: true, create: false, edit: false, delete: false, manage: false },
        schedule: { view: true, create: true, edit: true, delete: true, manage: true },
        reports: { view: true, create: false, edit: false, delete: false, manage: false },
      },
    },
  ] as CustomRole[],
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
  | { type: 'UPSERT_PHASE_OVERRIDE'; payload: EstimatePhaseOverride }
  | { type: 'REMOVE_PHASE_OVERRIDE'; phaseId: number }
  | { type: 'SET_SIGNATURE'; payload: { signature: string; signedBy: string } }
  | { type: 'CLEAR_SIGNATURE' }
  | { type: 'ADD_OPPORTUNITY'; payload: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } }
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
  | { type: 'SET_BILLING_ADDRESS'; customerId: string; addressId: string }
  // ── Job task actions ─────────────────────────────────────────
  | { type: 'ADD_JOB_TASK'; oppId: string; task: JobTask }
  | { type: 'UPDATE_JOB_TASK'; oppId: string; taskId: string; payload: Partial<JobTask> }
  | { type: 'REMOVE_JOB_TASK'; oppId: string; taskId: string }
  // ── Job attachment actions ────────────────────────────────────
  | { type: 'ADD_JOB_ATTACHMENT'; oppId: string; attachment: JobAttachment }
  | { type: 'REMOVE_JOB_ATTACHMENT'; oppId: string; attachmentId: string }
  | { type: 'ADD_CUSTOMER_ATTACHMENT'; customerId: string; attachment: JobAttachment }
  | { type: 'REMOVE_CUSTOMER_ATTACHMENT'; customerId: string; attachmentId: string }
  // ── Job activity actions ────────────────────────────────────────────
  | { type: 'ADD_JOB_ACTIVITY'; oppId: string; event: ActivityEvent }
  // ── Lead note actions ─────────────────────────────────────────────
  | { type: 'ADD_LEAD_NOTE'; oppId: string; note: LeadNote }
  | { type: 'REMOVE_LEAD_NOTE'; oppId: string; noteId: string }
  | { type: 'ADD_LEAD_ATTACHMENT'; oppId: string; attachment: JobAttachment }
  | { type: 'REMOVE_LEAD_ATTACHMENT'; oppId: string; attachmentId: string }
  // ── Lifecycle actions ────────────────────────────────────
  | {
      type: 'CONVERT_LEAD_TO_ESTIMATE';
      leadId: string;
      newEstimateId: string;
      newEstimateTitle: string;
      value: number;
      transferNotes?: LeadNote[];
      transferAttachments?: JobAttachment[];
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
  | { type: 'ADD_SCHEDULE_EVENT'; payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string } }
  | { type: 'UPDATE_SCHEDULE_EVENT'; id: string; payload: Partial<ScheduleEvent> }
  | { type: 'REMOVE_SCHEDULE_EVENT'; id: string }
  | { type: 'UPDATE_OPPORTUNITY_SCHEDULE'; id: string; scheduledDate?: string; scheduledEndDate?: string; scheduledDuration?: number; assignedTo?: string; scheduleNotes?: string }
  | { type: 'SET_DEPOSIT'; depositType: 'pct' | 'flat'; depositValue: number }
  | { type: 'SET_SCHEDULE_FILTER'; jobId: string | null }
  | { type: 'SET_INBOX_CUSTOMER'; customerId: string | null }
  | { type: 'SET_INBOX_CONVERSATION'; conversationId: number | null; channel: 'sms' | 'email' | 'note' | null }
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
      transferNotes?: LeadNote[];       // estimate notes to copy into new job
      transferAttachments?: JobAttachment[]; // estimate attachments to copy into new job
    }
  | { type: 'UPDATE_USER_PROFILE'; payload: Partial<import('@/lib/types').UserProfile> }
  | { type: 'UPSERT_CUSTOM_ROLE'; role: CustomRole }
  | { type: 'REMOVE_CUSTOM_ROLE'; id: string }
  | {
      type: 'CREATE_CHANGE_ORDER';
      jobId: string;
      coEstimateId: string;
      coNumber: string;
      reason: string;
      scopeSummary: string;
    }
  | {
      type: 'UPDATE_CHANGE_ORDER';
      jobId: string;
      coId: string;
      patch: Partial<import('@/lib/types').ChangeOrder>;
    }
  | { type: 'UPDATE_SOW'; oppId: string; sowDocument: string }
  /**
   * Merge DB-sourced customers into local state.
   * - New customers (not in local state) are added.
   * - Existing customers (already in local state) are skipped to preserve
   *   any unsaved local edits (e.g. in-progress estimates).
   * - Opportunities from DB are merged per-customer the same way.
   */
  | { type: 'MERGE_DB_CUSTOMERS'; payload: Customer[] }
  /** Replace global invoices[] with DB-sourced data; also patches customer.invoices[] */
  | { type: 'MERGE_DB_INVOICES'; payload: Invoice[] }
  /** Replace global scheduleEvents[] with DB-sourced data */
  | { type: 'MERGE_DB_SCHEDULE_EVENTS'; payload: ScheduleEvent[] }
  /** Fired by SSE when a portal message arrives — triggers unread count re-query */
  | { type: 'PORTAL_UNREAD_PING' };

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
    case 'UPSERT_PHASE_OVERRIDE': {
      const exists = (state.phaseOverrides ?? []).find(o => o.phaseId === action.payload.phaseId);
      if (exists) {
        return {
          ...state,
          phaseOverrides: (state.phaseOverrides ?? []).map(o =>
            o.phaseId === action.payload.phaseId ? action.payload : o
          ),
        };
      }
      return { ...state, phaseOverrides: [...(state.phaseOverrides ?? []), action.payload] };
    }
    case 'REMOVE_PHASE_OVERRIDE':
      return {
        ...state,
        phaseOverrides: (state.phaseOverrides ?? []).filter(o => o.phaseId !== action.phaseId),
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
      const areaCount = state.opportunities.filter(o => o.area === action.payload.area).length;
      const newOpp: Opportunity = {
        ...action.payload,
        id: action.payload.id ?? nanoid(8),
        seqNumber: action.payload.seqNumber ?? (areaCount + 1),
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
            ? { ...c, profile: newProfile, lifetimeValue: newProfile.lifetimeValue, outstandingBalance: newProfile.outstandingBalance, tags: newProfile.tags, leadSource: newProfile.leadSource, customerNotes: newProfile.privateNotes, ...(newProfile.defaultTaxCode !== undefined ? { defaultTaxCode: newProfile.defaultTaxCode } : {}) }
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
          phaseOverrides: state.phaseOverrides ?? [],
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
        global: snap?.global ?? { markupPct: DEFAULTS.markupPct, laborRate: DEFAULTS.laborRate, paintRate: DEFAULTS.paintRate, taxEnabled: false, taxRateCode: '0603', customTaxPct: 8.9 },
        phases: snap?.phases ? mergePhasesWithCatalog(snap.phases as any[]) : ALL_PHASES,
        customItems: snap?.customItems ?? [],
        fieldNotes: snap?.fieldNotes ?? '',
        summaryNotes: snap?.summaryNotes ?? '',
        estimatorNotes: snap?.estimatorNotes ?? '',
        clientNote: snap?.clientNote ?? '',
        estimateOverrides: snap?.estimateOverrides ?? [],
        phaseOverrides: snap?.phaseOverrides ?? [],
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

    case 'SET_BILLING_ADDRESS':
      return {
        ...state,
        customers: state.customers.map(c => {
          if (c.id !== action.customerId) return c;
          const newAddresses = (c.addresses ?? []).map(a => ({
            ...a,
            isBilling: a.id === action.addressId,
          }));
          return { ...c, addresses: newAddresses };
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

    case 'ADD_CUSTOMER_ATTACHMENT':
      return {
        ...state,
        customers: state.customers.map(c =>
          c.id !== action.customerId ? c : { ...c, attachments: [...(c.attachments ?? []), action.attachment] }
        ),
      };

    case 'REMOVE_CUSTOMER_ATTACHMENT':
      return {
        ...state,
        customers: state.customers.map(c =>
          c.id !== action.customerId ? c : { ...c, attachments: (c.attachments ?? []).filter(a => a.id !== action.attachmentId) }
        ),
      };

     case 'ADD_JOB_ACTIVITY':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, jobActivity: [action.event, ...(o.jobActivity ?? [])] }
        ),
      };
    case 'ADD_LEAD_NOTE':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, leadNotes: [action.note, ...(o.leadNotes ?? [])] }
        ),
      };
    case 'REMOVE_LEAD_NOTE':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, leadNotes: (o.leadNotes ?? []).filter(n => n.id !== action.noteId) }
        ),
      };
    case 'ADD_LEAD_ATTACHMENT':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, leadAttachments: [...(o.leadAttachments ?? []), action.attachment] }
        ),
      };
    case 'REMOVE_LEAD_ATTACHMENT':
      return {
        ...state,
        opportunities: state.opportunities.map(o =>
          o.id !== action.oppId ? o : { ...o, leadAttachments: (o.leadAttachments ?? []).filter(a => a.id !== action.attachmentId) }
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
            phaseOverrides: state.phaseOverrides ?? [],
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
        // Transfer lead data if user opted in
        leadNotes: action.transferNotes ?? [],
        leadAttachments: action.transferAttachments ?? [],
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
        activeOpportunityId: action.newEstimateId,
        activeSection: 'opp-details',
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

      // Auto-create a deposit invoice using configured deposit settings
      const year = new Date().getFullYear();
      const existingInvoices = state.activeCustomerId
        ? (state.customers.find(c => c.id === state.activeCustomerId)?.invoices ?? [])
        : [];
      // Use a global invoice counter across all customers to avoid duplicates
      const globalInvoiceCount = state.customers.reduce(
        (sum, c) => sum + (c.invoices?.length ?? 0), 0
      );
      const invoiceNum = `INV-${year}-${String(globalInvoiceCount + 1).padStart(3, '0')}`;
      // Use configured depositType/depositValue (default: 50%)
      const depositPct = state.depositType === 'pct' ? state.depositValue : null;
      const subtotal = state.depositType === 'pct'
        ? Math.round(action.value * state.depositValue / 100 * 100) / 100
        : state.depositValue;
      const depositLabel = state.depositType === 'pct'
        ? `${state.depositValue}% Deposit`
        : `Deposit ($${state.depositValue.toLocaleString('en-US', { minimumFractionDigits: 2 })})`;
      const depositLineItem: InvoiceLineItem = {
        id: nanoid(8),
        description: depositLabel,
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
        depositPercent: depositPct ?? undefined,
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

      // Auto-create a placeholder schedule event for the new job (start: 1 week from now)
      const jobStartDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      const jobEndDate = new Date(jobStartDate.getTime() + 24 * 60 * 60 * 1000); // 1 day default
      const autoScheduleEvent: ScheduleEvent = {
        id: nanoid(8),
        type: 'job',
        title: action.newJobTitle,
        start: jobStartDate.toISOString(),
        end: jobEndDate.toISOString(),
        allDay: true,
        opportunityId: action.newJobId,
        customerId: state.activeCustomerId ?? '',
        assignedTo: [],
        notes: `Auto-created from estimate: ${estimate.title}`,
        completed: false,
        color: '#3b82f6',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      return {
        ...state,
        opportunities: state.opportunities
          .map(o => o.id === action.estimateId ? updatedEstimate : o)
          .concat(newJob),
        activePipelineArea: 'job',
        activeCustomerTab: 'jobs',
        activeOpportunityId: action.newJobId,
        activeSection: 'opp-details',
        activityFeed: [event, ...state.activityFeed],
        customers: syncedCustomers,
        scheduleEvents: [...state.scheduleEvents, autoScheduleEvent],
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

      // Auto-generate a final invoice if one doesn't already exist for this job
      const existingCustomerInvoices = state.activeCustomerId
        ? (state.customers.find(c => c.id === state.activeCustomerId)?.invoices ?? [])
        : [];
      const jobInvoices = existingCustomerInvoices.filter(inv => inv.opportunityId === action.jobId);
      const alreadyHasFinal = jobInvoices.some(inv => inv.type === 'final');
      const depositPaid = jobInvoices.filter(inv => inv.type === 'deposit').reduce((s, inv) => s + inv.amountPaid, 0);
      const finalBalance = Math.max(0, action.value - depositPaid);

      let updatedInvoices = existingCustomerInvoices;
      if (!alreadyHasFinal && finalBalance > 0) {
        const archiveYear = new Date().getFullYear();
        const globalInvCount = state.customers.reduce((sum, c) => sum + (c.invoices?.length ?? 0), 0);
        const finalInvNum = `INV-${archiveYear}-${String(globalInvCount + 1).padStart(3, '0')}`;
        const finalInvoice: Invoice = {
          id: nanoid(8),
          type: 'final',
          status: 'due',
          invoiceNumber: finalInvNum,
          customerId: state.activeCustomerId ?? '',
          opportunityId: action.jobId,
          sourceEstimateId: job.sourceEstimateId,
          subtotal: finalBalance,
          taxRate: 0,
          taxAmount: 0,
          total: finalBalance,
          issuedAt: new Date().toISOString(),
          dueDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
          payments: [],
          amountPaid: 0,
          balance: finalBalance,
          lineItems: [{
            id: nanoid(8),
            description: `Final Payment — ${job.title || 'Project'}`,
            qty: 1,
            unitPrice: finalBalance,
            total: finalBalance,
            notes: depositPaid > 0 ? `Remaining balance after ${fmtDollarSimple(depositPaid)} deposit` : undefined,
          }],
          notes: 'Balance due upon project completion.',
          internalNotes: `Auto-generated on job archive. Job: ${job.jobNumber ?? action.jobId}`,
          paymentTerms: 'Due within 14 days',
        };
        updatedInvoices = [...existingCustomerInvoices, finalInvoice];
      }

      const archivedOpps = state.opportunities.map(o => o.id === action.jobId ? archivedJob : o);
      const archivedFeed = [event, ...state.activityFeed];
      const newProfile = { ...state.customerProfile, lifetimeValue: newLifetimeValue };
      const syncedCustomers = state.activeCustomerId
        ? state.customers.map(c =>
            c.id === state.activeCustomerId
              ? { ...c, opportunities: archivedOpps, activityFeed: archivedFeed, profile: newProfile, lifetimeValue: newLifetimeValue, invoices: updatedInvoices }
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

      // ── Change Order approval path ─────────────────────────────
      // If this estimate is a CO, update the parent job's ChangeOrder record
      // instead of creating a new job.
      if (estimate.isChangeOrder && estimate.parentJobId) {
        const now = new Date().toISOString();
        const parentJob = state.opportunities.find(o => o.id === estimate.parentJobId);
        if (!parentJob) return state;

        const wonCOEstimate: Opportunity = {
          ...estimate,
          stage: 'Approved' as OpportunityStage,
          wonAt: now,
          updatedAt: now,
          ...(action.signedEstimateDataUrl ? { signedEstimateDataUrl: action.signedEstimateDataUrl } : {}),
          ...(action.signedEstimateFilename ? { signedEstimateFilename: action.signedEstimateFilename } : {}),
        };

        // Update the ChangeOrder record on the parent job
        const updatedCOs = (parentJob.changeOrders ?? []).map(co =>
          co.estimateId === estimate.id
            ? { ...co, status: 'approved' as import('@/lib/types').ChangeOrderStatus, valueDelta: action.totalPrice, approvedAt: now }
            : co
        );

        const coApprovalEvent = makeActivity(
          'change_order_approved',
          `Change Order ${estimate.coNumber ?? ''} Approved`,
          `Value: +$${action.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 2 })}`,
          estimate.id,
        );

        const updatedParentJob: Opportunity = {
          ...parentJob,
          changeOrders: updatedCOs,
          jobActivity: [coApprovalEvent, ...(parentJob.jobActivity ?? [])],
          updatedAt: now,
        };

        const updatedOpps = state.opportunities
          .map(o => o.id === estimate.id ? wonCOEstimate : o)
          .map(o => o.id === estimate.parentJobId ? updatedParentJob : o);

        const syncedCustomers = state.activeCustomerId
          ? state.customers.map(c =>
              c.id === state.activeCustomerId ? { ...c, opportunities: updatedOpps } : c
            )
          : state.customers;

        return {
          ...state,
          opportunities: updatedOpps,
          customers: syncedCustomers,
          activeOpportunityId: estimate.parentJobId,
          activePipelineArea: 'job',
          activeSection: 'job-details',
        };
      }
      // ── End Change Order approval path ────────────────────────

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
          // Transfer notes and attachments from estimate if requested
          ...(action.transferNotes?.length ? { leadNotes: action.transferNotes.map(n => ({ ...n, id: nanoid(8) })) } : {}),
          ...(action.transferAttachments?.length ? { leadAttachments: action.transferAttachments.map(a => ({ ...a, id: nanoid(8) })) } : {}),
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

      // 6. Sync to customer record + increment lifetime value
      const newLifetimeValue = (state.customerProfile.lifetimeValue || 0) + action.totalPrice;
      const newProfile = { ...state.customerProfile, lifetimeValue: newLifetimeValue };
      const syncedCustomers = state.activeCustomerId
        ? state.customers.map(c =>
            c.id === state.activeCustomerId
              ? { ...c, opportunities: updatedOpps, activityFeed: newFeed, invoices: updatedInvoices, profile: newProfile, lifetimeValue: newLifetimeValue }
              : c
          )
        : state.customers;

      return {
        ...state,
        opportunities: updatedOpps,
        activityFeed: newFeed,
        customers: syncedCustomers,
        scheduleEvents: newScheduleEvents,
        customerProfile: newProfile,
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
        phaseOverrides: [],
        signature: null,
        signedAt: null,
        signedBy: null,
      };
    case 'ADD_SCHEDULE_EVENT': {
      const now = new Date().toISOString();
      const newEvent: ScheduleEvent = {
        ...action.payload,
        id: action.payload.id ?? nanoid(8),
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
    case 'SET_INBOX_CUSTOMER':
      return { ...state, inboxCustomerId: action.customerId };
    case 'SET_INBOX_CONVERSATION':
      return { ...state, inboxConversationId: action.conversationId, inboxChannel: action.channel };
    case 'UPDATE_USER_PROFILE':
      return { ...state, userProfile: { ...state.userProfile, ...action.payload } };

    case 'UPSERT_CUSTOM_ROLE': {
      const exists = state.customRoles.some(r => r.id === action.role.id);
      return {
        ...state,
        customRoles: exists
          ? state.customRoles.map(r => r.id === action.role.id ? action.role : r)
          : [...state.customRoles, action.role],
      };
    }

    case 'REMOVE_CUSTOM_ROLE':
      return { ...state, customRoles: state.customRoles.filter(r => r.id !== action.id) };

    case 'MERGE_DB_CUSTOMERS': {
      // Build a map of DB customers for O(1) lookup
      const dbMap = new Map(action.payload.map(c => [c.id, c]));
      const localIds = new Set(state.customers.map(c => c.id));
      // New customers not yet in local state
      const newCustomers = action.payload.filter(c => !localIds.has(c.id));
      // For existing customers: merge opportunities from DB (update stage/wonAt/portalApprovedAt
      // for any opportunity whose DB updatedAt is newer than local updatedAt)
      const updatedCustomers = state.customers.map(c => {
        const dbCust = dbMap.get(c.id);
        if (!dbCust) return c;
        const dbOppMap = new Map((dbCust.opportunities ?? []).map((o: any) => [o.id, o]));
        const mergedOpps = c.opportunities.map(o => {
          const dbOpp = dbOppMap.get(o.id);
          if (!dbOpp) return o;
          const dbUpdated = new Date(dbOpp.updatedAt ?? 0).getTime();
          const localUpdated = new Date(o.updatedAt ?? 0).getTime();
          if (dbUpdated <= localUpdated) return o;
          // DB is newer — merge stage, wonAt, portalApprovedAt from DB
          return {
            ...o,
            stage: dbOpp.stage ?? o.stage,
            wonAt: dbOpp.wonAt ?? o.wonAt,
            portalApprovedAt: dbOpp.portalApprovedAt ?? o.portalApprovedAt,
            updatedAt: dbOpp.updatedAt ?? o.updatedAt,
          };
        });
        return { ...c, opportunities: mergedOpps };
      });
      if (newCustomers.length === 0 && updatedCustomers === state.customers) return state;
      return { ...state, customers: [...newCustomers, ...updatedCustomers] };
    }

    case 'MERGE_DB_INVOICES': {
      // Replace global invoices[] with DB data.
      // Also patch customer.invoices[] so InvoiceSection keeps reading from the right place.
      const byCustomer = new Map<string, Invoice[]>();
      for (const inv of action.payload) {
        const arr = byCustomer.get(inv.customerId) ?? [];
        arr.push(inv);
        byCustomer.set(inv.customerId, arr);
      }
      const patchedCustomers = state.customers.map(c => {
        const dbInvs = byCustomer.get(c.id);
        if (!dbInvs) return c;
        return { ...c, invoices: dbInvs };
      });
      return { ...state, invoices: action.payload, customers: patchedCustomers };
    }

    case 'MERGE_DB_SCHEDULE_EVENTS':
      return { ...state, scheduleEvents: action.payload };

    case 'PORTAL_UNREAD_PING':
      // No state change needed — this ping causes React Query to re-fetch unread count
      return { ...state, _portalUnreadPing: (state as any)._portalUnreadPing + 1 || 1 };

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

    case 'CREATE_CHANGE_ORDER': {
      const now = new Date().toISOString();
      const job = state.opportunities.find(o => o.id === action.jobId);
      if (!job) return state;

      // Create a new estimate opportunity for the CO, pre-populated from the job's snapshot
      const coEstimate: Opportunity = {
        id: action.coEstimateId,
        area: 'estimate',
        stage: 'Draft' as OpportunityStage,
        title: `${action.coNumber} — ${action.reason}`,
        value: 0,
        notes: action.scopeSummary,
        createdAt: now,
        updatedAt: now,
        archived: false,
        isChangeOrder: true,
        parentJobId: action.jobId,
        coNumber: action.coNumber,
        clientSnapshot: job.clientSnapshot,
        // Pre-populate with job's estimate snapshot so estimator has a starting point
        estimateSnapshot: job.estimateSnapshot,
      };

      // Add a ChangeOrder record to the job
      const newCO: import('@/lib/types').ChangeOrder = {
        id: nanoid(8),
        coNumber: action.coNumber,
        estimateId: action.coEstimateId,
        reason: action.reason,
        scopeSummary: action.scopeSummary,
        valueDelta: 0,
        status: 'draft',
        createdAt: now,
      };

      const coActivityEvent = makeActivity(
        'change_order_created',
        `Change Order ${action.coNumber} Created`,
        action.reason,
        action.coEstimateId,
      );

      const updatedJob: Opportunity = {
        ...job,
        changeOrders: [...(job.changeOrders ?? []), newCO],
        jobActivity: [coActivityEvent, ...(job.jobActivity ?? [])],
        updatedAt: now,
      };

      const updatedOpps = state.opportunities
        .map(o => o.id === action.jobId ? updatedJob : o)
        .concat(coEstimate);

      const syncedCustomers = state.activeCustomerId
        ? state.customers.map(c =>
            c.id === state.activeCustomerId ? { ...c, opportunities: updatedOpps } : c
          )
        : state.customers;

      return {
        ...state,
        opportunities: updatedOpps,
        customers: syncedCustomers,
        activeOpportunityId: action.coEstimateId,
        activePipelineArea: 'estimate',
        activeSection: 'estimate',
      };
    }

    case 'UPDATE_CHANGE_ORDER': {
      const now = new Date().toISOString();
      const updatedOpps = state.opportunities.map(o => {
        if (o.id !== action.jobId) return o;
        return {
          ...o,
          changeOrders: (o.changeOrders ?? []).map(co =>
            co.id === action.coId ? { ...co, ...action.patch } : co
          ),
          updatedAt: now,
        };
      });
      const syncedCustomers = state.activeCustomerId
        ? state.customers.map(c =>
            c.id === state.activeCustomerId ? { ...c, opportunities: updatedOpps } : c
          )
        : state.customers;
      return { ...state, opportunities: updatedOpps, customers: syncedCustomers };
    }

    case 'UPDATE_SOW': {
      const now = new Date().toISOString();
      const updatedOpps = state.opportunities.map(o =>
        o.id === action.oppId
          ? { ...o, sowDocument: action.sowDocument, sowGeneratedAt: now, updatedAt: now }
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
  upsertPhaseOverride: (override: EstimatePhaseOverride) => void;
  removePhaseOverride: (phaseId: number) => void;
  setSignature: (signature: string, signedBy: string) => void;
  clearSignature: () => void;
  addOpportunity: (payload: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  updateOpportunity: (id: string, payload: Partial<Opportunity>) => void;
  removeOpportunity: (id: string) => void;
  setPipelineArea: (area: PipelineArea) => void;
   // ── Lifecycle ──────────────────────────────────────────
  convertLeadToEstimate: (leadId: string, estimateTitle: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => void;
  convertEstimateToJob: (estimateId: string, jobTitle: string, value: number) => void;
  archiveJob: (jobId: string, value: number) => void;
  setActiveOpportunity: (id: string | null) => void;
  addCustomer: (customer: Customer) => void;
  mergeDbCustomers: (customers: Customer[]) => void;
  mergeDbInvoices: (invoices: Invoice[]) => void;
  mergeDbScheduleEvents: (events: ScheduleEvent[]) => void;
  updateCustomer: (id: string, payload: Partial<Customer>) => void;
  setActiveCustomer: (id: string | null) => void;
  addCustomerAddress: (customerId: string, address: CustomerAddress) => void;
  updateCustomerAddress: (customerId: string, addressId: string, payload: Partial<CustomerAddress>) => void;
  removeCustomerAddress: (customerId: string, addressId: string) => void;
  setPrimaryAddress: (customerId: string, addressId: string) => void;
  setBillingAddress: (customerId: string, addressId: string) => void;
  reset: () => void;
  navigateToTopLevel: (section: AppSection) => void;
  // Schedule
  addScheduleEvent: (payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => void;
  updateScheduleEvent: (id: string, payload: Partial<ScheduleEvent>) => void;
  removeScheduleEvent: (id: string) => void;
  updateOpportunitySchedule: (id: string, fields: { scheduledDate?: string; scheduledEndDate?: string; scheduledDuration?: number; assignedTo?: string; scheduleNotes?: string }) => void;
  // Deposit
  setDeposit: (depositType: 'pct' | 'flat', depositValue: number) => void;
  // Schedule deep-link filter
  setScheduleFilter: (jobId: string | null) => void;
  // Inbox deep-link: pre-select customer in InboxPage
  setInboxCustomer: (customerId: string | null) => void;
  // Inbox deep-link: open specific conversation with channel
  setInboxConversation: (conversationId: number | null, channel: 'sms' | 'email' | 'note' | null) => void;
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
    transferNotes?: LeadNote[];
    transferAttachments?: JobAttachment[];
  }) => void;
  // Job tasks
  addJobTask: (oppId: string, task: JobTask) => void;
  updateJobTask: (oppId: string, taskId: string, payload: Partial<JobTask>) => void;
  removeJobTask: (oppId: string, taskId: string) => void;
  // Job attachments
  addJobAttachment: (oppId: string, attachment: JobAttachment) => void;
  removeJobAttachment: (oppId: string, attachmentId: string) => void;
  // Customer-level attachments
  addCustomerAttachment: (customerId: string, attachment: JobAttachment) => void;
  removeCustomerAttachment: (customerId: string, attachmentId: string) => void;
  // Job activity
  addJobActivity: (oppId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>) => void;
  // Lead notes & attachments
  addLeadNote: (oppId: string, note: Omit<LeadNote, 'id' | 'createdAt'>) => void;
  removeLeadNote: (oppId: string, noteId: string) => void;
  addLeadAttachment: (oppId: string, attachment: JobAttachment) => void;
  removeLeadAttachment: (oppId: string, attachmentId: string) => void;
  // User profile
  updateUserProfile: (payload: Partial<import('@/lib/types').UserProfile>) => void;
  // Custom roles
  upsertCustomRole: (role: CustomRole) => void;
  removeCustomRole: (id: string) => void;
  // Change orders
  createChangeOrder: (jobId: string, reason: string, scopeSummary: string) => void;
  updateChangeOrder: (jobId: string, coId: string, patch: Partial<import('@/lib/types').ChangeOrder>) => void;
  // SOW editing
  updateSow: (oppId: string, sowDocument: string) => void;
}

const EstimatorContext = createContext<EstimatorContextValue | null>(null);

// Bump this version whenever ALL_PHASES catalog rates change — forces a phases refresh
// while preserving all customer/opportunity/invoice data.
// v1 → v2: door casing (p11-dc) rates corrected to per-opening ($85/$130/$220)
const STORAGE_KEY = 'hp-field-estimator-v2';
const LEGACY_STORAGE_KEY = 'hp-field-estimator-v1';

const SIGNED_EST_PREFIX = 'hp-signed-est-';

/** Save a signed estimate PNG to its own localStorage key (keyed by opportunity ID). */
export function persistSignedEstimate(oppId: string, dataUrl: string): void {
  try { localStorage.setItem(`${SIGNED_EST_PREFIX}${oppId}`, dataUrl); } catch { /* quota */ }
}

/** Retrieve a signed estimate PNG by opportunity ID. */
export function loadSignedEstimate(oppId: string): string | null {
  try { return localStorage.getItem(`${SIGNED_EST_PREFIX}${oppId}`); } catch { return null; }
}

/**
 * Merge persisted per-item user data (qty, notes, tier, selectedDimension, markupPct, enabled)
 * onto the fresh ALL_PHASES catalog so rate/dimension changes in code always take effect.
 */
function mergePhasesWithCatalog(persistedPhases: any[]): typeof ALL_PHASES {
  return ALL_PHASES.map(catalogPhase => ({
    ...catalogPhase,
    items: catalogPhase.items.map(catalogItem => {
      const persistedPhase = persistedPhases.find((p: any) => p.id === catalogPhase.id);
      const persistedItem = persistedPhase?.items?.find((i: any) => i.id === catalogItem.id);
      if (!persistedItem) return catalogItem;
      // Preserve only user-entered fields; all catalog fields (rates, tiers, dimensions) come fresh
      return {
        ...catalogItem,
        qty: persistedItem.qty ?? catalogItem.qty,
        notes: persistedItem.notes ?? catalogItem.notes,
        tier: persistedItem.tier ?? catalogItem.tier,
        selectedDimension: persistedItem.selectedDimension ?? catalogItem.selectedDimension,
        markupPct: persistedItem.markupPct ?? catalogItem.markupPct,
        enabled: persistedItem.enabled ?? catalogItem.enabled,
        paintPrep: persistedItem.paintPrep ?? catalogItem.paintPrep,
        salesSelected: persistedItem.salesSelected ?? catalogItem.salesSelected,
      };
    }),
  }));
}

function loadPersistedState(): EstimatorState {
  try {
    // Try current version key first; fall back to legacy key for migration
    let raw = localStorage.getItem(STORAGE_KEY);
    let isLegacy = false;
    if (!raw) {
      raw = localStorage.getItem(LEGACY_STORAGE_KEY);
      isLegacy = !!raw;
    }
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
    // Always merge phases with fresh catalog so rate changes in code take effect immediately
    const mergedPhases = parsed.phases
      ? mergePhasesWithCatalog(parsed.phases as any[])
      : ALL_PHASES;
    // If migrating from legacy key, clear the old key
    if (isLegacy) {
      try { localStorage.removeItem(LEGACY_STORAGE_KEY); } catch { /* ignore */ }
    }
    // Merge with initialState so new fields added in code are always present
    return {
      ...initialState,
      ...parsed,
      phases: mergedPhases,
      opportunities: restoredOpps,
      customers: restoredCustomers,
      // Always reset transient UI state on reload
      activeSection: parsed.activeSection ?? 'dashboard',
      activeOpportunityId: null,
      // Merge global settings to ensure new fields (taxEnabled, taxRateCode, customTaxPct) are present
      global: {
        ...initialState.global,
        ...(parsed.global ?? {}),
      },
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
  const upsertPhaseOverride = useCallback((override: EstimatePhaseOverride) =>
    dispatch({ type: 'UPSERT_PHASE_OVERRIDE', payload: override }), []);
  const removePhaseOverride = useCallback((phaseId: number) =>
    dispatch({ type: 'REMOVE_PHASE_OVERRIDE', phaseId }), []);
  const setSignature = useCallback((signature: string, signedBy: string) =>
    dispatch({ type: 'SET_SIGNATURE', payload: { signature, signedBy } }), []);
  const clearSignature = useCallback(() => dispatch({ type: 'CLEAR_SIGNATURE' }), []);
  const addOpportunity = useCallback((payload: Omit<Opportunity, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) =>
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
  const convertLeadToEstimate = useCallback((leadId: string, estimateTitle: string, value: number, transferNotes?: LeadNote[], transferAttachments?: JobAttachment[]) => {
    dispatch({
      type: 'CONVERT_LEAD_TO_ESTIMATE',
      leadId,
      newEstimateId: nanoid(8),
      newEstimateTitle: estimateTitle,
      value,
      transferNotes,
      transferAttachments,
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

  const mergeDbCustomers = useCallback((customers: Customer[]) => {
    dispatch({ type: 'MERGE_DB_CUSTOMERS', payload: customers });
  }, []);

  const mergeDbInvoices = useCallback((invoices: Invoice[]) => {
    dispatch({ type: 'MERGE_DB_INVOICES', payload: invoices });
  }, []);

  const mergeDbScheduleEvents = useCallback((events: ScheduleEvent[]) => {
    dispatch({ type: 'MERGE_DB_SCHEDULE_EVENTS', payload: events });
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
  const setBillingAddress = useCallback((customerId: string, addressId: string) => {
    dispatch({ type: 'SET_BILLING_ADDRESS', customerId, addressId });
  }, []);

  const setActiveCustomer = useCallback((id: string | null) => {
    dispatch({ type: 'SET_ACTIVE_CUSTOMER', payload: id });
  }, []);

  const navigateToTopLevel = useCallback((section: AppSection) => {
    dispatch({ type: 'NAVIGATE_TO_TOP_LEVEL', payload: section });
  }, []);

  const reset = useCallback(() => dispatch({ type: 'RESET' }), []);

  // ── Schedule callbacks ────────────────────────────────────
  const addScheduleEvent = useCallback((payload: Omit<ScheduleEvent, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }) => {
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
    transferNotes?: LeadNote[];
    transferAttachments?: JobAttachment[];
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
   const setInboxCustomer = useCallback((customerId: string | null) => {
    dispatch({ type: 'SET_INBOX_CUSTOMER', customerId });
  }, []);
  const setInboxConversation = useCallback((conversationId: number | null, channel: 'sms' | 'email' | 'note' | null) => {
    dispatch({ type: 'SET_INBOX_CONVERSATION', conversationId, channel });
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
  const addCustomerAttachment = useCallback((customerId: string, attachment: JobAttachment) => {
    dispatch({ type: 'ADD_CUSTOMER_ATTACHMENT', customerId, attachment });
  }, []);
  const removeCustomerAttachment = useCallback((customerId: string, attachmentId: string) => {
    dispatch({ type: 'REMOVE_CUSTOMER_ATTACHMENT', customerId, attachmentId });
  }, []);

   const addJobActivity = useCallback((oppId: string, event: Omit<ActivityEvent, 'id' | 'timestamp'>) => {
    dispatch({
      type: 'ADD_JOB_ACTIVITY',
      oppId,
      event: { ...event, id: nanoid(8), timestamp: new Date().toISOString() },
    });
  }, []);
  const addLeadNote = useCallback((oppId: string, note: Omit<LeadNote, 'id' | 'createdAt'>) => {
    dispatch({
      type: 'ADD_LEAD_NOTE',
      oppId,
      note: { ...note, id: nanoid(8), createdAt: new Date().toISOString() },
    });
  }, []);
  const removeLeadNote = useCallback((oppId: string, noteId: string) => {
    dispatch({ type: 'REMOVE_LEAD_NOTE', oppId, noteId });
  }, []);
  const addLeadAttachment = useCallback((oppId: string, attachment: JobAttachment) => {
    dispatch({ type: 'ADD_LEAD_ATTACHMENT', oppId, attachment });
  }, []);
  const removeLeadAttachment = useCallback((oppId: string, attachmentId: string) => {
    dispatch({ type: 'REMOVE_LEAD_ATTACHMENT', oppId, attachmentId });
  }, []);
  const updateUserProfile = useCallback((payload: Partial<import('@/lib/types').UserProfile>) => {
    dispatch({ type: 'UPDATE_USER_PROFILE', payload });
  }, []);

  const upsertCustomRole = useCallback((role: CustomRole) => {
    dispatch({ type: 'UPSERT_CUSTOM_ROLE', role });
  }, []);

  const removeCustomRole = useCallback((id: string) => {
    dispatch({ type: 'REMOVE_CUSTOM_ROLE', id });
  }, []);

  const createChangeOrder = useCallback((jobId: string, reason: string, scopeSummary: string) => {
    const job = state.opportunities.find(o => o.id === jobId);
    if (!job) return;
    const existingCOs = job.changeOrders?.length ?? 0;
    const coNumber = `CO-${String(existingCOs + 1).padStart(3, '0')}`;
    dispatch({
      type: 'CREATE_CHANGE_ORDER',
      jobId,
      coEstimateId: nanoid(8),
      coNumber,
      reason,
      scopeSummary,
    });
  }, [state.opportunities]);

  const updateChangeOrder = useCallback((jobId: string, coId: string, patch: Partial<import('@/lib/types').ChangeOrder>) => {
    dispatch({ type: 'UPDATE_CHANGE_ORDER', jobId, coId, patch });
  }, []);

  const updateSow = useCallback((oppId: string, sowDocument: string) => {
    dispatch({ type: 'UPDATE_SOW', oppId, sowDocument });
  }, []);

  return (
    <EstimatorContext.Provider value={{
      state, setSection, setJobInfo, setGlobal, updateItem,
      addCustomItem, updateCustomItem, removeCustomItem,
      setFieldNotes, setSummaryNotes, setEstimatorNotes, setClientNote,
      upsertEstimateOverride, removeEstimateOverride,
      upsertPhaseOverride, removePhaseOverride,
      setSignature, clearSignature,
      addOpportunity, updateOpportunity, removeOpportunity, setPipelineArea,
      setCustomerProfile, addActivityEvent, setCustomerTab,
      convertLeadToEstimate, convertEstimateToJob, archiveJob,
      setActiveOpportunity,
      addCustomer, mergeDbCustomers, mergeDbInvoices, mergeDbScheduleEvents, updateCustomer, setActiveCustomer,
      addCustomerAddress, updateCustomerAddress, removeCustomerAddress, setPrimaryAddress, setBillingAddress,
      navigateToTopLevel,
      reset,
      addScheduleEvent, updateScheduleEvent, removeScheduleEvent, updateOpportunitySchedule,
      setDeposit,
      setScheduleFilter,
      setInboxCustomer,
      setInboxConversation,
      approveEstimate,
      addJobTask, updateJobTask, removeJobTask,
      addJobAttachment, removeJobAttachment,
      addCustomerAttachment, removeCustomerAttachment,
      addJobActivity,
      addLeadNote, removeLeadNote,
      addLeadAttachment, removeLeadAttachment,
      updateUserProfile,
      upsertCustomRole,
      removeCustomRole,
      createChangeOrder,
      updateChangeOrder,
      updateSow,
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
