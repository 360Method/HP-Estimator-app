/**
 * 360 Method - canonical framework definition.
 *
 * Single source of truth for the 3 phases and 9 steps of the 360 Method,
 * the philosophy behind it, and the per-step staff guidance. Both the staff
 * app and (later) the member portal render from this module, so the names,
 * order, and copy here must match the published framework exactly:
 *
 *   Phase 1 AWARE (Know Before You Need):    1 Baseline, 2 Inspect, 3 Track
 *   Phase 2 ACT (Fix Small Before It's Big): 4 Prioritize, 5 Schedule, 6 Execute
 *   Phase 3 ADVANCE (Build Wealth Through Property Care): 7 Preserve, 8 Upgrade, 9 Scale
 *
 * Steps 2 through 6 recur as a seasonal cycle four times a year.
 * Phase 3 activates in membership year two.
 *
 * Copy rules for every string in this file: plain human prose, no em or en
 * dashes, no internal tier codes, no cost or margin math. Banner copy must be
 * safe for a customer glancing at a tech's phone.
 */

export type ThreeSixtyPhaseId = 'aware' | 'act' | 'advance';

export type ThreeSixtyStepKey =
  | 'baseline'
  | 'inspect'
  | 'track'
  | 'prioritize'
  | 'schedule'
  | 'execute'
  | 'preserve'
  | 'upgrade'
  | 'scale';

export type ThreeSixtyOperatorRole =
  | 'Lead Desk'
  | 'Consultant Desk'
  | 'PM Desk'
  | 'Field Desk'
  | 'Closeout Desk'
  | 'Retainment Desk'
  | 'Integrator'
  | 'CFO Intelligence';

export type ThreeSixtyStepCadence = 'once' | 'seasonal' | 'continuous' | 'annual';

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
  /** One line: what this step delivers to the homeowner. */
  delivers: string;
  /** Why this step exists, written for staff. */
  staffWhy: string;
  /** How we run this step inside this app, written for staff. */
  staffHow: string;
  /** How the value shows up for the member, written for staff. */
  valueFraming: string;
  /** In-app SOP document id, readable at /os/d/{sopDocId}. */
  sopDocId: string;
  cadence: ThreeSixtyStepCadence;
  /** True for the Advance phase steps that activate in membership year two. */
  yearTwoPlus: boolean;
}

