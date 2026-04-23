import { useState } from 'react';
import { FileText, Save } from 'lucide-react';
import { toast } from 'sonner';

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <div className="flex items-center justify-between py-3 border-b border-border/60 last:border-0">
    <span className="text-sm text-foreground">{label}</span>
    <button onClick={onChange} className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  </div>
);

export default function EstimatesSettings() {
  const [cfg, setCfg] = useState({
    prefix: 'EST-', startNumber: 1001, expiryDays: 30,
    depositPct: 50, signatureRequired: true, showLineItemPrices: true,
    showPhaseSubtotals: true, allowCustomerComments: false,
    autoSendReminder: true, reminderDays: 3,
  });

  const toggle = (k: keyof typeof cfg) => setCfg(p => ({ ...p, [k]: !p[k] }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Estimates</h2>

      <section className="card-section">
        <div className="card-section-header"><FileText size={13} /><span className="text-xs font-bold uppercase tracking-wider">Numbering</span></div>
        <div className="card-section-body grid grid-cols-2 gap-4">
          <div><label className="field-label">Estimate number prefix</label>
            <input value={cfg.prefix} onChange={e => setCfg(p => ({ ...p, prefix: e.target.value }))} className="field-input" /></div>
          <div><label className="field-label">Starting number</label>
            <input type="number" value={cfg.startNumber} onChange={e => setCfg(p => ({ ...p, startNumber: Number(e.target.value) }))} className="field-input" /></div>
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Defaults</span></div>
        <div className="card-section-body grid grid-cols-2 gap-4">
          <div><label className="field-label">Estimate expiry (days)</label>
            <input type="number" value={cfg.expiryDays} onChange={e => setCfg(p => ({ ...p, expiryDays: Number(e.target.value) }))} className="field-input" /></div>
          <div><label className="field-label">Default deposit (%)</label>
            <input type="number" min={0} max={100} value={cfg.depositPct} onChange={e => setCfg(p => ({ ...p, depositPct: Number(e.target.value) }))} className="field-input" /></div>
          <div><label className="field-label">Reminder before expiry (days)</label>
            <input type="number" value={cfg.reminderDays} onChange={e => setCfg(p => ({ ...p, reminderDays: Number(e.target.value) }))} className="field-input" /></div>
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Options</span></div>
        <div className="card-section-body">
          <Toggle checked={cfg.signatureRequired} onChange={() => toggle('signatureRequired')} label="Require customer signature before approval" />
          <Toggle checked={cfg.showLineItemPrices} onChange={() => toggle('showLineItemPrices')} label="Show individual line item prices to customer" />
          <Toggle checked={cfg.showPhaseSubtotals} onChange={() => toggle('showPhaseSubtotals')} label="Show phase subtotals on customer estimate" />
          <Toggle checked={cfg.allowCustomerComments} onChange={() => toggle('allowCustomerComments')} label="Allow customers to add comments on estimate" />
          <Toggle checked={cfg.autoSendReminder} onChange={() => toggle('autoSendReminder')} label="Auto-send reminder before estimate expires" />
        </div>
      </section>

      <button onClick={() => toast.success('Estimate settings saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Settings
      </button>
    </div>
  );
}
