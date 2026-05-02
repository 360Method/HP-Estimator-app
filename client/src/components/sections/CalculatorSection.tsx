// ============================================================
// HP Field Estimator v4 — Calculator Section
// Field order: Dimension → Style → Tier → Qty → Labor → Markup → Final Price
// Paint prep restricted to Drywall (phase 5) and Trim (phase 11) only
// Per-trade custom material row inside every phase accordion
// ============================================================

import { useState, useMemo, useCallback, useEffect } from 'react';
import AIEstimateChat from '@/components/AIEstimateChat';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcLineItem, calcCustomItem, calcTotals, fmtDollar, fmtDollarCents, getMarginFlag, getMarginLabel } from '@/lib/calc';
import { LineItem, CustomLineItem, Tier, UNIT_LABELS, UnitType, ConsultantWorkflowMeta } from '@/lib/types';
import { ESTIMATOR_WORKFLOW_STEPS, buildApprovalChecklist, estimateReadinessStatus, findCalculatorQualityIssues, lineItemQuality, selectedScopeCount } from '@/lib/estimateWorkflow';
import { ChevronDown, AlertTriangle, CheckCircle2, XCircle, Sparkles, Plus, Trash2, Loader2, Ruler, Star, ClipboardCheck, ShieldCheck, Send, Search, ClipboardList, Camera, FileText } from 'lucide-react';
import { toast } from 'sonner';
import { ALL_PHASES } from '@/lib/phases';
import { getProductionAudit, summarizeRateBookAudit } from '@/lib/productionRateAudit';
import { trpc, trpcClient } from '@/lib/trpc';
import { calcMemberDiscount, type MemberTier } from '../../../../shared/threeSixtyTiers';

// Paint prep is only relevant for these two phases
const PAINT_PREP_PHASE_IDS = new Set([5, 11]); // Drywall, Trim & Finish Carpentry
const IMAGE_MIME_RE = /^image\//;
const newWorkflowEventId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