export interface ThreeSixtyPhase {
  id: ThreeSixtyPhaseId;
  name: string;
  /** Canonical phase subtitle, e.g. "Know Before You Need". */
  subtitle: string;
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
    delivers: 'A full home walkthrough with all 10 systems documented and a permanent health record started.',
    staffWhy: 'You cannot protect what you have not documented. The baseline is the foundation of everything that follows and it sets the tone for the whole relationship, so it is owner led.',
    staffHow: 'Schedule the baseline scan from the member roster, walk all 10 systems with photos and ratings, and complete the scan report in the app the same day.',
    valueFraming: 'The member gets a complete, honest picture of their home, often for the first time since they bought it.',
    sopDocId: 'HP-SOP-101',
    cadence: 'once',
    yearTwoPlus: false,
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
    delivers: 'Seasonal walkthroughs that catch small issues before they grow.',
    staffWhy: 'Most expensive home failures start as cheap fixes nobody saw. Showing up every season is how we catch them while they are still small.',
    staffHow: 'Work the seasonal visit from its work order, follow the season checklist, photograph anything that changed since the baseline, and log every finding before you leave.',
    valueFraming: 'The member never has to wonder if something is quietly going wrong. We are already looking.',
    sopDocId: 'HP-SOP-102',
    cadence: 'seasonal',
    yearTwoPlus: false,
  },
  {
    number: 3,
    key: 'track',
    phase: 'aware',
    name: 'Track',
    customerLabel: 'Home Health Record',
    operatorOutcome: 'Maintain a living log of every repair, visit, contractor, and dollar spent so the property history is complete and patterns are visible.',
    customerOutcome: 'They have one place that holds the full history of the home and what it has needed.',
    owner: 'Consultant Desk',
    aiSupport: 'Organize history into a clean timeline, surface spending patterns, and flag recurring issues.',
    delivers: 'A living log of every repair, visit, and dollar.',
    staffWhy: 'A home with a complete record is worth more and easier to care for. Tracking is what turns individual visits into a history the member can rely on.',
    staffHow: 'Update the record the same day work happens: finish the visit notes, attach photos, and make sure findings and costs land on the member profile.',
    valueFraming: 'The member owns a clean home history they can hand to an appraiser, an insurer, or a buyer.',
    sopDocId: 'HP-SOP-103',
    cadence: 'continuous',
    yearTwoPlus: false,
  },
  {
    number: 4,
    key: 'prioritize',
    phase: 'act',
    name: 'Prioritize',
    customerLabel: 'Priority Roadmap',
    operatorOutcome: 'Convert the baseline and condition log into NOW, SOON, and WAIT priorities with investment ranges, then scope, price, and secure approval before scheduling.',
    customerOutcome: 'They know what matters now, what can wait, and exactly what each next step involves.',
    owner: 'Consultant Desk',
    aiSupport: 'Rank findings, draft red/yellow/green priorities, prepare the roadmap, and audit scope and proposal language.',
    delivers: 'Findings sorted into a NOW, SOON, WAIT roadmap with investment ranges.',
    staffWhy: 'A list of problems creates anxiety. A roadmap creates confidence. Sorting findings by urgency is how we act as a guide instead of a salesperson.',
    staffHow: 'Turn the scan findings into recommendations in the report builder, bucket each one as NOW, SOON, or WAIT, and deliver the roadmap to the member portal.',
    valueFraming: 'The member knows exactly what matters now and what can wait, with no pressure and no guesswork.',
    sopDocId: 'HP-SOP-104',
    cadence: 'seasonal',
    yearTwoPlus: false,
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
    delivers: 'A real maintenance calendar so nothing slips.',
    staffWhy: 'A roadmap nobody calendars is just a wish list. Putting dates on the work is what makes the method real.',
    staffHow: 'Confirm the seasonal visit dates for the year and book the approved roadmap work, so every open item has a date or a deliberate reason it does not.',
    valueFraming: 'The member sees what is happening next without having to chase anyone.',
    sopDocId: 'HP-SOP-105',
    cadence: 'seasonal',
    yearTwoPlus: false,
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
    delivers: 'Work done in priority order with proof.',
    staffWhy: 'This is where trust is earned or lost. Doing the work in priority order, documenting it, and closing the loop is the promise the whole membership rests on.',
    staffHow: 'Work the job from its work order, capture before and after photos, apply labor bank where it fits, and close it out with notes the member can read.',
    valueFraming: 'The member gets finished work with proof, in the order that protects their home best.',
    sopDocId: 'HP-SOP-106',
    cadence: 'seasonal',
    yearTwoPlus: false,
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
    delivers: 'Routines that extend the life of major systems.',
    staffWhy: 'Replacing a system early because nobody maintained it is the most expensive mistake in homeownership. Preservation routines push those dates out by years.',
    staffHow: 'Use the system ages and conditions on the member profile to propose life extension work before a system enters its failure window.',
    valueFraming: 'The member keeps major systems alive years longer, which is the cheapest money they will ever save.',
    sopDocId: 'HP-SOP-107',
    cadence: 'annual',
    yearTwoPlus: true,
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
    delivers: 'Good, better, best improvement options that protect and grow home value.',
    staffWhy: 'Once a home is stable, the conversation can shift from fixing to improving. Upgrades framed around the member\'s goals turn maintenance trust into bigger wins for them and for us.',
    staffHow: 'When the roadmap is clear of urgent items, build good, better, best options for improvements that match the member\'s goal to sell, refinance, or stay.',
    valueFraming: 'The member gets a thoughtful path from maintenance into better living and a more valuable asset.',
    sopDocId: 'HP-SOP-108',
    cadence: 'annual',
    yearTwoPlus: true,
  },
  {
    number: 9,
    key: 'scale',
    phase: 'advance',
    name: 'Scale',
    customerLabel: 'Property Value Intelligence',
    operatorOutcome: 'Track maintenance history, investment, risk reduction, condition trends, and value-supporting documentation for this property.',
    customerOutcome: 'They have a practical ownership record that can support refinance, sale, insurance, planning, or wealth-building conversations with licensed professionals.',
    owner: 'CFO Intelligence',
    aiSupport: 'Summarize maintenance investment, avoided-risk notes, property health trends, documentation gaps, and non-advisory equity intelligence disclaimers.',
    delivers: 'A Home Score and a documented record of care that supports the home\'s value over time.',
    staffWhy: 'A maintained home with records is a financial asset, not just a place to live. The annual review is where the member sees the whole year of care add up.',
    staffHow: 'Run the annual review: refresh the Home Score from the latest scan, walk the member through the year\'s record, and ask for the referral.',
    valueFraming: 'The member holds a documented, scored record of care they can bring to any refinance, sale, or insurance conversation.',
    sopDocId: 'HP-SOP-109',
    cadence: 'annual',
    yearTwoPlus: true,
  },
];

export const THREE_SIXTY_METHOD_PHASES: ThreeSixtyPhase[] = [
  {
    id: 'aware',
    name: 'Aware',
    subtitle: 'Know Before You Need',
    promise: 'Know the home before selling work.',
    steps: THREE_SIXTY_METHOD_STEPS.filter(step => step.phase === 'aware'),
  },
  {
    id: 'act',
    name: 'Act',
    subtitle: 'Fix Small Before It\'s Big',
    promise: 'Turn findings into the right next action.',
    steps: THREE_SIXTY_METHOD_STEPS.filter(step => step.phase === 'act'),
  },
  {
    id: 'advance',
    name: 'Advance',
    subtitle: 'Build Wealth Through Property Care',
    promise: 'Preserve value and create the next opportunity.',
    steps: THREE_SIXTY_METHOD_STEPS.filter(step => step.phase === 'advance'),
  },
];

