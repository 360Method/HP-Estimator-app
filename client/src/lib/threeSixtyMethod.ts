export type ThreeSixtyPhaseId = 'aware' | 'act' | 'advance';

export type ThreeSixtyOperatorRole =
  | 'Lead Desk'
  | 'Consultant Desk'
  | 'PM Desk'
  | 'Field Desk'
  | 'Closeout Desk'
  | 'Retainment Desk'
  | 'Integrator'
  | 'CFO Intelligence';

export interface ThreeSixtyMethodStep {
  number: number;
  key: ThreeSixtyStepKey;
  phase: ThreeSixtyPhaseId;
  name: string;
  customerLabel: string;
  operatorOutcome: string;
  customerOutcome: string;
  owner: ThreeSixtyOperatorRole;
  aiSupport: string;
}

export type ThreeSixtyStepKey =
  | 'baseline'
  | 'inspect'
  | 'prioritize'
  | 'scope_price_approve'
  | 'schedule'
  | 'execute'
  | 'preserve'
  | 'upgrade'
  | 'cfo_intelligence';

export interface ThreeSixtyPhase {
  id: ThreeSixtyPhaseId;
  name: string;
  promise: string;
  steps: ThreeSixtyMethodStep[];
}

export const THREE_SIXTY_METHOD_STEPS: ThreeSixtyMethodStep[] = [
  {
    number: 1,
    key: 'baseline',
    phase: 'aware',
    name: 'Baseline',
    customerLabel: 'Home Baseline',
    operatorOutcome: 'Document systems, property condition, risk areas, photos, and homeowner goals.',
    customerOutcome: 'They understand what exists in the home and what needs attention.',
    owner: 'Consultant Desk',
    aiSupport: 'Pre-fill inspection prompts, detect missing systems, summarize property risks.',
  },
  {
    number: 2,
    key: 'inspect',
    phase: 'aware',
    name: 'Inspect',
    customerLabel: 'Seasonal Walkthrough',
    operatorOutcome: 'Run guided room, exterior, and system walkthroughs on a seasonal cadence.',
    customerOutcome: 'They get consistent eyes on the home before small issues become expensive.',
    owner: 'Field Desk',
    aiSupport: 'Generate seasonal checklists and flag abnormal findings by region and season.',
  },
  {
    number: 3,
    key: 'prioritize',
    phase: 'aware',
    name: 'Priority Roadmap',
    customerLabel: 'Priority Roadmap',
    operatorOutcome: 'Convert the baseline and condition log into NOW, SOON, and WAIT priorities with investment ranges.',
    customerOutcome: 'They know what matters now, what can wait, and how to make confident decisions.',
    owner: 'Consultant Desk',
    aiSupport: 'Rank findings, draft red/yellow/green priorities, and prepare the customer-facing roadmap.',
  },
  {
    number: 4,
    key: 'scope_price_approve',
    phase: 'act',
    name: 'Scope, Price, Approve',
    customerLabel: 'Approved Scope',
    operatorOutcome: 'Document exact scope, price work correctly, send the proposal, and secure customer approval.',
    customerOutcome: 'They see clear scope, investment, approval path, and what happens next.',
    owner: 'Consultant Desk',
    aiSupport: 'Audit scope clarity, pricing risk, missing exclusions, and customer proposal language.',
  },
  {
    number: 5,
    key: 'schedule',
    phase: 'act',
    name: 'Schedule',
    customerLabel: 'Care Calendar',
    operatorOutcome: 'Turn priorities into appointments, work orders, parts lists, and labor assignments.',
    customerOutcome: 'They see what is happening next with minimal coordination effort.',
    owner: 'PM Desk',
    aiSupport: 'Suggest appointment windows, bundle tasks, and prepare crew notes.',
  },
  {
    number: 6,
    key: 'execute',
    phase: 'act',
    name: 'Execute',
    customerLabel: 'Work Completed',
    operatorOutcome: 'Complete the work, capture proof, update labor bank, and close the work order.',
    customerOutcome: 'They receive finished work with clear proof and no mystery.',
    owner: 'Field Desk',
    aiSupport: 'Create completion summaries, photo captions, and follow-up recommendations.',
  },
  {
    number: 7,
    key: 'preserve',
    phase: 'advance',
    name: 'Preserve',
    customerLabel: 'Preventive Care',
    operatorOutcome: 'Maintain recurring tasks that extend system life and reduce emergency repairs.',
    customerOutcome: 'They feel the home is being actively protected.',
    owner: 'Retainment Desk',
    aiSupport: 'Watch due dates, seasonal needs, and skipped care patterns.',
  },
  {
    number: 8,
    key: 'upgrade',
    phase: 'advance',
    name: 'Upgrade',
    customerLabel: 'Smart Improvements',
    operatorOutcome: 'Identify larger improvements, ROI opportunities, and bundled project plans.',
    customerOutcome: 'They see a thoughtful path from maintenance into better living and asset value.',
    owner: 'Consultant Desk',
    aiSupport: 'Draft option sets, ROI notes, and proposal outlines for human review.',
  },
  {
    number: 9,
    key: 'cfo_intelligence',
    phase: 'advance',
    name: 'CFO Intelligence',
    customerLabel: 'Property Value Intelligence',
    operatorOutcome: 'Track maintenance history, investment, risk reduction, condition trends, and value-supporting documentation for this property.',
    customerOutcome: 'They have a practical ownership record that can support refinance, sale, insurance, planning, or wealth-building conversations with licensed professionals.',
    owner: 'CFO Intelligence',
    aiSupport: 'Summarize maintenance investment, avoided-risk notes, property health trends, documentation gaps, and non-advisory equity intelligence disclaimers.',
  },
];

