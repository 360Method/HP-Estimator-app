import { useState } from 'react';
import { GitBranch, Save } from 'lucide-react';
import { toast } from 'sonner';

const Toggle = ({ checked, onChange, label }: { checked: boolean; onChange: () => void; label: string }) => (
  <div className="flex items-center justify-between py-3 border-b border-border/60 last:border-0">
    <span className="text-sm text-foreground">{label}</span>
    <button onClick={onChange} className={`relative w-9 h-5 rounded-full transition-colors ${checked ? 'bg-primary' : 'bg-muted border border-border'}`}>
      <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-4' : ''}`} />
    </button>
  </div>
);

const WIN_PROBABILITIES: { stage: string; prob: number }[] = [
  { stage: 'New Lead', prob: 10 },
  { stage: 'First Contact', prob: 25 },
  { stage: 'Second Contact', prob: 40 },
  { stage: 'Estimate Sent', prob: 60 },
  { stage: 'Verbal Acceptance', prob: 80 },
  { stage: 'Approved', prob: 95 },
];

export default function PipelineSettings() {
  const [cfg, setCfg] = useState({
    defaultView: 'kanban' as 'kanban' | 'table',
    showValueOnCards: true, showCustomerOnCards: true,
    showDaysInStageWarning: true, daysInStageWarningThreshold: 7,
    groupByType: false,
  });
  const [probs, setProbs] = useState(WIN_PROBABILITIES);
  const toggle = (k: keyof typeof cfg) => setCfg(p => ({ ...p, [k]: !p[k] }));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Pipeline</h2>

      <section className="card-section">
        <div className="card-section-header"><GitBranch size={13} /><span className="text-xs font-bold uppercase tracking-wider">Display</span></div>
        <div className="card-section-body space-y-3">
          <div>
            <label className="field-label">Default view</label>
            <div className="flex gap-2 mt-1">
              {(['kanban', 'table'] as const).map(v => (
                <button key={v} onClick={() => setCfg(p => ({ ...p, defaultView: v }))}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors capitalize ${cfg.defaultView === v ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:bg-muted'}`}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <Toggle checked={cfg.showValueOnCards} onChange={() => toggle('showValueOnCards')} label="Show deal value on kanban cards" />
          <Toggle checked={cfg.showCustomerOnCards} onChange={() => toggle('showCustomerOnCards')} label="Show customer name on kanban cards" />
          <Toggle checked={cfg.groupByType} onChange={() => toggle('groupByType')} label="Group pipeline by type (Lead / Estimate / Job)" />
          <Toggle checked={cfg.showDaysInStageWarning} onChange={() => toggle('showDaysInStageWarning')} label="Highlight cards stuck in a stage too long" />
          {cfg.showDaysInStageWarning && (
            <div className="pl-4">
              <label className="field-label">Warn after (days)</label>
              <input type="number" value={cfg.daysInStageWarningThreshold}
                onChange={e => setCfg(p => ({ ...p, daysInStageWarningThreshold: Number(e.target.value) }))}
                className="field-input w-24" />
            </div>
          )}
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><span className="text-xs font-bold uppercase tracking-wider">Win Probability by Stage</span></div>
        <div className="card-section-body divide-y divide-border/60">
          {probs.map((p, i) => (
            <div key={p.stage} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <span className="flex-1 text-sm text-foreground">{p.stage}</span>
              <div className="flex items-center gap-2">
                <input type="range" min={0} max={100} step={5} value={p.prob}
                  onChange={e => setProbs(prev => prev.map((r, ri) => ri === i ? { ...r, prob: Number(e.target.value) } : r))}
                  className="w-28" />
                <span className="text-sm font-bold text-primary w-10 text-right">{p.prob}%</span>
              </div>
            </div>
          ))}
        </div>
      </section>

      <button onClick={() => toast.success('Pipeline settings saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Settings
      </button>
    </div>
  );
}
