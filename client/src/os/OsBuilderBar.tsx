/**
 * OsBuilderBar — the in-opportunity strip extracted from MetricsBar:
 * back-to-profile link, opportunity title, the builder tabs
 * (Scope/Proposal for estimates, Scope/Billing for jobs), and the
 * internal margin pills. Rendered by OsRoom only while an opportunity
 * is open; the OS shell owns every other piece of chrome.
 *
 * Sticky at the OS header's height (57px) so it rides under the shell
 * top bar instead of sliding behind it.
 */
import { ArrowLeft } from 'lucide-react';
import { fmtDollar, fmtPct, getMarginFlag, TotalsResult } from '@/lib/calc';
import { useEstimator } from '@/contexts/EstimatorContext';
import { AppSection } from '@/lib/types';

// Simplified flow (2026-06-11): opening anything lands straight in
// Scope/Price, then Proposal (and Billing for jobs).
const BUILDER_TABS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'calculator',  icon: '🧮', label: 'Scope/Price', shortLabel: 'Scope' },
  { id: 'estimate',    icon: '📄', label: 'Proposal',    shortLabel: 'Proposal' },
];

const JOB_BUILDER_TABS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'calculator',  icon: '🧮', label: 'Scope/Price', shortLabel: 'Scope' },
  { id: 'invoice',     icon: '💳', label: 'Billing',     shortLabel: 'Billing' },
];

export default function OsBuilderBar({ totals }: { totals: TotalsResult }) {
  const { totalHard, totalPrice, totalGP, totalGM } = totals;
  const { state, setSection, setActiveOpportunity } = useEstimator();

  const insideOpportunity = !!state.activeOpportunityId;
  if (!insideOpportunity) return null;

  const activeOpp = state.opportunities.find(o => o.id === state.activeOpportunityId) ?? null;
  const isCustomerFacing = state.activeSection === 'sales' || state.activeSection === 'estimate';

  const activeCustomerRecord = state.activeCustomerId
    ? state.customers.find(c => c.id === state.activeCustomerId)
    : null;
  const activeCustomerDisplayName = activeCustomerRecord
    ? ([activeCustomerRecord.firstName, activeCustomerRecord.lastName].filter(Boolean).join(' ') ||
       activeCustomerRecord.displayName ||
       activeCustomerRecord.company ||
       state.jobInfo.client ||
       'Profile')
    : (state.jobInfo.client || 'Profile');

  const minGM = totalHard < 2000 ? 0.40 : 0.30;
  const gmFlag = getMarginFlag(totalGM, totalHard);
  const gmColor = {
    empty: 'text-muted-foreground',
    ok:    'text-emerald-600',
    warn:  'text-amber-600',
    bad:   'text-red-600',
  }[gmFlag];

  return (
    <div className="sticky top-[57px] z-30 bg-white border-b border-border shadow-sm no-print">
      {/* ── Internal margin pills (never customer-facing) ─────────── */}
      {!isCustomerFacing && totalPrice > 0 && (
        <div className="bg-slate-50 border-b border-border">
          <div className="px-3 sm:px-4 md:px-6">
            <div className="flex items-center gap-3 sm:gap-5 py-1.5 text-xs overflow-x-auto scrollbar-none">
              <span className="text-muted-foreground shrink-0 hidden sm:inline">This estimate:</span>
              <MetricPill label="Cost" value={fmtDollar(totalHard)} sub="internal" />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill label="Price" value={fmtDollar(totalPrice)} sub="customer" bold />
              <div className="h-4 w-px bg-border shrink-0" />
              <MetricPill
                label="GM"
                value={fmtPct(totalGM)}
                sub={totalGM >= minGM - 0.001 ? '✓' : '✗'}
                valueClass={gmColor}
              />
              <div className="h-4 w-px bg-border shrink-0 hidden sm:block" />
              <MetricPill label="GP" value={fmtDollar(totalGP)} sub="profit" />
            </div>
          </div>
        </div>
      )}

      {/* ── Builder tabs ──────────────────────────────────────────── */}
      <div className="px-3 sm:px-4 md:px-6">
        <div className="flex items-stretch">
          {/* Back to profile */}
          <button
            onClick={() => setActiveOpportunity(null)}
            className="flex items-center gap-1.5 pr-2 py-2 text-[11px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 border-b-2 border-transparent transition-colors shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline truncate max-w-[80px]">
              {activeCustomerDisplayName}
            </span>
          </button>

          <div className="flex items-center px-1 text-muted-foreground/30 text-sm select-none">/</div>

          {/* Opportunity name */}
          <div className="flex items-center px-1 py-2 text-[11px] font-semibold text-foreground truncate max-w-[100px] sm:max-w-xs">
            {activeOpp?.title ?? 'Opportunity'}
          </div>

          <div className="flex-1" />

          {/* Builder section tabs — Jobs get Billing instead of Proposal */}
          {(activeOpp?.area === 'lead'
            ? BUILDER_TABS.filter(t => t.id === 'opp-details')
            : activeOpp?.area === 'job'
              ? JOB_BUILDER_TABS
              : BUILDER_TABS
          ).map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`flex flex-col items-center gap-0.5 px-2.5 sm:px-4 py-2 text-[11px] font-semibold border-b-2 transition-colors min-w-0 ${
                state.activeSection === item.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <span className="text-sm leading-none">{item.icon}</span>
              <span className="leading-none hidden sm:inline">{item.label}</span>
              <span className="leading-none sm:hidden">{item.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function MetricPill({ label, value, sub, bold = false, valueClass = '' }: {
  label: string; value: string; sub: string; bold?: boolean; valueClass?: string;
}) {
  return (
    <div className="flex items-baseline gap-1 shrink-0">
      <span className="text-muted-foreground">{label}:</span>
      <span className={`font-bold ${bold ? 'text-primary' : 'text-foreground'} ${valueClass}`}>{value}</span>
      <span className="text-muted-foreground/70 text-[10px] hidden sm:inline">{sub}</span>
    </div>
  );
}