export const THREE_SIXTY_METHOD_PHASES: ThreeSixtyPhase[] = [
  {
    id: 'aware',
    name: 'Aware',
    promise: 'Know the home before selling work.',
    steps: THREE_SIXTY_METHOD_STEPS.filter(step => step.phase === 'aware'),
  },
  {
    id: 'act',
    name: 'Act',
    promise: 'Turn findings into the right next action.',
    steps: THREE_SIXTY_METHOD_STEPS.filter(step => step.phase === 'act'),
  },
  {
    id: 'advance',
    name: 'Advance',
    promise: 'Preserve value and create the next opportunity.',
    steps: THREE_SIXTY_METHOD_STEPS.filter(step => step.phase === 'advance'),
  },
];

export const VANCOUVER_PNW_SEASONAL_FOCUS = [
  {
    season: 'Spring',
    focus: 'Drainage, gutters, exterior envelope, moss/algae, trip hazards, irrigation startup.',
  },
  {
    season: 'Summer',
    focus: 'Decks, fences, paint, exterior repairs, windows, airflow, outdoor living readiness.',
  },
  {
    season: 'Fall',
    focus: 'Roof line, gutters, weatherproofing, caulking, crawlspace moisture, storm readiness.',
  },
  {
    season: 'Winter',
    focus: 'Freeze risk, interior leaks, electrical safety, indoor repairs, planning larger spring projects.',
  },
];

export const THREE_SIXTY_OPERATOR_LADDER = [
  'One-off job or lead enters the customer profile.',
  'The work is assigned to a specific property and placed inside Aware, Act, or Advance.',
  'Findings become prioritized work, membership value, seasonal care, upgrades, or property intelligence.',
  'Completed work feeds the property history, score, labor bank, documents, and next recommendation.',
  'Retainment keeps the property inside the recurring care flywheel while CFO Intelligence tracks value-supporting history.',
];

export function getThreeSixtyStepByKey(key?: string | null) {
  const normalizedKey =
    key === 'scale' ? 'cfo_intelligence'
    : key === 'track' ? 'cfo_intelligence'
    : key === 'roadmap_execution' ? 'scope_price_approve'
    : key;
  return THREE_SIXTY_METHOD_STEPS.find(step => step.key === normalizedKey) ?? null;
}

export interface ThreeSixtyRoleResponsibility {
  role: ThreeSixtyOperatorRole;
  owns: string;
  humanResponsibilities: string[];
  aiResponsibilities: string[];
  reviewRequiredFor: string[];
}

