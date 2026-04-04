// ============================================================
// NewRecurringJobModal — Recurring Job intake
// ============================================================
import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { IntakeModal, CustomerFields, Label } from './NewJobModal';
import { CustomerPrefill } from './types';

interface Props { onClose: () => void; prefill?: CustomerPrefill; }

const FREQUENCIES = ['Weekly', 'Bi-weekly', 'Monthly', 'Quarterly', 'Annually'];
const JOB_TYPES = ['Flooring', 'Painting', 'Carpentry', 'Drywall', 'Plumbing', 'Electrical', 'Landscaping', 'General Handyman', 'Other'];

export default function NewRecurringJobModal({ onClose, prefill }: Props) {
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
    frequency: '',
    startDate: '',
    assignedTo: '',
    notes: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title) { toast.error('Job title is required'); return; }
    if (!form.frequency) { toast.error('Frequency is required'); return; }
    toast.success(`Recurring job "${form.title}" created`);
    onClose();
  };

  return (
    <IntakeModal title="New Recurring Job" icon={<RefreshCw size={17} />} onClose={onClose} onSubmit={handleSubmit} submitLabel="Create Recurring Job" prefill={prefill}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Job Title *</Label>
          <input className="intake-field" placeholder="e.g. Monthly lawn maintenance" value={form.title} onChange={e => set('title', e.target.value)} />
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
          <Label>Frequency *</Label>
          <select className="intake-field" value={form.frequency} onChange={e => set('frequency', e.target.value)}>
            <option value="">Select frequency</option>
            {FREQUENCIES.map(f => <option key={f} value={f}>{f}</option>)}
          </select>
        </div>
        <div>
          <Label>Start Date</Label>
          <input type="date" className="intake-field" value={form.startDate} onChange={e => set('startDate', e.target.value)} />
        </div>
        <div>
          <Label>Assigned To</Label>
          <input className="intake-field" placeholder="Technician name" value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <textarea className="intake-field resize-none" rows={3} placeholder="Recurring job notes..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </IntakeModal>
  );
}
