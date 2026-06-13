// ============================================================
// CustomItemRow — the engine-backed custom line-item editor.
// Extracted from CalculatorSection so the guided estimate wizard can use the
// SAME pricing function (material + labor + gross-margin → customer price)
// the full calculator uses, instead of a stripped-down qty/cost editor.
// ============================================================
import { useState, useMemo, useCallback } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcCustomItem, fmtDollar } from '@/lib/calc';
import { CustomLineItem, UNIT_LABELS, UnitType } from '@/lib/types';
import { ChevronDown, Sparkles, Trash2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { trpcClient } from '@/lib/trpc';

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

// ─── CUSTOM ITEM ROW ──────────────────────────────────────────
/**
 * One custom line item with the full pricing breakdown. `lockNotes` hides
 * the internal Notes field for callers that use notes as a control tag
 * (the spot-inspection wizard tags lines `spot:<id>:<idx>`); editing it
 * there would break detection. `defaultExpanded` opens the breakdown on
 * mount, useful for lines that still need a price.
 */
export function CustomItemRow({ ci, lockNotes, defaultExpanded }: { ci: CustomLineItem; lockNotes?: boolean; defaultExpanded?: boolean }) {
  const { state, updateCustomItem, removeCustomItem } = useEstimator();
  const [expanded, setExpanded] = useState(!!defaultExpanded);
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

            {/* Notes — hidden when the caller owns the notes field as a tag */}
            {!lockNotes && (
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
            )}
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