export const THREE_SIXTY_ROLE_RESPONSIBILITIES: ThreeSixtyRoleResponsibility[] = [
  {
    role: 'Lead Desk',
    owns: 'Inbound request capture, qualification, first response, and clean handoff to the consultant.',
    humanResponsibilities: ['Call or text the customer', 'Confirm urgency, property, budget signals, and decision maker', 'Set the consultant up with a clear brief'],
    aiResponsibilities: ['Summarize intake', 'Suggest qualification questions', 'Draft first-touch messages and follow-ups'],
    reviewRequiredFor: ['Price expectations', 'Scheduling promises', 'Membership positioning if the customer is confused or skeptical'],
  },
  {
    role: 'Consultant Desk',
    owns: 'Baseline, inspection, priority planning, estimates, and upgrade guidance.',
    humanResponsibilities: ['Walk the property', 'Diagnose the request', 'Explain options as an expert guide', 'Approve estimates before sending'],
    aiResponsibilities: ['Prepare site brief', 'Draft option sets', 'Convert findings into red/yellow/green priorities'],
    reviewRequiredFor: ['Dollar figures', 'Scope', 'Timeline commitments', 'Upgrade ROI language'],
  },
  {
    role: 'PM Desk',
    owns: 'Scheduling, materials, crew handoff, and work-order readiness.',
    humanResponsibilities: ['Confirm schedule', 'Assign labor', 'Verify materials and access requirements', 'Resolve blockers before the visit'],
    aiResponsibilities: ['Bundle tasks', 'Draft crew notes', 'Flag missing materials or unclear scope'],
    reviewRequiredFor: ['Schedule changes', 'Material substitutions', 'Customer-impacting delays'],
  },
  {
    role: 'Field Desk',
    owns: 'On-site execution, proof capture, completion notes, and field issue escalation.',
    humanResponsibilities: ['Complete the work', 'Capture photos and notes', 'Report changes or new findings', 'Request sign-off when needed'],
    aiResponsibilities: ['Turn field notes into completion summaries', 'Suggest follow-up recommendations', 'Organize photo captions'],
    reviewRequiredFor: ['Change orders', 'Incomplete work explanations', 'Unexpected damage or safety concerns'],
  },
  {
    role: 'Closeout Desk',
    owns: 'Invoice readiness, payment follow-up, completion packet, and job financial close.',
    humanResponsibilities: ['Verify billable work', 'Send invoices', 'Handle payment questions', 'Close the job financially'],
    aiResponsibilities: ['Draft invoice notes', 'Check missing sign-off', 'Prepare payment reminders'],
    reviewRequiredFor: ['Invoices', 'Refunds', 'Discounts', 'Payment disputes'],
  },
  {
    role: 'Retainment Desk',
    owns: 'Membership conversion, seasonal rhythm, review requests, and return work.',
    humanResponsibilities: ['Position the 360 Method', 'Schedule recurring visits', 'Ask for reviews and referrals', 'Keep the property in the flywheel'],
    aiResponsibilities: ['Draft nurture sequences', 'Find next best recommendations', 'Summarize property history for the customer'],
    reviewRequiredFor: ['Membership enrollment', 'Cancellation saves', 'Sensitive customer experience follow-up'],
  },
  {
    role: 'CFO Intelligence',
    owns: 'Property-level maintenance investment history, condition trends, and value-supporting documentation.',
    humanResponsibilities: ['Review the property intelligence summary', 'Keep disclaimers clear', 'Help the customer understand what records exist'],
    aiResponsibilities: ['Summarize maintenance investment', 'Identify documentation gaps', 'Prepare non-advisory property record summaries'],
    reviewRequiredFor: ['Any language that could sound like financial, appraisal, tax, legal, or real estate advice'],
  },
];

export function getThreeSixtyRoleResponsibility(role: ThreeSixtyOperatorRole) {
  return THREE_SIXTY_ROLE_RESPONSIBILITIES.find(item => item.role === role) ?? null;
}

export function getCustomerFacingStepAction(step: ThreeSixtyMethodStep) {
  const map: Record<string, string> = {
    baseline: 'Review your home baseline and confirm the goals we should keep in mind.',
    inspect: 'Prepare for your walkthrough or review the findings from the visit.',
    prioritize: 'Review the priority roadmap and decide what should happen now, soon, or later.',
    scope_price_approve: 'Review the approved scope, proposal, and next step before work is scheduled.',
    schedule: 'Confirm the appointment window or message us if the timing needs to change.',
    execute: 'Follow the work progress and review completion proof when the job is done.',
    preserve: 'Stay current with seasonal maintenance that protects the home.',
    upgrade: 'Review smart improvement options with clear scope and pricing.',
    cfo_intelligence: 'Review the property record as a planning tool for qualified professionals.',
  };
  return map[step.key] ?? step.customerOutcome;
}

