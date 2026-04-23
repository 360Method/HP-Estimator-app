import { useState } from 'react';
import { Radio, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

interface LeadSource {
  id: string;
  name: string;
  active: boolean;
  count: number;
}

const DEFAULT_SOURCES: LeadSource[] = [
  { id: '1',  name: 'Google',           active: true,  count: 0 },
  { id: '2',  name: 'Yelp',             active: true,  count: 0 },
  { id: '3',  name: 'Facebook',         active: true,  count: 0 },
  { id: '4',  name: 'Nextdoor',         active: true,  count: 0 },
  { id: '5',  name: 'Referral',         active: true,  count: 0 },
  { id: '6',  name: 'Word of Mouth',    active: true,  count: 0 },
  { id: '7',  name: 'Repeat Customer',  active: true,  count: 0 },
  { id: '8',  name: 'Door Hanger',      active: true,  count: 0 },
  { id: '9',  name: 'Yard Sign',        active: true,  count: 0 },
  { id: '10', name: 'Home Advisor',     active: false, count: 0 },
  { id: '11', name: 'Thumbtack',        active: false, count: 0 },
  { id: '12', name: 'Angi',             active: false, count: 0 },
  { id: '13', name: 'Website',          active: true,  count: 0 },
  { id: '14', name: 'Other',            active: true,  count: 0 },
];

export default function LeadSourcesSettings() {
  const [sources, setSources] = useState<LeadSource[]>(DEFAULT_SOURCES);
  const [newName, setNewName] = useState('');

  const add = () => {
    if (!newName.trim()) return;
    setSources(prev => [...prev, { id: Date.now().toString(), name: newName.trim(), active: true, count: 0 }]);
    setNewName('');
  };

  const toggle = (id: string) => setSources(prev => prev.map(s => s.id === id ? { ...s, active: !s.active } : s));
  const remove = (id: string) => setSources(prev => prev.filter(s => s.id !== id));

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Lead Sources</h2>
      <p className="text-sm text-muted-foreground">Track where your leads come from. Active sources appear in the lead intake form.</p>

      <section className="card-section">
        <div className="card-section-header"><Radio size={13} /><span className="text-xs font-bold uppercase tracking-wider">Sources</span></div>
        <div className="card-section-body divide-y divide-border/60">
          {sources.map(s => (
            <div key={s.id} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
              <button onClick={() => toggle(s.id)}
                className={`relative w-9 h-5 rounded-full transition-colors shrink-0 ${s.active ? 'bg-primary' : 'bg-muted border border-border'}`}>
                <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${s.active ? 'translate-x-4' : ''}`} />
              </button>
              <span className={`flex-1 text-sm ${s.active ? 'text-foreground font-semibold' : 'text-muted-foreground line-through'}`}>{s.name}</span>
              <button onClick={() => remove(s.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><Plus size={13} /><span className="text-xs font-bold uppercase tracking-wider">Add Source</span></div>
        <div className="card-section-body flex gap-2">
          <input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Source name (e.g. Instagram)"
            className="field-input flex-1"
          />
          <button onClick={add} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
            Add
          </button>
        </div>
      </section>

      <button onClick={() => toast.success('Lead sources saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save
      </button>
    </div>
  );
}
