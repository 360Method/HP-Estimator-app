// ============================================================
// NewEventModal — New Event / appointment intake
// ============================================================
import { useState } from 'react';
import { Calendar } from 'lucide-react';
import { toast } from 'sonner';
import { IntakeModal, CustomerFields, Label } from './NewJobModal';
import { CustomerPrefill } from './types';

interface Props { onClose: () => void; prefill?: CustomerPrefill; }

const EVENT_TYPES = ['Site Visit', 'Estimate Appointment', 'Follow-up Call', 'Job Start', 'Job Completion', 'Team Meeting', 'Other'];

export default function NewEventModal({ onClose, prefill }: Props) {
  const [form, setForm] = useState({
    title: '',
    customer: prefill?.displayName || '',
    phone: prefill?.mobilePhone || prefill?.homePhone || '',
    email: prefill?.email || '',
    address: prefill ? [prefill.street, prefill.unit].filter(Boolean).join(' ') : '',
    city: prefill?.city || '',
    state: prefill?.state || '',
    zip: prefill?.zip || '',
    eventType: '',
    assignedTo: '',
    date: '',
    startTime: '',
    endTime: '',
    location: prefill ? [prefill.street, prefill.unit].filter(Boolean).join(' ') : '',
    notes: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title) { toast.error('Event title is required'); return; }
    if (!form.date) { toast.error('Date is required'); return; }
    toast.success(`Event "${form.title}" created`);
    onClose();
  };

  return (
    <IntakeModal title="New Event" icon={<Calendar size={17} />} onClose={onClose} onSubmit={handleSubmit} submitLabel="Create Event" prefill={prefill}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Event Title *</Label>
          <input className="intake-field" placeholder="e.g. Site visit — Johnson residence" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>

        <CustomerFields form={form} set={set} prefill={prefill} />

        <div>
          <Label>Event Type</Label>
          <select className="intake-field" value={form.eventType} onChange={e => set('eventType', e.target.value)}>
            <option value="">Select type</option>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Label>Assigned To</Label>
          <input className="intake-field" placeholder="Team member name" value={form.assignedTo} onChange={e => set('assignedTo', e.target.value)} />
        </div>
        <div>
          <Label>Date *</Label>
          <input type="date" className="intake-field" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div>
          <Label>Location</Label>
          <input className="intake-field" placeholder="Address or meeting link" value={form.location} onChange={e => set('location', e.target.value)} />
        </div>
        <div>
          <Label>Start Time</Label>
          <input type="time" className="intake-field" value={form.startTime} onChange={e => set('startTime', e.target.value)} />
        </div>
        <div>
          <Label>End Time</Label>
          <input type="time" className="intake-field" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <textarea className="intake-field resize-none" rows={2} placeholder="Event notes..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </IntakeModal>
  );
}