export function inferOpportunityThreeSixtyStep(opportunity: {
  area?: string;
  stage?: string;
  title?: string;
  notes?: string;
  membershipId?: number | null;
  threeSixtyStepKey?: string | null;
}) {
  const explicitStep = getThreeSixtyStepByKey(opportunity.threeSixtyStepKey);
  if (explicitStep) return explicitStep;

  const text = `${opportunity.title ?? ''} ${opportunity.notes ?? ''}`.toLowerCase();
  const isUpgrade = /\b(deck|remodel|renovation|upgrade|addition|kitchen|bathroom|flooring|window|door|paint|siding|outdoor living)\b/.test(text);
  const isRepair = /\b(repair|fix|touch[- ]?up|leak|damage|broken|replace|patch|caulk|rot|drywall|trim)\b/.test(text);

  if (opportunity.membershipId) {
    if (opportunity.area === 'job') return getThreeSixtyStepByKey('execute')!;
    if (opportunity.area === 'estimate') return getThreeSixtyStepByKey('scope_price_approve')!;
    return getThreeSixtyStepByKey('inspect')!;
  }

  if (opportunity.area === 'lead') {
    if (isUpgrade) return getThreeSixtyStepByKey('upgrade')!;
    if (isRepair) return getThreeSixtyStepByKey('inspect')!;
    return getThreeSixtyStepByKey('baseline')!;
  }
  if (opportunity.area === 'estimate') {
    if (isUpgrade && ['Unscheduled', 'Scheduled', 'In Progress', 'Draft', 'Ready to Send', 'Sent'].includes(String(opportunity.stage))) return getThreeSixtyStepByKey('upgrade')!;
    if (['Scheduled', 'In Progress', 'Completed'].includes(String(opportunity.stage))) return getThreeSixtyStepByKey('baseline')!;
    if (['Sent', 'Ready to Send', 'Verbal Acceptance', 'Approved'].includes(String(opportunity.stage))) return getThreeSixtyStepByKey('scope_price_approve')!;
    return getThreeSixtyStepByKey('scope_price_approve')!;
  }
  if (opportunity.area === 'job') {
    if (['Invoice Sent', 'Invoice Paid'].includes(String(opportunity.stage))) return getThreeSixtyStepByKey('cfo_intelligence')!;
    if (['Completed', 'Awaiting Sign-Off'].includes(String(opportunity.stage))) return getThreeSixtyStepByKey('execute')!;
    return getThreeSixtyStepByKey('schedule')!;
  }

  return getThreeSixtyStepByKey('baseline')!;
}

export interface ThreeSixtyPropertyBoardStep extends ThreeSixtyMethodStep {
  opportunities: any[];
}

export interface ThreeSixtyPropertyBoardPhase {
  id: ThreeSixtyPhaseId;
  name: string;
  promise: string;
  steps: ThreeSixtyPropertyBoardStep[];
}

export interface ThreeSixtyPropertyBoard {
  propertyId: string | null;
  propertyLabel: string;
  phases: ThreeSixtyPropertyBoardPhase[];
  unassignedOpportunities: any[];
}

export function deriveThreeSixtyPropertyBoard(input: {
  propertyId?: string | null;
  propertyLabel?: string | null;
  opportunities?: any[] | null;
}): ThreeSixtyPropertyBoard {
  const propertyId = input.propertyId ?? null;
  const opportunities = input.opportunities ?? [];
  const scoped = opportunities.filter((opp: any) => {
    if (!propertyId) return !opp?.propertyId;
    return !opp?.propertyId || opp.propertyId === propertyId;
  });

  const phases = THREE_SIXTY_METHOD_PHASES.map(phase => ({
    ...phase,
    steps: phase.steps.map(step => ({
      ...step,
      opportunities: scoped.filter((opp: any) => inferOpportunityThreeSixtyStep(opp).key === step.key),
    })),
  }));

  return {
    propertyId,
    propertyLabel: input.propertyLabel ?? 'Primary property',
    phases,
    unassignedOpportunities: opportunities.filter((opp: any) => propertyId && opp?.propertyId && opp.propertyId !== propertyId),
  };
}

export type ThreeSixtyStatusTone = 'good' | 'watch' | 'urgent' | 'empty';

export interface ThreeSixtySeasonStatus {
  season: 'spring' | 'summer' | 'fall' | 'winter';
  label: string;
  status: 'included' | 'scheduled' | 'completed' | 'due' | 'not_included';
}

