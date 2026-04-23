/**
 * Tests for per-opportunity estimate data isolation.
 * Each opportunity must carry its own independent EstimateSnapshot.
 * Switching between estimates must not bleed data from one to another.
 */
import { describe, it, expect } from 'vitest';
import { ALL_PHASES, DEFAULTS } from './phases';

// Minimal reducer-like logic mirroring EstimatorContext snapshot save/restore
interface Snapshot {
  jobInfo: { client: string; jobNumber: string };
  phases: typeof ALL_PHASES;
  global: { markupPct: number; laborRate: number; paintRate: number };
  customItems: unknown[];
  fieldNotes: string;
  summaryNotes: string;
  estimatorNotes: string;
  clientNote: string;
  estimateOverrides: unknown[];
  signature: string | null;
  signedAt: string | null;
  signedBy: string | null;
  depositType: 'pct' | 'flat';
  depositValue: number;
}

interface Opp {
  id: string;
  title: string;
  estimateSnapshot?: Snapshot;
}

interface WorkingState {
  activeOpportunityId: string | null;
  opportunities: Opp[];
  jobInfo: { client: string; jobNumber: string };
  phases: typeof ALL_PHASES;
  global: { markupPct: number; laborRate: number; paintRate: number };
  customItems: unknown[];
  fieldNotes: string;
  summaryNotes: string;
  estimatorNotes: string;
  clientNote: string;
  estimateOverrides: unknown[];
  signature: string | null;
  signedAt: string | null;
  signedBy: string | null;
  depositType: 'pct' | 'flat';
  depositValue: number;
}

const defaultGlobal = { markupPct: DEFAULTS.markupPct, laborRate: DEFAULTS.laborRate, paintRate: DEFAULTS.paintRate };
const defaultSnapshot = (): Snapshot => ({
  jobInfo: { client: '', jobNumber: '' },
  phases: ALL_PHASES,
  global: defaultGlobal,
  customItems: [],
  fieldNotes: '',
  summaryNotes: '',
  estimatorNotes: '',
  clientNote: '',
  estimateOverrides: [],
  signature: null,
  signedAt: null,
  signedBy: null,
  depositType: 'pct',
  depositValue: 50,
});

