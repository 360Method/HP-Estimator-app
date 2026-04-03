// ============================================================
// MetricsBar — Sticky live totals bar
// ============================================================

import { fmtDollar, fmtPct, getMarginFlag } from '@/lib/calc';
import { TotalsResult } from '@/lib/calc';
import { useEstimator } from '@/contexts/EstimatorContext';
import { AppSection } from '@/lib/types';
import { toast } from 'sonner';

interface MetricsBarProps {
  totals: TotalsResult;
}

const NAV_ITEMS: { id: AppSection; icon: string; label: string; shortLabel: string }[] = [
  { id: 'customer',    icon: '👤', label: 'Customer Info', shortLabel: 'Client' },
  { id: 'sales',       icon: '🛍', label: 'Sales View',   shortLabel: 'Sales' },
  { id: 'calculator',  icon: '🧮', label: 'Calculator',   shortLabel: 'Calc' },
  { id: 'estimate',    icon: '📄', label: 'Estimate',     shortLabel: 'Estimate' },
];

export default function MetricsBar({ totals }: MetricsBarProps) {
  const { totalHard, totalPrice, totalGP, totalGM } = totals;
  const { state, setSection, reset } = useEstimator();

  const minGM = totalHard < 2000 ? 0.40 : 0.30;
  const gmFlag = getMarginFlag(totalGM, totalHard);

  // Hide internal cost data on customer-facing screens (Sales View, Estimate)
  const isCustomerFacing = state.activeSection === 'sales' || state.activeSection === 'estimate';

  const gmColor = {
    empty: 'text-muted-foreground',
    ok:    'text-emerald-700',
    warn:  'text-amber-700',
    bad:   'text-red-700',
  }[gmFlag];

  const gmBg = {
    empty: '',
    ok:    'bg-emerald-50',
    warn:  'bg-amber-50',
    bad:   'bg-red-50',
  }[gmFlag];

  const handleReset = () => {
    if (window.confirm('Clear all estimate data and start fresh?')) {
      reset();
      toast.success('Estimate cleared — ready for a new job');
    }
  };

  return (
    <div className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-border shadow-sm no-print">
      <div className="container">
        {/* Top row: brand + metrics + reset */}
        <div className="flex items-center gap-0 py-2 overflow-x-auto">
          {/* Brand */}
          <div className="flex items-center gap-2 pr-4 border-r border-border mr-4 shrink-0">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg"
              alt="Handy Pioneers"
              className="w-8 h-8 object-contain rounded"
            />
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Handy Pioneers</div>
              <div className="text-xs font-semibold text-foreground leading-tight">Field Estimator</div>
            </div>
          </div>

          {/* Metrics — internal figures hidden on customer-facing screens */}
          <div className="flex items-center gap-5 flex-1 min-w-0">
            {!isCustomerFacing && (
              <>
                <Metric label="Hard Cost" value={totalHard > 0 ? fmtDollar(totalHard) : '—'} sub="internal only" valueClass="text-foreground" />
                <div className="h-7 w-px bg-border shrink-0" />
              </>
            )}
            <Metric label="Customer Price" value={totalPrice > 0 ? fmtDollar(totalPrice) : '—'} sub="all phases" valueClass="text-primary font-black" />
            {!isCustomerFacing && (
              <>
                <div className="h-7 w-px bg-border shrink-0" />
                <Metric
                  label="Gross Margin"
                  value={totalHard > 0 ? fmtPct(totalGM) : '—'}
                  sub={totalHard > 0 ? (totalGM >= minGM - 0.001 ? `${Math.round(minGM * 100)}% floor met` : `${Math.round(minGM * 100)}% floor not met`) : 'no data'}
                  valueClass={gmColor}
                  containerClass={gmBg}
                />
                <div className="h-7 w-px bg-border shrink-0" />
                <Metric label="Gross Profit" value={totalGP > 0 ? fmtDollar(totalGP) : '—'} sub="price − hard cost" valueClass="text-foreground" />
              </>
            )}
            {isCustomerFacing && totalPrice > 0 && (
              <span className="text-[10px] text-muted-foreground italic">Internal details hidden</span>
            )}
          </div>

          <button
            onClick={handleReset}
            className="ml-4 shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 px-2.5 py-1 rounded-md transition-colors no-print"
          >
            Reset
          </button>
        </div>

        {/* Section nav tabs — flex-1 so each tab fills equal width on all screen sizes */}
        <div className="flex border-t border-border -mx-4 px-0">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-1.5 text-[11px] font-semibold border-b-2 transition-colors min-w-0 ${
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

function Metric({ label, value, sub, valueClass = '', containerClass = '' }: {
  label: string; value: string; sub: string; valueClass?: string; containerClass?: string;
}) {
  return (
    <div className={`px-2 py-0.5 rounded-md ${containerClass} shrink-0`}>
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider leading-none mb-0.5">{label}</div>
      <div className={`text-sm font-bold mono leading-tight ${valueClass}`}>{value}</div>
      <div className="text-[10px] text-muted-foreground leading-none mt-0.5">{sub}</div>
    </div>
  );
}
