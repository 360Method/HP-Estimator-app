// ============================================================
// NewIntakeModal — Field Intake / site measurement form
// ============================================================
import { useState } from 'react';
import { ClipboardList } from 'lucide-react';
import { toast } from 'sonner';
import { IntakeModal, CustomerFields, Label } from './NewJobModal';
import { CustomerPrefill } from './types';

interface Props { onClose: () => void; prefill?: CustomerPrefill; }

const WORK_TYPES = ['Flooring', 'Painting', 'Carpentry', 'Drywall', 'Plumbing', 'Electrical', 'Landscaping', 'General Handyman', 'Other'];

export default function NewIntakeModal({ onClose, prefill }: Props) {
  const [form, setForm] = useState({
    customer: prefill?.displayName || '',
    phone: prefill?.mobilePhone || prefill?.homePhone || '',
    email: prefill?.email || '',
    address: prefill ? [prefill.street, prefill.unit].filter(Boolean).join(' ') : '',
    city: prefill?.city || '',
    state: prefill?.state || '',
    zip: prefill?.zip || '',
    workType: '',
    sqft: '',
    rooms: '',
    specialConditions: '',
    urgency: 'normal',
    notes: '',
    photos: 'false',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.customer) { toast.error('Customer name is required'); return; }
    toast.success(`Field intake for "${form.customer}" saved`);
    onClose();
  };

  return (
    <IntakeModal title="Field Intake" icon={<ClipboardList size={17} />} onClose={onClose} onSubmit={handleSubmit} submitLabel="Save Intake" prefill={prefill}>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <CustomerFields form={form} set={set} prefill={prefill} />

        <div>
          <Label>Work Type</Label>
          <select className="intake-field" value={form.workType} onChange={e => set('workType', e.target.value)}>
            <option value="">Select type</option>
            {WORK_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Label>Approx. Square Footage</Label>
          <input type="number" min="0" className="intake-field" placeholder="e.g. 850" value={form.sqft} onChange={e => set('sqft', e.target.value)} />
        </div>
        <div>
          <Label>Number of Rooms / Areas</Label>
          <input type="number" min="0" className="intake-field" placeholder="e.g. 3" value={form.rooms} onChange={e => set('rooms', e.target.value)} />
        </div>
        <div>
          <Label>Urgency</Label>
          <select className="intake-field" value={form.urgency} onChange={e => set('urgency', e.target.value)}>
            <option value="normal">Normal</option>
            <option value="urgent">Urgent</option>
            <option value="emergency">Emergency</option>
          </select>
        </div>
        <div className="sm:col-span-2">
          <Label>Special Conditions</Label>
          <input className="intake-field" placeholder="Stairs, obstacles, existing damage..." value={form.specialConditions} onChange={e => set('specialConditions', e.target.value)} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="photos" checked={form.photos === 'true'}
            onChange={e => set('photos', e.target.checked ? 'true' : 'false')} className="accent-primary" />
          <label htmlFor="photos" className="text-sm text-muted-foreground cursor-pointer">Photos taken on site</label>
        </div>
        <div className="sm:col-span-2">
          <Label>Field Notes</Label>
          <textarea className="intake-field resize-none" rows={3} placeholder="Measurements, observations, customer requests..." value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </IntakeModal>
  );
}
