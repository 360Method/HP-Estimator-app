import { useState } from 'react';
import { Tag, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

interface JobField {
  id: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'date' | 'checkbox';
  required: boolean;
  options?: string;
}

const DEFAULT_FIELDS: JobField[] = [
  { id: '1', label: 'Permit Number',       type: 'text',     required: false },
  { id: '2', label: 'HOA Approval',        type: 'checkbox', required: false },
  { id: '3', label: 'Access Code',         type: 'text',     required: false },
  { id: '4', label: 'Material Supplier',   type: 'text',     required: false },
  { id: '5', label: 'Project Manager',     type: 'text',     required: false },
  { id: '6', label: 'Estimated Duration',  type: 'select',   required: false, options: '1 day,2-3 days,1 week,2 weeks,1 month,2+ months' },
];

export default function JobFieldsSettings() {
  const [fields, setFields] = useState<JobField[]>(DEFAULT_FIELDS);

  const addField = () => {
    setFields(prev => [...prev, { id: Date.now().toString(), label: '', type: 'text', required: false }]);
  };

  const update = (id: string, key: keyof JobField, value: string | boolean) => {
    setFields(prev => prev.map(f => f.id === id ? { ...f, [key]: value } : f));
  };

  const remove = (id: string) => {
    setFields(prev => prev.filter(f => f.id !== id));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Job Fields</h2>
        <button onClick={addField} className="flex items-center gap-2 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
          <Plus size={14} /> Add Field
        </button>
      </div>

      <p className="text-sm text-muted-foreground">Custom fields that appear on every job record. Use these for permit numbers, HOA info, access codes, or any business-specific data.</p>

      <section className="card-section">
        <div className="card-section-header"><Tag size={13} /><span className="text-xs font-bold uppercase tracking-wider">Custom Job Fields</span></div>
        <div className="card-section-body divide-y divide-border/60">
          {fields.length === 0 && <p className="text-sm text-muted-foreground italic py-2">No custom fields yet. Click "Add Field" to create one.</p>}
          {fields.map(f => (
            <div key={f.id} className="grid grid-cols-[1fr_auto_auto_auto] gap-3 items-center py-3 first:pt-0 last:pb-0">
              <input
                value={f.label}
                onChange={e => update(f.id, 'label', e.target.value)}
                placeholder="Field label"
                className="field-input"
              />
              <select value={f.type} onChange={e => update(f.id, 'type', e.target.value)} className="field-input text-xs">
                <option value="text">Text</option>
                <option value="number">Number</option>
                <option value="select">Dropdown</option>
                <option value="date">Date</option>
                <option value="checkbox">Checkbox</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap cursor-pointer">
                <input type="checkbox" checked={f.required} onChange={e => update(f.id, 'required', e.target.checked)} className="rounded" />
                Required
              </label>
              <button onClick={() => remove(f.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <button onClick={() => toast.success('Job fields saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Fields
      </button>
    </div>
  );
}
