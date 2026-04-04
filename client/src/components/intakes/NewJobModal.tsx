// ============================================================
// NewJobModal — New Job intake form
// Accepts optional `prefill` to pre-fill customer contact info
// when opened from within a customer profile.
// ============================================================
import { useState } from 'react';
import { X, Briefcase, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { CustomerPrefill } from './types';

interface Props {
  onClose: () => void;
  prefill?: CustomerPrefill;
}

const JOB_TYPES = ['Flooring', 'Painting', 'Carpentry', 'Drywall', 'Plumbing', 'Electrical', 'Landscaping', 'General Handyman', 'Other'];

export default function NewJobModal({ onClose, prefill }: Props) {
  const [form, setForm] = useState({
    title: '',
    customer: prefill?.displayName || '',
    phone: prefill?.mobilePhone || prefill?.homePhone || '',
    email: prefill?.email || '',
    address: prefill ? [prefill.street, prefill.unit].filter(Boolean).join(' ') : '',
    city: prefill?.city || '',
    state: prefill?.state || '',
    zip: prefill?.zip || '',
    jobType: '',
    assignedTo: '',
    scheduledDate: '',
    estimatedHours: '',
    notes: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title) { toast.error('Job title is required'); return; }
    toast.success(`Job "${form.title}" created`);
    onClose();
  };

  return (
    <IntakeModal title="New Job" icon={<Briefcase size={17} />} onClose={onClose} onSubmit={handleSubmit} submitLabel="Create Job" prefill={prefill}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Job Title *</Label>
          <input className="intake-field" placeholder="e.g. Hardwood floor installation" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>

        <CustomerFields form={form} set={set} prefill={prefill} />

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

// ── Shared: customer contact block ──────────────────────────
export function CustomerFields({
  form, set, prefill,
}: {
  form: Record<string, string>;
  set: (k: string, v: string) => void;
  prefill?: CustomerPrefill;
}) {
  const locked = !!prefill;
  const fieldClass = `intake-field ${locked ? 'bg-primary/5 text-foreground cursor-default' : ''}`;

  return (
    <>
      <div>
        <Label>Customer {locked && <PrefillBadge />}</Label>
        <input className={fieldClass} placeholder="Customer name" value={form.customer}
          onChange={e => !locked && set('customer', e.target.value)}
          readOnly={locked} />
      </div>
      <div>
        <Label>Phone {locked && <PrefillBadge />}</Label>
        <input type="tel" className={fieldClass} placeholder="(360) 555-0100" value={form.phone}
          onChange={e => !locked && set('phone', e.target.value)}
          readOnly={locked} />
      </div>
      <div>
        <Label>Email {locked && <PrefillBadge />}</Label>
        <input type="email" className={fieldClass} placeholder="customer@email.com" value={form.email}
          onChange={e => !locked && set('email', e.target.value)}
          readOnly={locked} />
      </div>
      <div>
        <Label>Address {locked && <PrefillBadge />}</Label>
        <input className={fieldClass} placeholder="Street address" value={form.address}
          onChange={e => !locked && set('address', e.target.value)}
          readOnly={locked} />
      </div>
      <div>
        <Label>City {locked && <PrefillBadge />}</Label>
        <input className={fieldClass} placeholder="City" value={form.city}
          onChange={e => !locked && set('city', e.target.value)}
          readOnly={locked} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>State {locked && <PrefillBadge />}</Label>
          <input className={fieldClass} placeholder="WA" value={form.state}
            onChange={e => !locked && set('state', e.target.value)}
            readOnly={locked} />
        </div>
        <div>
          <Label>Zip {locked && <PrefillBadge />}</Label>
          <input className={fieldClass} placeholder="98683" value={form.zip}
            onChange={e => !locked && set('zip', e.target.value)}
            readOnly={locked} />
        </div>
      </div>
    </>
  );
}

function PrefillBadge() {
  return (
    <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-semibold text-primary/70 bg-primary/10 px-1.5 py-0.5 rounded">
      <UserCheck size={9} /> from profile
    </span>
  );
}

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="flex items-center text-xs font-semibold text-muted-foreground mb-1">{children}</label>;
}

// ── Shared modal shell ───────────────────────────────────────
export function IntakeModal({
  title, icon, onClose, onSubmit, submitLabel, children, prefill,
}: {
  title: string;
  icon: React.ReactNode;
  onClose: () => void;
  onSubmit: () => void;
  submitLabel: string;
  children: React.ReactNode;
  prefill?: CustomerPrefill;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-xl my-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-base font-bold text-foreground flex items-center gap-2">
              <span className="text-primary">{icon}</span>
              {title}
            </h2>
            {prefill && (
              <p className="text-[11px] text-primary/70 mt-0.5 flex items-center gap-1">
                <UserCheck size={11} />
                Contact info pre-filled from {prefill.displayName || [prefill.firstName, prefill.lastName].filter(Boolean).join(' ')}
              </p>
            )}
          </div>
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
