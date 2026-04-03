// ============================================================
// SalesSection — Customer-facing material/tier selection
// No prices shown. Customer picks Good/Better/Best per trade.
// ============================================================

import { useEstimator } from '@/contexts/EstimatorContext';
import { Tier } from '@/lib/types';
import { CheckCircle2, Info } from 'lucide-react';

const TIER_LABELS: Record<Tier, { label: string; color: string; bg: string; border: string }> = {
  good:   { label: 'Good',   color: 'text-slate-700',   bg: 'bg-slate-50',   border: 'border-slate-300' },
  better: { label: 'Better', color: 'text-blue-700',    bg: 'bg-blue-50',    border: 'border-blue-300' },
  best:   { label: 'Best',   color: 'text-amber-700',   bg: 'bg-amber-50',   border: 'border-amber-400' },
};

export default function SalesSection() {
  const { state, updateItem } = useEstimator();

  // Only show phases that have items with hasTiers = true
  const salesPhases = state.phases.map(phase => ({
    ...phase,
    items: phase.items.filter(item => item.hasTiers && item.enabled),
  })).filter(phase => phase.items.length > 0);

  return (
    <div className="space-y-8">
      {/* Header note */}
      <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div>
          <div className="text-sm font-semibold text-blue-800">Material Selection Guide</div>
          <div className="text-sm text-blue-700 mt-0.5">
            Review each trade below and select the material tier that best fits your project goals and budget.
            Your selections will be reflected in the final estimate.
          </div>
        </div>
      </div>

      {salesPhases.map(phase => (
        <div key={phase.id}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-lg">{phase.icon}</span>
            <h2 className="text-sm font-bold text-foreground uppercase tracking-wider">{phase.name}</h2>
          </div>

          <div className="space-y-4">
            {phase.items.map(item => (
              <div key={item.id} className="card-section">
                <div className="card-section-body">
                  <div className="mb-3">
                    <div className="font-semibold text-foreground">{item.name}</div>
                    {item.salesDesc && (
                      <div className="text-sm text-muted-foreground mt-0.5">{item.salesDesc}</div>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {(['good', 'better', 'best'] as Tier[]).map(tier => {
                      const tierInfo = item.tiers[tier];
                      const style = TIER_LABELS[tier];
                      const isSelected = item.tier === tier;

                      return (
                        <button
                          key={tier}
                          onClick={() => updateItem(phase.id, item.id, { tier })}
                          className={`relative text-left p-3 rounded-lg border-2 transition-all ${
                            isSelected
                              ? `${style.border} ${style.bg} ring-2 ring-offset-1 ring-current`
                              : 'border-border bg-background hover:border-muted-foreground/40'
                          }`}
                        >
                          {isSelected && (
                            <CheckCircle2 size={14} className={`absolute top-2 right-2 ${style.color}`} />
                          )}
                          <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${style.color}`}>
                            {style.label}
                          </div>
                          <div className="text-sm font-semibold text-foreground leading-tight">
                            {tierInfo.name}
                          </div>
                          {tierInfo.desc && (
                            <div className="text-xs text-muted-foreground mt-1 leading-snug">
                              {tierInfo.desc}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {salesPhases.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <div className="text-4xl mb-3">📋</div>
          <div className="font-semibold">No trades configured yet</div>
          <div className="text-sm mt-1">Go to the Calculator tab to enter quantities for each trade.</div>
        </div>
      )}
    </div>
  );
}