export interface ThreeSixtyOperatingStatus {
  hasMembership: boolean;
  activeMembership: any | null;
  currentPhase: ThreeSixtyPhaseId;
  currentStep: ThreeSixtyMethodStep;
  healthScore: number | null;
  healthTone: ThreeSixtyStatusTone;
  baselineStatus: 'needed' | 'scheduled' | 'complete' | 'refresh';
  laborBankBalanceCents: number;
  openWorkOrders: any[];
  completedWorkOrders: any[];
  pendingRepairEstimates: any[];
  seasonalVisits: ThreeSixtySeasonStatus[];
  priorityCounts: {
    red: number;
    yellow: number;
    green: number;
  };
  nextInternalAction: string;
  nextCustomerAction: string;
}

export interface ThreeSixtyMembershipEngineStep {
  key: string;
  label: string;
  owner: ThreeSixtyOperatorRole;
  internalAction: string;
  customerAction: string;
  completionSignal: string;
}

export interface ThreeSixtyMembershipEnginePlan {
  current: ThreeSixtyMembershipEngineStep;
  next: ThreeSixtyMembershipEngineStep | null;
  flywheel: ThreeSixtyMembershipEngineStep[];
}

export interface ThreeSixtySopGate {
  stepKey: ThreeSixtyStepKey;
  source: string;
  owner: ThreeSixtyOperatorRole;
  requiredOutputs: string[];
  approvalRequiredFor: string[];
  customerVisibleWhen: string;
  cannotAdvanceIfMissing: string[];
}

export const THREE_SIXTY_SOP_GATES: Record<ThreeSixtyStepKey, ThreeSixtySopGate> = {
  baseline: {
    stepKey: 'baseline',
    source: 'Step_01_Baseline_Assessment_SOP',
    owner: 'Consultant Desk',
    requiredOutputs: ['10-system baseline', 'photos', 'homeowner goals', 'urgent concerns', 'property notes'],
    approvalRequiredFor: ['customer-facing baseline summary', 'urgent safety/structural language'],
    customerVisibleWhen: 'Consultant approves the baseline summary and evidence package.',
    cannotAdvanceIfMissing: ['system ratings', 'photo evidence', 'consultant notes'],
  },
  inspect: {
    stepKey: 'inspect',
    source: 'Step_02_Condition_Log_SOP',
    owner: 'Field Desk',
    requiredOutputs: ['condition rating', 'system notes', 'priority flags', 'new deficiency log'],
    approvalRequiredFor: ['new customer-visible findings', 'specialty trade recommendations'],
    customerVisibleWhen: 'Findings are reviewed and converted into clear customer language.',
    cannotAdvanceIfMissing: ['condition rating', 'finding note'],
  },
  prioritize: {
    stepKey: 'prioritize',
    source: 'Step_03_Priority_Roadmap_SOP',
    owner: 'Consultant Desk',
    requiredOutputs: ['NOW/SOON/WAIT roadmap', 'investment ranges', 'red/yellow/green priority', 'source findings'],
    approvalRequiredFor: ['investment ranges', 'roadmap PDF/page', 'customer recommendation'],
    customerVisibleWhen: 'Consultant approves roadmap language and investment ranges.',
    cannotAdvanceIfMissing: ['priority bucket', 'investment range', 'approved customer summary'],
  },
  scope_price_approve: {
    stepKey: 'scope_price_approve',
    source: 'Step_04_Roadmap_Execution_SOP',
    owner: 'Consultant Desk',
    requiredOutputs: ['exact scope', 'materials/labor assumptions', 'margin audit', 'proposal', 'customer approval'],
    approvalRequiredFor: ['scope', 'price', 'deposit', 'schedule promise', 'change in exclusions'],
    customerVisibleWhen: 'Proposal passes audit and consultant marks it ready for customer.',
    cannotAdvanceIfMissing: ['scope', 'price', 'approval path'],
  },
  schedule: {
    stepKey: 'schedule',
    source: 'HP_Job_Dispatch / Step_05_Seasonal_Visit_Protocol',
    owner: 'PM Desk',
    requiredOutputs: ['appointment window', 'crew assignment', 'materials status', 'client confirmation', 'pre-job brief'],
    approvalRequiredFor: ['firm schedule commitment', 'customer-impacting delay', 'material substitution'],
    customerVisibleWhen: 'PM confirms date, access, materials, and crew readiness.',
    cannotAdvanceIfMissing: ['client confirmation', 'crew assignment', 'materials status'],
  },
  execute: {
    stepKey: 'execute',
    source: 'HP_Project_Closeout / Step_04_Roadmap_Execution_SOP',
    owner: 'Field Desk',
    requiredOutputs: ['completed work notes', 'before/after photos', 'punch status', 'client walkthrough', 'portal update'],
    approvalRequiredFor: ['change order', 'incomplete work explanation', 'damage/safety issue'],
    customerVisibleWhen: 'Proof, notes, and sign-off are complete.',
    cannotAdvanceIfMissing: ['completion photos', 'field notes', 'portal update'],
  },
  preserve: {
    stepKey: 'preserve',
    source: 'Step_07_Preservation_Projects_SOP',
    owner: 'Retainment Desk',
    requiredOutputs: ['preservation opportunity', 'system age/risk', 'timing window', 'recommended next care'],
    approvalRequiredFor: ['preservation project proposal', 'membership renewal or save offer'],
    customerVisibleWhen: 'Retainment approves the next care recommendation.',
    cannotAdvanceIfMissing: ['system risk', 'recommended timing'],
  },
  upgrade: {
    stepKey: 'upgrade',
    source: 'Step_08_Strategic_Upgrades_SOP',
    owner: 'Consultant Desk',
    requiredOutputs: ['client goal', 'upgrade reason', 'scope option', 'investment range', 'disclaimer-safe value language'],
    approvalRequiredFor: ['ROI/value language', 'scope', 'price', 'timeline'],
    customerVisibleWhen: 'Consultant approves customer-facing recommendation and disclaimers.',
    cannotAdvanceIfMissing: ['client goal', 'scope option', 'approval rule'],
  },
  cfo_intelligence: {
    stepKey: 'cfo_intelligence',
    source: 'Step_09_Home_Score_SOP',
    owner: 'CFO Intelligence',
    requiredOutputs: ['10-category Home Score', 'maintenance investment history', 'condition trend', 'documentation gaps', 'non-advisory disclaimer'],
    approvalRequiredFor: ['financial, appraisal, tax, legal, insurance, or real-estate-adjacent language'],
    customerVisibleWhen: 'Record is framed as documentation, not licensed advice.',
    cannotAdvanceIfMissing: ['score inputs', 'disclaimer', 'source documentation'],
  },
};

