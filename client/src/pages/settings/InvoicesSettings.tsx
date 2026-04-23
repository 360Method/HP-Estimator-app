import { useState } from 'react';
import { Receipt, Save } from 'lucide-react';
import { toast } from 'sonner';

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <div className="flex items-center justify-between py-3 border-b border-border/60 last:border-0">
    <span className="text-sm text-foreground">{label}</span>
    <button onClick={onChange} className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  </div>
);

export default function InvoicesSettings() {
  const [cfg, setCfg] = useState({
    prefix: 'INV-', startNumber: 1001, dueDays: 14,
    lateFeeEnabled: false, lateFeeType: 'percent' as 'percent' | 'flat',
    lateFeeAmount: 1.5, lateFeeGraceDays: 7,
    acceptCash: true, acceptCheck: true, acceptCard: true, acceptACH: false,
    autoSendReminder: true, reminderDays: 3,
    requireSignatureOnCompletion: true,
  });
  const toggle = (k: keyof typeof cfg) => setCfg(p => ({ ...p, [k]: !p[k] }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Invoices</h2>

      <section className="card-section">
        <div className="card-section-header"><Receipt size={13} /><span className="text-xs font-bold uppercase tracking-wider">Numbering</span></div>
        <div className="card-section-body grid grid-cols-2 gap-4">
          <div><label className="field-label">Invoice number prefix</label>
            <input value={cfg.prefix} onChange={e => setCfg(p => ({ ...p, prefix: e.target.value }))} className="field-input" /></div>
          <div><label className="field-label">Starting number</label>
            <input type="number" value={cfg.startNumber} onChange={e => setCfg(p => ({ ...p, startNumber: Number(e.target.value) }))} className="field-input" /></div>
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Payment Terms</span></div>
        <div className="card-section-body grid grid-cols-2 gap-4">
          <div><label className="field-label">Default due (days after invoice)</label>
            <input type="number" value={cfg.dueDays} onChange={e => setCfg(p => ({ ...p, dueDays: Number(e.target.value) }))} className="field-input" /></div>
          <div><label className="field-label">Reminder before due (days)</label>
            <input type="number" value={cfg.reminderDays} onChange={e => setCfg(p => ({ ...p, reminderDays: Number(e.target.value) }))} className="field-input" /></div>
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Late Fees</span></div>
        <div className="card-section-body space-y-3">
          <Toggle checked={cfg.lateFeeEnabled} onChange={() => toggle('lateFeeEnabled')} label="Enable late fees on overdue invoices" />
          {cfg.lateFeeEnabled && (
            <div className="grid grid-cols-3 gap-3 pt-1">
              <div><label className="field-label">Fee type</label>
                <select value={cfg.lateFeeType} onChange={e => setCfg(p => ({ ...p, lateFeeType: e.target.value as 'percent' | 'flat' }))} className="field-input">
                  <option value="percent">Percentage (%)</option>
                  <option value="flat">Flat fee ($)</option>
                </select></div>
              <div><label className="field-label">Amount</label>
                <input type="number" step="0.1" value={cfg.lateFeeAmount} onChange={e => setCfg(p => ({ ...p, lateFeeAmount: Number(e.target.value) }))} className="field-input" /></div>
              <div><label className="field-label">Grace period (days)</label>
                <input type="number" value={cfg.lateFeeGraceDays} onChange={e => setCfg(p => ({ ...p, lateFeeGraceDays: Number(e.target.value) }))} className="field-input" /></div>
            </div>
          )}
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Accepted Payment Methods</span></div>
        <div className="card-section-body">
          <Toggle checked={cfg.acceptCash} onChange={() => toggle('acceptCash')} label="Cash" />
          <Toggle checked={cfg.acceptCheck} onChange={() => toggle('acceptCheck')} label="Check" />
          <Toggle checked={cfg.acceptCard} onChange={() => toggle('acceptCard')} label="Credit / Debit card (Stripe)" />
          <Toggle checked={cfg.acceptACH} onChange={() => toggle('acceptACH')} label="ACH bank transfer" />
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Options</span></div>
        <div className="card-section-body">
          <Toggle checked={cfg.autoSendReminder} onChange={() => toggle('autoSendReminder')} label="Auto-send payment reminder before due date" />
          <Toggle checked={cfg.requireSignatureOnCompletion} onChange={() => toggle('requireSignatureOnCompletion')} label="Require customer signature on job completion" />
        </div>
      </section>

      <button onClick={() => toast.success('Invoice settings saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Settings
      </button>
    </div>
  );
}
