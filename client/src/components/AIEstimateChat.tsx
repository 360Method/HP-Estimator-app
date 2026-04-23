// ============================================================
// AI Estimate Chat — Right-side drawer for walkthrough note parsing
// Submits notes → aiParse endpoint → shows diff/review panel → Apply
// ============================================================

import { useState, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Sparkles,
  Loader2,
  AlertTriangle,
  Info,
  CheckCircle2,
  ChevronRight,
  XCircle,
  Zap,
} from 'lucide-react';
import { trpc } from '@/lib/trpc';
import { useEstimator } from '@/contexts/EstimatorContext';
import { toast } from 'sonner';
import type { UnitType } from '@/lib/types';

// ─── Types mirroring server response ─────────────────────────
interface AiLineItem {
  itemId: string;
  qty: number;
  tier: 'good' | 'better' | 'best';
  paintPrepMode: 'none' | 'caulk' | 'full';
  notes: string;
}

interface AiCustomItem {
  description: string;
  qty: number;
  unit: string;
  estimatedHrsPerUnit: number;
  notes: string;
}

interface AiWarning {
  severity: 'info' | 'review' | 'missing';
  message: string;
}

interface AiParseResult {
  jobTitle: string;
  scopeSummary: string;
  lineItems: AiLineItem[];
  customItems: AiCustomItem[];
  warnings: AiWarning[];
}

// ─── Map AI unit string → UnitType ───────────────────────────
const UNIT_MAP: Record<string, UnitType> = {
  lf: 'lf', 'linear feet': 'lf', 'linear foot': 'lf',
  sqft: 'sqft', 'sq ft': 'sqft', 'square feet': 'sqft', 'square foot': 'sqft',
  hr: 'hr', hrs: 'hr', hour: 'hr', hours: 'hr',
  unit: 'unit', each: 'unit', ea: 'unit',
  opening: 'opening', openings: 'opening',
  door: 'door', doors: 'door',
  window: 'window', windows: 'window',
  fixture: 'fixture', fixtures: 'fixture',
  circuit: 'circuit', circuits: 'circuit',
  can: 'can', cans: 'can',
  fan: 'fan', fans: 'fan',
  device: 'device', devices: 'device',
  step: 'step', steps: 'step',
  load: 'load', loads: 'load',
  patch: 'patch', patches: 'patch',
  box: 'box', boxes: 'box',
  closet: 'closet', closets: 'closet',
};

function mapUnit(unit: string): UnitType {
  return UNIT_MAP[unit.toLowerCase()] ?? 'unit';
}

// ─── Severity badge ───────────────────────────────────────────
function SeverityBadge({ severity }: { severity: AiWarning['severity'] }) {
  if (severity === 'missing') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
        <XCircle size={10} /> MISSING
      </span>
    );
  }
  if (severity === 'review') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
        <AlertTriangle size={10} /> REVIEW
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
      <Info size={10} /> INFO
    </span>
  );
}

// ─── Tier badge ───────────────────────────────────────────────
function TierBadge({ tier }: { tier: 'good' | 'better' | 'best' }) {
  const colors = {
    good: 'bg-slate-100 text-slate-600',
    better: 'bg-blue-100 text-blue-700',
    best: 'bg-violet-100 text-violet-700',
  };
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${colors[tier]}`}>
      {tier}
    </span>
  );
}

// ─── Paint prep badge ─────────────────────────────────────────
function PaintPrepBadge({ mode }: { mode: 'none' | 'caulk' | 'full' }) {
  if (mode === 'none') return null;
  const colors = mode === 'caulk'
    ? 'bg-amber-50 text-amber-700 border border-amber-200'
    : 'bg-orange-50 text-orange-700 border border-orange-200';
  const label = mode === 'caulk' ? 'Caulk-only prep' : 'Full paint prep';
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium ${colors}`}>
      🎨 {label}
    </span>
  );
}