// ─── AI COST ANALYSIS ────────────────────────────────────────
// Calls the Forge LLM via the server-side tRPC proxy so the API key stays
// on the server.
async function analyzeCustomItemCost(description: string, qty: number, unitType: string): Promise<{ low: number; high: number; notes: string }> {
  const prompt = `You are a residential remodel estimator in Vancouver, WA (Pacific Northwest).
Analyze this custom scope item and provide a realistic cost RANGE for the TOTAL hard cost (materials + labor at $100/hr):

Item: "${description}"
Quantity: ${qty} ${unitType}

Respond ONLY with valid JSON in this exact format (no markdown, no explanation):
{"low": 500, "high": 800, "notes": "Brief 1-2 sentence explanation of what drives the cost range"}

Base your estimate on current Pacific Northwest contractor pricing (2024-2025). Be realistic and specific.`;

  const data = await trpcClient.forge.proxy.mutate({
    path: 'chat/completions',
    params: {
      model: 'claude-3-5-haiku',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 200,
    },
  });

  const text = data?.choices?.[0]?.message?.content ?? '';
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
          <label className="field-label">Default Gross Margin Target</label>
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
          <div className="text-xs text-muted-foreground mt-0.5">default for new/custom items only</div>
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
          <strong>GM floors:</strong> Jobs with hard cost ≥ $2,000 → 30% minimum GM. Jobs under $2,000 → 40% minimum GM. Per-item gross margin targets override the global default.
        </div>
      </div>
      {totals.hasData && (
        <div className="sticky top-2 z-20 mx-4 mb-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-sm backdrop-blur sm:hidden">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hard</div>
              <div className="text-xs font-bold font-mono">{fmtDollar(totals.hardCost)}</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">GM</div>
              <div className={`text-xs font-bold font-mono ${totals.gm >= 0.3 ? 'text-emerald-600' : 'text-red-600'}`}>{Math.round(totals.gm * 100)}%</div>
            </div>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Price</div>
              <div className="text-xs font-bold font-mono text-primary">{fmtDollar(totals.price)}</div>
            </div>
          </div>
        </div>
      )}
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
  const quality = lineItemQuality(item, result);
  const productionAudit = getProductionAudit(item);

  const update = (payload: Partial<LineItem>) => updateItem(phaseId, item.id, payload);
  const updateProductionAudit = (payload: Partial<typeof productionAudit>) => {
    update({ productionAudit: { ...productionAudit, ...payload } });
  };

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
            {item.qty > 0 && (
              <span className={`inline-flex items-center gap-1 text-[10px] font-bold border px-1.5 py-0.5 rounded ${
                productionAudit.confidence === 'high'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : productionAudit.confidence === 'medium'
                    ? 'bg-amber-50 text-amber-700 border-amber-200'
                    : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {productionAudit.confidence === 'high' ? 'production verified' : `${productionAudit.confidence} confidence`}
              </span>
            )}
            {item.qty > 0 && (
              <div className="flex flex-wrap gap-1 mt-1">
                {[
                  { label: 'Measured', ok: quality.measured },
                  { label: 'Note', ok: quality.note },
                  { label: 'Margin', ok: quality.margin },
                  { label: 'Specialty', ok: quality.specialty },
                  { label: 'Wording', ok: quality.approvedWording },
                  { label: 'Min', ok: !result.minimumLaborApplied },
                  { label: 'Factors', ok: result.complexityFactor === 1 && result.accessFactor === 1 },
                ].map(badge => (
                  <span
                    key={badge.label}
                    className={`inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border ${
                      badge.ok ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {badge.ok ? <CheckCircle2 className="w-3 h-3" /> : <AlertTriangle className="w-3 h-3" />}
                    {badge.label}
                  </span>
                ))}
                {(productionAudit.pricingMode === 'subcontractor' || productionAudit.pricingMode === 'allowance') && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-red-50 text-red-700 border-red-200">
                    <AlertTriangle className="w-3 h-3" /> quote needed
                  </span>
                )}
                {productionAudit.overrideReason.trim() && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200">
                    override present
                  </span>
                )}
              </div>
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
                      {/* For opening-type items, show the LF breakdown note */}
                      {item.unitType === 'opening' && (
                        <div className="text-[10px] text-muted-foreground font-normal mt-0.5 leading-tight">
                          {item.unitType === 'opening' && (() => {
                            // Derive approximate LF from selected dimension note, or default to ~26 LF
                            const dim = item.dimensionOptions?.find(d => d.value === (item.selectedDimension ?? item.dimensionOptions?.[0]?.value));
                            const lfNote = dim?.note?.match(/(\d+)\s*LF/)?.[1];
                            const lf = lfNote ? parseInt(lfNote) : 26;
                            const matPerLf = lf > 0 ? displayRate / lf : 0;
                            return `~${lf} LF × ${fmtDollarCents(matPerLf)}/lf (mat only — labor separate)`;
                          })()}
                        </div>
                      )}
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
              <label className="field-label">Labor hard-cost rate ($/hr)</label>
              <input
                type="number" min={0}
                value={productionAudit.laborCostRate}
                onChange={e => {
                  const rate = parseFloat(e.target.value) || 0;
                  update({ laborRate: rate, productionAudit: { ...productionAudit, laborCostRate: rate } });
                }}
                className="field-input w-full"
              />
              {productionAudit.recommendedSellRate && (
                <div className="text-xs text-muted-foreground mt-1">
                  Sell-rate reference: ${productionAudit.recommendedSellRate}/hr
                </div>
              )}
            </div>
            {item.laborMode === 'hr' ? (
              <div>
                <label className="field-label">Hrs / {unitLabel}</label>
                <input
                  type="number" min={0} step={0.01}
                  value={productionAudit.baseHoursPerUnit}
                  onChange={e => {
                    const hrs = parseFloat(e.target.value) || 0;
                    update({
                      hrsPerUnit: hrs,
                      productionAudit: {
                        ...productionAudit,
                        baseHoursPerUnit: hrs,
                        recommendedHoursPerUnit: hrs,
                      },
                    });
                  }}
                  className="field-input w-full"
                />
                {item.qty > 0 && (
                  <div className="text-xs text-muted-foreground mt-1">
                    Base: {result.baseLaborHrs.toFixed(1)} hrs · modeled: {result.laborHrs.toFixed(1)} hrs
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

          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Production-rate audit</div>
                <div className="text-sm font-semibold text-slate-950">
                  {productionAudit.pricingMode.replace('_', ' ')} / {productionAudit.confidence} confidence / {productionAudit.auditStatus.replace('_', ' ')}
                </div>
              </div>
              {result.minimumLaborApplied && (
                <span className="inline-flex w-fit items-center gap-1 rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">
                  <AlertTriangle size={12} /> minimum hours applied
                </span>
              )}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div><label className="field-label">Min hours</label><input type="number" min={0} step={0.25} value={productionAudit.minChargeHours} onChange={e => updateProductionAudit({ minChargeHours: parseFloat(e.target.value) || 0 })} className="field-input w-full" /></div>
              <div><label className="field-label">Mobilization</label><input type="number" min={0} step={0.25} value={productionAudit.mobilizationHours} onChange={e => updateProductionAudit({ mobilizationHours: parseFloat(e.target.value) || 0 })} className="field-input w-full" /></div>
              <div><label className="field-label">Complexity</label><select value={productionAudit.complexityFactor} onChange={e => updateProductionAudit({ complexityFactor: parseFloat(e.target.value) || 1 })} className="field-input w-full"><option value={1}>Simple / standard</option><option value={1.15}>Detailed</option><option value={1.35}>Complex</option><option value={1.6}>High risk</option></select></div>
              <div><label className="field-label">Access</label><select value={productionAudit.accessFactor} onChange={e => updateProductionAudit({ accessFactor: parseFloat(e.target.value) || 1 })} className="field-input w-full"><option value={1}>Easy access</option><option value={1.1}>Occupied home</option><option value={1.25}>Constrained</option><option value={1.45}>Difficult access</option></select></div>
              <div><label className="field-label">Protection/disposal hrs</label><input type="number" min={0} step={0.25} value={productionAudit.disposalProtectionHours} onChange={e => updateProductionAudit({ disposalProtectionHours: parseFloat(e.target.value) || 0 })} className="field-input w-full" /></div>
              <div><label className="field-label">Sub/allowance $</label><input type="number" min={0} step={25} value={productionAudit.subcontractorAllowance} onChange={e => updateProductionAudit({ subcontractorAllowance: parseFloat(e.target.value) || 0 })} className="field-input w-full" /></div>
              <div><label className="field-label">Pricing mode</label><select value={productionAudit.pricingMode} onChange={e => updateProductionAudit({ pricingMode: e.target.value as typeof productionAudit.pricingMode })} className="field-input w-full"><option value="self_performed">Self-performed</option><option value="subcontractor">Subcontractor</option><option value="allowance">Allowance</option><option value="fixed_price">Fixed price</option></select></div>
              <div><label className="field-label">Confidence</label><select value={productionAudit.confidence} onChange={e => updateProductionAudit({ confidence: e.target.value as typeof productionAudit.confidence })} className="field-input w-full"><option value="high">High</option><option value="medium">Medium</option><option value="low">Low</option></select></div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div><label className="field-label">Override reason</label><input type="text" value={productionAudit.overrideReason} onChange={e => updateProductionAudit({ overrideReason: e.target.value })} placeholder="Required when consultant changes rate assumptions" className="field-input w-full" /></div>
              <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{productionAudit.auditNotes || 'No production-rate notes for this item.'}</div>
            </div>
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

          {/* 6. GROSS MARGIN TARGET */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="field-label mb-0">6. Gross Margin Target</label>
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
                      ? `${result.laborHrs.toFixed(1)} hrs × $${productionAudit.laborCostRate}/hr`
                      : `${item.qty} ${unitLabel} × $${item.flatRatePerUnit}`})
                  </span>
                  <span className="font-mono">{fmtDollar(result.laborCost)}</span>
                </div>
                {result.subcontractorAllowance > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Subcontractor / allowance</span>
                    <span className="font-mono">{fmtDollar(result.subcontractorAllowance)}</span>
                  </div>
                )}
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

            {/* Gross margin target */}
            <div className="sm:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label className="field-label mb-0">Gross Margin Target</label>
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
function PhasePanel({ phaseId, searchQuery = '' }: { phaseId: number; searchQuery?: string }) {
  const { state } = useEstimator();
  const phase = state.phases.find(p => p.id === phaseId);
  if (!phase) return null;
  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleItems = normalizedQuery
    ? phase.items.filter(item =>
        [item.name, item.shortName, item.salesDesc, item.notes, item.flagNote]
          .filter(Boolean)
          .some(value => value.toLowerCase().includes(normalizedQuery))
      )
    : phase.items;

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
            {visibleItems.length} of {phase.items.length} standard items
            {phaseCustomItems.length > 0 && (
              <span className="ml-1 text-violet-600 font-medium">· {phaseCustomItems.length} additional material{phaseCustomItems.length !== 1 ? 's' : ''}</span>
            )}
            {showPaintPrep && <span className="ml-2 text-amber-600 font-medium">· Paint prep available</span>}
          </div>
        </div>
      </div>

      {/* Standard line items */}
      {visibleItems.length === 0 && (
        <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-muted-foreground">
          No calculator items match "{searchQuery}" in this phase.
        </div>
      )}
      {visibleItems.map(item => (
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

// ─── CUSTOM REQUESTS PANEL ───────────────────────────────────
// Items with phaseId=0 are "out-of-scope" custom requests not tied to any trade phase.
// They flow through to PresentSection as "Additional Services".
function CustomRequestsPanel() {
  const { state, addCustomItem, removeCustomItem } = useEstimator();
  const customRequests = state.customItems.filter(ci => ci.phaseId === 0);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    description: '',
    cost: 0,
    marginPct: state.global.markupPct * 100, // default to global markup
  });

  const sellPrice = form.cost > 0 && form.marginPct < 100
    ? form.cost / (1 - form.marginPct / 100)
    : 0;

  const handleAdd = () => {
    if (!form.title.trim() || form.cost <= 0) {
      toast.error('Title and cost are required');
      return;
    }
    addCustomItem({
      phaseId: 0,
      description: form.description.trim()
        ? `${form.title.trim()} — ${form.description.trim()}`
        : form.title.trim(),
      unitType: 'unit',
      qty: 1,
      matCostPerUnit: form.cost,
      laborHrsPerUnit: 0,
      laborRate: 0,
      notes: '',
      markupPct: form.marginPct / 100,
    });
    setForm({ title: '', description: '', cost: 0, marginPct: state.global.markupPct * 100 });
    setOpen(false);
    toast.success('Custom request added');
  };

  return (
    <div className="mt-8 mb-4">
      {/* Section header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex-1 h-px bg-orange-200 dark:bg-orange-800" />
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-orange-700 dark:text-orange-400">
            Custom Requests
          </span>
          {customRequests.length > 0 && (
            <span className="inline-flex items-center justify-center min-w-[20px] h-5 px-1 rounded-full bg-orange-600 text-white text-[10px] font-bold">
              {customRequests.length}
            </span>
          )}
        </div>
        <div className="flex-1 h-px bg-orange-200 dark:bg-orange-800" />
      </div>

      <p className="text-xs text-muted-foreground text-center mb-3">
        Out-of-scope work not covered by standard trade phases — e.g. specialty fabrication, subcontractor pass-through, or unique one-off tasks.
      </p>

      {/* Existing custom requests */}
      {customRequests.length > 0 && (
        <div className="space-y-2 mb-3">
          {customRequests.map(cr => {
            const effectiveMarkup = cr.markupPct ?? state.global.markupPct;
            const sell = effectiveMarkup < 1 ? cr.matCostPerUnit / (1 - effectiveMarkup) : cr.matCostPerUnit;
            return (
              <div key={cr.id} className="flex items-start gap-3 rounded-xl border border-orange-200 bg-orange-50/30 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm text-foreground leading-snug">{cr.description}</div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                    <span>Cost: <span className="font-mono font-semibold text-slate-700">{fmtDollar(cr.matCostPerUnit)}</span></span>
                    <span>Margin: <span className="font-mono font-semibold text-emerald-700">{Math.round((effectiveMarkup) * 100)}%</span></span>
                    <span>Sell: <span className="font-mono font-bold text-primary">{fmtDollar(sell)}</span></span>
                  </div>
                </div>
                <button
                  onClick={() => removeCustomItem(cr.id)}
                  className="text-muted-foreground hover:text-red-500 transition-colors mt-0.5"
                  title="Remove"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add form */}
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border-2 border-dashed border-orange-300 text-orange-600 hover:border-orange-400 hover:bg-orange-50/50 transition-all text-sm font-semibold"
        >
          <Plus size={15} />
          Add Custom Request
        </button>
      ) : (
        <div className="border-2 border-dashed border-orange-300 rounded-xl p-4 bg-orange-50/20">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold text-orange-700 uppercase tracking-wider">New Custom Request</div>
            <button onClick={() => setOpen(false)} className="text-xs text-muted-foreground hover:text-foreground">Cancel</button>
          </div>

          {/* Title */}
          <div className="mb-3">
            <label className="field-label">Title <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={form.title}
              onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
              placeholder="e.g. Custom steel beam fabrication"
              className="field-input w-full"
              autoFocus
            />
          </div>

          {/* Description */}
          <div className="mb-3">
            <label className="field-label">Description (optional — shown on estimate)</label>
            <textarea
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe the scope of work, materials, or special requirements..."
              rows={3}
              className="field-input w-full resize-none"
            />
          </div>

          {/* Cost + Margin + Sell price */}
          <div className="grid grid-cols-3 gap-3 mb-4">
            <div>
              <label className="field-label">Actual Cost ($) <span className="text-red-500">*</span></label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={form.cost || ''}
                onChange={e => setForm(f => ({ ...f, cost: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="field-label">Margin (%)</label>
              <input
                type="number"
                min={0}
                max={99}
                step={1}
                value={form.marginPct || ''}
                onChange={e => setForm(f => ({ ...f, marginPct: parseFloat(e.target.value) || 0 }))}
                placeholder={String(Math.round(state.global.markupPct * 100))}
                className="field-input w-full"
              />
            </div>
            <div>
              <label className="field-label">Customer Price</label>
              <div className="field-input w-full font-mono font-bold text-primary bg-slate-50">
                {sellPrice > 0 ? fmtDollar(sellPrice) : '—'}
              </div>
            </div>
          </div>

          <button
            onClick={handleAdd}
            className="w-full py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors"
          >
            Add to Estimate
          </button>
        </div>
      )}
    </div>
  );
}

// ─── MAIN CALCULATOR SECTION ──────────────────────────────────
function WorkflowTextarea({
  label,
  value,
  onChange,
  placeholder,
  rows = 3,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  rows?: number;
}) {
  return (
    <label className="block">
      <span className="field-label">{label}</span>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        className="field-input w-full resize-y"
      />
    </label>
  );
}

function GuidedEstimatorWorkflow({
  totals,
  selectedCount,
}: {
  totals: ReturnType<typeof calcTotals>;
  selectedCount: number;
}) {
  const { state, setConsultantWorkflow, setEstimateAudit, setEstimateProposal, setClientNote } = useEstimator();
  const activeOpportunity = state.opportunities.find(o => o.id === state.activeOpportunityId);
  const activeCustomer = state.customers.find(c => c.id === state.activeCustomerId);
  const photoAttachments = useMemo(() => {
    const oppPhotos = [
      ...(activeOpportunity?.attachments ?? []),
      ...(activeOpportunity?.leadAttachments ?? []),
    ].filter(att => IMAGE_MIME_RE.test(att.mimeType));
    const customerPhotos = (activeCustomer?.attachments ?? []).filter(att => IMAGE_MIME_RE.test(att.mimeType));
    const byId = new Map([...oppPhotos, ...customerPhotos].map(att => [att.id, att]));
    return Array.from(byId.values());
  }, [activeOpportunity, activeCustomer]);
  const workflow = state.consultantWorkflow;
  const audit = state.estimateAudit;
  const proposal = state.estimateProposal;
  const quality = useMemo(
    () => findCalculatorQualityIssues({
      phases: state.phases,
      customItems: state.customItems,
      global: state.global,
      workflow,
      linkedPhotoCount: workflow.linkedPhotoAttachmentIds.length,
    }),
    [state.phases, state.customItems, state.global, workflow]
  );
  const localChecklist = useMemo(
    () => buildApprovalChecklist({
      workflow,
      phases: state.phases,
      customItems: state.customItems,
      global: state.global,
      customerSummary: proposal.customerSummary,
    }),
    [workflow, state.phases, state.customItems, state.global, proposal.customerSummary]
  );
  const readiness = estimateReadinessStatus({
    checklist: audit.approvalChecklist.length ? audit.approvalChecklist : localChecklist,
    auditBlockingCount: audit.blockingIssues.length || quality.issues.filter(issue => issue.severity === 'blocking').length,
    approvedAt: proposal.approvedAt,
    sentAt: activeOpportunity?.sentAt,
    wonAt: activeOpportunity?.wonAt,
  });
  const currentStepIndex = ESTIMATOR_WORKFLOW_STEPS.findIndex(step => step.id === workflow.currentStep);
  const previousStep = ESTIMATOR_WORKFLOW_STEPS[Math.max(0, currentStepIndex - 1)];
  const nextStep = ESTIMATOR_WORKFLOW_STEPS[Math.min(ESTIMATOR_WORKFLOW_STEPS.length - 1, currentStepIndex + 1)];
  const auditMutation = trpc.aiBrain.auditEstimateDraft.useMutation({
    onSuccess: result => {
      setEstimateAudit({
        lastRunAt: new Date().toISOString(),
        source: result.source,
        providerConfigured: result.providerConfigured,
        readinessScore: result.readinessScore,
        blockingIssues: result.blockingIssues,
        suggestedFixes: result.suggestedFixes,
        pricingRisks: result.pricingRisks,
        scopeQuestions: result.scopeQuestions,
        customerSummaryDraft: result.customerSummaryDraft,
        recommendedAlternates: result.recommendedAlternates,
        approvalChecklist: result.approvalChecklist,
        history: [
          {
            id: newWorkflowEventId(),
            type: 'audit_run',
            title: 'Estimate audit run',
            summary: `${Math.round(result.readinessScore)}% readiness · ${result.blockingIssues.length} blocking issue(s)`,
            createdAt: new Date().toISOString(),
            actor: state.userProfile.firstName || state.userProfile.email || 'Consultant',
          },
          ...audit.history,
        ],
      });
      if (!proposal.customerSummary.trim() && result.customerSummaryDraft) {
        setEstimateProposal({ customerSummary: result.customerSummaryDraft, alternates: result.recommendedAlternates });
      }
      toast.success('Estimate audit complete');
    },
    onError: error => toast.error(error.message || 'Estimate audit failed'),
  });

  const patchWorkflow = (payload: Partial<ConsultantWorkflowMeta>) => setConsultantWorkflow(payload);
  const completeStep = (step: ConsultantWorkflowMeta['currentStep']) => {
    const completedSteps = workflow.completedSteps.includes(step) ? workflow.completedSteps : [...workflow.completedSteps, step];
    const nextStep = ESTIMATOR_WORKFLOW_STEPS[Math.min(currentStepIndex + 1, ESTIMATOR_WORKFLOW_STEPS.length - 1)]?.id ?? step;
    setConsultantWorkflow({ completedSteps, currentStep: nextStep });
  };
  const runAudit = () => {
    auditMutation.mutate({
      customerId: state.activeCustomerId ?? undefined,
      propertyId: activeOpportunity?.propertyId ?? undefined,
      opportunityId: state.activeOpportunityId ?? undefined,
      estimateSnapshot: {
        jobInfo: state.jobInfo,
        global: state.global,
        phases: state.phases,
        customItems: state.customItems,
        fieldNotes: state.fieldNotes,
        summaryNotes: state.summaryNotes,
        estimatorNotes: state.estimatorNotes,
        clientNote: state.clientNote,
        depositType: state.depositType,
        depositValue: state.depositValue,
        consultantWorkflow: workflow,
        audit,
        proposal,
        totals,
      },
      consultantNotes: [state.fieldNotes, state.estimatorNotes, workflow.internalAssumptions].filter(Boolean).join('\n\n'),
      findings: workflow.findingNotes,
      photos: [
        workflow.photoNotes,
        workflow.linkedPhotoAttachmentIds.length
          ? `Linked photos: ${photoAttachments.filter(att => workflow.linkedPhotoAttachmentIds.includes(att.id)).map(att => att.name).join(', ')}`
          : '',
      ].filter(Boolean).join('\n'),
      proposalStyle: 'single_with_alternates',
    });
  };
  const approveProposal = () => {
    const checklist = audit.approvalChecklist.length ? audit.approvalChecklist : localChecklist;
    const requiredPassed = checklist.filter(item => item.required).every(item => item.passed);
    if (!requiredPassed || audit.blockingIssues.length > 0 || !proposal.customerSummary.trim()) {
      setEstimateAudit({
        history: [
          {
            id: newWorkflowEventId(),
            type: 'approval_blocked',
            title: 'Proposal approval blocked',
            summary: 'Required checklist items, blocking audit issues, or customer summary were incomplete.',
            createdAt: new Date().toISOString(),
            actor: state.userProfile.firstName || state.userProfile.email || 'Consultant',
          },
          ...audit.history,
        ],
      });
      toast.error('Resolve required audit checks and approve the customer summary first');
      return;
    }
    const now = new Date().toISOString();
    const approvedBy = state.userProfile.firstName || state.userProfile.email || 'Consultant';
    setEstimateAudit({
      approvedAt: now,
      approvedBy,
      history: [
        {
          id: newWorkflowEventId(),
          type: 'proposal_ready',
          title: 'Proposal marked ready',
          summary: 'Consultant approved the customer-facing estimate package.',
          createdAt: now,
          actor: approvedBy,
        },
        ...audit.history,
      ],
    });
    setEstimateProposal({
      status: 'ready_for_customer',
      approvedAt: now,
      approvedBy,
      nextStep: proposal.nextStep || 'Approve the proposal, place the deposit, and we will schedule materials and field work.',
    });
    setClientNote(proposal.customerSummary);
    setConsultantWorkflow({ currentStep: 'proposal', completedSteps: Array.from(new Set([...workflow.completedSteps, 'audit', 'proposal'])) });
    toast.success('Proposal marked ready for customer review');
  };

  return (
    <div className="mb-6 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4 sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-blue-700">
              <ClipboardCheck className="w-4 h-4" />
              Consultant estimator workflow
            </div>
            <h2 className="mt-1 text-xl font-bold text-slate-950">Build, audit, and approve the estimate before the customer sees it.</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {activeOpportunity?.title ?? 'No active opportunity'}
              {activeCustomer ? ` · ${[activeCustomer.firstName, activeCustomer.lastName].filter(Boolean).join(' ') || activeCustomer.displayName || activeCustomer.company}` : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center sm:flex sm:items-center sm:text-left">
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Readiness</div>
              <div className="text-sm font-bold capitalize text-slate-900">{readiness.replaceAll('_', ' ')}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Scope Items</div>
              <div className="text-sm font-bold font-mono text-slate-900">{selectedCount}</div>
            </div>
            <div className="rounded-xl border border-slate-200 bg-white px-3 py-2">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Audit Score</div>
              <div className={`text-sm font-bold font-mono ${audit.readinessScore >= 80 ? 'text-emerald-600' : audit.readinessScore >= 50 ? 'text-amber-600' : 'text-slate-500'}`}>
                {audit.lastRunAt ? `${Math.round(audit.readinessScore)}%` : 'Not run'}
              </div>
            </div>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {ESTIMATOR_WORKFLOW_STEPS.map((step, idx) => {
            const active = workflow.currentStep === step.id;
            const done = workflow.completedSteps.includes(step.id);
            return (
              <button
                key={step.id}
                onClick={() => patchWorkflow({ currentStep: step.id })}
                className={`min-h-14 rounded-xl border px-2 py-2 text-left transition-colors ${
                  active
                    ? 'border-blue-500 bg-blue-50 text-blue-800'
                    : done
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <div className="text-[10px] font-bold uppercase tracking-wider">{idx + 1}</div>
                <div className="text-xs font-bold leading-tight">{step.shortLabel}</div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 sm:hidden">
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => patchWorkflow({ currentStep: previousStep.id })}
              disabled={currentStepIndex === 0}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-40"
            >
              Back
            </button>
            <div className="text-center">
              <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">Field mode</div>
              <div className="text-sm font-bold text-blue-950">{ESTIMATOR_WORKFLOW_STEPS[currentStepIndex]?.label}</div>
            </div>
            <button
              type="button"
              onClick={() => patchWorkflow({ currentStep: nextStep.id })}
              disabled={currentStepIndex === ESTIMATOR_WORKFLOW_STEPS.length - 1}
              className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-xs font-bold text-blue-800 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>

        {workflow.currentStep === 'prep' && (
          <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
            <div className="space-y-3">
              <h3 className="font-bold text-slate-950">On-site objective</h3>
              <p className="text-sm text-muted-foreground">
                Confirm the customer goal, inspect the affected areas, document constraints, build a priced recommendation, and leave with a clear next step.
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">360 Method Step</div>
                  <div className="mt-1 text-sm font-semibold capitalize">{activeOpportunity?.threeSixtyStepKey?.replaceAll('_', ' ') ?? 'Estimate / consult'}</div>
                </div>
                <div className="rounded-xl border border-slate-200 p-3">
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-400">Priority</div>
                  <div className="mt-1 text-sm font-semibold capitalize">{activeOpportunity?.threeSixtyPriority ?? 'Not set'}</div>
                </div>
              </div>
            </div>
            <button onClick={() => completeStep('prep')} className="btn-primary h-fit justify-center">Start scope capture</button>
          </div>
        )}

        {workflow.currentStep === 'scope' && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <WorkflowTextarea label="Problem statement" value={workflow.problemStatement} onChange={v => patchWorkflow({ problemStatement: v })} placeholder="What did the customer ask us to solve?" />
              <WorkflowTextarea label="Customer goals" value={workflow.customerGoals} onChange={v => patchWorkflow({ customerGoals: v })} placeholder="What does success look like for them?" />
              <WorkflowTextarea label="Affected areas" value={workflow.affectedAreas} onChange={v => patchWorkflow({ affectedAreas: v })} placeholder="Rooms, elevations, exterior areas, or systems included." />
              <WorkflowTextarea label="Urgency" value={workflow.urgency} onChange={v => patchWorkflow({ urgency: v })} placeholder="Timing, safety, water, event, sale, or seasonal driver." />
              <WorkflowTextarea label="Constraints" value={workflow.constraints} onChange={v => patchWorkflow({ constraints: v })} placeholder="Access, material, HOA, weather, occupancy, pets, parking, unknowns." />
              <WorkflowTextarea label="Decision factors" value={workflow.decisionFactors} onChange={v => patchWorkflow({ decisionFactors: v })} placeholder="Budget sensitivity, quality level, timeline, trust factors, optional upgrades." />
            </div>
            <button onClick={() => completeStep('scope')} className="btn-primary">Continue to measurements</button>
          </div>
        )}

        {workflow.currentStep === 'measurements' && (
          <div className="space-y-4">
            <div className="grid gap-4 md:grid-cols-3">
              <WorkflowTextarea label="Measurement basis" value={workflow.measurementNotes} onChange={v => patchWorkflow({ measurementNotes: v })} placeholder="Dimensions, quantities, counts, access notes, assumptions." rows={5} />
              <WorkflowTextarea label="Field findings" value={workflow.findingNotes} onChange={v => patchWorkflow({ findingNotes: v })} placeholder="Condition, risk, what you saw, what needs follow-up." rows={5} />
              <WorkflowTextarea label="Photo notes" value={workflow.photoNotes} onChange={v => patchWorkflow({ photoNotes: v })} placeholder="Photos taken, what they show, missing photo reminders." rows={5} />
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-sm font-bold text-slate-900">
                <Camera className="h-4 w-4 text-slate-500" />
                Linked estimate photos
                <span className="ml-auto rounded-full bg-white px-2 py-0.5 text-xs font-mono text-slate-600">
                  {workflow.linkedPhotoAttachmentIds.length}/{photoAttachments.length}
                </span>
              </div>
              {photoAttachments.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No image attachments are available on this opportunity or customer yet. Add photos from the opportunity/customer documents area, then link them here.</p>
              ) : (
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {photoAttachments.map(att => {
                    const checked = workflow.linkedPhotoAttachmentIds.includes(att.id);
                    return (
                      <label key={att.id} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${checked ? 'border-blue-300 bg-blue-50 text-blue-800' : 'border-slate-200 bg-white text-slate-700'}`}>
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...workflow.linkedPhotoAttachmentIds, att.id]
                              : workflow.linkedPhotoAttachmentIds.filter(id => id !== att.id);
                            patchWorkflow({ linkedPhotoAttachmentIds: Array.from(new Set(next)) });
                          }}
                        />
                        <span className="truncate">{att.name}</span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <button onClick={() => completeStep('measurements')} className="btn-primary">Price selected scope</button>
          </div>
        )}

        {workflow.currentStep === 'calculator' && (
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Hard Cost</div>
              <div className="font-mono text-lg font-bold">{fmtDollar(totals.hardCost)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Gross Profit</div>
              <div className="font-mono text-lg font-bold text-emerald-600">{fmtDollar(totals.grossProfit)}</div>
            </div>
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Blended GM</div>
              <div className={`font-mono text-lg font-bold ${totals.gm >= 0.3 ? 'text-emerald-600' : 'text-red-600'}`}>{Math.round(totals.gm * 100 || 0)}%</div>
            </div>
            <button onClick={() => completeStep('calculator')} className="btn-primary justify-center">Run audit</button>
          </div>
        )}

        {workflow.currentStep === 'audit' && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="font-bold text-slate-950">AI audit and consultant approval</h3>
                <p className="text-sm text-muted-foreground">AI flags gaps. The consultant decides what is accurate and customer-ready.</p>
              </div>
              <button onClick={runAudit} disabled={auditMutation.isPending} className="btn-primary justify-center disabled:opacity-60">
                {auditMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                Run estimate audit
              </button>
            </div>
            <div className="grid gap-3 lg:grid-cols-3">
              {(audit.blockingIssues.length ? audit.blockingIssues : quality.issues).map(issue => (
                <div key={issue.id} className={`rounded-xl border p-3 ${issue.severity === 'blocking' ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}>
                  <div className="text-xs font-bold uppercase tracking-wider">{issue.area}</div>
                  <div className="mt-1 text-sm font-semibold">{issue.message}</div>
                  <div className="mt-2 text-xs text-muted-foreground">{issue.fix}</div>
                </div>
              ))}
              {audit.lastRunAt && audit.blockingIssues.length === 0 && quality.issues.filter(issue => issue.severity === 'blocking').length === 0 && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">
                  No blocking audit items. Review the proposal summary before marking ready.
                </div>
              )}
            </div>
            {audit.suggestedFixes.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-bold text-slate-950">AI suggestions</h4>
                {audit.suggestedFixes.map(suggestion => (
                  <button
                    key={suggestion.id}
                    onClick={() => suggestion.customerSafe && setEstimateProposal({ customerSummary: suggestion.suggestion })}
                    className="block w-full rounded-xl border border-slate-200 bg-white p-3 text-left text-sm hover:bg-slate-50"
                  >
                    <span className="font-semibold">{suggestion.title}</span>
                    <span className="mt-1 block text-muted-foreground">{suggestion.suggestion}</span>
                  </button>
                ))}
              </div>
            )}
            <button onClick={() => patchWorkflow({ currentStep: 'proposal' })} className="btn-secondary">Review proposal package</button>
          </div>
        )}

        {workflow.currentStep === 'proposal' && (
          <div className="space-y-4">
            <WorkflowTextarea label="Customer-facing recommended scope" value={proposal.customerSummary} onChange={v => setEstimateProposal({ customerSummary: v })} placeholder="Plain-language recommendation the customer can approve." rows={5} />
            <WorkflowTextarea label="What happens next" value={proposal.nextStep} onChange={v => setEstimateProposal({ nextStep: v })} placeholder="Example: approve the proposal, place deposit, then we schedule materials and field work." />
            <div className="rounded-xl border border-slate-200 p-3">
              <h4 className="text-sm font-bold text-slate-950">Approval checklist</h4>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                {(audit.approvalChecklist.length ? audit.approvalChecklist : localChecklist).map(check => (
                  <div key={check.id} className="flex items-center gap-2 text-sm">
                    {check.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> : <AlertTriangle className="w-4 h-4 text-amber-600" />}
                    <span className={check.passed ? 'text-slate-800' : 'text-amber-800'}>{check.label}{check.required ? ' *' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
            <button onClick={approveProposal} className="btn-primary">
              <Send className="w-4 h-4" />
              Mark ready for customer
            </button>
            {audit.history.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <h4 className="text-sm font-bold text-slate-950">Audit and approval history</h4>
                <div className="mt-2 space-y-2">
                  {audit.history.slice(0, 5).map(event => (
                    <div key={event.id} className="rounded-lg bg-white px-3 py-2 text-xs">
                      <div className="font-semibold text-slate-900">{event.title}</div>
                      <div className="text-slate-600">{event.summary}</div>
                      <div className="mt-1 text-slate-400">{event.actor} · {new Date(event.createdAt).toLocaleString()}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        )}
      </div>
    </div>
  );
}

function FocusedScopeTools({
  search,
  onSearch,
  selectedCount,
}: {
  search: string;
  onSearch: (value: string) => void;
  selectedCount: number;
}) {
  const { state } = useEstimator();
  const selectedStandard = state.phases.flatMap(phase =>
    phase.items.filter(item => item.qty > 0).map(item => ({ id: item.id, label: item.shortName || item.name, phase: phase.name, qty: item.qty }))
  );
  const selectedCustom = state.customItems
    .filter(item => item.qty > 0 || item.description.trim())
    .map(item => ({ id: item.id, label: item.description || 'Custom item', phase: item.phaseId === 0 ? 'Alternate / Add-on' : `Phase ${item.phaseId}`, qty: item.qty }));

  return (
    <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_320px]">
      <label className="relative block">
        <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input
          value={search}
          onChange={e => onSearch(e.target.value)}
          placeholder="Search calculator catalog by item, material, phase, or specialty note"
          className="field-input w-full pl-9"
        />
      </label>
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
          <ClipboardList className="w-4 h-4" />
          Selected scope tray
          <span className="ml-auto rounded-full bg-slate-900 px-2 py-0.5 text-white">{selectedCount}</span>
        </div>
        <div className="mt-2 max-h-28 space-y-1 overflow-auto">
          {[...selectedStandard, ...selectedCustom].length === 0 ? (
            <div className="text-xs text-muted-foreground">No priced items selected yet.</div>
          ) : (
            [...selectedStandard, ...selectedCustom].slice(0, 6).map(item => (
              <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                <span className="truncate text-slate-700">{item.label}</span>
                <span className="shrink-0 font-mono text-slate-500">{item.qty}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function EstimatePackagePreview({
  totals,
  depositAmount,
}: {
  totals: ReturnType<typeof calcTotals>;
  depositAmount: number;
}) {
  const { state } = useEstimator();
  const proposal = state.estimateProposal;
  const linkedPhotoCount = state.consultantWorkflow.linkedPhotoAttachmentIds.length;
  const alternates = proposal.alternates ?? [];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-500">
        <FileText className="h-4 w-4" />
        Internal package preview
      </div>
      <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_260px]">
        <div className="space-y-4">
          <section>
            <h4 className="text-sm font-bold text-slate-950">Recommended scope</h4>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
              {proposal.customerSummary || 'No approved customer summary yet.'}
            </p>
          </section>
          <section>
            <h4 className="text-sm font-bold text-slate-950">What happens next</h4>
            <p className="mt-1 text-sm text-slate-700">
              {proposal.nextStep || 'Approve the proposal, place the deposit, and Handy Pioneers will confirm schedule and materials.'}
            </p>
          </section>
          <section>
            <h4 className="text-sm font-bold text-slate-950">Optional alternates</h4>
            {alternates.length === 0 ? (
              <p className="mt-1 text-sm text-muted-foreground">No alternates selected for this package.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {alternates.map(alt => (
                  <div key={alt.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="text-sm font-semibold text-slate-900">{alt.title}</div>
                    <div className="text-xs text-slate-600">{alt.summary}</div>
                    <div className="mt-1 text-xs font-mono text-slate-800">{alt.investmentRange}</div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
        <div className="space-y-2">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Customer price</div>
            <div className="font-mono text-xl font-bold text-primary">{fmtDollar(totals.price)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Deposit</div>
            <div className="font-mono text-lg font-bold text-slate-900">{fmtDollar(depositAmount)}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Photo evidence</div>
            <div className="text-sm font-bold text-slate-900">{linkedPhotoCount} linked</div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Internal costs, gross margin, AI audit notes, and labor assumptions are not included in the customer package.
          </div>
        </div>
      </div>
    </div>
  );
}

function PricebookGroundworkPanel() {
  const { state, setEstimatePricebook } = useEstimator();
  const pricebook = state.estimatePricebook;
  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Pricebook source</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            {pricebook.catalogVersion} · {pricebook.region}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            V1 still uses the frontend phase catalog. This estimate now stores pricebook metadata so rates/items can move to admin/database later without changing the consultant workflow.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEstimatePricebook({
            reviewedAt: new Date().toISOString(),
            reviewedBy: state.userProfile.firstName || state.userProfile.email || 'Consultant',
          })}
          className="rounded-lg border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
        >
          {pricebook.reviewedAt ? 'Pricebook reviewed' : 'Mark reviewed'}
        </button>
      </div>
      {pricebook.reviewedAt && (
        <div className="mt-2 text-xs text-emerald-700">
          Reviewed by {pricebook.reviewedBy} on {new Date(pricebook.reviewedAt).toLocaleString()}.
        </div>
      )}
    </div>
  );
}

function CalculatorAuditPanel() {
  const { state } = useEstimator();
  const summary = useMemo(() => summarizeRateBookAudit(state.phases), [state.phases]);
  const activeFlags = useMemo(() => {
    const flags: Array<{ id: string; label: string; tone: 'red' | 'amber' | 'slate' }> = [];
    if (summary.subcontractor > 0) {
      flags.push({ id: 'subcontractor', label: `${summary.subcontractor} specialty lines need quote/allowance handling`, tone: 'red' });
    }
    if (summary.fieldValidate > 0) {
      flags.push({ id: 'field-validate', label: `${summary.fieldValidate} lines marked for field validation`, tone: 'amber' });
    }
    if (summary.adjust > 0) {
      flags.push({ id: 'adjust', label: `${summary.adjust} lines adjusted from legacy assumptions`, tone: 'amber' });
    }
    flags.push({ id: 'global-labor', label: 'Global labor rate no longer overwrites trade-specific rates', tone: 'slate' });
    return flags;
  }, [summary]);

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Calculator audit</div>
          <div className="mt-1 text-sm font-semibold text-slate-950">
            {summary.totalItems} line items across {summary.phases} phases
          </div>
          <div className="mt-1 text-xs text-slate-600">
            Production-rate metadata is attached to every catalog item without destructively changing old estimate snapshots.
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
            <div className="text-lg font-bold text-emerald-700">{summary.keep}</div>
            <div className="text-[10px] uppercase text-emerald-700">keep</div>
          </div>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="text-lg font-bold text-amber-700">{summary.fieldValidate + summary.adjust}</div>
            <div className="text-[10px] uppercase text-amber-700">review</div>
          </div>
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2">
            <div className="text-lg font-bold text-red-700">{summary.subcontractor}</div>
            <div className="text-[10px] uppercase text-red-700">quotes</div>
          </div>
        </div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        {activeFlags.map(flag => (
          <div
            key={flag.id}
            className={`rounded-lg border px-3 py-2 text-xs font-medium ${
              flag.tone === 'red'
                ? 'border-red-200 bg-red-50 text-red-700'
                : flag.tone === 'amber'
                  ? 'border-amber-200 bg-amber-50 text-amber-700'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
            }`}
          >
            {flag.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CalculatorSection() {
  const { state, updateOpportunity } = useEstimator();
  const [activePhaseId, setActivePhaseId] = useState<number>(ALL_PHASES[0].id);
  const [catalogSearch, setCatalogSearch] = useState('');

  // 360° member discount — look up active customer's membership
  const { data: membershipData } = trpc.threeSixty.memberships.getByCustomer.useQuery(
    { customerId: state.activeCustomerId! },
    { enabled: !!state.activeCustomerId }
  );
  const activeMembership = membershipData?.find((m: { status: string }) => m.status === 'active');

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

  // 360° step-ladder member discount (in cents)
  const memberDiscountCents = useMemo(() => {
    if (!activeMembership) return 0;
    const priceCents = Math.round(grandTotals.price * 100);
    return calcMemberDiscount(activeMembership.tier as MemberTier, priceCents);
  }, [activeMembership, grandTotals.price]);
  const memberDiscountDollars = memberDiscountCents / 100;
  const discountedPrice = grandTotals.price - memberDiscountDollars;
  const depositAmount = state.depositType === 'pct'
    ? grandTotals.price * (state.depositValue / 100)
    : state.depositValue;
  const selectedCount = useMemo(
    () => selectedScopeCount(state.phases, state.customItems),
    [state.phases, state.customItems]
  );

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
  const visiblePhases = useMemo(() => {
    const query = catalogSearch.trim().toLowerCase();
    if (!query) return orderedPhases;
    return orderedPhases.filter(phase =>
      phase.name.toLowerCase().includes(query) ||
      phase.description.toLowerCase().includes(query) ||
      phase.items.some(item =>
        [item.name, item.shortName, item.salesDesc, item.notes, item.flagNote]
          .filter(Boolean)
          .some(value => value.toLowerCase().includes(query))
      )
    );
  }, [orderedPhases, catalogSearch]);

  useEffect(() => {
    if (visiblePhases.length > 0 && !visiblePhases.some(phase => phase.id === activePhaseId)) {
      setActivePhaseId(visiblePhases[0].id);
    }
  }, [visiblePhases, activePhaseId]);

  const [aiChatOpen, setAiChatOpen] = useState(false);

  return (
    <div className="pb-24">
      {/* AI Estimate Chat drawer */}
      <AIEstimateChat open={aiChatOpen} onClose={() => setAiChatOpen(false)} />

      {/* AI Estimate button bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="text-xs text-muted-foreground">
          Build your estimate phase by phase, or let AI parse your walkthrough notes.
        </div>
        <button
          onClick={() => setAiChatOpen(true)}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-violet-300 bg-violet-50 text-violet-700 text-xs font-semibold hover:bg-violet-100 hover:border-violet-400 transition-colors shadow-sm"
        >
          <Sparkles size={13} />
          AI Estimate
        </button>
      </div>

      <GuidedEstimatorWorkflow totals={grandTotals} selectedCount={selectedCount} />
      {state.consultantWorkflow.currentStep === 'proposal' && (
        <div className="mb-6">
          <EstimatePackagePreview totals={grandTotals} depositAmount={depositAmount} />
        </div>
      )}
      <PricebookGroundworkPanel />
      <CalculatorAuditPanel />
      <GlobalSettingsPanel />
      <FocusedScopeTools search={catalogSearch} onSearch={setCatalogSearch} selectedCount={selectedCount} />
      <PhaseTabBar
        phases={visiblePhases.map(p => ({ id: p.id, name: p.name, icon: p.icon }))}
        activePhaseId={activePhaseId}
        onSelect={setActivePhaseId}
        phaseResults={phaseResults}
      />
      <PhasePanel phaseId={activePhaseId} searchQuery={catalogSearch} />

      <CustomRequestsPanel />

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
              {activeMembership && memberDiscountCents > 0 && (
                <div className="flex items-center justify-end gap-1.5 mb-1">
                  <Star className="w-3 h-3 text-yellow-500 fill-yellow-400" />
                  <span className="text-[10px] font-semibold text-yellow-700">
                    {(activeMembership.tier as string).charAt(0).toUpperCase() + (activeMembership.tier as string).slice(1)} Member Discount
                  </span>
                  <span className="text-[10px] font-mono font-bold text-emerald-600">-{fmtDollar(memberDiscountDollars)}</span>
                </div>
              )}
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Customer Price</div>
              {activeMembership && memberDiscountCents > 0 ? (
                <div className="flex items-baseline gap-2 justify-end">
                  <div className="text-sm line-through text-slate-400 font-mono">{fmtDollar(grandTotals.price)}</div>
                  <div className="text-2xl font-bold font-mono text-emerald-600 leading-tight">{fmtDollar(discountedPrice)}</div>
                </div>
              ) : (
                <div className="text-2xl font-bold font-mono text-primary leading-tight">{fmtDollar(grandTotals.price)}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
