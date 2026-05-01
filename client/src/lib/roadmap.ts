import type { Opportunity } from '@/lib/types';

export type RoadmapUrgency = 'NOW' | 'SOON' | 'WAIT';

export interface RoadmapItem {
  id: string;
  urgency: RoadmapUrgency;
  title: string;
  category: string;
  finding: string;
  recommendedApproach: string;
  investmentLow: number;
  investmentHigh: number;
  reasoning: string;
  sourceOpportunityId?: string;
  status?: string;
}

export const ROADMAP_BUCKETS: Array<{
  urgency: RoadmapUrgency;
  label: string;
  horizon: string;
  internalMeaning: string;
  customerMeaning: string;
}> = [
  {
    urgency: 'NOW',
    label: 'Now',
    horizon: 'Next 90 days',
    internalMeaning: 'Active risk, high-priority customer concern, or work that should become an estimate now.',
    customerMeaning: 'Items we recommend addressing first.',
  },
  {
    urgency: 'SOON',
    label: 'Soon',
    horizon: '6-18 months',
    internalMeaning: 'Planned work, bundling opportunity, seasonal timing, or medium-risk finding.',
    customerMeaning: 'Items worth planning before the next major season cycle.',
  },
  {
    urgency: 'WAIT',
    label: 'Wait',
    horizon: '3-5 years',
    internalMeaning: 'Monitor, document, or revisit during the next 360 check-in.',
    customerMeaning: 'Items to track, not rush.',
  },
];

export function formatInvestmentRange(low?: number | null, high?: number | null) {
  if (!low || !high) return 'Range pending';
  const fmt = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  });
  return `${fmt.format(low)}-${fmt.format(high)}`;
}

export function urgencyFromPriority(priority?: Opportunity['threeSixtyPriority'] | string | null): RoadmapUrgency {
  if (priority === 'red' || priority === 'Critical' || priority === 'High' || priority === 'NOW') return 'NOW';
  if (priority === 'yellow' || priority === 'Medium' || priority === 'SOON') return 'SOON';
  return 'WAIT';
}

function rangeFromOpportunity(opp: Opportunity) {
  const value = Number(opp.value ?? 0);
  if (value > 0) {
    return {
      low: Math.max(250, Math.round(value * 0.85)),
      high: Math.max(500, Math.round(value * 1.2)),
    };
  }
  const priority = urgencyFromPriority(opp.threeSixtyPriority);
  if (priority === 'NOW') return { low: 850, high: 4_800 };
  if (priority === 'SOON') return { low: 650, high: 3_200 };
  return { low: 250, high: 950 };
}

export function buildRoadmapItemsFromOpportunities(opportunities: Opportunity[]): RoadmapItem[] {
  return opportunities
    .filter(opp => !opp.archived)
    .map(opp => {
      const range = rangeFromOpportunity(opp);
      const urgency = urgencyFromPriority(opp.threeSixtyPriority);
      return {
        id: opp.id,
        urgency,
        title: opp.title || 'Property item',
        category: opp.area === 'lead' ? 'Customer request' : opp.area === 'estimate' ? 'Recommended scope' : 'Active work',
        finding: opp.threeSixtyFinding || opp.notes || 'Consultant finding needs to be captured before this roadmap is sent.',
        recommendedApproach:
          urgency === 'NOW'
            ? 'Review scope and pricing, then decide whether this should become an approved estimate.'
            : urgency === 'SOON'
              ? 'Plan timing, bundle with related work, and revisit during the next seasonal walkthrough.'
              : 'Keep this in the property record and revisit during future 360 Method check-ins.',
        investmentLow: range.low,
        investmentHigh: range.high,
        reasoning: `Mapped from ${opp.area} stage "${opp.stage}" and ${opp.threeSixtyPriority || 'unset'} priority.`,
        sourceOpportunityId: opp.id,
        status: opp.stage,
      };
    })
    .sort((a, b) => ROADMAP_BUCKETS.findIndex(bucket => bucket.urgency === a.urgency) - ROADMAP_BUCKETS.findIndex(bucket => bucket.urgency === b.urgency));
}

export function normalizePriorityTranslationFindings(findings: any[] | null | undefined): RoadmapItem[] {
  return (findings ?? []).map((finding, index) => ({
    id: `${finding.category ?? 'finding'}-${index}`,
    urgency: urgencyFromPriority(finding.urgency),
    title: finding.category ?? 'Roadmap item',
    category: finding.category ?? 'Property finding',
    finding: finding.finding ?? '',
    recommendedApproach: finding.recommended_approach ?? finding.recommendedApproach ?? '',
    investmentLow: Number(finding.investment_range_low_usd ?? finding.investmentLow ?? 0),
    investmentHigh: Number(finding.investment_range_high_usd ?? finding.investmentHigh ?? 0),
    reasoning: finding.reasoning ?? '',
    status: finding.status,
  }));
}

export function bucketRoadmapItems(items: RoadmapItem[]) {
  return ROADMAP_BUCKETS.map(bucket => ({
    ...bucket,
    items: items.filter(item => item.urgency === bucket.urgency),
    totalLow: items.filter(item => item.urgency === bucket.urgency).reduce((sum, item) => sum + (item.investmentLow || 0), 0),
    totalHigh: items.filter(item => item.urgency === bucket.urgency).reduce((sum, item) => sum + (item.investmentHigh || 0), 0),
  }));
}

export function roadmapSummary(items: RoadmapItem[]) {
  const buckets = bucketRoadmapItems(items);
  const now = buckets.find(bucket => bucket.urgency === 'NOW');
  const soon = buckets.find(bucket => bucket.urgency === 'SOON');
  const wait = buckets.find(bucket => bucket.urgency === 'WAIT');
  return {
    count: items.length,
    nowCount: now?.items.length ?? 0,
    soonCount: soon?.items.length ?? 0,
    waitCount: wait?.items.length ?? 0,
    totalLow: items.reduce((sum, item) => sum + (item.investmentLow || 0), 0),
    totalHigh: items.reduce((sum, item) => sum + (item.investmentHigh || 0), 0),
  };
}
