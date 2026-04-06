// ============================================================
// HP Field Estimator v4 — Calculator Section
// Field order: Dimension → Style → Tier → Qty → Labor → Markup → Final Price
// Paint prep restricted to Drywall (phase 5) and Trim (phase 11) only
// Per-trade custom material row inside every phase accordion
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcLineItem, calcCustomItem, calcTotals, fmtDollar, fmtDollarCents, getMarginFlag, getMarginLabel } from '@/lib/calc';
import { LineItem, CustomLineItem, Tier, UNIT_LABELS, UnitType } from '@/lib/types';
import { ChevronDown, AlertTriangle, CheckCircle2, XCircle, Sparkles, Plus, Trash2, Loader2, Ruler } from 'lucide-react';
import { toast } from 'sonner';
import { ALL_PHASES } from '@/lib/phases';

const FORGE_API_URL = import.meta.env.VITE_FRONTEND_FORGE_API_URL as string;
const FORGE_API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY as string;

// Paint prep is only relevant for these two phases
const PAINT_PREP_PHASE_IDS = new Set([5, 11]); // Drywall, Trim & Finish Carpentry

// ─── AI COST ANALYSIS ────────────────────────────────────────
async function analyzeCustomItemCost(description: string, qty: number, unitType: string): Promise<{ low: number; high: number; notes: string }> {
  const prompt = `You are a residential remodel estimator in Vancouver, WA (Pacific Northwest). 
Analyze this custom scope item and provide a realistic cost RANGE for the TOTAL hard cost (materials + labor at $100/hr):

Item: "${description}"
Quantity: ${qty} ${unitType}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{"low": 500, "high": 800, "notes": "Brief 1-2 sentence explanation of what drives the cost range"}

Base your estimate on current Pacific Northwest contractor pricing (2024-2025). Be realistic and specific.`;

  const response = await fetch(`${FORGE_API_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${FORGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'claude-3-5-haiku',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    }),
  });

  if (!response.ok) throw new Error('AI analysis failed');
  const data = await response.json();
  const text = data.choices?.[0]?.message?.content ?? '';
  const parsed = JSON.parse(text.trim());
  return { low: parsed.low, high: parsed.high, notes: parsed.notes };
}

// ─── GLOBAL SETTINGS PANEL ────────────────────────────────────
function GlobalSettingsPanel() {
  const { state, setGlobal, setDeposit } = useEstimator();
  const { global } = state;
  const totals = useMemo(() => {
    const phaseResults = state.phases.map(p => calcPhase(p, global));
    const customResults = state.customItems.map(ci => calcCustomItem(ci, global));
    return calcTotals(phaseResults, customResults);
  }, [state.phases, state.customItems, global]);

  return (
    <div className="card-section mb-6">
      <div className="card-section-header">
        <span>⚙️</span>
        <span>Global Settings</span>
        <span className="ml-auto text-xs text-muted-foreground font-normal">Default for all line items — override per item below</span>
      </div>
      <div className="card-section-body grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <label className="field-label">Default Target GM</label>
          <div className="flex items-center gap-2">
            <input
              type="range" min={20} max={60} step={1}
              value={Math.round(global.markupPct * 100)}
              onChange={e => setGlobal({ markupPct: parseInt(e.target.value) / 100 })}
              className="flex-1"
            />
            <span className="text-sm font-bold mono w-10 text-right">{Math.round(global.markupPct * 100)}%</span>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">applied to items without override</div>
        </div>
        <div>
          <label className="field-label">Default Labor Rate</label>
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
          <div className="text-xs text-muted-foreground mt-0.5">paint prep labor (Drywall &amp; Trim phases)</div>
        </div>
      </div>
      {/* ── Deposit Configuration ── */}
      <div className="px-4 pb-3 border-t border-slate-100 pt-3">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground w-28 shrink-0">Deposit</span>
          {/* Type toggle */}
          <div className="flex rounded-lg border border-border overflow-hidden">
            <button
              onClick={() => setDeposit('pct', state.depositValue)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                state.depositType === 'pct'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              %
            </button>
            <button
              onClick={() => setDeposit('flat', state.depositValue)}
              className={`px-3 py-1.5 text-xs font-semibold transition-colors ${
                state.depositType === 'flat'
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-background text-muted-foreground hover:bg-muted'
              }`}
            >
              $
            </button>
          </div>
          {/* Value input */}
          <div className="flex items-center gap-1.5">
            {state.depositType === 'flat' && (
              <span className="text-sm font-semibold text-muted-foreground">$</span>
            )}
            <input
              type="number"
              min={state.depositType === 'pct' ? 0 : 0}
              max={state.depositType === 'pct' ? 100 : undefined}
              step={state.depositType === 'pct' ? 1 : 100}
              value={state.depositValue}
              onChange={e => {
                const v = parseFloat(e.target.value);
                if (!isNaN(v) && v >= 0) setDeposit(state.depositType, v);
              }}
              className="w-24 border border-border rounded-lg px-2 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-ring text-right"
            />
            {state.depositType === 'pct' && (
              <span className="text-sm font-semibold text-muted-foreground">%</span>
            )}
          </div>
          {/* Live deposit amount preview */}
          {totals.hasData && (
            <span className="text-xs text-muted-foreground">
              = <span className="font-semibold text-foreground">
                {state.depositType === 'pct'
                  ? fmtDollar(totals.price * (state.depositValue / 100))
                  : fmtDollar(state.depositValue)
                }
              </span> deposit on {fmtDollar(totals.price)} total
            </span>
          )}
          {/* Quick presets */}
          <div className="flex gap-1 ml-auto">
            {[25, 33, 50].map(pct => (
              <button
                key={pct}
                onClick={() => setDeposit('pct', pct)}
                className={`px-2 py-1 text-[10px] font-semibold rounded border transition-colors ${
                  state.depositType === 'pct' && state.depositValue === pct
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'border-border text-muted-foreground hover:bg-muted'
                }`}
              >
                {pct}%
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overall margin summary */}
      {totals.hasData && (
        <div className="mx-4 mb-3 rounded-lg bg-slate-50 border border-slate-200 p-3 grid grid-cols-4 gap-3 text-center">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Hard Cost</div>
            <div className="text-sm font-bold mono">{fmtDollar(totals.hardCost)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Customer Price</div>
            <div className="text-sm font-bold mono text-primary">{fmtDollar(totals.price)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Blended GM</div>
            <div className={`text-sm font-bold mono ${totals.gm >= 0.30 ? 'text-emerald-600' : 'text-red-600'}`}>
              {Math.round(totals.gm * 100)}%
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Gross Profit</div>
            <div className="text-sm font-bold mono text-emerald-700">{fmtDollar(totals.grossProfit)}</div>
          </div>
        </div>
      )}
      <div className="px-4 pb-3">
        <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          <strong>GM floors:</strong> Jobs with hard cost ≥ $2,000 → 30% minimum GM. Jobs under $2,000 → 40% minimum GM. Per-item markup overrides the global default.
        </div>
      </div>
    </div>
  );
}

// ─── PHASE SELECTOR GRID ─────────────────────────────────────
// Renders phases in the correct construction sequence (ALL_PHASES order)
function PhaseTabBar({ phases, activePhaseId, onSelect, phaseResults }: {
  phases: { id: number; name: string; icon: string }[];
  activePhaseId: number;
  onSelect: (id: number) => void;
  phaseResults: Map<number, { hasData: boolean; price: number }>;
}) {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
        Select Phase — Construction Sequence
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {phases.map((p, idx) => {
          const result = phaseResults.get(p.id);
          const hasData = result?.hasData ?? false;
          const isActive = p.id === activePhaseId;
          return (
            <button
              key={p.id}
              onClick={() => onSelect(p.id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left transition-all ${
                isActive
                  ? 'border-primary bg-primary/5 text-primary shadow-sm'
                  : 'border-border bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground hover:bg-muted/40'
              }`}
            >
              <span className="text-[10px] font-bold text-muted-foreground/60 w-4 shrink-0">{idx + 1}</span>
              <span className="text-base shrink-0 leading-none">{p.icon}</span>
              <span className="text-xs font-semibold leading-tight line-clamp-2 flex-1 min-w-0">{p.name}</span>
              {hasData && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── LINE ITEM ROW ────────────────────────────────────────────
// Field order: Dimension → Style/Notes → Tier → Qty → Labor → Markup → Final Price
function LineItemRow({ item, phaseId, showPaintPrep }: { item: LineItem; phaseId: number; showPaintPrep: boolean }) {
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
            {item.markupPct !== null && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded">
                {Math.round(item.markupPct * 100)}% GM override
              </span>
            )}
          </div>
          {item.flagged && item.flagNote && (
            <div className="text-xs text-amber-600 mt-0.5">{item.flagNote}</div>
          )}
          {/* Dimension quick badge in header */}
          {item.dimensionOptions && item.dimensionOptions.length > 0 && (
            <div className="flex items-center gap-1 mt-0.5" onClick={e => e.stopPropagation()}>
              <Ruler size={10} className="text-muted-foreground shrink-0" />
              <select
                value={item.selectedDimension || item.dimensionOptions[0].value}
                onChange={e => update({ selectedDimension: e.target.value })}
                className="text-xs border border-border rounded px-1 py-0.5 bg-background text-foreground max-w-[160px] cursor-pointer"
              >
                {item.dimensionOptions.map(d => (
                  <option key={d.value} value={d.value}>{d.label}</option>
                ))}
              </select>
            </div>
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

      {/* ── Expanded detail — field order: Dimension → Style → Tier → Qty → Labor → Markup → Final Price ── */}
      {expanded && (
        <div className="border-t border-border p-4 space-y-4">

          {/* 1. DIMENSION — full button grid */}
          {item.dimensionOptions && item.dimensionOptions.length > 0 && (
            <div>
              <label className="field-label flex items-center gap-1.5">
                <Ruler size={12} /> 1. Size / Dimension
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                {item.dimensionOptions.map(dim => {
                  const isSelected = (item.selectedDimension || item.dimensionOptions![0].value) === dim.value;
                  const tierRate = item.tiers[item.tier as Tier]?.rate ?? 0;
                  const effectiveRate = dim.rateOverride !== undefined
                    ? dim.rateOverride
                    : dim.rateMultiplier !== undefined
                      ? tierRate * dim.rateMultiplier
                      : tierRate;
                  return (
                    <button
                      key={dim.value}
                      onClick={() => update({ selectedDimension: dim.value })}
                      className={`text-left p-2 rounded-lg border-2 transition-all ${
                        isSelected ? 'border-primary bg-primary/5' : 'border-border hover:border-muted-foreground/40'
                      }`}
                    >
                      <div className={`text-xs font-semibold leading-tight ${isSelected ? 'text-primary' : 'text-foreground'}`}>
                        {dim.label}
                      </div>
                      {dim.note && (
                        <div className="text-[10px] text-muted-foreground mt-0.5">{dim.note}</div>
                      )}
                      {item.hasTiers && (
                        <div className="text-[10px] font-bold mono text-muted-foreground mt-1">
                          {fmtDollarCents(effectiveRate)}/{UNIT_LABELS[item.unitType]}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* 2. STYLE / NOTES */}
          <div>
            <label className="field-label">2. Style / Notes (internal)</label>
            <input
              type="text"
              value={item.notes}
              onChange={e => update({ notes: e.target.value })}
              placeholder="e.g. herringbone pattern, custom color, special finish…"
              className="field-input w-full"
            />
          </div>

          {/* 3. TIER — Good / Better / Best */}
          {item.hasTiers && (
            <div>
              <label className="field-label">3. Material Tier</label>
              <div className="grid grid-cols-3 gap-2">
                {(['good', 'better', 'best'] as Tier[]).map(tier => {
                  const td = item.tiers[tier];
                  const isSelected = item.tier === tier;
                  let displayRate = td.rate;
                  if (item.dimensionOptions && item.selectedDimension) {
                    const dim = item.dimensionOptions.find(d => d.value === item.selectedDimension);
                    if (dim) {
                      if (dim.rateOverride !== undefined) displayRate = dim.rateOverride;
                      else if (dim.rateMultiplier !== undefined) displayRate = td.rate * dim.rateMultiplier;
                    }
                  }
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
                      <div className="text-xs text-muted-foreground leading-tight mt-0.5 line-clamp-2">{td.desc}</div>
                      <div className="text-xs font-bold mono text-primary mt-1.5">
                        {fmtDollarCents(displayRate)}/{unitLabel}
                        {item.dimensionOptions && item.selectedDimension && displayRate !== td.rate && (
                          <span className="text-[10px] text-muted-foreground font-normal ml-1">(adj.)</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
              {item.dimensionOptions && item.selectedDimension && (() => {
                const dim = item.dimensionOptions.find(d => d.value === item.selectedDimension);
                return dim ? (
                  <div className="text-xs text-muted-foreground mt-1.5">
                    {item.tiers[item.tier].name} — {item.tiers[item.tier].desc}
                    <span className="ml-1 text-primary font-medium">· {dim.label}</span>
                  </div>
                ) : null;
              })()}
            </div>
          )}

          {/* 4. QUANTITY + WASTE */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="field-label">4. Quantity ({unitLabel})</label>
              <input
                type="number" min={0}
                value={item.qty || ''}
                onChange={e => update({ qty: parseFloat(e.target.value) || 0 })}
                placeholder="0"
                className="field-input w-full"
              />
            </div>
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
          </div>

          {/* 5. LABOR */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="field-label">5. Labor Mode</label>
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
            <div>
              <label className="field-label">Labor Rate ($/hr)</label>
              <input
                type="number" min={0}
                value={item.laborRate}
                onChange={e => update({ laborRate: parseFloat(e.target.value) || 0 })}
                className="field-input w-full"
              />
            </div>
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
          </div>

          {/* Paint prep — only shown in Drywall (5) and Trim (11) phases */}
          {item.hasPaintPrep && showPaintPrep && (
            <div>
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
            </div>
          )}

          {/* 6. MARKUP OVERRIDE */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="field-label mb-0">6. Markup Override</label>
              <button
                onClick={() => update({ markupPct: item.markupPct !== null ? null : state.global.markupPct })}
                className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                  item.markupPct !== null
                    ? 'border-blue-300 bg-blue-50 text-blue-700 hover:bg-blue-100'
                    : 'border-border text-muted-foreground hover:border-foreground'
                }`}
              >
                {item.markupPct !== null ? 'Using override — click to reset' : 'Using global — click to override'}
              </button>
            </div>
            {item.markupPct !== null ? (
              <div className="flex items-center gap-2">
                <input
                  type="range" min={15} max={70} step={1}
                  value={Math.round(item.markupPct * 100)}
                  onChange={e => update({ markupPct: parseInt(e.target.value) / 100 })}
                  className="flex-1"
                />
                <span className="text-sm font-bold mono w-10 text-right text-blue-700">
                  {Math.round(item.markupPct * 100)}%
                </span>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground">
                Using global default: {Math.round(state.global.markupPct * 100)}% GM
              </div>
            )}
          </div>

          {/* 7. FINAL PRICE — cost breakdown */}
          {result.hasData && (
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">7. Final Price Breakdown</div>
              <div className="space-y-1 text-xs">
                {item.hasTiers && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">
                      Material ({fmtDollarCents(result.matRate)}/{unitLabel} × {result.purchaseQty.toFixed(1)} {unitLabel})
                      {item.dimensionOptions && item.selectedDimension && (() => {
                        const dim = item.dimensionOptions.find(d => d.value === item.selectedDimension);
                        return dim ? <span className="ml-1 text-primary font-medium">[ {dim.label} ]</span> : null;
                      })()}
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
                <div className="flex justify-between font-bold text-primary text-sm">
                  <span>Customer price ({Math.round(result.gm * 100)}% GM · {item.markupPct !== null ? 'override' : 'global'})</span>
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

// ─── CUSTOM ITEM ROW (existing global custom items) ───────────
function CustomItemRow({ ci }: { ci: CustomLineItem }) {
  const { state, updateCustomItem, removeCustomItem } = useEstimator();
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const result = useMemo(() => calcCustomItem(ci, state.global), [ci, state.global]);

  const handleAiAnalyze = useCallback(async () => {
    if (!ci.description.trim()) {
      toast.error('Add a description first');
      return;
    }
    setAnalyzing(true);
    try {
      const analysis = await analyzeCustomItemCost(ci.description, ci.qty, ci.unitType);
      updateCustomItem(ci.id, {
        aiAnalysis: {
          loading: false,
          lowEstimate: analysis.low,
          highEstimate: analysis.high,
          notes: analysis.notes,
          timestamp: Date.now(),
        },
      });
      toast.success('AI analysis complete');
    } catch {
      toast.error('AI analysis failed — check connection');
    } finally {
      setAnalyzing(false);
    }
  }, [ci, updateCustomItem]);

  return (
    <div className="border border-dashed border-blue-300 rounded-xl mb-3 bg-blue-50/30">
      <div
        className="flex items-center gap-3 p-3 cursor-pointer select-none"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="inline-flex items-center gap-1 text-[10px] font-bold text-blue-700 bg-blue-100 border border-blue-300 px-1.5 py-0.5 rounded">
              CUSTOM
            </span>
            <span className="font-semibold text-sm text-foreground truncate">
              {ci.description || 'Untitled custom item'}
            </span>
          </div>
          {ci.aiAnalysis && (
            <div className="text-xs text-blue-600 mt-0.5">
              AI range: {fmtDollar(ci.aiAnalysis.lowEstimate)} – {fmtDollar(ci.aiAnalysis.highEstimate)} hard cost
            </div>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
          <input
            type="number" min={0}
            value={ci.qty || ''}
            onChange={e => updateCustomItem(ci.id, { qty: parseFloat(e.target.value) || 0 })}
            placeholder="0"
            className="field-input w-16 text-right"
          />
          <span className="text-xs text-muted-foreground">{UNIT_LABELS[ci.unitType]}</span>
        </div>

        {result.hasData && (
          <div className="shrink-0 text-right">
            <div className="text-sm font-bold mono text-primary">{fmtDollar(result.price)}</div>
            <div className="text-[10px] text-muted-foreground">customer</div>
          </div>
        )}

        <button
          onClick={e => { e.stopPropagation(); removeCustomItem(ci.id); }}
          className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
        >
          <Trash2 size={14} />
        </button>
        <ChevronDown size={14} className={`text-muted-foreground shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </div>

      {expanded && (
        <div className="border-t border-blue-200 p-4 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="field-label">Description</label>
              <input
                type="text"
                value={ci.description}
                onChange={e => updateCustomItem(ci.id, { description: e.target.value })}
                placeholder="e.g. Custom built-in bookshelf, 8 ft wide × 8 ft tall"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="field-label">Unit Type</label>
              <select
                value={ci.unitType}
                onChange={e => updateCustomItem(ci.id, { unitType: e.target.value as UnitType })}
                className="field-input w-full"
              >
                {Object.entries(UNIT_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label">Quantity</label>
              <input
                type="number" min={0}
                value={ci.qty || ''}
                onChange={e => updateCustomItem(ci.id, { qty: parseFloat(e.target.value) || 0 })}
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="field-label">Material Cost / Unit ($)</label>
              <input
                type="number" min={0} step={0.01}
                value={ci.matCostPerUnit || ''}
                onChange={e => updateCustomItem(ci.id, { matCostPerUnit: parseFloat(e.target.value) || 0 })}
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="field-label">Labor Hours / Unit</label>
              <input
                type="number" min={0} step={0.25}
                value={ci.laborHrsPerUnit || ''}
                onChange={e => updateCustomItem(ci.id, { laborHrsPerUnit: parseFloat(e.target.value) || 0 })}
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="field-label">Labor Rate ($/hr)</label>
              <input
                type="number" min={0}
                value={ci.laborRate}
                onChange={e => updateCustomItem(ci.id, { laborRate: parseFloat(e.target.value) || 0 })}
                className="field-input w-full"
              />
            </div>

            {/* Markup override */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="field-label mb-0">Markup Override</label>
                <button
                  onClick={() => updateCustomItem(ci.id, { markupPct: ci.markupPct !== null ? null : state.global.markupPct })}
                  className={`text-[10px] font-bold px-2 py-0.5 rounded border transition-colors ${
                    ci.markupPct !== null
                      ? 'border-blue-300 bg-blue-50 text-blue-700'
                      : 'border-border text-muted-foreground hover:border-foreground'
                  }`}
                >
                  {ci.markupPct !== null ? 'Using override — click to reset' : 'Using global — click to override'}
                </button>
              </div>
              {ci.markupPct !== null ? (
                <div className="flex items-center gap-2">
                  <input
                    type="range" min={15} max={70} step={1}
                    value={Math.round(ci.markupPct * 100)}
                    onChange={e => updateCustomItem(ci.id, { markupPct: parseInt(e.target.value) / 100 })}
                    className="flex-1"
                  />
                  <span className="text-sm font-bold mono w-10 text-right text-blue-700">
                    {Math.round(ci.markupPct * 100)}%
                  </span>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground">
                  Using global default: {Math.round(state.global.markupPct * 100)}% GM
                </div>
              )}
            </div>

            {/* Notes */}
            <div className="sm:col-span-2">
              <label className="field-label">Notes (internal)</label>
              <input
                type="text"
                value={ci.notes}
                onChange={e => updateCustomItem(ci.id, { notes: e.target.value })}
                placeholder="Optional notes"
                className="field-input w-full"
              />
            </div>
          </div>

          {/* AI analysis */}
          <div>
            <button
              onClick={handleAiAnalyze}
              disabled={analyzing || !ci.description.trim()}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-blue-300 bg-blue-50 text-blue-700 text-xs font-semibold hover:bg-blue-100 disabled:opacity-50 transition-colors"
            >
              {analyzing ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
              {analyzing ? 'Analyzing…' : 'Analyze Scope (AI)'}
            </button>
            {ci.aiAnalysis && (
              <div className="mt-2 rounded-lg bg-blue-50 border border-blue-200 p-3 text-xs">
                <div className="font-bold text-blue-700 mb-1">AI Cost Range</div>
                <div className="flex gap-4 mb-1">
                  <span>Low: <strong>{fmtDollar(ci.aiAnalysis.lowEstimate)}</strong></span>
                  <span>High: <strong>{fmtDollar(ci.aiAnalysis.highEstimate)}</strong></span>
                </div>
                <div className="text-blue-600">{ci.aiAnalysis.notes}</div>
              </div>
            )}
          </div>

          {/* Cost breakdown */}
          {result.hasData && (
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Final Price Breakdown</div>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Material ({ci.qty} × ${ci.matCostPerUnit})</span>
                  <span className="font-mono">{fmtDollar(result.matCost)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labor ({ci.qty} × {ci.laborHrsPerUnit} hrs × ${ci.laborRate}/hr)</span>
                  <span className="font-mono">{fmtDollar(result.laborCost)}</span>
                </div>
                <div className="flex justify-between border-t border-border pt-1 font-semibold">
                  <span>Hard cost</span>
                  <span className="font-mono">{fmtDollar(result.hardCost)}</span>
                </div>
                <div className="flex justify-between font-bold text-primary text-sm">
                  <span>Customer price ({Math.round(result.gm * 100)}% GM · {ci.markupPct !== null ? 'override' : 'global'})</span>
                  <span className="font-mono">{fmtDollar(result.price)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── ADD CUSTOM MATERIAL ROW (per-trade, inline) ──────────────
// Shown at the bottom of every phase accordion for quick custom material entry
function AddCustomMaterialRow({ phaseId }: { phaseId: number }) {
  const { state, addCustomItem } = useEstimator();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    description: '',
    unitType: 'unit' as UnitType,
    dimension: '',
    qty: 1,
    matCostPerUnit: 0,
    laborHrsPerUnit: 0,
    laborRate: state.global.laborRate,
  });

  const hardCost = form.qty * form.matCostPerUnit + form.qty * form.laborHrsPerUnit * form.laborRate;
  const customerPrice = hardCost > 0 ? hardCost / (1 - state.global.markupPct) : 0;

  const handleAdd = () => {
    if (!form.description.trim()) return;
    addCustomItem({
      phaseId,
      description: form.dimension
        ? `${form.description} [${form.dimension}]`
        : form.description,
      unitType: form.unitType,
      qty: form.qty,
      matCostPerUnit: form.matCostPerUnit,
      laborHrsPerUnit: form.laborHrsPerUnit,
      laborRate: form.laborRate,
      notes: '',
      markupPct: null,
    });
    setForm({
      description: '',
      unitType: 'unit',
      dimension: '',
      qty: 1,
      matCostPerUnit: 0,
      laborHrsPerUnit: 0,
      laborRate: state.global.laborRate,
    });
    setOpen(false);
    toast.success('Custom material added');
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-violet-300 text-violet-600 hover:border-violet-400 hover:bg-violet-50/50 transition-all text-sm font-semibold mt-2"
      >
        <Plus size={15} />
        Add Custom Material / Scope Item
      </button>
    );
  }

  return (
    <div className="border-2 border-dashed border-violet-300 rounded-xl p-4 mt-2 bg-violet-50/20">
      <div className="flex items-center justify-between mb-3">
        <div className="text-xs font-bold text-violet-700 uppercase tracking-wider">Custom Material / Scope</div>
        <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
      </div>

      {/* Row 1: Description + Dimension + Unit */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
        <div className="sm:col-span-1">
          <label className="field-label">Description</label>
          <input
            type="text"
            value={form.description}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
            placeholder="e.g. Custom tile accent wall"
            className="field-input w-full"
            autoFocus
          />
        </div>
        <div>
          <label className="field-label">Dimension / Size (optional)</label>
          <input
            type="text"
            value={form.dimension}
            onChange={e => setForm(f => ({ ...f, dimension: e.target.value }))}
            placeholder="e.g. 12x24, 3/4 inch, 2x6"
            className="field-input w-full"
          />
        </div>
        <div>
          <label className="field-label">Unit Type</label>
          <select
            value={form.unitType}
            onChange={e => setForm(f => ({ ...f, unitType: e.target.value as UnitType }))}
            className="field-input w-full"
          >
            {Object.entries(UNIT_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Row 2: Qty + Mat Cost + Labor Hrs + Labor Rate */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
        <div>
          <label className="field-label">Qty</label>
          <input
            type="number" min={0}
            value={form.qty || ''}
            onChange={e => setForm(f => ({ ...f, qty: parseFloat(e.target.value) || 0 }))}
            className="field-input w-full"
          />
        </div>
        <div>
          <label className="field-label">Mat Cost / Unit ($)</label>
          <input
            type="number" min={0} step={0.01}
            value={form.matCostPerUnit || ''}
            onChange={e => setForm(f => ({ ...f, matCostPerUnit: parseFloat(e.target.value) || 0 }))}
            placeholder="0.00"
            className="field-input w-full"
          />
        </div>
        <div>
          <label className="field-label">Labor Hrs / Unit</label>
          <input
            type="number" min={0} step={0.25}
            value={form.laborHrsPerUnit || ''}
            onChange={e => setForm(f => ({ ...f, laborHrsPerUnit: parseFloat(e.target.value) || 0 }))}
            placeholder="0"
            className="field-input w-full"
          />
        </div>
        <div>
          <label className="field-label">Labor Rate ($/hr)</label>
          <input
            type="number" min={0}
            value={form.laborRate}
            onChange={e => setForm(f => ({ ...f, laborRate: parseFloat(e.target.value) || 0 }))}
            className="field-input w-full"
          />
        </div>
      </div>

      {/* Live price preview */}
      {hardCost > 0 && (
        <div className="flex items-center gap-4 text-xs mb-3 px-3 py-2 rounded-lg bg-violet-50 border border-violet-200">
          <span className="text-muted-foreground">Hard cost: <strong className="font-mono text-foreground">{fmtDollar(hardCost)}</strong></span>
          <span className="text-violet-700">→ Customer price: <strong className="font-mono">{fmtDollar(customerPrice)}</strong> ({Math.round(state.global.markupPct * 100)}% GM)</span>
        </div>
      )}

      <button
        onClick={handleAdd}
        disabled={!form.description.trim()}
        className="px-5 py-2 rounded-lg bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-50 transition-colors"
      >
        Add to Estimate
      </button>
    </div>
  );
}

// ─── PHASE PANEL ──────────────────────────────────────────────
function PhasePanel({ phaseId }: { phaseId: number }) {
  const { state } = useEstimator();
  const phase = state.phases.find(p => p.id === phaseId);
  if (!phase) return null;

  // Paint prep UI is only shown for Drywall (5) and Trim & Finish Carpentry (11)
  const showPaintPrep = PAINT_PREP_PHASE_IDS.has(phaseId);

  // Find the sequential build-order position of this phase
  const buildOrderPos = ALL_PHASES.findIndex(p => p.id === phaseId) + 1;

  const phaseCustomItems = state.customItems.filter(ci => ci.phaseId === phaseId);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{phase.icon}</span>
        <div>
          <h2 className="font-bold text-foreground">
            Step {buildOrderPos}: {phase.name}
          </h2>
          <div className="text-xs text-muted-foreground">
            {phase.items.length} standard items
            {phaseCustomItems.length > 0 && (
              <span className="ml-1 text-violet-600 font-medium">· {phaseCustomItems.length} additional material{phaseCustomItems.length !== 1 ? 's' : ''}</span>
            )}
            {showPaintPrep && <span className="ml-2 text-amber-600 font-medium">· Paint prep available</span>}
          </div>
        </div>
      </div>

      {/* Standard line items */}
      {phase.items.map(item => (
        <LineItemRow key={item.id} item={item} phaseId={phase.id} showPaintPrep={showPaintPrep} />
      ))}

      {/* ── Additional Materials section ───────────────────────────────────── */}
      <div className="mt-6">
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1 h-px bg-violet-200 dark:bg-violet-800" />
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold uppercase tracking-wider text-violet-700 dark:text-violet-400">
              Additional Materials
            </span>
            {phaseCustomItems.length > 0 && (
              <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-violet-600 text-white text-[10px] font-bold">
                {phaseCustomItems.length}
              </span>
            )}
          </div>
          <div className="flex-1 h-px bg-violet-200 dark:bg-violet-800" />
        </div>
        {phaseCustomItems.length === 0 && (
          <p className="text-xs text-muted-foreground text-center mb-3">
            Add multiple materials for this phase — e.g. different trim profiles, door styles, tile sizes, hardware types, etc.
          </p>
        )}
      </div>

      {/* Custom items for this phase */}
      {phaseCustomItems.map(ci => (
        <CustomItemRow key={ci.id} ci={ci} />
      ))}

      {/* Per-trade custom material entry */}
      <AddCustomMaterialRow phaseId={phaseId} />
    </div>
  );
}

// ─── MAIN CALCULATOR SECTION ──────────────────────────────────
export default function CalculatorSection() {
  const { state, updateOpportunity } = useEstimator();
  const [activePhaseId, setActivePhaseId] = useState<number>(ALL_PHASES[0].id);

  // Phase results keyed by phase ID
  const phaseResults = useMemo(() => {
    const map = new Map<number, { hasData: boolean; price: number }>();
    state.phases.forEach(phase => {
      const result = calcPhase(phase, state.global);
      const hasCustom = state.customItems.some(ci => ci.phaseId === phase.id && ci.qty > 0);
      map.set(phase.id, { hasData: result.hasData || hasCustom, price: result.price });
    });
    return map;
  }, [state.phases, state.customItems, state.global]);

  // Grand totals across ALL phases
  const grandTotals = useMemo(() => {
    const allPhaseResults = state.phases.map(p => calcPhase(p, state.global));
    const allCustomResults = state.customItems.map(ci => calcCustomItem(ci, state.global));
    return calcTotals(allPhaseResults, allCustomResults);
  }, [state.phases, state.customItems, state.global]);

  // Sync calculated price back to the active opportunity
  useEffect(() => {
    if (state.activeOpportunityId && grandTotals.hasData && grandTotals.price > 0) {
      updateOpportunity(state.activeOpportunityId, { value: grandTotals.price });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grandTotals.price, state.activeOpportunityId]);

  // Render phases in correct construction sequence (ALL_PHASES order)
  const orderedPhases = useMemo(
    () => ALL_PHASES.map(ap => state.phases.find(p => p.id === ap.id)!).filter(Boolean),
    [state.phases]
  );

  return (
    <div className="pb-24">
      <GlobalSettingsPanel />
      <PhaseTabBar
        phases={orderedPhases.map(p => ({ id: p.id, name: p.name, icon: p.icon }))}
        activePhaseId={activePhaseId}
        onSelect={setActivePhaseId}
        phaseResults={phaseResults}
      />
      <PhasePanel phaseId={activePhaseId} />

      {/* Sticky total cost summary bar */}
      {grandTotals.hasData && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-sm border-t border-slate-200 shadow-[0_-4px_24px_rgba(0,0,0,0.10)] px-4 py-3">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-5 flex-wrap">
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hard Cost</div>
                <div className="text-sm font-bold font-mono text-slate-700">{fmtDollar(grandTotals.hardCost)}</div>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross Profit</div>
                <div className="text-sm font-bold font-mono text-emerald-600">{fmtDollar(grandTotals.grossProfit)}</div>
              </div>
              <div className="w-px h-8 bg-slate-200" />
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Blended GM</div>
                <div className={`text-sm font-bold font-mono ${
                  grandTotals.gm >= 0.30 ? 'text-emerald-600' : 'text-red-600'
                }`}>{Math.round(grandTotals.gm * 100)}%</div>
              </div>
            </div>
            <div className="text-right">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Customer Price</div>
              <div className="text-2xl font-bold font-mono text-primary leading-tight">{fmtDollar(grandTotals.price)}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
