/**
 * 360 Method journey engine.
 *
 * Pure derivation: given a membership and the records that already exist
 * (scans, work orders, visits, property systems, linked opportunities, labor
 * bank activity), compute where the member sits in the 9-step 360 Method and
 * what value has been delivered so far. No database access, fully unit tested.
 *
 * Derived beats manually set: the step shown in the app always comes from
 * what actually happened. If field reality ever disagrees with the rules
 * here, the escape hatch is a nullable journeyStepOverride column on
 * threeSixtyMemberships (not built yet; add a migration if it proves needed).
 */
import {
  THREE_SIXTY_METHOD_STEPS,
  currentSeason,
  nextSeasonStart,
  SEASON_LABELS,
  type ThreeSixtySeason,
  type ThreeSixtyStepKey,
  type ThreeSixtyPhaseId,
} from './threeSixtyMethod';
import { TIER_DEFINITIONS, type MemberTier } from './threeSixtyTiers';

export type JourneyStepStatus =
  | 'not_yet'
  | 'in_progress'
  | 'done'
  | 'due_this_season'
  | 'done_this_season'
  | 'waiting_year_two'
  | 'not_included';

export interface JourneyStepState {
  key: ThreeSixtyStepKey;
  status: JourneyStepStatus;
  /** One short line of evidence-backed detail, safe for any audience. */
  detail: string;
}

export interface JourneyValueDelivered {
  visitsCompleted: number;
  findingsLogged: number;
  healthScore: number | null;
  laborBankBalanceCents: number;
  jobsCompleted: number;
}

export interface JourneyState {
  steps: JourneyStepState[];
  /** The single headline step staff should be working. */
  currentStepKey: ThreeSixtyStepKey;
  /** Steps active right now (Track usually rides along once the baseline exists). */
  activeStepKeys: ThreeSixtyStepKey[];
  phase: ThreeSixtyPhaseId;
  season: ThreeSixtySeason;
  /** Membership year, 1-based. */
  membershipYear: number;
  valueDelivered: JourneyValueDelivered;
  membershipStatus: 'active' | 'paused' | 'cancelled' | 'none';
}

export interface JourneyInput {
  /**
   * Null for customers who are not members. The nine steps are the framework
   * for EVERY customer; membership only changes which signals exist (no
   * seasonal work orders, no labor bank) and gates the Advance phase.
   */
  membership: {
    tier: MemberTier;
    status: 'active' | 'paused' | 'cancelled';
    /** Unix ms */
    startDate: number;
    annualScanCompleted: boolean;
    /** Unix ms */
    annualScanDate: number | null;
    laborBankBalance: number;
  } | null;
  scans: {
    status: 'draft' | 'completed' | 'delivered';
    /** Unix ms */
    scanDate: number;
    sentToPortalAt: number | null;
    hasRecommendations: boolean;
    findingsCount: number;
    healthScore: number | null;
  }[];
  workOrders: {
    type: 'baseline_scan' | 'spring' | 'summer' | 'fall' | 'winter' | string;
    status: 'open' | 'scheduled' | 'in_progress' | 'completed' | 'skipped' | string;
    visitYear: number | null;
    /** Unix ms */
    scheduledDate: number | null;
    completedDate: number | null;
    hpOpportunityId: string | null;
  }[];
  /** Legacy seasonal visit rows; counted when work orders are absent. */
  visits: {
    season: ThreeSixtySeason | string;
    status: 'scheduled' | 'completed' | 'skipped' | string;
    visitYear: number;
  }[];
  propertySystemsCount: number;
  /** Opportunities linked to this membership. */
  opportunities: {
    area: string | null;
    stage: string | null;
    /** Dollars in live flows. */
    value: number | null;
    /** Unix ms */
    scheduledDate: number | null;
    archived?: boolean;
  }[];
  laborBankTxnCount: number;
  /** Spot inspections (any customer). completed = mini roadmap delivered. */
  spotInspections?: {
    status: 'submitted' | 'processing' | 'awaiting_review' | 'completed' | 'failed' | string;
    /** Unix ms */
    createdAt: number;
  }[];
  /** Unix ms; defaults to Date.now(). */
  now?: number;
}

const MS_PER_YEAR = 365.25 * 24 * 60 * 60 * 1000;

/** Membership-linked improvement work at or above this value counts toward Upgrade. */
const UPGRADE_VALUE_FLOOR_DOLLARS = 2500;

const JOB_DONE_STAGES = ['completed', 'invoice sent', 'invoice paid'];
const JOB_OPEN_STAGES = ['scheduled', 'in progress', 'awaiting sign-off'];
const ESTIMATE_OPEN_STAGES = ['sent', 'ready to send', 'verbal acceptance', 'approved'];

