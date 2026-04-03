// ============================================================
// FieldNotesCard — Quick field notes with tag shortcuts
// ============================================================

import { useEstimator } from '@/contexts/EstimatorContext';

const QUICK_TAGS = [
  'Existing trim demo needed',
  'Walls not square — allow extra time',
  'Stain-grade material',
  'Client supplied material',
  'Stairs included',
  'Tight corners',
  'High ceilings (10\'+)',
  'Painted in place',
  'Caulk & paint by client',
  'Multiple rooms',
];

export default function FieldNotesCard() {
  const { state, setFieldNotes } = useEstimator();

  const addTag = (tag: string) => {
    const cur = state.fieldNotes;
    setFieldNotes(cur + (cur && !cur.endsWith('\n') ? '\n' : '') + tag + ' ');
  };

  return (
    <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
      <h2 className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-3">Field Notes</h2>
      <textarea
        className="field-input resize-y min-h-[100px]"
        placeholder="Site conditions, special requirements, measurements, client preferences..."
        value={state.fieldNotes}
        onChange={e => setFieldNotes(e.target.value)}
      />
      <div className="flex flex-wrap gap-1.5 mt-2">
        {QUICK_TAGS.map(tag => (
          <button
            key={tag}
            onClick={() => addTag(tag)}
            className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-secondary hover:bg-primary/5 hover:border-primary/40 text-muted-foreground hover:text-primary transition-colors"
          >
            + {tag}
          </button>
        ))}
      </div>
    </div>
  );
}