export function getThreeSixtySopGate(stepKey?: string | null) {
  const step = getThreeSixtyStepByKey(stepKey);
  return step ? THREE_SIXTY_SOP_GATES[step.key] : null;
}

const SEASONS: ThreeSixtySeasonStatus['season'][] = ['spring', 'summer', 'fall', 'winter'];

function normalizeStatus(value: unknown) {
  return String(value ?? '').toLowerCase();
}

function getHealthTone(score: number | null): ThreeSixtyStatusTone {
  if (score == null) return 'empty';
  if (score >= 75) return 'good';
  if (score >= 55) return 'watch';
  return 'urgent';
}

function getLatestHealthScore(input: {
  latestScan?: any;
  reports?: any[];
  workOrders?: any[];
}) {
  if (typeof input.latestScan?.healthScore === 'number') return input.latestScan.healthScore;
  const reportScore = input.reports?.find(report => typeof report?.healthScore === 'number')?.healthScore;
  if (typeof reportScore === 'number') return reportScore;
  const workOrderScore = input.workOrders?.find(workOrder => typeof workOrder?.healthScore === 'number')?.healthScore;
  if (typeof workOrderScore === 'number') return workOrderScore;
  return null;
}

export function deriveThreeSixtyOperatingStatus(input: {
  memberships?: any[] | null;
  membershipData?: any | null;
  workOrders?: any[] | null;
  opportunities?: any[] | null;
  latestScan?: any | null;
}): ThreeSixtyOperatingStatus {
  const memberships = input.memberships ?? (input.membershipData?.membership ? [input.membershipData.membership] : []);
  const activeMembership = memberships.find(m => normalizeStatus(m?.status) === 'active') ?? memberships[0] ?? null;
  const workOrders = input.workOrders ?? input.membershipData?.workOrders ?? [];
  const linkedEstimates = input.membershipData?.linkedEstimates ?? [];
  const reports = input.membershipData?.reports ?? [];
  const opportunities = input.opportunities ?? [];
  const hasMembership = !!activeMembership;
  const openWorkOrders = workOrders.filter((wo: any) => ['open', 'scheduled', 'in_progress'].includes(normalizeStatus(wo?.status)));
  const completedWorkOrders = workOrders.filter((wo: any) => normalizeStatus(wo?.status) === 'completed');
  const baselineWork = workOrders.find((wo: any) => normalizeStatus(wo?.type) === 'baseline_scan');
  const pendingRepairEstimates = linkedEstimates.filter((estimate: any) => ['sent', 'viewed'].includes(normalizeStatus(estimate?.status)));
  const latestHealthScore = getLatestHealthScore({ latestScan: input.latestScan, reports, workOrders });
  const includedVisits = Number(activeMembership?.seasonalVisits ?? activeMembership?.visitsPerYear ?? 4);

  const baselineStatus: ThreeSixtyOperatingStatus['baselineStatus'] = (() => {
    if (!hasMembership) return 'needed';
    if (!baselineWork) return 'needed';
    if (normalizeStatus(baselineWork.status) === 'completed') return latestHealthScore == null ? 'refresh' : 'complete';
    if (['scheduled', 'in_progress'].includes(normalizeStatus(baselineWork.status))) return 'scheduled';
    return 'needed';
  })();

  const seasonalVisits = SEASONS.map((season): ThreeSixtySeasonStatus => {
    const visit = workOrders.find((wo: any) => normalizeStatus(wo?.type) === season);
    const isIncluded = includedVisits >= 4 || season === 'spring' || season === 'fall';
    if (!isIncluded) return { season, label: `${season[0].toUpperCase()}${season.slice(1)}`, status: 'not_included' };
    if (normalizeStatus(visit?.status) === 'completed') return { season, label: `${season[0].toUpperCase()}${season.slice(1)}`, status: 'completed' };
    if (['scheduled', 'in_progress'].includes(normalizeStatus(visit?.status))) return { season, label: `${season[0].toUpperCase()}${season.slice(1)}`, status: 'scheduled' };
    return { season, label: `${season[0].toUpperCase()}${season.slice(1)}`, status: 'due' };
  });

  const highValueOpen = opportunities.filter((opp: any) => !opp?.archived && Number(opp?.value ?? 0) >= 5000).length;
  const warmValueOpen = opportunities.filter((opp: any) => !opp?.archived && Number(opp?.value ?? 0) > 0 && Number(opp?.value ?? 0) < 5000).length;
  const priorityCounts = {
    red: openWorkOrders.length + pendingRepairEstimates.length + (latestHealthScore != null && latestHealthScore < 55 ? 1 : 0) + highValueOpen,
    yellow: seasonalVisits.filter(visit => visit.status === 'due').length + (latestHealthScore != null && latestHealthScore >= 55 && latestHealthScore < 75 ? 1 : 0) + warmValueOpen,
    green: completedWorkOrders.length + seasonalVisits.filter(visit => visit.status === 'completed').length,
  };

  const currentStep = (() => {
    if (!hasMembership || baselineStatus === 'needed' || baselineStatus === 'scheduled') return THREE_SIXTY_METHOD_STEPS[0];
    if (openWorkOrders.length > 0) return THREE_SIXTY_METHOD_STEPS[5];
    if (pendingRepairEstimates.length > 0) return getThreeSixtyStepByKey('scope_price_approve')!;
    if (priorityCounts.red > 0) return getThreeSixtyStepByKey('prioritize')!;
    if (seasonalVisits.some(visit => visit.status === 'due')) return THREE_SIXTY_METHOD_STEPS[6];
    return getThreeSixtyStepByKey('cfo_intelligence')!;
  })();

  const nextInternalAction = (() => {
    if (!hasMembership) return 'Position the 360 Method after the current request and offer the baseline walkthrough.';
    if (baselineStatus === 'needed') return 'Schedule the baseline walkthrough and document systems, photos, risk areas, and homeowner goals.';
    if (baselineStatus === 'scheduled') return 'Prepare the consultant brief and confirm the walkthrough details.';
    if (pendingRepairEstimates.length > 0) return 'Review flagged repair estimates and decide what should be sent to the customer.';
    if (openWorkOrders.length > 0) return 'Work the open membership visits or work orders to completion with photos and notes.';
    if (seasonalVisits.some(visit => visit.status === 'due')) return 'Schedule the next seasonal walkthrough and refresh the priority list.';
    return 'Review the history and prepare the next preserve, upgrade, or referral recommendation.';
  })();

  const nextCustomerAction = (() => {
    if (!hasMembership) return 'Consider the 360 Home Method so we can build a clear care plan for the property.';
    if (baselineStatus === 'needed') return 'Schedule your baseline walkthrough.';
    if (pendingRepairEstimates.length > 0) return 'Review the recommended repair estimate.';
    const nextSeason = seasonalVisits.find(visit => visit.status === 'scheduled' || visit.status === 'due');
    if (nextSeason) return `${nextSeason.status === 'scheduled' ? 'Prepare for' : 'Schedule'} your ${nextSeason.label} seasonal visit.`;
    return 'Your home care plan is active. We will keep tracking the next recommended step.';
  })();

  return {
    hasMembership,
    activeMembership,
    currentPhase: currentStep.phase,
    currentStep,
    healthScore: latestHealthScore,
    healthTone: getHealthTone(latestHealthScore),
    baselineStatus,
    laborBankBalanceCents: Number(input.membershipData?.laborBankBalance ?? activeMembership?.laborBankBalance ?? 0),
    openWorkOrders,
    completedWorkOrders,
    pendingRepairEstimates,
    seasonalVisits,
    priorityCounts,
    nextInternalAction,
    nextCustomerAction,
  };
}