function setActiveOpportunity(state: WorkingState, newId: string | null): WorkingState {
  // Save outgoing snapshot
  let updatedOpps = state.opportunities;
  if (state.activeOpportunityId) {
    const outSnap: Snapshot = {
      jobInfo: state.jobInfo,
      phases: state.phases,
      global: state.global,
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
    updatedOpps = state.opportunities.map(o =>
      o.id === state.activeOpportunityId ? { ...o, estimateSnapshot: outSnap } : o
    );
  }

  if (!newId) {
    return { ...state, opportunities: updatedOpps, activeOpportunityId: null };
  }

  // Restore incoming snapshot
  const incoming = updatedOpps.find(o => o.id === newId);
  const snap = incoming?.estimateSnapshot ?? defaultSnapshot();
  return {
    ...state,
    opportunities: updatedOpps,
    activeOpportunityId: newId,
    jobInfo: snap.jobInfo,
    phases: snap.phases,
    global: snap.global,
    customItems: snap.customItems,
    fieldNotes: snap.fieldNotes,
    summaryNotes: snap.summaryNotes,
    estimatorNotes: snap.estimatorNotes,
    clientNote: snap.clientNote,
    estimateOverrides: snap.estimateOverrides,
    signature: snap.signature,
    signedAt: snap.signedAt,
    signedBy: snap.signedBy,
    depositType: snap.depositType,
    depositValue: snap.depositValue,
  };
}

const baseState = (): WorkingState => ({
  activeOpportunityId: null,
  opportunities: [
    { id: 'opp-1', title: 'Remodel' },
    { id: 'opp-2', title: 'Bath' },
  ],
  jobInfo: { client: '', jobNumber: '' },
  phases: ALL_PHASES,
  global: defaultGlobal,
  customItems: [],
  fieldNotes: '',
  summaryNotes: '',
  estimatorNotes: '',
  clientNote: '',
  estimateOverrides: [],
  signature: null,
  signedAt: null,
  signedBy: null,
  depositType: 'pct',
  depositValue: 50,
});

describe('Estimate data isolation', () => {
  it('opens first estimate with clean state', () => {
    let state = baseState();
    state = setActiveOpportunity(state, 'opp-1');
    expect(state.activeOpportunityId).toBe('opp-1');
    expect(state.jobInfo.client).toBe('');
    expect(state.fieldNotes).toBe('');
  });

  it('saves data to opp-1 snapshot when switching to opp-2', () => {
    let state = baseState();
    state = setActiveOpportunity(state, 'opp-1');
    // Simulate user entering data for Remodel
    state = { ...state, jobInfo: { client: 'Smith Family', jobNumber: 'HP-2026-001' }, fieldNotes: 'Full kitchen remodel' };
    // Switch to Bath estimate
    state = setActiveOpportunity(state, 'opp-2');
    // opp-1 should now have its snapshot saved
    const opp1 = state.opportunities.find(o => o.id === 'opp-1');
    expect(opp1?.estimateSnapshot?.jobInfo.client).toBe('Smith Family');
    expect(opp1?.estimateSnapshot?.fieldNotes).toBe('Full kitchen remodel');
  });

  it('opp-2 opens with clean state (no bleed from opp-1)', () => {
    let state = baseState();
    state = setActiveOpportunity(state, 'opp-1');
    state = { ...state, jobInfo: { client: 'Smith Family', jobNumber: 'HP-2026-001' }, fieldNotes: 'Full kitchen remodel' };
    state = setActiveOpportunity(state, 'opp-2');
    // Bath should start clean
    expect(state.jobInfo.client).toBe('');
    expect(state.fieldNotes).toBe('');
    expect(state.activeOpportunityId).toBe('opp-2');
  });

  it('switching back to opp-1 restores its saved data', () => {
    let state = baseState();
    // Open Remodel, enter data
    state = setActiveOpportunity(state, 'opp-1');
    state = { ...state, jobInfo: { client: 'Smith Family', jobNumber: 'HP-2026-001' }, fieldNotes: 'Full kitchen remodel' };
    // Switch to Bath, enter different data
    state = setActiveOpportunity(state, 'opp-2');
    state = { ...state, jobInfo: { client: 'Jones Family', jobNumber: 'HP-2026-002' }, fieldNotes: 'Master bath tile' };
    // Switch back to Remodel
    state = setActiveOpportunity(state, 'opp-1');
    expect(state.jobInfo.client).toBe('Smith Family');
    expect(state.fieldNotes).toBe('Full kitchen remodel');
  });

  it('opp-2 data is preserved when switching back to opp-1 and then back to opp-2', () => {
    let state = baseState();
    state = setActiveOpportunity(state, 'opp-1');
    state = { ...state, jobInfo: { client: 'Smith Family', jobNumber: 'HP-2026-001' }, fieldNotes: 'Full kitchen remodel' };
    state = setActiveOpportunity(state, 'opp-2');
    state = { ...state, jobInfo: { client: 'Jones Family', jobNumber: 'HP-2026-002' }, fieldNotes: 'Master bath tile' };
    state = setActiveOpportunity(state, 'opp-1');
    state = setActiveOpportunity(state, 'opp-2');
    expect(state.jobInfo.client).toBe('Jones Family');
    expect(state.fieldNotes).toBe('Master bath tile');
  });

  it('deposit settings are isolated per opportunity', () => {
    let state = baseState();
    state = setActiveOpportunity(state, 'opp-1');
    state = { ...state, depositType: 'flat', depositValue: 1500 };
    state = setActiveOpportunity(state, 'opp-2');
    // opp-2 should have default deposit
    expect(state.depositType).toBe('pct');
    expect(state.depositValue).toBe(50);
    // Switch back to opp-1
    state = setActiveOpportunity(state, 'opp-1');
    expect(state.depositType).toBe('flat');
    expect(state.depositValue).toBe(1500);
  });

  it('signature is isolated per opportunity', () => {
    let state = baseState();
    state = setActiveOpportunity(state, 'opp-1');
    state = { ...state, signature: 'data:image/png;base64,abc123', signedBy: 'John Smith', signedAt: '2026-04-06T12:00:00Z' };
    state = setActiveOpportunity(state, 'opp-2');
    expect(state.signature).toBeNull();
    expect(state.signedBy).toBeNull();
  });
});
