// Add-opportunity inline form — extracted verbatim from CustomerSection.tsx (Phase D).
import { useState } from 'react';
import { toast } from 'sonner';
import {
  LEAD_STAGES, ESTIMATE_STAGES, JOB_STAGES,
  type PipelineArea, type OpportunityStage,
} from '@/lib/types';

export default function AddOpportunityForm({
  area, onAdd, onCancel,
}: {
  area: PipelineArea;
  onAdd: (title: string, stage: OpportunityStage, value: number, notes: string) => void;
  onCancel: () => void;
}) {
  const stages = area === 'lead' ? LEAD_STAGES : area === 'estimate' ? ESTIMATE_STAGES : JOB_STAGES;
  const [title, setTitle] = useState('');
  const [stage, setStage] = useState<OpportunityStage>(stages[0]);
  const [value, setValue] = useState('');
  const [notes, setNotes] = useState('');

  const submit = () => {
    if (!title.trim()) { toast.error('Enter a title for this opportunity'); return; }
    onAdd(title.trim(), stage, parseFloat(value) || 0, notes.trim());
    toast.success('Opportunity added');
  };

  return (
    <div className="border border-primary/30 rounded-xl bg-primary/5 p-4 space-y-3">
      <div className="text-xs font-semibold text-primary uppercase tracking-wider">New Opportunity</div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Title / Description</label>
        <input type="text" value={title} onChange={e => setTitle(e.target.value)}
          placeholder="e.g. Kitchen remodel — Johnson residence"
          className="field-input w-full" autoFocus />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Stage</label>
          <select value={stage} onChange={e => setStage(e.target.value as OpportunityStage)} className="field-input w-full">
            {stages.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Est. Value ($)</label>
          <input type="number" value={value} onChange={e => setValue(e.target.value)}
            placeholder="0.00" className="field-input w-full" />
        </div>
      </div>
      <div>
        <label className="block text-xs text-muted-foreground mb-1">Notes (optional)</label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)}
          placeholder="Any relevant notes..." rows={2} className="field-input w-full resize-none" />
      </div>
      <div className="flex gap-2">
        <button onClick={submit} className="flex-1 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
          Add Opportunity
        </button>
        <button onClick={onCancel} className="px-3 py-2 border border-border rounded-lg text-xs hover:bg-muted transition-colors">
          Cancel
        </button>
      </div>
    </div>
  );
}
