// Builds the full per-opportunity estimate snapshot from working state.
// Single source of truth for both reducer flush sites (SET_ACTIVE_OPPORTUNITY
// and SET_ACTIVE_CUSTOMER) so neither can drift and drop fields again.

import type { EstimateSnapshot, EstimatorState } from '@/lib/types';

export type SnapshotSourceState = Pick<
  EstimatorState,
  | 'jobInfo'
  | 'global'
  | 'phases'
  | 'customItems'
  | 'fieldNotes'
  | 'summaryNotes'
  | 'estimatorNotes'
  | 'clientNote'
  | 'estimateOverrides'
  | 'phaseOverrides'
  | 'signature'
  | 'signedAt'
  | 'signedBy'
  | 'depositType'
  | 'depositValue'
  | 'consultantWorkflow'
  | 'estimateAudit'
  | 'estimateProposal'
  | 'estimatePricebook'
>;

export function buildEstimateSnapshot(state: SnapshotSourceState): EstimateSnapshot {
  return {
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
    consultantWorkflow: state.consultantWorkflow,
    audit: state.estimateAudit,
    proposal: state.estimateProposal,
    pricebook: state.estimatePricebook,
    approvedAt: state.estimateProposal.approvedAt ?? state.estimateAudit.approvedAt,
    approvedBy: state.estimateProposal.approvedBy ?? state.estimateAudit.approvedBy,
  };
}

// DB payload variant: the signature PNG data-url can be hundreds of KB and the
// portal keeps its own signed copy, so it stays out of persisted snapshots.
export function buildEstimateSnapshotForDb(state: SnapshotSourceState): EstimateSnapshot {
  return { ...buildEstimateSnapshot(state), signature: null };
}
