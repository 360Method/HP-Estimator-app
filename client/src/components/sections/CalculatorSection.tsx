// ============================================================
// HP Field Estimator v3 — Calculator Section
// Per-line-item markup, per-phase custom items, AI cost analysis
// ============================================================

import { useState, useMemo, useCallback } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcLineItem, calcCustomItem, calcTotals, fmtDollar, fmtDollarCents, getMarginFlag, getMarginLabel } from '@/lib/calc';
import { LineItem, CustomLineItem, Tier, UNIT_LABELS, UnitType } from '@/lib/types';
import { ChevronDown, AlertTriangle, CheckCircle2, XCircle, Sparkles, Plus, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const FORGE_API_URL = import.meta.env.VITE_FRONTEND_FORGE_API_URL as string;
const FORGE_API_KEY = import.meta.env.VITE_FRONTEND_FORGE_API_KEY as string;

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
  const { state, setGlobal } = useEstimator();
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
          <div className="text-xs text-muted-foreground mt-0.5">paint prep labor</div>
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
function PhaseTabBar({ phases, activePhaseId, onSelect, phaseResults }: {
  phases: { id: number; name: string; icon: string }[];
  activePhaseId: number;
  onSelect: (id: number) => void;
  phaseResults: Map<number, { hasData: boolean; price: number }>;
}) {
  return (
    <div className="mb-5">
      <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2 px-0.5">
        Select Phase
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
        {phases.map(p => {
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
function LineItemRow({ item, phaseId }: { item: LineItem; phaseId: number }) {
  const { state, updateItem } = useEstimator();
  const [expanded, setExpanded] = useState(false);

  const result = useMemo(() => calcLineItem(item, state.global), [item, state.global]);
  const flag = getMarginFlag(result.gm, result.hardCost);
  const flagLabel = getMarginLabel(result.gm, result.hardCost, result.price);
  const unitLabel = UNIT_LABELS[item.unitType];
  const effectiveMarkup = item.markupPct !== null && item.markupPct !== undefined
    ? item.markupPct
    : state.global.markupPct;

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
              </div>
            )}

            {/* ── Per-item markup override ── */}
            <div className="sm:col-span-2 lg:col-span-3">
              <div className="flex items-center justify-between mb-1">
                <label className="field-label mb-0">Markup Override</label>
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

// ─── CUSTOM ITEM ROW (per-phase) ──────────────────────────────
function CustomItemRow({ ci }: { ci: CustomLineItem }) {
  const { state, updateCustomItem, removeCustomItem } = useEstimator();
  const [expanded, setExpanded] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);

  const result = useMemo(() => calcCustomItem(ci, state.global), [ci, state.global]);
  const effectiveMarkup = ci.markupPct !== null && ci.markupPct !== undefined
    ? ci.markupPct
    : state.global.markupPct;

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

            {/* Per-item markup override */}
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
                  {ci.markupPct !== null ? 'Override active — click to reset' : 'Using global — click to override'}
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
                <div className="text-xs text-muted-foreground">Using global: {Math.round(state.global.markupPct * 100)}% GM</div>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="field-label">Internal Notes</label>
              <input
                type="text"
                value={ci.notes}
                onChange={e => updateCustomItem(ci.id, { notes: e.target.value })}
                placeholder="Notes for estimator / sub"
                className="field-input w-full"
              />
            </div>
          </div>

          {/* AI Analysis */}
          <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-blue-800 flex items-center gap-1.5">
                <Sparkles size={12} />
                AI Scope Analysis
              </div>
              <button
                onClick={handleAiAnalyze}
                disabled={analyzing || !ci.description.trim()}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {analyzing ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
                {analyzing ? 'Analyzing...' : 'Analyze Scope'}
              </button>
            </div>
            {ci.aiAnalysis ? (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-blue-700 font-medium">Estimated hard cost range:</span>
                  <span className="text-sm font-bold mono text-blue-900">
                    {fmtDollar(ci.aiAnalysis.lowEstimate)} – {fmtDollar(ci.aiAnalysis.highEstimate)}
                  </span>
                </div>
                <div className="text-xs text-blue-700 leading-relaxed">{ci.aiAnalysis.notes}</div>
                {ci.matCostPerUnit === 0 && ci.laborHrsPerUnit === 0 && (
                  <div className="text-[10px] text-blue-600 italic">
                    Tip: Use the AI range to fill in material cost and labor hours above.
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-blue-600">
                Enter a description and click "Analyze Scope" — AI will estimate a realistic cost range for this item based on Pacific Northwest contractor pricing.
              </div>
            )}
          </div>

          {/* Cost breakdown */}
          {result.hasData && (
            <div className="rounded-lg bg-muted/40 border border-border p-3">
              <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Cost Breakdown</div>
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
                <div className="flex justify-between font-bold text-primary">
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

// ─── ADD CUSTOM ITEM FORM ─────────────────────────────────────
function AddCustomItemButton({ phaseId }: { phaseId: number }) {
  const { state, addCustomItem } = useEstimator();
  const [open, setOpen] = useState(false);
  const [desc, setDesc] = useState('');

  const handleAdd = () => {
    if (!desc.trim()) return;
    addCustomItem({
      phaseId,
      description: desc.trim(),
      unitType: 'unit',
      qty: 1,
      matCostPerUnit: 0,
      laborHrsPerUnit: 0,
      laborRate: state.global.laborRate,
      notes: '',
      markupPct: null,
    });
    setDesc('');
    setOpen(false);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-blue-300 text-blue-600 hover:border-blue-400 hover:bg-blue-50/50 transition-all text-sm font-semibold mt-2"
      >
        <Plus size={15} />
        Add Custom Item
      </button>
    );
  }

  return (
    <div className="border-2 border-dashed border-blue-300 rounded-xl p-4 mt-2 bg-blue-50/30">
      <div className="text-xs font-bold text-blue-700 mb-2">New Custom Item</div>
      <div className="flex gap-2">
        <input
          type="text"
          value={desc}
          onChange={e => setDesc(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          placeholder="e.g. Custom built-in bookshelf, 8 ft wide"
          className="field-input flex-1"
          autoFocus
        />
        <button
          onClick={handleAdd}
          disabled={!desc.trim()}
          className="px-4 py-1.5 rounded-lg bg-blue-600 text-white text-sm font-semibold hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          Add
        </button>
        <button
          onClick={() => { setOpen(false); setDesc(''); }}
          className="px-3 py-1.5 rounded-lg border border-border text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ─── PHASE PANEL ──────────────────────────────────────────────
function PhasePanel({ phaseId }: { phaseId: number }) {
  const { state } = useEstimator();
  const phase = state.phases.find(p => p.id === phaseId);
  if (!phase) return null;

  const phaseCustomItems = state.customItems.filter(ci => ci.phaseId === phaseId);

  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <span className="text-2xl">{phase.icon}</span>
        <div>
          <h2 className="font-bold text-foreground">Phase {phase.id}: {phase.name}</h2>
          <div className="text-xs text-muted-foreground">{phase.items.length} standard items · {phaseCustomItems.length} custom</div>
        </div>
      </div>
      {phase.items.map(item => (
        <LineItemRow key={item.id} item={item} phaseId={phase.id} />
      ))}
      {/* Custom items for this phase */}
      {phaseCustomItems.map(ci => (
        <CustomItemRow key={ci.id} ci={ci} />
      ))}
      <AddCustomItemButton phaseId={phaseId} />
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
      const hasCustom = state.customItems.some(ci => ci.phaseId === phase.id && ci.qty > 0);
      map.set(phase.id, { hasData: result.hasData || hasCustom, price: result.price });
    });
    return map;
  }, [state.phases, state.customItems, state.global]);

  // Grand totals across ALL phases (for sticky bar)
  const grandTotals = useMemo(() => {
    const allPhaseResults = state.phases.map(p => calcPhase(p, state.global));
    const allCustomResults = state.customItems.map(ci => calcCustomItem(ci, state.global));
    return calcTotals(allPhaseResults, allCustomResults);
  }, [state.phases, state.customItems, state.global]);

  return (
    <div className="pb-24">
      <GlobalSettingsPanel />
      <PhaseTabBar
        phases={state.phases.map(p => ({ id: p.id, name: p.name, icon: p.icon }))}
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