function norm(value: unknown): string {
  return String(value ?? '').toLowerCase();
}

export function deriveJourney(input: JourneyInput): JourneyState {
  const now = input.now ?? Date.now();
  const nowDate = new Date(now);
  const season = currentSeason(nowDate);
  const year = nowDate.getFullYear();
  const { membership } = input;
  const isMember = membership != null;
  const membershipYear = isMember
    ? Math.max(1, Math.floor((now - membership.startDate) / MS_PER_YEAR) + 1)
    : 0;
  const yearTwoReached = isMember && now - membership.startDate >= MS_PER_YEAR;
  const tierSeasons = isMember
    ? (TIER_DEFINITIONS[membership.tier]?.seasons ?? []).map(s => s.toLowerCase())
    : [];
  const opportunities = input.opportunities.filter(o => !o.archived);
  const spots = input.spotInspections ?? [];
  const spotsDelivered = spots.filter(s => norm(s.status) === 'completed');
  const spotsInFlight = spots.filter(s =>
    ['submitted', 'processing', 'awaiting_review'].includes(norm(s.status)),
  );

  // ── Shared evidence ────────────────────────────────────────────────────────
  const baselineWO = input.workOrders.filter(wo => norm(wo.type) === 'baseline_scan');
  const baselineDone =
    input.scans.some(s => s.status === 'completed' || s.status === 'delivered') ||
    baselineWO.some(wo => norm(wo.status) === 'completed');
  const baselineInProgress =
    !baselineDone &&
    (baselineWO.some(wo => ['scheduled', 'in_progress'].includes(norm(wo.status))) ||
      input.scans.some(s => s.status === 'draft'));

  const seasonWOs = input.workOrders.filter(
    wo => norm(wo.type) === season && (wo.visitYear == null || wo.visitYear === year),
  );
  const seasonVisitRows = input.visits.filter(v => norm(v.season) === season && v.visitYear === year);
  const seasonInspectDone =
    seasonWOs.some(wo => norm(wo.status) === 'completed') ||
    seasonVisitRows.some(v => norm(v.status) === 'completed');
  const seasonInspectInProgress =
    seasonWOs.some(wo => ['scheduled', 'in_progress'].includes(norm(wo.status))) ||
    seasonVisitRows.some(v => norm(v.status) === 'scheduled');
  const seasonIncluded = tierSeasons.includes(season);

  const completedWOs = input.workOrders.filter(wo => norm(wo.status) === 'completed');
  const completedVisits = input.visits.filter(v => norm(v.status) === 'completed');
  const completedJobs = opportunities.filter(
    o => norm(o.area) === 'job' && JOB_DONE_STAGES.includes(norm(o.stage)),
  );
  const trackEvents =
    completedWOs.length +
    completedVisits.length +
    input.laborBankTxnCount +
    opportunities.length +
    spotsDelivered.length;

  const latestScan = [...input.scans].sort((a, b) => b.scanDate - a.scanDate)[0] ?? null;
  // A delivered spot inspection mini roadmap IS a delivered roadmap.
  const roadmapDelivered =
    spotsDelivered.length > 0 ||
    (latestScan != null &&
      latestScan.hasRecommendations &&
      (latestScan.status === 'delivered' || latestScan.sentToPortalAt != null));
  const roadmapInProgress =
    !roadmapDelivered &&
    (spotsInFlight.length > 0 ||
      input.scans.some(s => s.hasRecommendations || s.status === 'completed'));

  const futureScheduledWO = input.workOrders
    .filter(wo => wo.scheduledDate != null && wo.scheduledDate > now && norm(wo.status) !== 'skipped')
    .sort((a, b) => (a.scheduledDate ?? 0) - (b.scheduledDate ?? 0))[0];
  const futureScheduledOpp = opportunities
    .filter(o => o.scheduledDate != null && o.scheduledDate > now)
    .sort((a, b) => (a.scheduledDate ?? 0) - (b.scheduledDate ?? 0))[0];
  const nextScheduledMs = Math.min(
    futureScheduledWO?.scheduledDate ?? Infinity,
    futureScheduledOpp?.scheduledDate ?? Infinity,
  );
  const seasonCoveredOnCalendar =
    seasonInspectDone ||
    seasonWOs.some(wo => ['scheduled', 'in_progress', 'completed'].includes(norm(wo.status)));

  const executedThisYear =
    completedWOs.some(wo => wo.visitYear === year || (wo.completedDate != null && new Date(wo.completedDate).getFullYear() === year)) ||
    completedJobs.length > 0;
  const executeInProgress =
    input.workOrders.some(wo => norm(wo.status) === 'in_progress') ||
    opportunities.some(o => norm(o.area) === 'job' && JOB_OPEN_STAGES.includes(norm(o.stage)));

  const improvementOpps = opportunities.filter(o => (o.value ?? 0) >= UPGRADE_VALUE_FLOOR_DOLLARS);
  const upgradeWon = improvementOpps.some(o => JOB_DONE_STAGES.includes(norm(o.stage)) || norm(o.area) === 'job');
  const upgradeOpen = improvementOpps.some(o => ESTIMATE_OPEN_STAGES.includes(norm(o.stage)));

  const annualReviewCurrent =
    isMember &&
    membership.annualScanCompleted &&
    membership.annualScanDate != null &&
    now - membership.annualScanDate < MS_PER_YEAR;

  const findingsLogged = input.scans.reduce((sum, s) => sum + s.findingsCount, 0);
  const healthScore = latestScan?.healthScore ?? null;
  const nextSeasonLabel = SEASON_LABELS[currentSeason(nextSeasonStart(nowDate))];
  const nextSeasonDate = nextSeasonStart(nowDate).toLocaleDateString('en-US', { month: 'long', day: 'numeric' });

  // ── Per-step states ────────────────────────────────────────────────────────
  const stepStates: Record<ThreeSixtyStepKey, JourneyStepState> = {
    baseline: baselineDone
      ? {
          key: 'baseline',
          status: 'done',
          detail:
            input.propertySystemsCount > 0
              ? `Baseline complete with ${input.propertySystemsCount} systems on record.`
              : 'Baseline complete.',
        }
      : baselineInProgress
        ? { key: 'baseline', status: 'in_progress', detail: 'Baseline walkthrough is scheduled or underway.' }
        : isMember
          ? { key: 'baseline', status: 'not_yet', detail: 'Baseline walkthrough has not happened yet.' }
          : { key: 'baseline', status: 'not_yet', detail: 'The full baseline comes with membership or a standalone walkthrough.' },

    inspect: !isMember
      ? spotsDelivered.length > 0
        ? {
            key: 'inspect',
            status: 'done',
            detail: `${spotsDelivered.length} spot inspection${spotsDelivered.length === 1 ? '' : 's'} on record.`,
          }
        : spotsInFlight.length > 0
          ? { key: 'inspect', status: 'in_progress', detail: 'A spot inspection is in progress.' }
          : { key: 'inspect', status: 'not_yet', detail: 'Every request starts with a look. Run a spot inspection.' }
      : !seasonIncluded
        ? {
            key: 'inspect',
            status: 'not_included',
            detail: `${SEASON_LABELS[season]} visits are not part of this plan. Next included season is covered.`,
          }
        : seasonInspectDone
          ? { key: 'inspect', status: 'done_this_season', detail: `${SEASON_LABELS[season]} walkthrough is complete.` }
          : seasonInspectInProgress
            ? { key: 'inspect', status: 'in_progress', detail: `${SEASON_LABELS[season]} walkthrough is on the calendar.` }
            : { key: 'inspect', status: 'due_this_season', detail: `${SEASON_LABELS[season]} walkthrough still needs a date.` },

    track: trackEvents > 0
      ? { key: 'track', status: 'done', detail: `${trackEvents} events on the home record.` }
      : baselineDone || spotsDelivered.length > 0
        ? { key: 'track', status: 'in_progress', detail: 'Record is open and waiting for its first entries.' }
        : { key: 'track', status: 'not_yet', detail: 'The record starts with the first visit.' },

    prioritize: roadmapDelivered
      ? { key: 'prioritize', status: 'done', detail: 'Priority roadmap is delivered and current.' }
      : roadmapInProgress
        ? { key: 'prioritize', status: 'in_progress', detail: 'Findings are in, the roadmap is being prepared.' }
        : { key: 'prioritize', status: 'not_yet', detail: 'No findings to prioritize yet.' },

    schedule: nextScheduledMs !== Infinity
      ? {
          key: 'schedule',
          status: 'in_progress',
          detail: `Next visit ${new Date(nextScheduledMs).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}.`,
        }
      : executedThisYear || executeInProgress
        ? { key: 'schedule', status: 'done_this_season', detail: `${SEASON_LABELS[season]} work made it onto the calendar.` }
        : roadmapDelivered
          ? { key: 'schedule', status: 'due_this_season', detail: 'Roadmap is ready but nothing is on the calendar.' }
          : seasonCoveredOnCalendar
            ? { key: 'schedule', status: 'done_this_season', detail: `${SEASON_LABELS[season]} visit is handled.` }
            : { key: 'schedule', status: 'not_yet', detail: 'Scheduling starts once the roadmap is set.' },

    execute: executedThisYear
      ? { key: 'execute', status: 'done_this_season', detail: 'Work completed this year in priority order.' }
      : executeInProgress
        ? { key: 'execute', status: 'in_progress', detail: 'Work is underway.' }
        : { key: 'execute', status: 'not_yet', detail: 'No roadmap work has started yet.' },

    preserve: !isMember
      ? { key: 'preserve', status: 'not_included', detail: 'Preservation routines open with a Proactive Path membership.' }
      : !yearTwoReached
        ? { key: 'preserve', status: 'waiting_year_two', detail: 'Preservation routines begin in year two.' }
        : completedWOs.some(wo => wo.visitYear != null && wo.visitYear >= new Date(membership.startDate).getFullYear() + 1)
          ? { key: 'preserve', status: 'done', detail: 'Preservation routines are running.' }
          : { key: 'preserve', status: 'in_progress', detail: 'Year two has started. Time to propose life extension work.' },

    upgrade: upgradeWon
      ? { key: 'upgrade', status: 'done', detail: 'Improvement work has been delivered.' }
      : upgradeOpen
        ? { key: 'upgrade', status: 'in_progress', detail: 'An improvement option is on the table.' }
        : !isMember
          ? { key: 'upgrade', status: 'not_yet', detail: 'Remodel options can start any time.' }
          : !yearTwoReached
            ? { key: 'upgrade', status: 'waiting_year_two', detail: 'Upgrade conversations usually start in year two.' }
            : { key: 'upgrade', status: 'not_yet', detail: 'No improvement projects proposed yet.' },

    scale: !isMember
      ? { key: 'scale', status: 'not_included', detail: 'The Home Score and annual review open with membership.' }
      : !yearTwoReached
        ? { key: 'scale', status: 'waiting_year_two', detail: 'The first annual review lands in year two.' }
        : annualReviewCurrent && healthScore != null
          ? { key: 'scale', status: 'done', detail: `Annual review is current. Home Score ${healthScore}.` }
          : healthScore != null
            ? { key: 'scale', status: 'in_progress', detail: 'Home Score is on record. Annual review is due.' }
            : { key: 'scale', status: 'not_yet', detail: 'No Home Score on record yet.' },
  };

  // ── Headline step ──────────────────────────────────────────────────────────
  const currentStepKey: ThreeSixtyStepKey = (() => {
    if (!isMember) {
      // Non-member: the front door is the look, then the same working order.
      if (stepStates.upgrade.status === 'in_progress') return 'upgrade';
      if (spotsInFlight.length > 0) return 'inspect';
      if (!roadmapDelivered && roadmapInProgress) return 'prioritize';
      if (executeInProgress) return 'execute';
      if (roadmapDelivered && nextScheduledMs === Infinity && !executedThisYear) return 'schedule';
      if (spots.length === 0 && opportunities.length === 0) return 'inspect';
      return 'track';
    }
    if (!baselineDone) return 'baseline';
    // Seasonal cycle in working order for the current season.
    if (seasonIncluded && !seasonInspectDone) return 'inspect';
    if (!roadmapDelivered && roadmapInProgress) return 'prioritize';
    if (stepStates.schedule.status === 'due_this_season') return 'schedule';
    if (executeInProgress) return 'execute';
    if (roadmapDelivered && !executedThisYear && stepStates.execute.status !== 'not_yet') return 'execute';
    // Cycle is clear; year-two work or steady-state tracking.
    if (yearTwoReached) {
      if (stepStates.scale.status === 'in_progress') return 'scale';
      if (stepStates.upgrade.status === 'in_progress') return 'upgrade';
      if (stepStates.preserve.status !== 'done') return 'preserve';
      return 'scale';
    }
    return 'track';
  })();

  if (currentStepKey === 'track') {
    stepStates.track.detail = isMember
      ? `Holding steady. ${nextSeasonLabel} season starts ${nextSeasonDate}.`
      : 'Record is open. The next request starts with a look.';
  }

  const activeStepKeys: ThreeSixtyStepKey[] = [currentStepKey];
  if ((baselineDone || spotsDelivered.length > 0) && currentStepKey !== 'track') activeStepKeys.push('track');

  const phase = THREE_SIXTY_METHOD_STEPS.find(s => s.key === currentStepKey)!.phase;

  return {
    steps: THREE_SIXTY_METHOD_STEPS.map(s => stepStates[s.key]),
    currentStepKey,
    activeStepKeys,
    phase,
    season,
    membershipYear,
    valueDelivered: {
      visitsCompleted:
        completedWOs.filter(wo => norm(wo.type) !== 'baseline_scan').length +
        completedVisits.length +
        spotsDelivered.length,
      findingsLogged,
      healthScore,
      laborBankBalanceCents: membership?.laborBankBalance ?? 0,
      jobsCompleted: completedJobs.length,
    },
    membershipStatus: membership?.status ?? 'none',
  };
}
