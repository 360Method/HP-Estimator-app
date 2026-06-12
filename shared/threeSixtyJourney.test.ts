import { describe, expect, it } from 'vitest';
import { deriveJourney, type JourneyInput } from './threeSixtyJourney';

const DAY = 24 * 60 * 60 * 1000;
/** A fixed "now": June 12, 2026 (summer). */
const NOW = new Date(2026, 5, 12).getTime();
const SPRING_NOW = new Date(2026, 3, 10).getTime();

function baseInput(overrides: Partial<JourneyInput> = {}): JourneyInput {
  return {
    membership: {
      tier: 'silver',
      status: 'active',
      startDate: NOW - 30 * DAY,
      annualScanCompleted: false,
      annualScanDate: null,
      laborBankBalance: 30000,
    },
    scans: [],
    workOrders: [],
    visits: [],
    propertySystemsCount: 0,
    opportunities: [],
    laborBankTxnCount: 0,
    now: NOW,
    ...overrides,
  };
}

function stepStatus(state: ReturnType<typeof deriveJourney>, key: string) {
  return state.steps.find(s => s.key === key)!.status;
}

describe('deriveJourney', () => {
  it('fresh enrollment: Baseline is current, advance steps wait for year two', () => {
    const state = deriveJourney(baseInput());
    expect(state.currentStepKey).toBe('baseline');
    expect(state.phase).toBe('aware');
    expect(stepStatus(state, 'baseline')).toBe('not_yet');
    expect(stepStatus(state, 'track')).toBe('not_yet');
    expect(stepStatus(state, 'preserve')).toBe('waiting_year_two');
    expect(stepStatus(state, 'upgrade')).toBe('waiting_year_two');
    expect(stepStatus(state, 'scale')).toBe('waiting_year_two');
    expect(state.membershipYear).toBe(1);
  });

  it('baseline work order scheduled means Baseline is in progress', () => {
    const state = deriveJourney(
      baseInput({
        workOrders: [
          { type: 'baseline_scan', status: 'scheduled', visitYear: 2026, scheduledDate: NOW + 3 * DAY, completedDate: null, hpOpportunityId: null },
        ],
      }),
    );
    expect(stepStatus(state, 'baseline')).toBe('in_progress');
    expect(state.currentStepKey).toBe('baseline');
  });

  it('delivered scan plus systems on record means Baseline is done and Track activates', () => {
    const state = deriveJourney(
      baseInput({
        scans: [
          { status: 'delivered', scanDate: NOW - 10 * DAY, sentToPortalAt: NOW - 9 * DAY, hasRecommendations: true, findingsCount: 12, healthScore: 78 },
        ],
        propertySystemsCount: 10,
        laborBankTxnCount: 1,
      }),
    );
    expect(stepStatus(state, 'baseline')).toBe('done');
    expect(state.steps.find(s => s.key === 'baseline')!.detail).toContain('10 systems');
    expect(stepStatus(state, 'track')).toBe('done');
    expect(stepStatus(state, 'prioritize')).toBe('done');
    expect(state.activeStepKeys).toContain('track');
  });

  it('seasonal cycle: summer visit completed = Inspect done this season', () => {
    const state = deriveJourney(
      baseInput({
        scans: [
          { status: 'delivered', scanDate: NOW - 60 * DAY, sentToPortalAt: NOW - 59 * DAY, hasRecommendations: true, findingsCount: 8, healthScore: 80 },
        ],
        workOrders: [
          { type: 'summer', status: 'completed', visitYear: 2026, scheduledDate: NOW - 5 * DAY, completedDate: NOW - 5 * DAY, hpOpportunityId: null },
        ],
      }),
    );
    expect(stepStatus(state, 'inspect')).toBe('done_this_season');
    expect(stepStatus(state, 'execute')).toBe('done_this_season');
  });

  it('Essential tier in summer: Inspect is not included, cycle moves on', () => {
    const state = deriveJourney(
      baseInput({
        membership: { tier: 'bronze', status: 'active', startDate: NOW - 30 * DAY, annualScanCompleted: false, annualScanDate: null, laborBankBalance: 0 },
        scans: [
          { status: 'delivered', scanDate: NOW - 20 * DAY, sentToPortalAt: NOW - 19 * DAY, hasRecommendations: true, findingsCount: 5, healthScore: 72 },
        ],
      }),
    );
    expect(stepStatus(state, 'inspect')).toBe('not_included');
    expect(state.currentStepKey).not.toBe('inspect');
  });

  it('Essential tier in spring: Inspect is included and due', () => {
    const state = deriveJourney(
      baseInput({
        membership: { tier: 'bronze', status: 'active', startDate: SPRING_NOW - 30 * DAY, annualScanCompleted: false, annualScanDate: null, laborBankBalance: 0 },
        scans: [
          { status: 'delivered', scanDate: SPRING_NOW - 20 * DAY, sentToPortalAt: SPRING_NOW - 19 * DAY, hasRecommendations: true, findingsCount: 5, healthScore: 72 },
        ],
        now: SPRING_NOW,
      }),
    );
    expect(stepStatus(state, 'inspect')).toBe('due_this_season');
    expect(state.currentStepKey).toBe('inspect');
  });

  it('Prioritize: recommendations built but not delivered = in progress; sentToPortalAt flips it done', () => {
    const notSent = deriveJourney(
      baseInput({
        scans: [
          { status: 'completed', scanDate: NOW - 2 * DAY, sentToPortalAt: null, hasRecommendations: true, findingsCount: 9, healthScore: 70 },
        ],
        workOrders: [
          { type: 'summer', status: 'completed', visitYear: 2026, scheduledDate: null, completedDate: NOW - 2 * DAY, hpOpportunityId: null },
        ],
      }),
    );
    expect(stepStatus(notSent, 'prioritize')).toBe('in_progress');
    expect(notSent.currentStepKey).toBe('prioritize');

    const sent = deriveJourney(
      baseInput({
        scans: [
          { status: 'completed', scanDate: NOW - 2 * DAY, sentToPortalAt: NOW - DAY, hasRecommendations: true, findingsCount: 9, healthScore: 70 },
        ],
      }),
    );
    expect(stepStatus(sent, 'prioritize')).toBe('done');
  });

  it('Schedule: roadmap delivered but nothing on the calendar = due this season', () => {
    const state = deriveJourney(
      baseInput({
        scans: [
          { status: 'delivered', scanDate: NOW - 10 * DAY, sentToPortalAt: NOW - 9 * DAY, hasRecommendations: true, findingsCount: 6, healthScore: 75 },
        ],
        // Inspect done this season so the headline falls to Schedule.
        visits: [{ season: 'summer', status: 'completed', visitYear: 2026 }],
      }),
    );
    expect(stepStatus(state, 'schedule')).toBe('due_this_season');
    expect(state.currentStepKey).toBe('schedule');
  });

  it('Execute: work order in progress = in progress and headline', () => {
    const state = deriveJourney(
      baseInput({
        scans: [
          { status: 'delivered', scanDate: NOW - 10 * DAY, sentToPortalAt: NOW - 9 * DAY, hasRecommendations: true, findingsCount: 6, healthScore: 75 },
        ],
        workOrders: [
          { type: 'summer', status: 'in_progress', visitYear: 2026, scheduledDate: NOW - DAY, completedDate: null, hpOpportunityId: 'opp1' },
          { type: 'summer', status: 'completed', visitYear: 2026, scheduledDate: NOW - 10 * DAY, completedDate: NOW - 10 * DAY, hpOpportunityId: null },
        ],
      }),
    );
    expect(stepStatus(state, 'execute')).toBe('done_this_season');
    const inProgress = deriveJourney(
      baseInput({
        scans: [
          { status: 'delivered', scanDate: NOW - 10 * DAY, sentToPortalAt: NOW - 9 * DAY, hasRecommendations: true, findingsCount: 6, healthScore: 75 },
        ],
        visits: [{ season: 'summer', status: 'completed', visitYear: 2026 }],
        opportunities: [
          { area: 'job', stage: 'In Progress', value: 1800, scheduledDate: null },
        ],
      }),
    );
    expect(stepStatus(inProgress, 'execute')).toBe('in_progress');
    expect(inProgress.currentStepKey).toBe('execute');
  });

  it('year two boundary flips the Advance gating at 12 months', () => {
    const elevenMonths = deriveJourney(
      baseInput({
        membership: { tier: 'gold', status: 'active', startDate: NOW - 335 * DAY, annualScanCompleted: false, annualScanDate: null, laborBankBalance: 60000 },
      }),
    );
    expect(stepStatus(elevenMonths, 'preserve')).toBe('waiting_year_two');
    expect(elevenMonths.membershipYear).toBe(1);

    const thirteenMonths = deriveJourney(
      baseInput({
        membership: { tier: 'gold', status: 'active', startDate: NOW - 396 * DAY, annualScanCompleted: false, annualScanDate: null, laborBankBalance: 60000 },
        scans: [
          { status: 'delivered', scanDate: NOW - 300 * DAY, sentToPortalAt: NOW - 299 * DAY, hasRecommendations: true, findingsCount: 10, healthScore: 82 },
        ],
        workOrders: [
          { type: 'summer', status: 'completed', visitYear: 2026, scheduledDate: null, completedDate: NOW - 3 * DAY, hpOpportunityId: null },
        ],
      }),
    );
    expect(thirteenMonths.membershipYear).toBe(2);
    expect(stepStatus(thirteenMonths, 'preserve')).not.toBe('waiting_year_two');
    expect(stepStatus(thirteenMonths, 'scale')).toBe('in_progress');
    expect(['preserve', 'upgrade', 'scale']).toContain(thirteenMonths.currentStepKey);
  });

  it('Scale: current annual review with a Home Score reads done', () => {
    const state = deriveJourney(
      baseInput({
        membership: { tier: 'gold', status: 'active', startDate: NOW - 400 * DAY, annualScanCompleted: true, annualScanDate: NOW - 30 * DAY, laborBankBalance: 0 },
        scans: [
          { status: 'delivered', scanDate: NOW - 30 * DAY, sentToPortalAt: NOW - 29 * DAY, hasRecommendations: true, findingsCount: 4, healthScore: 88 },
        ],
        workOrders: [
          { type: 'spring', status: 'completed', visitYear: 2026, scheduledDate: null, completedDate: NOW - 60 * DAY, hpOpportunityId: null },
          { type: 'summer', status: 'completed', visitYear: 2026, scheduledDate: null, completedDate: NOW - 3 * DAY, hpOpportunityId: null },
        ],
      }),
    );
    expect(stepStatus(state, 'scale')).toBe('done');
    expect(state.steps.find(s => s.key === 'scale')!.detail).toContain('88');
  });

  it('Upgrade: an open improvement estimate over the floor reads in progress', () => {
    const state = deriveJourney(
      baseInput({
        opportunities: [{ area: 'estimate', stage: 'Sent', value: 8200, scheduledDate: null }],
      }),
    );
    expect(stepStatus(state, 'upgrade')).toBe('in_progress');
  });

  it('legacy visit rows count when no work orders exist', () => {
    const state = deriveJourney(
      baseInput({
        scans: [
          { status: 'delivered', scanDate: NOW - 40 * DAY, sentToPortalAt: NOW - 39 * DAY, hasRecommendations: true, findingsCount: 7, healthScore: 76 },
        ],
        visits: [{ season: 'summer', status: 'completed', visitYear: 2026 }],
      }),
    );
    expect(stepStatus(state, 'inspect')).toBe('done_this_season');
    expect(state.valueDelivered.visitsCompleted).toBe(1);
  });

  it('non-member with nothing on file: Inspect is the front door, Advance gated by membership', () => {
    const state = deriveJourney(baseInput({ membership: null }));
    expect(state.currentStepKey).toBe('inspect');
    expect(state.membershipStatus).toBe('none');
    expect(state.membershipYear).toBe(0);
    expect(stepStatus(state, 'inspect')).toBe('not_yet');
    expect(stepStatus(state, 'preserve')).toBe('not_included');
    expect(stepStatus(state, 'scale')).toBe('not_included');
    expect(stepStatus(state, 'upgrade')).toBe('not_yet');
    expect(state.valueDelivered.laborBankBalanceCents).toBe(0);
  });

  it('non-member spot inspection drives Inspect, Prioritize, then Schedule', () => {
    const inFlight = deriveJourney(
      baseInput({
        membership: null,
        spotInspections: [{ status: 'awaiting_review', createdAt: NOW - DAY }],
      }),
    );
    expect(stepStatus(inFlight, 'inspect')).toBe('in_progress');
    expect(inFlight.currentStepKey).toBe('inspect');

    const delivered = deriveJourney(
      baseInput({
        membership: null,
        spotInspections: [{ status: 'completed', createdAt: NOW - DAY }],
      }),
    );
    expect(stepStatus(delivered, 'inspect')).toBe('done');
    expect(stepStatus(delivered, 'prioritize')).toBe('done');
    expect(delivered.currentStepKey).toBe('schedule');
    expect(delivered.valueDelivered.visitsCompleted).toBe(1);
  });

  it('non-member remodel estimate puts Upgrade in play', () => {
    const state = deriveJourney(
      baseInput({
        membership: null,
        opportunities: [{ area: 'estimate', stage: 'Sent', value: 12000, scheduledDate: null }],
      }),
    );
    expect(stepStatus(state, 'upgrade')).toBe('in_progress');
    expect(state.currentStepKey).toBe('upgrade');
  });

  it('member spot inspection counts toward the record and the roadmap', () => {
    const state = deriveJourney(
      baseInput({
        spotInspections: [{ status: 'completed', createdAt: NOW - 2 * DAY }],
      }),
    );
    expect(stepStatus(state, 'prioritize')).toBe('done');
    expect(stepStatus(state, 'track')).toBe('done');
  });

  it('reports membership status and value delivered', () => {
    const state = deriveJourney(
      baseInput({
        membership: { tier: 'silver', status: 'paused', startDate: NOW - 90 * DAY, annualScanCompleted: false, annualScanDate: null, laborBankBalance: 12300 },
        scans: [
          { status: 'delivered', scanDate: NOW - 80 * DAY, sentToPortalAt: NOW - 79 * DAY, hasRecommendations: true, findingsCount: 11, healthScore: 69 },
        ],
        workOrders: [
          { type: 'baseline_scan', status: 'completed', visitYear: 2026, scheduledDate: null, completedDate: NOW - 80 * DAY, hpOpportunityId: null },
          { type: 'spring', status: 'completed', visitYear: 2026, scheduledDate: null, completedDate: NOW - 50 * DAY, hpOpportunityId: null },
        ],
        opportunities: [{ area: 'job', stage: 'Completed', value: 950, scheduledDate: null }],
      }),
    );
    expect(state.membershipStatus).toBe('paused');
    expect(state.valueDelivered).toEqual({
      visitsCompleted: 1,
      findingsLogged: 11,
      healthScore: 69,
      laborBankBalanceCents: 12300,
      jobsCompleted: 1,
    });
  });
});
