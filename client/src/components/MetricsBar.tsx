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

const NAV_ITEMS: { id: AppSection; label: string }[] = [
  { id: 'customer', label: 'Customer Info' },
  { id: 'sales',    label: 'Sales View' },
  { id: 'calculator', label: 'Calculator' },
  { id: 'estimate', label: 'Estimate' },
];

export default function MetricsBar({ totals }: MetricsBarProps) {
  const { totalHard, totalPrice, totalGP, totalGM } = totals;
  const { state, setSection, reset } = useEstimator();

  const minGM = totalHard < 2000 ? 0.40 : 0.30;
  const gmFlag = getMarginFlag(totalGM, totalHard);

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
            <div className="w-7 h-7 rounded-md bg-primary flex items-center justify-center">
              <span className="text-white font-black text-xs leading-none">HP</span>
            </div>
            <div>
              <div className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest leading-none">Handy Pioneers</div>
              <div className="text-xs font-semibold text-foreground leading-tight">Field Estimator</div>
            </div>
          </div>

          {/* Metrics */}
          <div className="flex items-center gap-5 flex-1 min-w-0">
            <Metric label="Hard Cost" value={totalHard > 0 ? fmtDollar(totalHard) : '—'} sub="internal only" valueClass="text-foreground" />
            <div className="h-7 w-px bg-border shrink-0" />
            <Metric label="Customer Price" value={totalPrice > 0 ? fmtDollar(totalPrice) : '—'} sub="all phases" valueClass="text-primary font-black" />
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
          </div>

          <button
            onClick={handleReset}
            className="ml-4 shrink-0 text-[11px] font-semibold text-muted-foreground hover:text-destructive border border-border hover:border-destructive/50 px-2.5 py-1 rounded-md transition-colors no-print"
          >
            Reset
          </button>
        </div>

        {/* Section nav tabs */}
        <div className="flex border-t border-border -mx-4 px-4 overflow-x-auto">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setSection(item.id)}
              className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                state.activeSection === item.id
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {item.label}
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
