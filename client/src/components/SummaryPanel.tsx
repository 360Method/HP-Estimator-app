// ============================================================
// SummaryPanel — Final summary, customer estimate, margin audit
// ============================================================

import { useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { calcTrade, calcTotals, generateCustomerEstimate, generateMarginAudit } from '@/lib/calc';
import { fmtDollar, fmtPct } from '@/lib/data';
import MarginFlag from './MarginFlag';
import { toast } from 'sonner';

export default function SummaryPanel() {
  const { state, setSummaryNotes } = useEstimator();
  const [showAudit, setShowAudit] = useState(false);
  const [copied, setCopied] = useState<'estimate' | 'audit' | null>(null);

  const bbResult = calcTrade('bb', state.bb, state.global);
  const dcResult = calcTrade('dc', state.dc, state.global);
  const wcResult = calcTrade('wc', state.wc, state.global);
  const totals = calcTotals(bbResult, dcResult, wcResult);

  const items = [
    { name: 'Baseboard',     price: bbResult.price, matName: bbResult.matName, totalLF: bbResult.totalLF },
    { name: 'Door Casing',   price: dcResult.price, matName: dcResult.matName, totalLF: dcResult.totalLF, count: state.dc.count },
    { name: 'Window Casing', price: wcResult.price, matName: wcResult.matName, totalLF: wcResult.totalLF, count: state.wc.count },
  ];

  const customerEstimate = generateCustomerEstimate(
    state.jobInfo,
    items,
    totals.totalPrice,
    state.summaryNotes
  );

  const marginAudit = generateMarginAudit(
    state.jobInfo,
    state.global,
    bbResult,
    dcResult,
    wcResult,
    totals
  );

  const handleCopy = async (text: string, type: 'estimate' | 'audit') => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(type);
      toast.success(type === 'estimate' ? 'Customer estimate copied!' : 'Margin audit copied!');
      setTimeout(() => setCopied(null), 2000);
    } catch {
      toast.error('Copy failed — please select and copy manually');
    }
  };

  const handlePrint = () => window.print();

  const activeItems = items.filter(i => i.price > 0);

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">Estimate Summary</h2>

        {/* Client line */}
        <div className="text-sm text-muted-foreground mb-4">
          {state.jobInfo.client || 'Client TBD'} · {state.jobInfo.address || 'Address TBD'}
        </div>

        {/* Line items */}
        {activeItems.length === 0 ? (
          <div className="text-[12px] text-muted-foreground italic py-2">
            No line items entered yet — configure each trade section above.
          </div>
        ) : (
          <div className="space-y-1 mb-4">
            {activeItems.map(item => (
              <div key={item.name} className="flex justify-between items-center py-1.5 border-b border-border last:border-0">
                <span className="text-[13px] text-foreground font-medium">{item.name}</span>
                <span className="text-[14px] font-bold mono text-foreground">{fmtDollar(item.price)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center py-1.5 text-muted-foreground">
              <span className="text-[11px]">Total hard cost (internal)</span>
              <span className="text-[12px] font-semibold mono">{fmtDollar(totals.totalHard)}</span>
            </div>
          </div>
        )}

        {/* Total */}
        <div className="flex justify-between items-center pt-3 border-t-2 border-border">
          <span className="text-base font-bold text-foreground">Total Customer Price</span>
          <span className="text-2xl font-black mono text-primary">{totals.totalPrice > 0 ? fmtDollar(totals.totalPrice) : '—'}</span>
        </div>

        {/* GM summary */}
        {totals.totalHard > 0 && (
          <div className="mt-3 grid grid-cols-3 gap-3">
            <MiniStat label="Gross Margin" value={fmtPct(totals.totalGM)} />
            <MiniStat label="Gross Profit" value={fmtDollar(totals.totalGP)} />
            <MiniStat label="Hard Cost" value={fmtDollar(totals.totalHard)} sub="internal" />
          </div>
        )}

        <div className="mt-4">
          <MarginFlag gm={totals.totalGM} hardCost={totals.totalHard} price={totals.totalPrice} />
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
        <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Estimator Notes</h2>
        <textarea
          className="field-input resize-y min-h-[80px]"
          placeholder="Final notes for the estimate, special client requests, or reminders before sending..."
          value={state.summaryNotes}
          onChange={e => setSummaryNotes(e.target.value)}
        />
        <div className="flex flex-wrap gap-2 mt-2">
          {['Client supplied paint', 'Existing trim demo included', 'Stain-grade — no paint prep', 'Tight corners — add time', 'Stairs included'].map(tag => (
            <button
              key={tag}
              onClick={() => setSummaryNotes(state.summaryNotes + (state.summaryNotes && !state.summaryNotes.endsWith('\n') ? '\n' : '') + tag + ' ')}
              className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-secondary hover:bg-primary/5 hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors"
            >
              + {tag}
            </button>
          ))}
        </div>
      </div>

      {/* Customer Estimate */}
      <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Customer Estimate</h2>
          <button
            onClick={() => handleCopy(customerEstimate, 'estimate')}
            className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
              copied === 'estimate'
                ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                : 'border-border hover:border-primary/50 hover:text-primary text-muted-foreground'
            }`}
          >
            {copied === 'estimate' ? '✓ Copied!' : 'Copy to clipboard'}
          </button>
        </div>
        <pre className="text-[11px] font-mono bg-secondary rounded-lg p-4 overflow-x-auto whitespace-pre text-foreground leading-relaxed border border-border">
          {customerEstimate}
        </pre>
        <p className="text-[10px] text-muted-foreground mt-2">
          Copy and paste into email, text, or your estimate document. No internal cost data is included.
        </p>
      </div>

      {/* Internal Margin Audit */}
      <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest">Internal Margin Audit</h2>
            <p className="text-[10px] text-muted-foreground mt-0.5">Never share with clients</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowAudit(v => !v)}
              className="text-[12px] font-semibold px-3 py-1.5 rounded-lg border border-border hover:border-primary/50 hover:text-primary text-muted-foreground transition-all"
            >
              {showAudit ? 'Hide' : 'Show'}
            </button>
            <button
              onClick={() => handleCopy(marginAudit, 'audit')}
              className={`text-[12px] font-semibold px-3 py-1.5 rounded-lg border transition-all ${
                copied === 'audit'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-700'
                  : 'border-border hover:border-primary/50 hover:text-primary text-muted-foreground'
              }`}
            >
              {copied === 'audit' ? '✓ Copied!' : 'Copy JSON'}
            </button>
          </div>
        </div>
        {showAudit && (
          <pre className="text-[11px] font-mono bg-slate-900 text-emerald-400 rounded-lg p-4 overflow-x-auto whitespace-pre leading-relaxed">
            {marginAudit}
          </pre>
        )}
      </div>

      {/* Print button */}
      <button
        onClick={handlePrint}
        className="w-full py-3 rounded-xl border border-border bg-white hover:bg-secondary text-[13px] font-semibold text-foreground transition-colors no-print"
      >
        Print / Save as PDF
      </button>
    </div>
  );
}

function MiniStat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-secondary rounded-lg p-2.5 text-center">
      <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="text-[15px] font-black mono text-foreground mt-0.5">{value}</div>
      {sub && <div className="text-[9px] text-muted-foreground">{sub}</div>}
    </div>
  );
}