// ─── Sample notes for quick testing ──────────────────────────
const SAMPLE_NOTES = `Rohny residence — full interior trim package
- Baseboard: 6, 3, 12, 26, 14, 8, 22, 11 lf (pre-primed MDF)
- Door casing: 9 openings (pre-primed MDF)
- Window casing: 4 windows (pre-primed MDF)
- Crown molding: living room + master bedroom, ~85 lf total (pre-primed)
- Replace 2 interior doors (hollow core)
- Hang 3 new doors (solid core)
- Install 14 light fixtures
- 4 ceiling fans
- Touch-up punch list: 3 hrs`;

// ─── Main component ───────────────────────────────────────────
interface AIEstimateChatProps {
  open: boolean;
  onClose: () => void;
}

export default function AIEstimateChat({ open, onClose }: AIEstimateChatProps) {
  const { state, updateItem, addCustomItem, setJobInfo, setSummaryNotes, setFieldNotes } = useEstimator();
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<AiParseResult | null>(null);
  const [applied, setApplied] = useState(false);

  const aiParse = trpc.estimate.aiParse.useMutation();

  const handleSubmit = useCallback(async () => {
    if (!notes.trim() || notes.trim().length < 10) {
      toast.error('Add at least 10 characters of walkthrough notes');
      return;
    }
    setResult(null);
    setApplied(false);
    try {
      const res = await aiParse.mutateAsync({ notes: notes.trim() });
      setResult(res);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'AI parse failed';
      toast.error(`AI error: ${msg}`);
    }
  }, [notes, aiParse]);

  const handleApply = useCallback(() => {
    if (!result) return;

    // 1. Set job title + scope summary
    if (result.jobTitle) {
      setJobInfo({ scope: result.jobTitle });
    }
    if (result.scopeSummary) {
      setSummaryNotes(result.scopeSummary);
    }
    // Save raw notes as field notes
    if (notes.trim()) {
      setFieldNotes(notes.trim());
    }

    // 2. Apply catalog line items
    let appliedCount = 0;
    for (const ai of result.lineItems) {
      if (ai.qty <= 0) continue; // skip zero-qty items (warnings already shown)
      // Find the phase containing this item
      for (const phase of state.phases) {
        const item = phase.items.find(i => i.id === ai.itemId);
        if (item) {
          updateItem(phase.id, ai.itemId, {
            qty: ai.qty,
            tier: ai.tier,
            paintPrep: ai.paintPrepMode,
            enabled: true,
          });
          appliedCount++;
          break;
        }
      }
    }

    // 3. Apply custom items
    for (const ci of result.customItems) {
      if (ci.qty <= 0) continue;
      // Map to the closest phase — default to phase 11 (trim) or phase 1 (pre-construction)
      const unitType = mapUnit(ci.unit);
      addCustomItem({
        phaseId: 11, // default to trim phase; estimator can move it
        description: ci.description,
        unitType,
        qty: ci.qty,
        matCostPerUnit: 0,
        laborHrsPerUnit: ci.estimatedHrsPerUnit,
        laborRate: 95, // default carpenter rate
        notes: ci.notes,
        markupPct: null,
      });
      appliedCount++;
    }

    setApplied(true);
    toast.success(`AI estimate applied — ${appliedCount} items populated. All fields remain editable.`);
  }, [result, notes, state.phases, updateItem, addCustomItem, setJobInfo, setSummaryNotes, setFieldNotes]);

  const handleClose = useCallback(() => {
    onClose();
    // Reset state when closed
    setTimeout(() => {
      setResult(null);
      setApplied(false);
    }, 300);
  }, [onClose]);

  const warningCounts = result
    ? {
        missing: result.warnings.filter(w => w.severity === 'missing').length,
        review: result.warnings.filter(w => w.severity === 'review').length,
        info: result.warnings.filter(w => w.severity === 'info').length,
      }
    : null;

  return (
    <Sheet open={open} onOpenChange={v => { if (!v) handleClose(); }}>
      <SheetContent side="right" className="w-full sm:max-w-lg flex flex-col p-0 gap-0">
        {/* Header */}
        <SheetHeader className="px-5 pt-5 pb-4 border-b border-border shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
              <Sparkles size={16} className="text-violet-600" />
            </div>
            <div>
              <SheetTitle className="text-base font-bold leading-tight">AI Estimate</SheetTitle>
              <SheetDescription className="text-xs text-muted-foreground leading-tight">
                Paste walkthrough notes — AI maps them to the calculator
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto">
          {/* Notes input area */}
          <div className="px-5 py-4 border-b border-border">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-foreground uppercase tracking-wider">
                Walkthrough Notes
              </label>
              <button
                onClick={() => setNotes(SAMPLE_NOTES)}
                className="text-[10px] text-violet-600 hover:text-violet-700 font-medium underline underline-offset-2"
              >
                Load sample
              </button>
            </div>
            <Textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder={`Paste your field notes here…\n\nExamples:\n• Baseboard: 6, 3, 12, 26 lf (pre-primed MDF)\n• 9 door casings, 4 window casings\n• Replace 2 interior doors (hollow core)\n• Install 14 light fixtures`}
              className="min-h-[180px] text-sm font-mono resize-none"
              disabled={aiParse.isPending}
            />
            <div className="flex items-center justify-between mt-2">
              <span className="text-[10px] text-muted-foreground">
                {notes.length} chars · {notes.split('\n').filter(l => l.trim()).length} lines
              </span>
              <Button
                onClick={handleSubmit}
                disabled={aiParse.isPending || notes.trim().length < 10}
                size="sm"
                className="gap-2 bg-violet-600 hover:bg-violet-700 text-white"
              >
                {aiParse.isPending ? (
                  <>
                    <Loader2 size={14} className="animate-spin" />
                    Parsing…
                  </>
                ) : (
                  <>
                    <Sparkles size={14} />
                    Parse Notes
                  </>
                )}
              </Button>
            </div>
          </div>

          {/* Loading state */}
          {aiParse.isPending && (
            <div className="px-5 py-8 flex flex-col items-center gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-violet-100 flex items-center justify-center">
                <Loader2 size={24} className="text-violet-600 animate-spin" />
              </div>
              <div className="text-sm font-semibold text-foreground">Analyzing your notes…</div>
              <div className="text-xs text-muted-foreground max-w-xs">
                AI is mapping scope items to the catalog, summing measurements, and detecting materials.
              </div>
            </div>
          )}

          {/* Results */}
          {result && !aiParse.isPending && (
            <div className="px-5 py-4 space-y-5">
              {/* Job title + scope summary */}
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle2 size={14} className="text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Parsed Job</span>
                </div>
                <div className="text-sm font-bold text-foreground mb-1">{result.jobTitle}</div>
                <div className="text-xs text-muted-foreground leading-relaxed">{result.scopeSummary}</div>
              </div>

              {/* Warnings */}
              {result.warnings.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Warnings & Flags
                    </span>
                    <div className="flex gap-1">
                      {warningCounts!.missing > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-red-100 text-red-700">
                          {warningCounts!.missing} missing
                        </span>
                      )}
                      {warningCounts!.review > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-700">
                          {warningCounts!.review} review
                        </span>
                      )}
                      {warningCounts!.info > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                          {warningCounts!.info} info
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    {result.warnings.map((w, i) => (
                      <div
                        key={i}
                        className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                          w.severity === 'missing'
                            ? 'bg-red-50 border border-red-200'
                            : w.severity === 'review'
                            ? 'bg-amber-50 border border-amber-200'
                            : 'bg-blue-50 border border-blue-200'
                        }`}
                      >
                        <SeverityBadge severity={w.severity} />
                        <span className="leading-relaxed text-foreground">{w.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Catalog line items */}
              {result.lineItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Catalog Items
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-700">
                      {result.lineItems.filter(i => i.qty > 0).length} active
                    </span>
                    {result.lineItems.some(i => i.qty === 0) && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-500">
                        {result.lineItems.filter(i => i.qty === 0).length} skipped
                      </span>
                    )}
                  </div>
                  <div className="space-y-2">
                    {result.lineItems.map((item, i) => {
                      // Find item name from phases
                      let itemName = item.itemId;
                      for (const phase of state.phases) {
                        const found = phase.items.find(pi => pi.id === item.itemId);
                        if (found) { itemName = found.name; break; }
                      }
                      const isSkipped = item.qty === 0;
                      return (
                        <div
                          key={i}
                          className={`rounded-lg border p-3 ${
                            isSkipped
                              ? 'border-slate-200 bg-slate-50/50 opacity-60'
                              : 'border-emerald-200 bg-emerald-50/30'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              {isSkipped ? (
                                <XCircle size={12} className="text-slate-400 shrink-0" />
                              ) : (
                                <CheckCircle2 size={12} className="text-emerald-500 shrink-0" />
                              )}
                              <span className="text-xs font-semibold text-foreground">{itemName}</span>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                              <TierBadge tier={item.tier} />
                            </div>
                          </div>
                          <div className="flex items-center gap-2 flex-wrap ml-4">
                            <span className="text-xs text-muted-foreground font-mono">
                              {isSkipped ? 'qty unclear' : `${item.qty} ${item.itemId.includes('lf') || item.itemId.includes('bb') || item.itemId.includes('crown') || item.itemId.includes('chair') ? 'lf' : 'units'}`}
                            </span>
                            <PaintPrepBadge mode={item.paintPrepMode} />
                          </div>
                          {item.notes && (
                            <div className="mt-1 ml-4 text-[11px] text-muted-foreground italic">
                              {item.notes}
                            </div>
                          )}
                          <div className="mt-1 ml-4">
                            <code className="text-[10px] text-slate-400">{item.itemId}</code>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Custom items */}
              {result.customItems.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                      Custom Items
                    </span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-violet-100 text-violet-700">
                      {result.customItems.length} items
                    </span>
                    <span className="text-[10px] text-muted-foreground">Added to Phase 11</span>
                  </div>
                  <div className="space-y-2">
                    {result.customItems.map((ci, i) => (
                      <div key={i} className="rounded-lg border border-violet-200 bg-violet-50/30 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-xs font-semibold text-foreground">{ci.description}</span>
                          <span className="text-xs font-mono text-violet-700 shrink-0">
                            {ci.qty} {ci.unit}
                          </span>
                        </div>
                        <div className="mt-1 text-[11px] text-muted-foreground">
                          {ci.estimatedHrsPerUnit} hrs/unit · {ci.notes}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {result.lineItems.length === 0 && result.customItems.length === 0 && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-center">
                  <AlertTriangle size={20} className="text-amber-500 mx-auto mb-2" />
                  <div className="text-sm font-semibold text-amber-700">No items detected</div>
                  <div className="text-xs text-amber-600 mt-1">
                    Try adding more detail to your notes — include measurements, quantities, and material types.
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer — Apply button */}
        {result && !aiParse.isPending && (
          <div className="px-5 py-4 border-t border-border bg-background shrink-0">
            {applied ? (
              <div className="flex items-center gap-3">
                <div className="flex-1 flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5">
                  <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
                  <div>
                    <div className="text-xs font-bold text-emerald-700">Applied to calculator</div>
                    <div className="text-[10px] text-emerald-600">All fields remain fully editable</div>
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClose}
                  className="shrink-0"
                >
                  Close
                </Button>
              </div>
            ) : (
              <div className="space-y-2">
                <Button
                  onClick={handleApply}
                  className="w-full gap-2 bg-violet-600 hover:bg-violet-700 text-white"
                  disabled={result.lineItems.filter(i => i.qty > 0).length === 0 && result.customItems.length === 0}
                >
                  <Zap size={15} />
                  Apply to Calculator
                  <ChevronRight size={14} className="ml-auto" />
                </Button>
                <p className="text-[10px] text-center text-muted-foreground">
                  All AI-filled fields remain fully editable after applying
                </p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
