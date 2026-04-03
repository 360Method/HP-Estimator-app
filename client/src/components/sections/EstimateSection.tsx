// ============================================================
// EstimateSection — Customer-facing estimate output
// Design: Trade cards with title, description, SOW bullets,
//         labor/materials split, copy/print actions.
// ============================================================

import { useMemo, useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcCustomItem, calcTotals, fmtDollar, fmtPct, getMarginFlag } from '@/lib/calc';
import { ALL_PHASES } from '@/lib/phases';
import { LineItem, PhaseGroup } from '@/lib/types';
import { Copy, Printer, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

// ─── SOW bullet generator ─────────────────────────────────────
// Builds 3–8 plain-English bullets from active line items.
// Written so both the client and a sub can understand the scope.
function buildSowBullets(phase: PhaseGroup, activeItems: LineItem[]): string[] {
  const bullets: string[] = [];

  for (const item of activeItems) {
    const tierData = item.hasTiers ? item.tiers[item.tier] : null;
    const tierName = tierData?.name ?? '';
    const qty = item.qty;
    const u = item.unitType;

    const qtyLabel = (n: number, unit: string): string => {
      const map: Record<string, string> = {
        lf: `${n} linear ft`, sqft: `${n} sq ft`, unit: `${n} unit${n !== 1 ? 's' : ''}`,
        hr: `${n} hr${n !== 1 ? 's' : ''}`, opening: `${n} opening${n !== 1 ? 's' : ''}`,
        load: `${n} load${n !== 1 ? 's' : ''}`, patch: `${n} patch${n !== 1 ? 'es' : ''}`,
        step: `${n} step${n !== 1 ? 's' : ''}`, closet: `${n} closet${n !== 1 ? 's' : ''}`,
        fixture: `${n} fixture${n !== 1 ? 's' : ''}`, circuit: `${n} circuit${n !== 1 ? 's' : ''}`,
        can: `${n} can${n !== 1 ? 's' : ''}`, door: `${n} door${n !== 1 ? 's' : ''}`,
        box: `${n} box${n !== 1 ? 'es' : ''}`, window: `${n} window${n !== 1 ? 's' : ''}`,
        fan: `${n} fan${n !== 1 ? 's' : ''}`, device: `${n} device${n !== 1 ? 's' : ''}`,
      };
      return map[unit] ?? `${n} ${unit}`;
    };

    let bullet = '';
    if (item.hasTiers && tierName) {
      bullet = `Supply and install ${qtyLabel(qty, u)} of ${tierName}`;
      if (item.wastePct > 0) bullet += ` (includes ${item.wastePct}% waste allowance)`;
    } else {
      bullet = `${item.name} — ${qtyLabel(qty, u)}`;
    }

    if (item.salesDesc) {
      // Append the sales description as a clarifying clause
      const desc = item.salesDesc.replace(/\.$/, '');
      bullet += `. ${desc}.`;
    }

    if (item.hasPaintPrep && item.paintPrep !== 'none') {
      const prepLabel = item.paintPrep === 'caulk' ? 'caulk and touch-up' : 'full paint prep (caulk, prime, and paint)';
      bullet += ` Includes ${prepLabel}.`;
    }

    if (item.flagged && item.flagNote) {
      bullet += ` (${item.flagNote})`;
    }

    bullets.push(bullet);
  }

  if (bullets.length > 8) {
    const shown = bullets.slice(0, 7);
    shown.push(`Plus ${bullets.length - 7} additional items — see detailed breakdown below.`);
    return shown;
  }

  return bullets;
}

// ─── Main component ───────────────────────────────────────────
export default function EstimateSection() {
  const { state, setSummaryNotes } = useEstimator();
  const [showMatLabor, setShowMatLabor] = useState(false);
  const [showAudit, setShowAudit] = useState(false);
  const [expandedPhases, setExpandedPhases] = useState<Set<number>>(new Set());

  const { phaseResults, customResults, totals } = useMemo(() => {
    const phaseResults = state.phases.map(p => calcPhase(p, state.global));
    const customResults = state.customItems.map(ci => calcCustomItem(ci, state.global));
    const totals = calcTotals(phaseResults, customResults);
    return { phaseResults, customResults, totals };
  }, [state.phases, state.customItems, state.global]);

  // Build per-phase data with active items and SOW bullets
  const activePhaseData = useMemo(() => {
    return state.phases
      .map((phase, idx) => {
        const activeItems = phase.items.filter(i => i.enabled && i.qty > 0);
        if (activeItems.length === 0) return null;
        const result = phaseResults[idx];
        const bullets = buildSowBullets(phase, activeItems);
        return { phase, result, activeItems, bullets };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }, [state.phases, phaseResults]);

  const gmFlag = getMarginFlag(totals.totalGM, totals.totalHard);
  const minGM = totals.totalHard < 2000 ? 0.40 : 0.30;
  const isReady = gmFlag === 'ok' && totals.totalPrice > 0;

  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const estimateNumber = state.jobInfo.jobNumber || `HP-${Date.now().toString().slice(-6)}`;

  const togglePhase = (id: number) => {
    setExpandedPhases(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Generate plain-text estimate for copy/paste
  const generatePlainText = (): string => {
    const lines: string[] = [
      'HANDY PIONEERS — PROJECT ESTIMATE',
      '─────────────────────────────────────',
      `Estimate #: ${estimateNumber}`,
      `Date: ${today}`,
      '',
    ];
    if (state.jobInfo.client) lines.push(`Client: ${state.jobInfo.client}`);
    if (state.jobInfo.address) lines.push(`Address: ${state.jobInfo.address}${state.jobInfo.city ? ', ' + state.jobInfo.city : ''}`);
    if (state.jobInfo.phone) lines.push(`Phone: ${state.jobInfo.phone}`);
    if (state.jobInfo.email) lines.push(`Email: ${state.jobInfo.email}`);
    lines.push('');

    if (state.jobInfo.scope) {
      lines.push('PROJECT OVERVIEW');
      lines.push('─────────────────────────────────────');
      lines.push(state.jobInfo.scope);
      lines.push('');
    }

    lines.push('SCOPE OF WORK & INVESTMENT');
    lines.push('─────────────────────────────────────');

    for (const { phase, result, bullets } of activePhaseData) {
      lines.push('');
      lines.push(`${phase.icon}  ${phase.name.toUpperCase()}`);
      lines.push(phase.description);
      lines.push('');
      for (const b of bullets) lines.push(`  • ${b}`);
      lines.push('');
      lines.push(`  Investment: ${fmtDollar(result.price)}`);
    }

    if (customResults.length > 0) {
      lines.push('');
      lines.push('ADDITIONAL ITEMS');
      lines.push('─────────────────────────────────────');
      for (const cr of customResults) {
        const ci = state.customItems.find(c => c.id === cr.id)!;
        lines.push(`  • ${ci.description} — ${fmtDollar(cr.price)}`);
      }
    }

    lines.push('');
    lines.push('─────────────────────────────────────');
    lines.push(`TOTAL INVESTMENT: ${fmtDollar(totals.totalPrice)}`);
    lines.push('');
    lines.push('TERMS');
    lines.push('─────────────────────────────────────');
    lines.push('• 50% deposit required to schedule work');
    lines.push('• Balance due upon project completion');
    lines.push('• Estimate valid for 30 days');
    lines.push('• All work guaranteed — 1-year workmanship warranty');
    lines.push('• Any scope changes will be documented in a written change order');

    if (state.summaryNotes) {
      lines.push('');
      lines.push('NOTES');
      lines.push('─────────────────────────────────────');
      lines.push(state.summaryNotes);
    }

    lines.push('');
    lines.push('Handy Pioneers — Vancouver, WA · Licensed & Insured');

    return lines.join('\n');
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(generatePlainText());
    toast.success('Estimate copied to clipboard');
  };

  // ─── Render ─────────────────────────────────────────────────
  return (
    <div className="space-y-6 pb-16">

      {/* Status banner */}
      <div className={`rounded-xl p-4 border flex items-start gap-3 ${
        totals.totalPrice === 0
          ? 'bg-slate-50 border-slate-200'
          : isReady
          ? 'bg-emerald-50 border-emerald-200'
          : gmFlag === 'warn'
          ? 'bg-amber-50 border-amber-200'
          : 'bg-red-50 border-red-200'
      }`}>
        {totals.totalPrice === 0
          ? <AlertTriangle className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
          : isReady
          ? <CheckCircle2 className="w-5 h-5 text-emerald-600 mt-0.5 shrink-0" />
          : gmFlag === 'warn'
          ? <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          : <XCircle className="w-5 h-5 text-red-600 mt-0.5 shrink-0" />
        }
        <div className="flex-1">
          <div className={`font-bold text-sm ${
            totals.totalPrice === 0 ? 'text-slate-600'
            : isReady ? 'text-emerald-800'
            : gmFlag === 'warn' ? 'text-amber-800'
            : 'text-red-800'
          }`}>
            {totals.totalPrice === 0
              ? 'No items entered — add quantities in the Calculator tab'
              : isReady
              ? `Estimate ready — ${fmtDollar(totals.totalPrice)} total · ${fmtPct(totals.totalGM)} GM · ${fmtDollar(totals.totalGP)} gross profit`
              : gmFlag === 'warn'
              ? `Low margin (${fmtPct(totals.totalGM)}) — floor is ${Math.round(minGM * 100)}%. Review before sending.`
              : `Below GM floor (${fmtPct(totals.totalGM)}) — raise markup or review costs before sending.`
            }
          </div>
          {isReady && (
            <div className="text-xs text-emerald-700 mt-0.5">
              Hard cost: {fmtDollar(totals.totalHard)} · Markup: {Math.round(state.global.markupPct * 100)}%
            </div>
          )}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex gap-2 flex-wrap no-print">
        <button
          onClick={handleCopy}
          className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors"
        >
          <Copy className="w-4 h-4" />
          Copy Estimate
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted transition-colors"
        >
          <Printer className="w-4 h-4" />
          Print / PDF
        </button>
        <button
          onClick={() => setShowMatLabor(v => !v)}
          className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm font-semibold hover:bg-muted transition-colors"
        >
          {showMatLabor ? 'Hide' : 'Show'} Mat/Labor Split
        </button>
      </div>

      {/* ─── ESTIMATE DOCUMENT ─────────────────────────────── */}
      <div className="bg-white border border-border rounded-xl shadow-sm overflow-hidden print-area">

        {/* Letterhead */}
        <div className="bg-slate-900 text-white px-6 py-5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <div className="w-8 h-8 rounded-md bg-primary flex items-center justify-center shrink-0">
                  <span className="text-white font-black text-sm leading-none">HP</span>
                </div>
                <span className="text-xl font-black tracking-tight">Handy Pioneers</span>
              </div>
              <div className="text-slate-400 text-xs">Vancouver, WA · Licensed &amp; Insured</div>
            </div>
            <div className="text-right text-sm">
              <div className="font-bold text-white">Project Estimate</div>
              <div className="text-slate-400 text-xs mt-0.5">#{estimateNumber}</div>
              <div className="text-slate-400 text-xs">{today}</div>
            </div>
          </div>
        </div>

        {/* Client info */}
        {(state.jobInfo.client || state.jobInfo.address) && (
          <div className="px-6 py-4 border-b border-border bg-slate-50">
            <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
              {state.jobInfo.client && (
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide font-semibold mb-0.5">Client</div>
                  <div className="font-semibold text-foreground">{state.jobInfo.client}</div>
                </div>
              )}
              {state.jobInfo.address && (
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide font-semibold mb-0.5">Address</div>
                  <div className="font-semibold text-foreground">{state.jobInfo.address}{state.jobInfo.city ? `, ${state.jobInfo.city}` : ''}</div>
                </div>
              )}
              {state.jobInfo.phone && (
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide font-semibold mb-0.5">Phone</div>
                  <div className="text-foreground">{state.jobInfo.phone}</div>
                </div>
              )}
              {state.jobInfo.email && (
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide font-semibold mb-0.5">Email</div>
                  <div className="text-foreground">{state.jobInfo.email}</div>
                </div>
              )}
              {state.jobInfo.jobType && (
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide font-semibold mb-0.5">Project Type</div>
                  <div className="text-foreground">{state.jobInfo.jobType}</div>
                </div>
              )}
              {state.jobInfo.estimator && (
                <div>
                  <div className="text-muted-foreground text-xs uppercase tracking-wide font-semibold mb-0.5">Estimator</div>
                  <div className="text-foreground">{state.jobInfo.estimator}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Project overview */}
        {state.jobInfo.scope && (
          <div className="px-6 py-4 border-b border-border">
            <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">Project Overview</div>
            <p className="text-sm text-foreground leading-relaxed">{state.jobInfo.scope}</p>
          </div>
        )}

        {/* Trade sections */}
        <div className="divide-y divide-border">
          {activePhaseData.length === 0 ? (
            <div className="px-6 py-12 text-center text-muted-foreground text-sm">
              <div className="text-4xl mb-3">📋</div>
              <div className="font-semibold">No items entered yet</div>
              <div className="mt-1">Go to the Calculator tab and add quantities for each trade.</div>
            </div>
          ) : (
            activePhaseData.map(({ phase, result, activeItems, bullets }) => {
              const isExpanded = expandedPhases.has(phase.id);
              return (
                <div key={phase.id} className="px-6 py-5">
                  {/* Trade header: title + price */}
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-lg leading-none">{phase.icon}</span>
                        <h3 className="font-bold text-base text-foreground">{phase.name}</h3>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{phase.description}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black text-foreground mono">{fmtDollar(result.price)}</div>
                      {showMatLabor && (
                        <div className="text-[11px] text-muted-foreground mt-0.5 space-y-0.5">
                          <div>Materials: {fmtDollar(result.matPrice)}</div>
                          <div>Labor: {fmtDollar(result.laborPrice)}</div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* SOW bullets */}
                  <ul className="space-y-2 mt-3 mb-3">
                    {bullets.map((b, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-foreground">
                        <span className="text-primary font-bold mt-0.5 shrink-0">•</span>
                        <span className="leading-relaxed">{b}</span>
                      </li>
                    ))}
                  </ul>

                  {/* Expand/collapse line item detail */}
                  <button
                    onClick={() => togglePhase(phase.id)}
                    className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors no-print mt-1"
                  >
                    {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    {isExpanded ? 'Hide' : 'Show'} line item detail
                  </button>

                  {/* Expanded line item table */}
                  {isExpanded && (
                    <div className="mt-3 rounded-lg border border-border overflow-hidden text-xs">
                      <table className="w-full">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="text-left px-3 py-2 font-semibold text-muted-foreground">Item</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Qty</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground hidden sm:table-cell">Materials</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground hidden sm:table-cell">Labor</th>
                            <th className="text-right px-3 py-2 font-semibold text-muted-foreground">Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border">
                          {activeItems.map(item => {
                            const tierData = item.hasTiers ? item.tiers[item.tier] : null;
                            const laborRate = item.laborRate || state.global.laborRate;
                            const matHard = item.hasTiers
                              ? tierData!.rate * item.qty * (1 + item.wastePct / 100)
                              : 0;
                            const laborHard = item.laborMode === 'hr'
                              ? item.hrsPerUnit * item.qty * laborRate
                              : item.flatRatePerUnit * item.qty;
                            const itemHard = matHard + laborHard;
                            const markup = state.global.markupPct;
                            const itemPrice = itemHard * markup;
                            const matPrice = matHard * markup;
                            const laborPrice = laborHard * markup;

                            return (
                              <tr key={item.id} className="hover:bg-muted/30">
                                <td className="px-3 py-2">
                                  <div className="font-medium text-foreground">{item.shortName}</div>
                                  {tierData && <div className="text-muted-foreground text-[10px]">{tierData.name}</div>}
                                </td>
                                <td className="px-3 py-2 text-right text-muted-foreground">{item.qty} {item.unitType}</td>
                                <td className="px-3 py-2 text-right hidden sm:table-cell">{item.hasTiers ? fmtDollar(matPrice) : '—'}</td>
                                <td className="px-3 py-2 text-right hidden sm:table-cell">{fmtDollar(laborPrice)}</td>
                                <td className="px-3 py-2 text-right font-semibold">{fmtDollar(itemPrice)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Custom items */}
        {customResults.length > 0 && (
          <div className="px-6 py-5 border-t border-border">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚙️</span>
              <h3 className="font-bold text-base text-foreground">Additional Items</h3>
            </div>
            <ul className="space-y-2">
              {customResults.map(cr => {
                const ci = state.customItems.find(c => c.id === cr.id)!;
                const phaseName = ALL_PHASES.find(p => p.id === ci.phaseId)?.name;
                return (
                  <li key={cr.id} className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-2 text-sm">
                      <span className="text-amber-500 mt-0.5 shrink-0 font-bold">•</span>
                      <div>
                        <span className="font-medium">{ci.description}</span>
                        {phaseName && <span className="text-xs text-muted-foreground ml-1.5">({phaseName})</span>}
                        {ci.notes && <div className="text-xs text-muted-foreground mt-0.5">{ci.notes}</div>}
                      </div>
                    </div>
                    <div className="text-sm font-bold shrink-0 mono">{fmtDollar(cr.price)}</div>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Total investment */}
        <div className="px-6 py-5 bg-slate-900 text-white">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs uppercase tracking-widest font-bold text-slate-400 mb-1">Total Investment</div>
              <div className="text-3xl font-black mono">{fmtDollar(totals.totalPrice)}</div>
              {showMatLabor && totals.totalHard > 0 && (
                <div className="text-xs text-slate-400 mt-1 space-y-0.5">
                  <div>Materials: {fmtDollar(activePhaseData.reduce((s, d) => s + d.result.matPrice, 0))}</div>
                  <div>Labor: {fmtDollar(activePhaseData.reduce((s, d) => s + d.result.laborPrice, 0))}</div>
                </div>
              )}
            </div>
            <div className="text-right text-xs text-slate-400 space-y-1">
              <div>{activePhaseData.length} trade{activePhaseData.length !== 1 ? 's' : ''} included</div>
              {customResults.length > 0 && <div>+ {customResults.length} custom item{customResults.length !== 1 ? 's' : ''}</div>}
            </div>
          </div>
        </div>

        {/* Terms */}
        <div className="px-6 py-5 border-t border-border bg-slate-50">
          <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-3">Terms &amp; Conditions</div>
          <ul className="space-y-1.5 text-sm text-foreground">
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>50% deposit required to schedule work; balance due upon project completion</li>
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>This estimate is valid for 30 days from the date above</li>
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>All work is guaranteed — 1-year workmanship warranty on labor</li>
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>Any changes to scope will be documented in a written change order before work proceeds</li>
            <li className="flex items-start gap-2"><span className="text-primary shrink-0 font-bold">•</span>Handy Pioneers is fully licensed and insured in the state of Washington</li>
          </ul>
        </div>

        {/* Notes for client */}
        <div className="px-6 py-4 border-t border-border no-print">
          <div className="text-xs uppercase tracking-widest font-bold text-muted-foreground mb-2">Notes for Client (optional)</div>
          <textarea
            value={state.summaryNotes}
            onChange={e => setSummaryNotes(e.target.value)}
            placeholder="Add any project-specific notes, exclusions, or special conditions here…"
            className="w-full text-sm border border-border rounded-lg px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-ring bg-background text-foreground placeholder:text-muted-foreground"
            rows={3}
          />
          {state.summaryNotes && (
            <div className="mt-2 text-sm text-foreground hidden print:block">
              <strong>Notes:</strong> {state.summaryNotes}
            </div>
          )}
        </div>
      </div>

      {/* Internal margin audit — hidden from customer */}
      <div className="no-print">
        <button
          onClick={() => setShowAudit(v => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          {showAudit ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
          Internal Margin Audit (not shown to client)
        </button>

        {showAudit && (
          <div className="mt-3 bg-slate-900 text-emerald-400 rounded-xl p-4 font-mono text-xs overflow-x-auto">
            <pre>{JSON.stringify({
              estimateNumber,
              date: today,
              client: state.jobInfo.client,
              hardCost: Math.round(totals.totalHard * 100) / 100,
              customerPrice: Math.round(totals.totalPrice * 100) / 100,
              grossProfit: Math.round(totals.totalGP * 100) / 100,
              grossMarginPct: Math.round(totals.totalGM * 1000) / 10,
              minGMFloor: Math.round(minGM * 100),
              gmStatus: gmFlag,
              markupMultiplier: state.global.markupPct,
              laborRate: state.global.laborRate,
              phases: activePhaseData.map(({ phase, result }) => ({
                phase: phase.name,
                hardCost: Math.round(result.hardCost * 100) / 100,
                customerPrice: Math.round(result.price * 100) / 100,
                matPrice: Math.round(result.matPrice * 100) / 100,
                laborPrice: Math.round(result.laborPrice * 100) / 100,
              })),
            }, null, 2)}</pre>
            <button
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify({
                  estimateNumber, date: today, client: state.jobInfo.client,
                  hardCost: totals.totalHard, customerPrice: totals.totalPrice,
                  grossProfit: totals.totalGP, grossMarginPct: Math.round(totals.totalGM * 1000) / 10,
                  minGMFloor: Math.round(minGM * 100), gmStatus: gmFlag,
                }, null, 2));
                toast.success('Audit data copied');
              }}
              className="mt-3 px-3 py-1.5 bg-emerald-800 text-emerald-200 rounded-md text-xs font-semibold hover:bg-emerald-700 transition-colors"
            >
              Copy Audit JSON
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
