// ============================================================
// CalculatorSection — Internal estimator with all 17 phase tabs
// ============================================================

import { useState, useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcLineItem, calcTotals, fmtDollar, fmtDollarCents, getMarginFlag, getMarginLabel } from '@/lib/calc';
import { LineItem, Tier, UNIT_LABELS } from '@/lib/types';
import { ChevronDown, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';

// ─── GLOBAL SETTINGS PANEL ────────────────────────────────────
function GlobalSettingsPanel() {
  const { state, setGlobal } = useEstimator();
  const { global } = state;

  return (
    <div className="card-section mb-6">
      <div className="card-section-header">
        <span>⚙️</span>
        <span>Global Settings</span>
        <span className="ml-auto text-xs text-muted-foreground font-normal">Syncs to all trades</span>
      </div>
      <div className="card-section-body grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="field-label">Target GM</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={20} max={60} step={1}
              value={Math.round(global.markupPct * 100)}
              onChange={e => setGlobal({ markupPct: parseInt(e.target.value) / 100 })}
              className="flex-1"
            />
            <span className="text-sm font-bold mono w-10 text-right">{Math.round(global.markupPct * 100)}%</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">applied to all phases</div>
        </div>
        <div>
          <label className="field-label">Labor Rate</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={60} max={200} step={5}
              value={global.laborRate}
              onChange={e => setGlobal({ laborRate: parseInt(e.target.value) })}
              className="flex-1"
            />
            <span className="text-sm font-bold mono w-16 text-right">${global.laborRate}/hr</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">hard cost — syncs to all trades</div>
        </div>
        <div>
          <label className="field-label">Paint Prep Rate</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={40} max={150} step={5}
              value={global.paintRate}
              onChange={e => setGlobal({ paintRate: parseInt(e.target.value) })}
              className="flex-1"
            />
            <span className="text-sm font-bold mono w-16 text-right">${global.paintRate}/hr</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">paint prep labor</div>
        </div>
      </div>
      <div className="px-4 pb-3">
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong>GM floors:</strong> Jobs with hard cost ≥ $2,000 → 30% minimum GM. Jobs under $2,000 → 40% minimum GM. Markup is automatically raised if needed.
        </div>
      </div>
    </div>
  );
}

// ─── PHASE TAB BAR ────────────────────────────────────────────
function PhaseTabBar({ phases, activePhaseId, onSelect, phaseResults }: {
  phases: { id: number; name: string; icon: string }[];
  activePhaseId: number;
  onSelect: (id: number) => void;
  phaseResults: Map<number, { hasData: boolean; price: number }>;
}) {
  return (
    <div className="flex gap-0.5 overflow-x-auto pb-1 mb-4 border-b border-border">
      {phases.map(p => {
        const result = phaseResults.get(p.id);
        const hasData = result?.hasData ?? false;
        const isActive = p.id === activePhaseId;
        return (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={`flex items-center gap-1 px-2.5 py-2 rounded-t-lg text-xs font-semibold whitespace-nowrap transition-colors border-b-2 ${
              isActive
                ? 'border-primary text-primary bg-primary/5'
                : 'border-transparent text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            <span className="text-sm">{p.icon}</span>
            <span className="hidden md:inline">{p.name}</span>
            <span className="md:hidden text-[10px] font-bold">{p.id}</span>
            {hasData && (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ─── LINE ITEM ROW ────────────────────────────────────────────
function LineItemRow({ item, phaseId }: { item: LineItem; phaseId: number }) {
  const { state, updateItem } = useEstimator();
  const [expanded, setExpanded] = useState(false);

  const result = useMemo(() => calcLineItem(item, state.global), [item, state.global]);

  const flag = getMarginFlag(result.gm, result.hardCost);
  const flagLabel = getMarginLabel(result.gm, result.hardCost, result.price);
  const unitLabel = UNIT_LABELS[item.unitType];

  const update = (payload: Partial<LineItem>) => updateItem(phaseId, item.id, payload);

  return (
    <div className={`border rounded-xl mb-3 transition-all ${item.flagged ? 'border-amber-200 bg-amber-50/30' : 'border-border bg-background'}`}>
      {/* Header row */}
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-sm text-foreground">{item.name}</span>
            {item.flagged && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-1.5 py-0.5 rounded">
                <AlertTriangle size={10} /> SUB
              </span>
            )}
          </div>
          {item.flagged && item.flagNote && (
            <div className="text-xs text-amber-600 mt-0.5">{item.flagNote}</div>
          )}
        </div>

        {/* Quick qty input */}
        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <input
            type="number"
            min={0}
            value={item.qty || ''}
            onChange={e => update({ qty: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="field-input w-20 text-right"
          />
          <span className="text-xs text-muted-foreground">{unitLabel}</span>
        </div>

        {/* Price badge */}
        {result.hasData && (
          <div className="shrink-0 text-right">
            <div className="text-sm font-bold mono text-primary">{fmtDollar(result.price)}</div>
            <div className="text-[10px] text-muted-foreground">customer</div>
          </div>
        )}

        {/* GM flag dot */}
        {result.hasData && (
          <div className={`w-2 h-2 rounded-full shrink-0 ${
            flag === 'ok' ? 'bg-emerald-500' : flag === 'warn' ? 'bg-amber-500' : 'bg-red-500'
          }`} />
        )}

        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Quantity */}
            <div>
              <label className="field-label">Quantity ({unitLabel})</label>
              <input
                type="number" min={0}
                value={item.qty || ''}
                onChange={e => update({ qty: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className="field-input w-full"
              />
            </div>

            {/* Waste factor */}
            {item.wastePct > 0 && (
              <div>
                <label className="field-label">Waste Factor (%)</label>
                <input
                  type="number" min={0} max={50}
                  value={item.wastePct}
                  onChange={e => update({ wastePct: parseFloat(e.target.value) || 0 })}
                  className="field-input w-full"
                />
                {item.qty > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Purchase: {(item.qty * (1 + item.wastePct / 100)).toFixed(1)} {unitLabel}
                  </div>
                )}
              </div>
            )}

            {/* Material tier */}
            {item.hasTiers && (
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="field-label">Material Tier</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['good', 'better', 'best'] as Tier[]).map(tier => {
                    const td = item.tiers[tier];
                    const isSelected = item.tier === tier;
                    return (
                      <button
                        key={tier}
                        onClick={() => update({ tier })}
                        className={`text-left p-2.5 rounded-lg border-2 transition-all ${
                          isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'
                        }`}
                      >
                        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-0.5">
                          {tier.toUpperCase()}
                        </div>
                        <div className="text-xs font-semibold text-foreground leading-tight">{td.name}</div>
                        <div className="text-xs font-bold mono text-primary mt-1">{fmtDollarCents(td.rate)}/{unitLabel}</div>
                      </button>
                    );
                  })}
                </div>
                <div className="text-xs text-muted-foreground mt-1.5">
                  {item.tiers[item.tier].name} — {item.tiers[item.tier].desc}
                </div>
              </div>
            )}

            {/* Labor mode */}
            <div>
              <label className="field-label">Labor Mode</label>
              <div className="flex gap-2">
                {(['hr', 'flat'] as const).map(mode => (
                  <button
                    key={mode}
                    onClick={() => update({ laborMode: mode })}
                    className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                      item.laborMode === mode ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground hover:border-foreground'
                    }`}
                  >
                    {mode === 'hr' ? 'Hourly' : 'Flat rate'}
                  </button>
                ))}
              </div>
            </div>

            {/* Labor rate */}
            <div>
              <label className="field-label">Labor Rate ($/hr)</label>
              <input
                type="number" min={0}
                value={item.laborRate}
                onChange={e => update({ laborRate: parseFloat(e.target.value) || 0 })}
                className="field-input w-full"
              />
            </div>

            {/* Hrs per unit or flat rate */}
            {item.laborMode === 'hr' ? (
              <div>
                <label className="field-label">Hrs / {unitLabel}</label>
                <input
                  type="number" min={0} step={0.01}
                  value={item.hrsPerUnit}
                  onChange={e => update({ hrsPerUnit: parseFloat(e.target.value) || 0 })}
                  className="field-input w-full"
                />
                {item.qty > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Est: {(item.qty * item.hrsPerUnit).toFixed(1)} hrs
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="field-label">Flat Rate / {unitLabel}</label>
                <input
                  type="number" min={0}
                  value={item.flatRatePerUnit}
                  onChange={e => update({ flatRatePerUnit: parseFloat(e.target.value) || 0 })}
                  className="field-input w-full"
                />
              </div>
            )}

            {/* Paint prep */}
            {item.hasPaintPrep && (
              <div className="sm:col-span-2 lg:col-span-3">
                <label className="field-label">Paint Prep</label>
                <div className="flex gap-2">
                  {(['none', 'caulk', 'full'] as const).map(prep => (
                    <button
                      key={prep}
                      onClick={() => update({ paintPrep: prep })}
                      className={`flex-1 py-1.5 text-xs font-semibold rounded-lg border transition-colors ${
                        item.paintPrep === prep ? 'border-primary bg-primary text-white' : 'border-border text-muted-foreground hover:border-foreground'
                      }`}
                    >
                      {prep === 'none' ? 'None' : prep === 'caulk' ? 'Caulk Only' : 'Full Prep'}
                    </button>
                  ))}
                </div>
                {item.paintPrep !== 'none' && (
                  <div className="text-xs text-muted-foreground mt-1">
                    {item.paintPrep === 'caulk' ? '$0.14/unit mat + 0.09 hrs/unit' : '$0.26/unit mat + 0.19 hrs/unit'}
                  </div>
                )}
              </div>
            )}

            {/* Notes */}
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="field-label">Notes (internal)</label>
              <input
                type="text"
                value={item.notes}
                onChange={e => update({ notes: e.target.value })}
                placeholder="Optional notes for this line item"
                className="field-input w-full"
              />
            </div>
          </div>

          {/* Cost breakdown */}
          {result.hasData && (
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Cost Breakdown</div>
              <div className="space-y-1 text-xs">
                {item.hasTiers && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Material ({fmtDollarCents(result.matRate)}/{unitLabel} × {result.purchaseQty.toFixed(1)} {unitLabel})
                    </span>
                    <span className="font-mono">{fmtDollar(result.matCost)}</span>
                  </div>
                )}
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    Labor ({item.laborMode === 'hr'
                      ? `${result.laborHrs.toFixed(1)} hrs × $${item.laborRate}/hr`
                      : `${item.qty} ${unitLabel} × $${item.flatRatePerUnit}`})
                  </span>
                  <span className="font-mono">{fmtDollar(result.laborCost)}</span>
                </div>
                {result.paintMatCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paint prep material</span>
                    <span className="font-mono">{fmtDollar(result.paintMatCost)}</span>
                  </div>
                )}
                {result.paintLaborCost > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Paint prep labor</span>
                    <span className="font-mono">{fmtDollar(result.paintLaborCost)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-border pt-1 font-semibold">
                  <span>Hard cost (internal)</span>
                  <span className="font-mono">{fmtDollar(result.hardCost)}</span>
                </div>
                <div className="flex justify-between font-bold text-primary">
                  <span>Customer price ({Math.round(result.gm * 100)}% GM)</span>
                  <span className="font-mono">{fmtDollar(result.price)}</span>
                </div>
              </div>

              {/* GM flag */}
              <div className={`mt-2 flex items-center gap-1.5 text-xs font-semibold rounded-md px-2 py-1.5 ${
                flag === 'ok' ? 'bg-emerald-50 text-emerald-700' :
                flag === 'warn' ? 'bg-amber-50 text-amber-700' :
                'bg-red-50 text-red-700'
              }`}>
                {flag === 'ok' ? <CheckCircle2 size={12} /> : flag === 'warn' ? <AlertTriangle size={12} /> : <XCircle size={12} />}
                {flagLabel}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── PHASE PANEL ──────────────────────────────────────────────
function PhasePanel({ phaseId }: { phaseId: number }) {
  const { state } = useEstimator();
  const phase = state.phases.find(p => p.id === phaseId);
  if (!phase) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{phase.icon}</span>
        <div>
          <h2 className="font-bold text-foreground">Phase {phase.id}: {phase.name}</h2>
          <div className="text-xs text-muted-foreground">{phase.items.length} line items — click any row to expand</div>
        </div>
      </div>
      {phase.items.map(item => (
        <LineItemRow key={item.id} item={item} phaseId={phase.id} />
      ))}
    </div>
  );
}

// ─── MAIN CALCULATOR SECTION ──────────────────────────────────
export default function CalculatorSection() {
  const { state } = useEstimator();
  const [activePhaseId, setActivePhaseId] = useState(1);

  const phaseResults = useMemo(() => {
    const map = new Map<number, { hasData: boolean; price: number }>();
    state.phases.forEach(phase => {
      const result = calcPhase(phase, state.global);
      map.set(phase.id, { hasData: result.hasData, price: result.price });
    });
    return map;
  }, [state.phases, state.global]);

  return (
    <div>
      <GlobalSettingsPanel />
      <PhaseTabBar
        phases={state.phases.map(p => ({ id: p.id, name: p.name, icon: p.icon }))}
        activePhaseId={activePhaseId}
        onSelect={setActivePhaseId}
        phaseResults={phaseResults}
      />
      <PhasePanel phaseId={activePhaseId} />
    </div>
  );
}
