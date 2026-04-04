// ============================================================
// NewJobModal — New Job intake form
// ============================================================
import { useState } from 'react';
import { X, Briefcase } from 'lucide-react';
import { toast } from 'sonner';

interface Props { onClose: () => void; }

const JOB_TYPES = ['Flooring', 'Painting', 'Carpentry', 'Drywall', 'Plumbing', 'Electrical', 'Landscaping', 'General Handyman', 'Other'];

export default function NewJobModal({ onClose }: Props) {
  const [form, setForm] = useState({
    title: '', customer: '', jobType: '', assignedTo: '',
    scheduledDate: '', estimatedHours: '', notes: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title) { toast.error('Job title is required'); return; }
    toast.success(`Job "${form.title}" created`);
    onClose();
  };

  return (
    <IntakeModal title="New Job" icon={<Briefcase size={17} />} onClose={onClose} onSubmit={handleSubmit} submitLabel="Create Job">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Job Title *</Label>
          <input className="intake-field" placeholder="e.g. Hardwood floor installation" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div>
          <Label>Customer</Label>
          <input className="intake-field" placeholder="Search or enter customer name" value={form.customer} onChange={e => set('customer', e.target.value)} />
        </div>
        <div>
          <Label>Job Type</Label>
          <select className="intake-field" value={form.jobType} onChange={e => set('jobType', e.target.value)}>
            <option value="">Select type</option>
            {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Label>Assigned To</Label>
          <input className="intake-field" placeholder="Technician name" value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} />
        </div>
        <div>
          <Label>Scheduled Date</Label>
          <input type="date" className="intake-field" value={form.scheduledDate} onChange={e => set('scheduledDate', e.target.value)} />
        </div>
        <div>
          <Label>Estimated Hours</Label>
          <input type="number" min="0" step="0.5" className="intake-field" placeholder="e.g. 8" value={form.estimatedHours} onChange={e => set('estimatedHours', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <textarea className="intake-field resize-none" rows={3} placeholder="Internal job notes..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </IntakeModal>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-muted-foreground mb-1">{children}</label>;
}

// ── Shared modal shell ───────────────────────────────────────
export function IntakeModal({
  title, icon, onClose, onSubmit, submitLabel, children,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="text-base font-bold text-foreground flex items-center gap-2">
            <span className="text-primary">{icon}</span>
            {title}
          </h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X size={16} />
          </button>
        </div>
        {/* Body */}
        <div className="px-5 py-5">{children}</div>
        {/* Footer */}
        <div className="px-5 py-4 border-t border-border bg-slate-50 rounded-b-xl flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-sm font-semibold text-muted-foreground border border-border rounded-lg hover:bg-muted transition-colors">
            Cancel
          </button>
          <button onClick={onSubmit} className="px-5 py-2 text-sm font-semibold bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors">
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
