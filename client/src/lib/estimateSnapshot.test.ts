/**
 * Regression tests for the snapshot flush bug: the SET_ACTIVE_CUSTOMER flush
 * used to build its own (incomplete) snapshot that dropped proposal/audit/
 * consultantWorkflow, so visiting a customer profile reset a ready estimate
 * back to draft. Both reducer flush sites now share buildEstimateSnapshot.
 */
import { describe, it, expect } from 'vitest';
import { buildEstimateSnapshot, buildEstimateSnapshotForDb, type SnapshotSourceState } from './estimateSnapshot';
import { ALL_PHASES, DEFAULTS } from './phases';
import type {
  ConsultantWorkflowMeta, EstimateAuditMeta, EstimateProposalMeta,
  EstimatePricebookMeta, EstimateSnapshot, JobInfo,
} from './types';

const jobInfo: JobInfo = {
  client: 'Smith Family', companyName: '', address: '123 Main St',
  city: 'Vancouver', state: 'WA', zip: '98604', phone: '', email: '',
  date: '2026-06-12', expiresDate: '2026-07-12', servicedDate: '',
  jobType: 'Full residential remodel', estimator: 'Marcin',
  jobNumber: 'HP-2026-100', scope: 'Kitchen remodel',
};

const consultantWorkflow: ConsultantWorkflowMeta = {
  currentStep: 'present', completedSteps: ['prep'],
  problemStatement: 'Dated kitchen', customerGoals: '', affectedAreas: '',
  urgency: '', constraints: '', decisionFactors: '', measurementNotes: '',
  findingNotes: '', photoNotes: '', linkedPhotoAttachmentIds: [],
  scheduleAssumptions: '', internalAssumptions: '',
} as ConsultantWorkflowMeta;

const estimateAudit: EstimateAuditMeta = {
  lastRunAt: '2026-06-12T10:00:00Z', source: 'rules', providerConfigured: false,
  readinessScore: 92, blockingIssues: [], suggestedFixes: [], pricingRisks: [],
  scopeQuestions: [], customerSummaryDraft: '', recommendedAlternates: [],
  approvalChecklist: [], approvedAt: '2026-06-12T10:05:00Z', approvedBy: 'Marcin',
  history: [],
};

const estimateProposal: EstimateProposalMeta = {
  status: 'ready_for_customer', customerSummary: 'New kitchen, 3 weeks.',
  alternates: [], nextStep: 'Review together',
  approvedAt: '2026-06-12T10:05:00Z', approvedBy: 'Marcin',
};

const estimatePricebook: EstimatePricebookMeta = {
  catalogVersion: 'frontend-catalog-v1', region: 'Vancouver / Clark County, WA',
  source: 'frontend_catalog', futureAdminReady: true, reviewedAt: null, reviewedBy: null,
};

const readyState: SnapshotSourceState = {
  jobInfo,
  global: { markupPct: DEFAULTS.markupPct, laborRate: DEFAULTS.laborRate, paintRate: DEFAULTS.paintRate, taxEnabled: true, taxRateCode: '0605', customTaxPct: 8.9 },
  phases: ALL_PHASES,
  customItems: [],
  fieldNotes: 'field',
  summaryNotes: 'summary',
  estimatorNotes: 'internal',
  clientNote: 'client-facing',
  estimateOverrides: [],
  phaseOverrides: [],
  signature: 'data:image/png;base64,abc123',
  signedAt: null,
  signedBy: null,
  depositType: 'flat',
  depositValue: 1500,
  consultantWorkflow,
  estimateAudit,
  estimateProposal,
  estimatePricebook,
};

// Mirrors the reducer's snapshot-restore merge in SET_ACTIVE_OPPORTUNITY.
function restoreProposal(snap: EstimateSnapshot): EstimateProposalMeta {
  const defaults: EstimateProposalMeta = {
    status: 'draft', customerSummary: '', alternates: [], nextStep: '',
    approvedAt: null, approvedBy: null,
  };
  return { ...defaults, ...(snap.proposal ?? {}) };
}

describe('buildEstimateSnapshot', () => {
  it('carries the full readiness state, not just calculator data', () => {
    const snap = buildEstimateSnapshot(readyState);
    expect(snap.proposal?.status).toBe('ready_for_customer');
    expect(snap.audit?.readinessScore).toBe(92);
    expect(snap.consultantWorkflow?.currentStep).toBe('present');
    expect(snap.pricebook?.catalogVersion).toBe('frontend-catalog-v1');
    expect(snap.approvedAt).toBe('2026-06-12T10:05:00Z');
    expect(snap.approvedBy).toBe('Marcin');
    expect(snap.depositType).toBe('flat');
    expect(snap.depositValue).toBe(1500);
  });

  it('falls back to audit approval when the proposal has none', () => {
    const snap = buildEstimateSnapshot({
      ...readyState,
      estimateProposal: { ...estimateProposal, approvedAt: null, approvedBy: null },
    });
    expect(snap.approvedAt).toBe(estimateAudit.approvedAt);
    expect(snap.approvedBy).toBe(estimateAudit.approvedBy);
  });

  it('proposal status survives the opportunity → customer → opportunity round trip', () => {
    // Leg 1: leaving the opportunity for a customer profile flushes the snapshot
    // (this was the buggy site — it used to omit proposal/audit/consultantWorkflow).
    const flushedOnCustomerVisit = buildEstimateSnapshot(readyState);
    // Leg 2: returning to the opportunity restores from that snapshot.
    const restored = restoreProposal(flushedOnCustomerVisit);
    expect(restored.status).toBe('ready_for_customer');
    expect(restored.approvedAt).toBe('2026-06-12T10:05:00Z');
    expect(restored.approvedBy).toBe('Marcin');

    // And a second full cycle keeps it ready.
    const secondFlush = buildEstimateSnapshot({ ...readyState, estimateProposal: restored });
    expect(restoreProposal(secondFlush).status).toBe('ready_for_customer');
  });

  it('old snapshots without the new fields restore to draft defaults', () => {
    const legacy = { ...buildEstimateSnapshot(readyState), proposal: undefined };
    expect(restoreProposal(legacy).status).toBe('draft');
  });
});

describe('buildEstimateSnapshotForDb', () => {
  it('strips the signature image but keeps readiness', () => {
    const snap = buildEstimateSnapshotForDb(readyState);
    expect(snap.signature).toBeNull();
    expect(snap.proposal?.status).toBe('ready_for_customer');
  });
});
