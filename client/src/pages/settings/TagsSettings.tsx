import { useState } from 'react';
import { Hash, Plus, Trash2, Save } from 'lucide-react';
import { toast } from 'sonner';

interface AppTag {
  id: string;
  name: string;
  color: string;
  usedIn: ('customer' | 'lead' | 'job' | 'estimate')[];
}

const COLORS = ['#3b82f6','#8b5cf6','#10b981','#f59e0b','#ef4444','#ec4899','#06b6d4','#84cc16'];

const DEFAULT_TAGS: AppTag[] = [
  { id: '1',  name: 'VIP',             color: '#f59e0b', usedIn: ['customer', 'lead'] },
  { id: '2',  name: 'Repeat Customer', color: '#10b981', usedIn: ['customer'] },
  { id: '3',  name: 'Referral',        color: '#3b82f6', usedIn: ['customer', 'lead'] },
  { id: '4',  name: 'Urgent',          color: '#ef4444', usedIn: ['job', 'lead'] },
  { id: '5',  name: 'Warranty',        color: '#8b5cf6', usedIn: ['job'] },
  { id: '6',  name: 'Commercial',      color: '#06b6d4', usedIn: ['customer', 'job', 'estimate'] },
  { id: '7',  name: 'Residential',     color: '#84cc16', usedIn: ['customer', 'job', 'estimate'] },
  { id: '8',  name: 'Seasonal',        color: '#ec4899', usedIn: ['job'] },
];

const ENTITY_OPTIONS = ['customer', 'lead', 'job', 'estimate'] as const;

export default function TagsSettings() {
  const [tags, setTags] = useState<AppTag[]>(DEFAULT_TAGS);
  const [newName, setNewName] = useState('');
  const [newColor, setNewColor] = useState(COLORS[0]);

  const add = () => {
    if (!newName.trim()) return;
    setTags(prev => [...prev, { id: Date.now().toString(), name: newName.trim(), color: newColor, usedIn: ['customer', 'lead', 'job'] }]);
    setNewName('');
  };

  const remove = (id: string) => setTags(prev => prev.filter(t => t.id !== id));

  const toggleEntity = (id: string, entity: typeof ENTITY_OPTIONS[number]) => {
    setTags(prev => prev.map(t => {
      if (t.id !== id) return t;
      const has = t.usedIn.includes(entity);
      return { ...t, usedIn: has ? t.usedIn.filter(e => e !== entity) : [...t.usedIn, entity] };
    }));
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <h2 className="text-2xl font-bold text-foreground">Tags</h2>
      <p className="text-sm text-muted-foreground">Tags help you categorize and filter customers, leads, jobs, and estimates.</p>

      <section className="card-section">
        <div className="card-section-header"><Hash size={13} /><span className="text-xs font-bold uppercase tracking-wider">All Tags</span></div>
        <div className="card-section-body divide-y divide-border/60">
          {/* Column headers */}
          <div className="grid grid-cols-[auto_1fr_auto_auto] gap-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            <span className="w-4" />
            <span>Name</span>
            <span>Used in</span>
            <span className="w-6" />
          </div>
          {tags.map(t => (
            <div key={t.id} className="grid grid-cols-[auto_1fr_auto_auto] gap-3 items-center py-2.5 first:pt-0">
              <div className="w-4 h-4 rounded-full border border-white/20 shadow-sm" style={{ backgroundColor: t.color }} />
              <span className="text-sm font-semibold text-foreground">{t.name}</span>
              <div className="flex flex-wrap gap-1">
                {ENTITY_OPTIONS.map(e => (
                  <button key={e} onClick={() => toggleEntity(t.id, e)}
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold border transition-colors capitalize ${
                      t.usedIn.includes(e) ? 'bg-primary/10 border-primary/30 text-primary' : 'border-border text-muted-foreground/50'
                    }`}>
                    {e}
                  </button>
                ))}
              </div>
              <button onClick={() => remove(t.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                <Trash2 size={13} />
              </button>
            </div>
          ))}
        </div>
      </section>

      <section className="card-section">
        <div className="card-section-header"><Plus size={13} /><span className="text-xs font-bold uppercase tracking-wider">New Tag</span></div>
        <div className="card-section-body flex items-center gap-3 flex-wrap">
          <div className="flex gap-1.5">
            {COLORS.map(c => (
              <button key={c} onClick={() => setNewColor(c)}
                className={`w-5 h-5 rounded-full border-2 transition-all ${newColor === c ? 'border-foreground scale-110' : 'border-transparent'}`}
                style={{ backgroundColor: c }} />
            ))}
          </div>
          <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()}
            placeholder="Tag name" className="field-input flex-1 min-w-32" />
          <button onClick={add} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
            Add
          </button>
        </div>
      </section>

      <button onClick={() => toast.success('Tags saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Tags
      </button>
    </div>
  );
}
