// ============================================================
// Home — Main estimator page
// Layout: Sticky MetricsBar → Job Info → Global Settings →
//         Trade Sections (BB, DC, WC) → Field Notes → Summary
// ============================================================

import { useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcTrade, calcTotals } from '@/lib/calc';
import MetricsBar from '@/components/MetricsBar';
import JobInfoCard from '@/components/JobInfoCard';
import GlobalSettingsCard from '@/components/GlobalSettingsCard';
import TradeSection from '@/components/TradeSection';
import FieldNotesCard from '@/components/FieldNotesCard';
import SummaryPanel from '@/components/SummaryPanel';

export default function Home() {
  const { state } = useEstimator();

  const bbResult = useMemo(() => calcTrade('bb', state.bb, state.global), [state.bb, state.global]);
  const dcResult = useMemo(() => calcTrade('dc', state.dc, state.global), [state.dc, state.global]);
  const wcResult = useMemo(() => calcTrade('wc', state.wc, state.global), [state.wc, state.global]);
  const totals = useMemo(() => calcTotals(bbResult, dcResult, wcResult), [bbResult, dcResult, wcResult]);

  return (
    <div className="min-h-screen bg-background">
      {/* Sticky live metrics bar */}
      <MetricsBar totals={totals} />

      <div className="container py-6 space-y-4">
        {/* Section: Job Info */}
        <SectionLabel>Job Information</SectionLabel>
        <JobInfoCard />

        {/* Section: Global Settings */}
        <SectionLabel>Global Settings</SectionLabel>
        <GlobalSettingsCard />

        {/* Section: Trades */}
        <SectionLabel>Trim Trades</SectionLabel>
        <div className="space-y-3">
          <TradeSection tradeKey="bb" defaultOpen={true} />
          <TradeSection tradeKey="dc" />
          <TradeSection tradeKey="wc" />
        </div>

        {/* Section: Field Notes */}
        <SectionLabel>Field Notes</SectionLabel>
        <FieldNotesCard />

        {/* Section: Summary */}
        <SectionLabel>Summary &amp; Export</SectionLabel>
        <SummaryPanel />

        {/* Footer */}
        <div className="text-center text-[11px] text-muted-foreground py-6 no-print">
          Handy Pioneers · Vancouver, WA · Internal use only · v1.0
        </div>
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest pt-2">
      {children}
    </div>
  );
}
