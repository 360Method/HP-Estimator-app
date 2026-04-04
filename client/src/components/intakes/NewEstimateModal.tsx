// ============================================================
// NewEstimateModal — New Estimate intake
// ============================================================
import { useState } from 'react';
import { FileText } from 'lucide-react';
import { toast } from 'sonner';
import { IntakeModal, CustomerFields, Label } from './NewJobModal';
import { CustomerPrefill } from './types';

interface Props { onClose: () => void; prefill?: CustomerPrefill; onOpenBuilder?: () => void; }

const JOB_TYPES = ['Flooring', 'Painting', 'Carpentry', 'Drywall', 'Plumbing', 'Electrical', 'Landscaping', 'General Handyman', 'Other'];

export default function NewEstimateModal({ onClose, prefill, onOpenBuilder }: Props) {
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
    estimator: '',
    estimateDate: '',
    expiresDate: '',
    estimatedValue: '',
    notes: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title) { toast.error('Estimate title is required'); return; }
    toast.success(`Estimate "${form.title}" created`);
    onClose();
    onOpenBuilder?.();
  };

  return (
    <IntakeModal title="New Estimate" icon={<FileText size={17} />} onClose={onClose} onSubmit={handleSubmit} submitLabel="Create Estimate" prefill={prefill}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Estimate Title *</Label>
          <input className="intake-field" placeholder="e.g. Master bedroom flooring" value={form.title} onChange={e => set('title', e.target.value)} />
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
          <Label>Estimator</Label>
          <input className="intake-field" placeholder="Estimator name" value={form.estimator} onChange={e => set('estimator', e.target.value)} />
        </div>
        <div>
          <Label>Estimated Value ($)</Label>
          <input type="number" min="0" step="100" className="intake-field" placeholder="0.00" value={form.estimatedValue} onChange={e => set('estimatedValue', e.target.value)} />
        </div>
        <div>
          <Label>Estimate Date</Label>
          <input type="date" className="intake-field" value={form.estimateDate} onChange={e => set('estimateDate', e.target.value)} />
        </div>
        <div>
          <Label>Expires Date</Label>
          <input type="date" className="intake-field" value={form.expiresDate} onChange={e => set('expiresDate', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <textarea className="intake-field resize-none" rows={3} placeholder="Scope summary or internal notes..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </IntakeModal>
  );
}