/** Steps 2 through 6 recur as the seasonal cycle, in working order. Track runs continuously alongside. */
export const SEASONAL_CYCLE_KEYS: ThreeSixtyStepKey[] = ['inspect', 'prioritize', 'schedule', 'execute'];

export type ThreeSixtySeason = 'spring' | 'summer' | 'fall' | 'winter';

export const SEASON_ORDER: ThreeSixtySeason[] = ['spring', 'summer', 'fall', 'winter'];

export const SEASON_LABELS: Record<ThreeSixtySeason, string> = {
  spring: 'Spring',
  summer: 'Summer',
  fall: 'Fall',
  winter: 'Winter',
};

/**
 * The season a date falls in, matching the work order type values:
 * spring Mar to May, summer Jun to Aug, fall Sep to Nov, winter Dec to Feb.
 */
export function currentSeason(date: Date = new Date()): ThreeSixtySeason {
  const month = date.getMonth(); // 0 = January
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'fall';
  return 'winter';
}

/** First day of the next season, for "next season starts" copy. */
export function nextSeasonStart(date: Date = new Date()): Date {
  const year = date.getFullYear();
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return new Date(year, 5, 1);
  if (month >= 5 && month <= 7) return new Date(year, 8, 1);
  if (month >= 8 && month <= 10) return new Date(year, 11, 1);
  // winter: Dec rolls to next year's March, Jan and Feb stay in this year
  return month === 11 ? new Date(year + 1, 2, 1) : new Date(year, 2, 1);
}

// ─── Regions ─────────────────────────────────────────────────────────────────
//
// The 9 steps are universal; what a seasonal visit actually checks is not.
// Seasonal task lists are region specific (the threeSixtyChecklist table
// carries a region column for exactly this). PNW (Vancouver, WA) is the only
// region today; expanding means adding a region here and seeding its
// checklist rows, never editing the method itself.

export type ServiceRegion = 'PNW';

export const DEFAULT_REGION: ServiceRegion = 'PNW';

export interface RegionSeasonalFocus {
  season: string;
  focus: string;
}

export const REGION_SEASONAL_FOCUS: Record<ServiceRegion, RegionSeasonalFocus[]> = {
  PNW: [
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
  ],
};

export function getRegionSeasonalFocus(region: ServiceRegion = DEFAULT_REGION): RegionSeasonalFocus[] {
  return REGION_SEASONAL_FOCUS[region];
}

export function getThreeSixtyStepByKey(key?: string | null): ThreeSixtyMethodStep | null {
  const normalizedKey =
    key === 'cfo_intelligence' ? 'scale'
    : key === 'scope_price_approve' ? 'prioritize'
    : key === 'roadmap_execution' ? 'prioritize'
    : key;
  return THREE_SIXTY_METHOD_STEPS.find(step => step.key === normalizedKey) ?? null;
}

export function getThreeSixtyStepByNumber(stepNumber: number): ThreeSixtyMethodStep | null {
  return THREE_SIXTY_METHOD_STEPS.find(step => step.number === stepNumber) ?? null;
}

// ─── Philosophy (staff-facing hub copy) ──────────────────────────────────────

export const METHOD_PHILOSOPHY = {
  headline: 'Proactive care prevents emergencies.',
  /** Why the method exists. */
  why: [
    'Most expensive home failures start as small, cheap fixes that nobody saw. The 360 Method exists to see them first. We document the whole home, show up every season, and fix things in priority order, so the member never gets ambushed by their own house.',
    'A home is the biggest thing most families will ever take care of. We treat it that way. Every visit, every photo, every logged dollar builds a record that protects the member\'s money, their time, and their peace of mind.',
  ],
  /** How we carry it: the operating principles. */
  principles: [
    'Teach, don\'t gatekeep. We would rather make the member capable than keep them dependent.',
    'The home is entrusted, not just owned. We care for it like the steward the member is.',
    'Guide, never pressure. The roadmap tells the member what matters now and what can wait, and we respect the difference.',
  ],
  /** What the member is promised, safe for any audience. */
  promise: 'The roadmap is the map of your home. The Proactive Path is how we keep it handled: we come back on a rhythm, watch for what is changing, and your living health record stays current. You have one number to call and one team that knows your house.',
} as const;

/** One-line elevator answer to "what is the 360 Method?" for staff. */
export const METHOD_ONE_LINER =
  'The 360 Method is how we care for a member\'s home: document everything once, inspect every season, fix small before it is big, and build the home\'s value year after year.';
