import { useState } from 'react';
import { CheckSquare, Plus, Trash2, ChevronDown, ChevronRight, Save } from 'lucide-react';
import { toast } from 'sonner';

interface ChecklistItem { id: string; text: string }
interface Checklist { id: string; name: string; type: 'job' | 'estimate' | 'lead'; items: ChecklistItem[]; expanded: boolean }

const DEFAULT_CHECKLISTS: Checklist[] = [
  {
    id: '1', name: 'Job Completion Checklist', type: 'job', expanded: false,
    items: [
      { id: '1a', text: 'All work completed per scope of work' },
      { id: '1b', text: 'Site cleaned up and debris removed' },
      { id: '1c', text: 'Before and after photos taken' },
      { id: '1d', text: 'Customer walkthrough completed' },
      { id: '1e', text: 'Customer signed off on completion' },
      { id: '1f', text: 'Final invoice sent' },
      { id: '1g', text: 'Review request sent to customer' },
    ],
  },
  {
    id: '2', name: 'Pre-Job Site Visit', type: 'job', expanded: false,
    items: [
      { id: '2a', text: 'Measure all areas accurately' },
      { id: '2b', text: 'Photo documentation of existing conditions' },
      { id: '2c', text: 'Identify any access or parking issues' },
      { id: '2d', text: 'Confirm material quantities' },
      { id: '2e', text: 'Check for permits required' },
    ],
  },
  {
    id: '3', name: 'Estimate Review Checklist', type: 'estimate', expanded: false,
    items: [
      { id: '3a', text: 'All phases and line items included' },
      { id: '3b', text: 'Markup applied correctly' },
      { id: '3c', text: 'Deposit amount set' },
      { id: '3d', text: 'Terms and conditions included' },
      { id: '3e', text: 'Customer contact info verified' },
    ],
  },
];

export default function ChecklistsSettings() {
  const [checklists, setChecklists] = useState<Checklist[]>(DEFAULT_CHECKLISTS);
  const [newListName, setNewListName] = useState('');
  const [newListType, setNewListType] = useState<'job' | 'estimate' | 'lead'>('job');

  const toggleExpand = (id: string) =>
    setChecklists(prev => prev.map(c => c.id === id ? { ...c, expanded: !c.expanded } : c));

  const addChecklist = () => {
    if (!newListName.trim()) return;
    setChecklists(prev => [...prev, { id: Date.now().toString(), name: newListName.trim(), type: newListType, items: [], expanded: true }]);
    setNewListName('');
  };

  const removeChecklist = (id: string) => setChecklists(prev => prev.filter(c => c.id !== id));

  const addItem = (checklistId: string) => {
    setChecklists(prev => prev.map(c => c.id === checklistId
      ? { ...c, items: [...c.items, { id: Date.now().toString(), text: '' }] }
      : c));
  };

  const updateItem = (checklistId: string, itemId: string, text: string) => {
    setChecklists(prev => prev.map(c => c.id === checklistId
      ? { ...c, items: c.items.map(i => i.id === itemId ? { ...i, text } : i) }
      : c));
  };

  const removeItem = (checklistId: string, itemId: string) => {
    setChecklists(prev => prev.map(c => c.id === checklistId
      ? { ...c, items: c.items.filter(i => i.id !== itemId) }
      : c));
  };

  const TYPE_COLOR: Record<string, string> = {
    job: 'bg-green-100 text-green-700',
    estimate: 'bg-blue-100 text-blue-700',
    lead: 'bg-amber-100 text-amber-700',
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-foreground">Checklists</h2>
      </div>
      <p className="text-sm text-muted-foreground">Reusable checklists that can be attached to jobs, estimates, and leads.</p>

      <div className="space-y-3">
        {checklists.map(cl => (
          <section key={cl.id} className="card-section">
            <div className="card-section-body">
              <div className="flex items-center gap-2">
                <button onClick={() => toggleExpand(cl.id)} className="text-muted-foreground hover:text-foreground transition-colors">
                  {cl.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
                <CheckSquare size={13} className="text-primary shrink-0" />
                <span className="flex-1 text-sm font-bold text-foreground">{cl.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold capitalize ${TYPE_COLOR[cl.type]}`}>{cl.type}</span>
                <span className="text-xs text-muted-foreground">{cl.items.length} items</span>
                <button onClick={() => removeChecklist(cl.id)} className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>

              {cl.expanded && (
                <div className="mt-3 space-y-1.5 pl-6">
                  {cl.items.map(item => (
                    <div key={item.id} className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
                      <input
                        value={item.text}
                        onChange={e => updateItem(cl.id, item.id, e.target.value)}
                        placeholder="Checklist item..."
                        className="flex-1 text-sm bg-transparent border-b border-border/60 focus:border-primary outline-none py-0.5 text-foreground"
                      />
                      <button onClick={() => removeItem(cl.id, item.id)} className="p-1 text-muted-foreground/50 hover:text-destructive transition-colors">
                        <Trash2 size={11} />
                      </button>
                    </div>
                  ))}
                  <button onClick={() => addItem(cl.id)} className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 transition-colors mt-2">
                    <Plus size={11} /> Add item
                  </button>
                </div>
              )}
            </div>
          </section>
        ))}
      </div>

      <section className="card-section">
        <div className="card-section-header"><Plus size={13} /><span className="text-xs font-bold uppercase tracking-wider">New Checklist</span></div>
        <div className="card-section-body flex gap-2 flex-wrap">
          <input value={newListName} onChange={e => setNewListName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addChecklist()}
            placeholder="Checklist name" className="field-input flex-1 min-w-40" />
          <select value={newListType} onChange={e => setNewListType(e.target.value as 'job' | 'estimate' | 'lead')} className="field-input w-36">
            <option value="job">Job</option>
            <option value="estimate">Estimate</option>
            <option value="lead">Lead</option>
          </select>
          <button onClick={addChecklist} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
            Create
          </button>
        </div>
      </section>

      <button onClick={() => toast.success('Checklists saved')} className="flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-semibold hover:bg-primary/90 transition-colors">
        <Save size={14} /> Save Checklists
      </button>
    </div>
  );
}