export const THREE_SIXTY_MEMBERSHIP_FLYWHEEL: ThreeSixtyMembershipEngineStep[] = [
  {
    key: 'enroll_or_baseline',
    label: 'Enroll / Baseline',
    owner: 'Consultant Desk',
    internalAction: 'Position the 360 Method and complete or schedule the baseline walkthrough.',
    customerAction: 'Schedule the baseline walkthrough.',
    completionSignal: 'Baseline is scheduled or complete with property goals and risks captured.',
  },
  {
    key: 'seasonal_walkthrough',
    label: 'Seasonal Walkthrough',
    owner: 'Field Desk',
    internalAction: 'Run the seasonal visit with PNW checklist, photos, and findings.',
    customerAction: 'Prepare for the seasonal visit.',
    completionSignal: 'Visit is completed with findings and proof attached.',
  },
  {
    key: 'priority_plan',
    label: 'Priority Plan',
    owner: 'Consultant Desk',
    internalAction: 'Convert findings into red/yellow/green priorities and estimate recommendations.',
    customerAction: 'Review recommended priorities.',
    completionSignal: 'Customer has a clear plan for urgent, planned, and maintain items.',
  },
  {
    key: 'work_order',
    label: 'Work Order / Labor Bank',
    owner: 'PM Desk',
    internalAction: 'Bundle approved work, schedule labor, and apply labor bank value when eligible.',
    customerAction: 'Approve or schedule the recommended work.',
    completionSignal: 'Work is scheduled, completed, or intentionally deferred.',
  },
  {
    key: 'proof_and_history',
    label: 'Proof / Home History',
    owner: 'Retainment Desk',
    internalAction: 'Update the home history, savings, labor bank, score, and next recommendation.',
    customerAction: 'View the completed work and home history.',
    completionSignal: 'Customer record shows what happened, what changed, and what comes next.',
  },
  {
    key: 'cfo_intelligence',
    label: 'CFO Intelligence',
    owner: 'CFO Intelligence',
    internalAction: 'Update the property intelligence record with maintenance investment, condition trend, risk reduction, and value-supporting documentation.',
    customerAction: 'Review the property intelligence summary as a planning tool, not financial or real estate advice.',
    completionSignal: 'Customer has a clear property record they can bring to licensed financial, insurance, appraisal, or real estate professionals.',
  },
];

