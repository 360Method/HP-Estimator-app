// ============================================================
// EstimateSection — Final customer-facing estimate output
// SOW bullets, labor/materials separated, copy/share/print
// ============================================================

import { useMemo, useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcPhase, calcCustomItem, calcTotals, generateCustomerEstimate, generateMarginAudit, fmtDollar, fmtPct, getMarginFlag } from '@/lib/calc';
import { ALL_PHASES } from '@/lib/phases';
import { Copy, Printer, ChevronDown, ChevronUp, AlertTriangle, CheckCircle2, XCircle, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export default function EstimateSection() {
  const { state, setSummaryNotes } = useEstimator();
  const [showAudit, setShowAudit] = useState(false);
  const [showMatLabor, setShowMatLabor] = useState(true);

  const { phaseResults, customResults, totals } = useMemo(() => {
    const phaseResults = state.phases.map(p => calcPhase(p, state.global));
    const customResults = state.customItems.map(ci => calcCustomItem(ci, state.global));
    const totals = calcTotals(phaseResults, customResults);
    return { phaseResults, customResults, totals };
  }, [state.phases, state.customItems, state.global]);

  const activePhases = phaseResults.filter(p => p.hasData);

  const estimateText = useMemo(() => generateCustomerEstimate(
    {
      client: state.jobInfo.client,
      address: state.jobInfo.address,
      date: state.jobInfo.date,
      estimator: state.jobInfo.estimator,
      jobNumber: state.jobInfo.jobNumber,
    },
    phaseResults,
    totals,
    state.summaryNotes,
    customResults,
  ), [state.jobInfo, phaseResults, totals, state.summaryNotes, customResults]);

  const auditText = useMemo(() => generateMarginAudit(
    { client: state.jobInfo.client, jobNumber: state.jobInfo.jobNumber, date: state.jobInfo.date },
    state.global,
    phaseResults,
    totals,
  ), [state.jobInfo, state.global, phaseResults, totals]);

  const gmFlag = getMarginFlag(totals.totalGM, totals.totalHard);

  const copyEstimate = () => {
    navigator.clipboard.writeText(estimateText).then(() => {
      toast.success('Customer estimate copied to clipboard');
    });
  };

  const copyAudit = () => {
    navigator.clipboard.writeText(auditText).then(() => {
      toast.success('Margin audit copied to clipboard');
    });
  };

  const dateStr = state.jobInfo.date
    ? new Date(state.jobInfo.date + 'T12:00:00').toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
    : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <div className="space-y-6">
      {/* GM Status Banner */}
      {totals.totalHard > 0 && (
        <div className={`rounded-xl border p-4 flex items-center gap-3 ${
          gmFlag === 'ok' ? 'border-emerald-200 bg-emerald-50' :
          gmFlag === 'warn' ? 'border-amber-200 bg-amber-50' :
          'border-red-200 bg-red-50'
        }`}>
          {gmFlag === 'ok' ? <CheckCircle2 size={18} className="text-emerald-600 shrink-0" /> :
           gmFlag === 'warn' ? <AlertTriangle size={18} className="text-amber-600 shrink-0" /> :
           <XCircle size={18} className="text-red-600 shrink-0" />}
          <div className="flex-1">
            <div className={`font-semibold text-sm ${
              gmFlag === 'ok' ? 'text-emerald-800' : gmFlag === 'warn' ? 'text-amber-800' : 'text-red-800'
            }`}>
              {gmFlag === 'ok' ? 'Estimate ready to send' : gmFlag === 'warn' ? 'Low margin — review before sending' : 'Below GM floor — do not send'}
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              {fmtPct(totals.totalGM)} GM · {fmtDollar(totals.totalGP)} gross profit · {fmtDollar(totals.totalHard)} hard cost
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-lg font-black mono text-primary">{fmtDollar(totals.totalPrice)}</div>
            <div className="text-xs text-muted-foreground">total investment</div>
          </div>
        </div>
      )}

      {/* Customer-Facing Estimate Preview */}
      <div className="card-section">
        <div className="card-section-header">
          <span>📄</span>
          <span>Customer Estimate</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => setShowMatLabor(!showMatLabor)}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border px-2.5 py-1 rounded-md transition-colors"
            >
              {showMatLabor ? <EyeOff size={12} /> : <Eye size={12} />}
              {showMatLabor ? 'Hide' : 'Show'} Mat/Labor Split
            </button>
            <button
              onClick={copyEstimate}
              className="flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 rounded-md transition-colors"
            >
              <Copy size={12} /> Copy
            </button>
            <button
              onClick={() => window.print()}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground border border-border px-2.5 py-1 rounded-md transition-colors hover:text-foreground"
            >
              <Printer size={12} /> Print
            </button>
          </div>
        </div>

        <div className="card-section-body print-area">
          {/* Estimate Header */}
          <div className="border-b border-border pb-4 mb-4">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-xl font-black text-foreground tracking-tight">HANDY PIONEERS</div>
                <div className="text-sm text-muted-foreground">Vancouver, WA · (360) 555-0100 · handypioneers.com</div>
              </div>
              <div className="text-right">
                <div className="text-xs text-muted-foreground">Project Estimate</div>
                <div className="text-sm font-semibold">{dateStr}</div>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
              <div><span className="text-muted-foreground">Client: </span><span className="font-semibold">{state.jobInfo.client || 'TBD'}</span></div>
              <div><span className="text-muted-foreground">Prepared by: </span><span className="font-semibold">{state.jobInfo.estimator || 'Handy Pioneers'}</span></div>
              <div><span className="text-muted-foreground">Address: </span><span className="font-semibold">{state.jobInfo.address || 'TBD'}</span></div>
              {state.jobInfo.jobNumber && <div><span className="text-muted-foreground">Job #: </span><span className="font-semibold">{state.jobInfo.jobNumber}</span></div>}
            </div>
          </div>

          {activePhases.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <div className="text-4xl mb-3">📋</div>
              <div className="font-semibold">No line items entered yet</div>
              <div className="text-sm mt-1">Go to the Calculator tab and enter quantities for each trade.</div>
            </div>
          ) : (
            <>
              {/* Scope of Work */}
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 border-b border-border pb-1">
                  Scope of Work
                </h3>
                <div className="space-y-4">
                  {activePhases.map(phase => (
                    <div key={phase.phaseId}>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-sm">{phase.phaseIcon}</span>
                        <span className="text-sm font-bold text-foreground">{phase.phaseName}</span>
                      </div>
                      <ul className="space-y-1 ml-5">
                        {phase.items.filter(i => i.hasData).map(item => (
                          <li key={item.id} className="text-sm text-foreground flex items-start gap-1.5">
                            <span className="text-muted-foreground mt-0.5">•</span>
                            <span>{item.sowLine}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              {/* Investment Table */}
              <div className="mb-6">
                <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground mb-3 border-b border-border pb-1">
                  Investment
                </h3>
                <div className="space-y-2">
                  {activePhases.map(phase => (
                    <div key={phase.phaseId} className="rounded-lg border border-border overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2 bg-muted/30">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">{phase.phaseIcon}</span>
                          <span className="text-sm font-semibold text-foreground">{phase.phaseName}</span>
                        </div>
                        <span className="text-sm font-bold mono text-primary">{fmtDollar(phase.price)}</span>
                      </div>
                      {showMatLabor && (
                        <div className="px-3 py-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-border">
                          <div>Materials: <span className="font-semibold text-foreground">{fmtDollar(phase.matPrice)}</span></div>
                          <div>Labor: <span className="font-semibold text-foreground">{fmtDollar(phase.laborPrice)}</span></div>
                        </div>
                      )}
                      {/* SOW items */}
                      <div className="px-3 pb-2 space-y-0.5">
                        {phase.items.filter(i => i.hasData).map(item => (
                          <div key={item.id} className="text-xs text-muted-foreground flex items-start gap-1">
                            <span className="mt-0.5">·</span>
                            <span>{item.sowLine}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}

                  {/* Custom items grouped by phase */}
                  {customResults.length > 0 && (() => {
                    const grouped = customResults.reduce((acc, ci) => {
                      const key = ci.phaseId;
                      if (!acc[key]) acc[key] = [];
                      acc[key].push(ci);
                      return acc;
                    }, {} as Record<number, typeof customResults>);
                    return Object.entries(grouped).map(([phaseId, items]) => {
                      const phase = ALL_PHASES.find(p => p.id === Number(phaseId));
                      const totalPrice = items.reduce((s, i) => s + i.price, 0);
                      const matPrice = items.reduce((s, i) => s + i.matPrice, 0);
                      const laborPrice = items.reduce((s, i) => s + i.laborPrice, 0);
                      return (
                        <div key={phaseId} className="rounded-lg border border-amber-200 overflow-hidden">
                          <div className="flex items-center justify-between px-3 py-2 bg-amber-50/50">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm">{phase?.icon ?? '✨'}</span>
                              <span className="text-sm font-semibold">{phase?.name ?? 'Custom'}</span>
                              <span className="text-[10px] text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full font-medium">Custom</span>
                            </div>
                            <span className="text-sm font-bold mono text-primary">{fmtDollar(totalPrice)}</span>
                          </div>
                          {showMatLabor && (
                            <div className="px-3 py-2 grid grid-cols-2 gap-2 text-xs text-muted-foreground border-t border-amber-100">
                              <div>Materials: <span className="font-semibold text-foreground">{fmtDollar(matPrice)}</span></div>
                              <div>Labor: <span className="font-semibold text-foreground">{fmtDollar(laborPrice)}</span></div>
                            </div>
                          )}
                          <div className="px-3 pb-2 space-y-0.5">
                            {items.map(ci => (
                              <div key={ci.id} className="text-xs text-muted-foreground flex items-start gap-1">
                                <span className="mt-0.5">·</span>
                                <span>{ci.sowLine}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    });
                  })()}
                </div>

                {/* Totals */}
                <div className="mt-3 rounded-xl border-2 border-primary/30 bg-primary/5 p-4">
                  <div className="flex justify-between items-center">
                    <span className="font-bold text-foreground">Total Investment</span>
                    <span className="text-xl font-black mono text-primary">{fmtDollar(totals.totalPrice)}</span>
                  </div>
                  {showMatLabor && (
                    <div className="mt-2 grid grid-cols-2 gap-2 text-sm text-muted-foreground border-t border-primary/20 pt-2">
                      <div>Total Materials: <span className="font-semibold text-foreground">{fmtDollar(totals.totalMatPrice)}</span></div>
                      <div>Total Labor: <span className="font-semibold text-foreground">{fmtDollar(totals.totalLaborPrice)}</span></div>
                    </div>
                  )}
                </div>
              </div>

              {/* Terms */}
              <div className="text-xs text-muted-foreground space-y-1 border-t border-border pt-4">
                <div className="font-semibold text-foreground mb-1.5">Terms</div>
                <div>• 50% deposit due upon acceptance</div>
                <div>• Balance due upon completion</div>
                <div>• Price valid for 30 days from estimate date</div>
                <div>• Pricing includes materials, labor, and cleanup</div>
                <div>• Client-supplied paint assumed unless noted</div>
              </div>

              {/* Estimator notes */}
              <div className="mt-4">
                <label className="block text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                  Estimator Notes (appears on estimate)
                </label>
                <textarea
                  value={state.summaryNotes}
                  onChange={e => setSummaryNotes(e.target.value)}
                  placeholder="Add any notes to include on the customer estimate..."
                  rows={3}
                  className="field-input w-full resize-none"
                />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Internal Margin Audit */}
      <div className="card-section border-amber-200">
        <div className="card-section-header bg-amber-50 border-b border-amber-200">
          <AlertTriangle size={14} className="text-amber-600" />
          <span className="text-amber-800">Internal Margin Audit</span>
          <span className="ml-2 text-xs text-amber-600 font-normal">Never share with clients</span>
          <div className="ml-auto flex gap-2">
            <button
              onClick={copyAudit}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 border border-amber-300 px-2.5 py-1 rounded-md transition-colors hover:bg-amber-100"
            >
              <Copy size={12} /> Copy JSON
            </button>
            <button
              onClick={() => setShowAudit(!showAudit)}
              className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 border border-amber-300 px-2.5 py-1 rounded-md transition-colors hover:bg-amber-100"
            >
              {showAudit ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {showAudit ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>
        {showAudit && (
          <div className="card-section-body">
            <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-foreground">
              {auditText}
            </pre>
          </div>
        )}
      </div>

      {/* Copy plain text */}
      <div className="card-section">
        <div className="card-section-header">
          <Copy size={14} />
          <span>Plain Text Estimate</span>
          <span className="ml-2 text-xs text-muted-foreground font-normal">Copy and paste into email or text</span>
          <button
            onClick={copyEstimate}
            className="ml-auto flex items-center gap-1.5 text-xs font-semibold text-primary border border-primary/30 bg-primary/5 hover:bg-primary/10 px-2.5 py-1 rounded-md transition-colors"
          >
            <Copy size={12} /> Copy to Clipboard
          </button>
        </div>
        <div className="card-section-body">
          <pre className="text-xs font-mono bg-muted/50 rounded-lg p-3 overflow-x-auto whitespace-pre-wrap text-foreground leading-relaxed">
            {estimateText}
          </pre>
        </div>
      </div>
    </div>
  );
}
