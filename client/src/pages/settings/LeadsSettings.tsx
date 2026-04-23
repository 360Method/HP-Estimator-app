import { useState } from 'react';
import { UserPlus, Save } from 'lucide-react';
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
  'New Lead', 'Return Call Needed', 'First Contact', 'Second Contact',
  'Third Contact', 'On Hold', 'Won', 'Lost',
];

export default function LeadsSettings() {
  const [cfg, setCfg] = useState({
    autoAssignToOwner: true, sendNewLeadNotification: true,
    requireFollowUpDate: false, autoArchiveLostLeads: false,
    followUpReminderDays: 3,
  });
  const [stages] = useState(DEFAULT_STAGES);
  const toggle = (k: keyof typeof cfg) => setCfg(p => ({ ...p, [k]: !p[k] }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Leads</h2>

      <section className="card-section">
        <div className="card-section-header"><UserPlus size={13} /><span className="text-xs font-bold uppercase tracking-wider">Lead Stages</span></div>
        <div className="card-section-body">
          <p className="text-xs text-muted-foreground mb-3">Stages used in the lead pipeline. Drag to reorder (coming soon).</p>
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
            <label className="field-label">Follow-up reminder (days after last contact)</label>
            <input type="number" value={cfg.followUpReminderDays} onChange={e => setCfg(p => ({ ...p, followUpReminderDays: Number(e.target.value) }))} className="field-input w-24" />
          </div>
          <Toggle checked={cfg.autoAssignToOwner} onChange={() => toggle('autoAssignToOwner')} label="Auto-assign new leads to owner" />
          <Toggle checked={cfg.sendNewLeadNotification} onChange={() => toggle('sendNewLeadNotification')} label="Send notification when new lead is created" />
          <Toggle checked={cfg.requireFollowUpDate} onChange={() => toggle('requireFollowUpDate')} label="Require follow-up date on all leads" />
          <Toggle checked={cfg.autoArchiveLostLeads} onChange={() => toggle('autoArchiveLostLeads')} label="Auto-archive leads marked as Lost after 90 days" />
        </div>
      </section>

      <button onClick={() => toast.success('Lead settings saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Settings
      </button>
    </div>
  );
}