export function deriveThreeSixtyMembershipEnginePlan(status: ThreeSixtyOperatingStatus): ThreeSixtyMembershipEnginePlan {
  const currentKey = (() => {
    if (!status.hasMembership || status.baselineStatus === 'needed' || status.baselineStatus === 'scheduled') return 'enroll_or_baseline';
    if (status.seasonalVisits.some(visit => visit.status === 'due' || visit.status === 'scheduled')) return 'seasonal_walkthrough';
    if (status.pendingRepairEstimates.length > 0 || status.priorityCounts.red > 0) return 'priority_plan';
    if (status.openWorkOrders.length > 0) return 'work_order';
    if (status.completedWorkOrders.length > 0) return 'proof_and_history';
    return 'cfo_intelligence';
  })();

  const currentIndex = THREE_SIXTY_MEMBERSHIP_FLYWHEEL.findIndex(step => step.key === currentKey);
  const current = THREE_SIXTY_MEMBERSHIP_FLYWHEEL[currentIndex] ?? THREE_SIXTY_MEMBERSHIP_FLYWHEEL[0];
  const next = THREE_SIXTY_MEMBERSHIP_FLYWHEEL[currentIndex + 1] ?? null;

  return {
    current,
    next,
    flywheel: THREE_SIXTY_MEMBERSHIP_FLYWHEEL,
  };
}
