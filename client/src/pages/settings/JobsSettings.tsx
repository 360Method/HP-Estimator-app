import { useState } from 'react';
import { Briefcase, Save } from 'lucide-react';
import { toast } from 'sonner';

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <div className="flex items-center justify-between py-3 border-b border-border/60 last:border-0">
    <span className="text-sm text-foreground">{label}</span>
    <button onClick={onChange} className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  </div>
);

const DEFAULT_STAGES = [
  'New Job', 'Deposit Needed', 'Deposit Collected', 'Need to Order Materials',
  'Waiting on Materials', 'Materials Received', 'Unscheduled', 'Scheduled',
  'In Progress', 'Completed', 'Invoice Sent', 'Invoice Paid',
];

export default function JobsSettings() {
  const [cfg, setCfg] = useState({
    prefix: 'JOB-', startNumber: 1001,
    requireCompletionSignOff: true, requirePhotosOnCompletion: false,
    autoCreateInvoiceOnCompletion: true, sendCompletionSummaryToCustomer: true,
    defaultTaxRate: 8.5,
  });
  const [stages] = useState(DEFAULT_STAGES);
  const toggle = (k: keyof typeof cfg) => setCfg(p => ({ ...p, [k]: !p[k] }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Jobs</h2>

      <section className="card-section">
        <div className="card-section-header"><Briefcase size={13} /><span className="text-xs font-bold uppercase tracking-wider">Numbering</span></div>
        <div className="card-section-body grid grid-cols-2 gap-4">
          <div><label className="field-label">Job number prefix</label>
            <input value={cfg.prefix} onChange={e => setCfg(p => ({ ...p, prefix: e.target.value }))} className="field-input" /></div>
          <div><label className="field-label">Starting number</label>
            <input type="number" value={cfg.startNumber} onChange={e => setCfg(p => ({ ...p, startNumber: Number(e.target.value) }))} className="field-input" /></div>
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Default Stages</span></div>
        <div className="card-section-body">
          <p className="text-xs text-muted-foreground mb-3">These stages appear in the job pipeline. Drag to reorder (coming soon).</p>
          <div className="flex flex-wrap gap-2">
            {stages.map((s, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full bg-muted border border-border text-xs font-semibold text-foreground">{s}</span>
            ))}
          </div>
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Defaults</span></div>
        <div className="card-section-body">
          <div className="mb-4">
            <label className="field-label">Default tax rate (%)</label>
            <input type="number" step="0.1" value={cfg.defaultTaxRate} onChange={e => setCfg(p => ({ ...p, defaultTaxRate: Number(e.target.value) }))} className="field-input w-32" />
          </div>
          <Toggle checked={cfg.requireCompletionSignOff} onChange={() => toggle('requireCompletionSignOff')} label="Require customer sign-off on job completion" />
          <Toggle checked={cfg.requirePhotosOnCompletion} onChange={() => toggle('requirePhotosOnCompletion')} label="Require completion photos before marking complete" />
          <Toggle checked={cfg.autoCreateInvoiceOnCompletion} onChange={() => toggle('autoCreateInvoiceOnCompletion')} label="Auto-create invoice when job is completed" />
          <Toggle checked={cfg.sendCompletionSummaryToCustomer} onChange={() => toggle('sendCompletionSummaryToCustomer')} label="Send completion summary email to customer" />
        </div>
      </section>

      <button onClick={() => toast.success('Job settings saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Settings
      </button>
    </div>
  );
}
