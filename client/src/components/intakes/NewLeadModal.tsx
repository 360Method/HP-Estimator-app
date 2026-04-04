// ============================================================
// NewLeadModal — New Lead intake form
// ============================================================
import { useState } from 'react';
import { Star } from 'lucide-react';
import { toast } from 'sonner';
import { IntakeModal } from './NewJobModal';

interface Props { onClose: () => void; }

const LEAD_SOURCES = ['Google', 'Referral', 'Facebook', 'Instagram', 'Nextdoor', 'Yelp', 'Direct Mail', 'Repeat Customer', 'Other'];
const JOB_TYPES = ['Flooring', 'Painting', 'Carpentry', 'Drywall', 'Plumbing', 'Electrical', 'Landscaping', 'General Handyman', 'Other'];

function Label({ children }: { children: React.ReactNode }) {
  return <label className="block text-xs font-semibold text-muted-foreground mb-1">{children}</label>;
}

export default function NewLeadModal({ onClose }: Props) {
  const [form, setForm] = useState({
    title: '', customer: '', phone: '', email: '',
    jobType: '', leadSource: '', estimatedValue: '',
    followUpDate: '', notes: '',
  });
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const handleSubmit = () => {
    if (!form.title) { toast.error('Lead title is required'); return; }
    toast.success(`Lead "${form.title}" created`);
    onClose();
  };

  return (
    <IntakeModal title="New Lead" icon={<Star size={17} />} onClose={onClose} onSubmit={handleSubmit} submitLabel="Create Lead">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="sm:col-span-2">
          <Label>Lead Title *</Label>
          <input className="intake-field" placeholder="e.g. Kitchen remodel inquiry" value={form.title} onChange={e => set('title', e.target.value)} />
        </div>
        <div>
          <Label>Customer Name</Label>
          <input className="intake-field" placeholder="First and last name" value={form.customer} onChange={e => set('customer', e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <input type="tel" className="intake-field" placeholder="(360) 555-0100" value={form.phone} onChange={e => set('phone', e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <input type="email" className="intake-field" placeholder="customer@email.com" value={form.email} onChange={e => set('email', e.target.value)} />
        </div>
        <div>
          <Label>Job Type</Label>
          <select className="intake-field" value={form.jobType} onChange={e => set('jobType', e.target.value)}>
            <option value="">Select type</option>
            {JOB_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Label>Lead Source</Label>
          <select className="intake-field" value={form.leadSource} onChange={e => set('leadSource', e.target.value)}>
            <option value="">Select source</option>
            {LEAD_SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <Label>Estimated Value ($)</Label>
          <input type="number" min="0" step="100" className="intake-field" placeholder="0.00" value={form.estimatedValue} onChange={e => set('estimatedValue', e.target.value)} />
        </div>
        <div>
          <Label>Follow-up Date</Label>
          <input type="date" className="intake-field" value={form.followUpDate} onChange={e => set('followUpDate', e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <textarea className="intake-field resize-none" rows={3} placeholder="What did the customer say? What are they looking for?" value={form.notes} onChange={e => set('notes', e.target.value)} />
        </div>
      </div>
    </IntakeModal>
  );
}
