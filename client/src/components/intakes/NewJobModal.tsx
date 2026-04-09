// ============================================================
// NewJobModal — New Job intake form
// Design: two-column full-screen layout matching HouseCall Pro reference
// Left: Customer, Schedule (From/To/Anytime/Team), Checklists, Attachments, Fields, Tags, Lead source
// Right: Private notes (This job / Customer tabs), Line items (Services + Materials + totals)
// ============================================================

import { useState } from 'react';
import { Calendar, Edit3, Paperclip, Hash, Tag, Globe, User } from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { useEstimator } from '@/contexts/EstimatorContext';
import IntakeShell, {
  CustomerSearchBox, SidebarSection, PrivateNotesPanel, LineItemsPanel, LineItem, SelectedCustomer,
} from './IntakeShell';

export default function NewJobModal({ onClose, prefill }: { onClose: () => void; prefill?: any }) {
  const { addOpportunity, addCustomer, setActiveCustomer, addScheduleEvent } = useEstimator();
  const [customer, setCustomer] = useState(prefill?.displayName ?? '');
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(
    prefill ? { id: prefill.id ?? '', displayName: prefill.displayName ?? '', phone: prefill.phone ?? '', email: prefill.email ?? '', address: prefill.address ?? '', city: prefill.city ?? '', state: prefill.state ?? '', zip: prefill.zip ?? '' } : null
  );
  const [fromDate, setFromDate] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toDate, setToDate] = useState('');
  const [toTime, setToTime] = useState('');
  const [anytime, setAnytime] = useState(false);
  const [team, setTeam] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);

  const handleCustomerConfirmed = (c: SelectedCustomer) => {
    setCustomer(c.displayName);
    setSelectedCustomer(c);
  };

  const handleSave = () => {
    if (!customer.trim()) { toast.error('Please select or enter a customer'); return; }
    let customerId = selectedCustomer?.id ?? '';
    // If no existing customer was selected, create a new one
    if (!customerId) {
      customerId = nanoid(8);
      addCustomer({ id: customerId, displayName: customer.trim(), firstName: '', lastName: '', company: '', mobilePhone: '', homePhone: '', workPhone: '', email: '', role: '', customerType: 'homeowner', doNotService: false, street: '', unit: '', city: '', state: 'WA', zip: '', addressNotes: '', customerNotes: '', billsTo: '', tags: [], leadSource: '', referredBy: '', sendNotifications: true, sendMarketingOptIn: false, createdAt: new Date().toISOString(), lifetimeValue: 0, outstandingBalance: 0 });
    }
    const totalValue = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    // We can't pass id to addOpportunity (it generates its own), so we use a stable ref
    // and rely on the fact that the new opp will be the last one added for this customer.
    // Instead, we'll add the schedule event using a predictable title match after creation.
    const newJobTitle = `Job — ${customer.trim()}`;
    addOpportunity({
      area: 'job',
      stage: 'New Job',
      title: `Job — ${customer.trim()}`,
      value: totalValue,
      notes,
      archived: false,
      clientSnapshot: { client: customer.trim(), companyName: '', phone: selectedCustomer?.phone ?? '', email: selectedCustomer?.email ?? '', address: selectedCustomer?.address ?? '', city: selectedCustomer?.city ?? '', state: selectedCustomer?.state ?? '', zip: selectedCustomer?.zip ?? '', jobType: '', scope: '' },
    });
    // Auto-create schedule event if dates were provided
    if (!anytime && fromDate) {
      const startISO = fromDate && fromTime
        ? new Date(`${fromDate}T${fromTime}`).toISOString()
        : new Date(`${fromDate}T08:00`).toISOString();
      const endISO = toDate
        ? (toTime ? new Date(`${toDate}T${toTime}`).toISOString() : new Date(`${toDate}T17:00`).toISOString())
        : new Date(new Date(startISO).getTime() + 8 * 60 * 60 * 1000).toISOString();
      addScheduleEvent({
        type: 'job',
        title: newJobTitle,
        start: startISO,
        end: endISO,
        allDay: false,
        customerId,
        assignedTo: team ? team.split(',').map(s => s.trim()).filter(Boolean) : [],
        notes: notes || '',
        completed: false,
      });
    }
    setActiveCustomer(customerId);
    toast.success('Job created');
    onClose();
  };

  const leftPanel = (
    <>
      <CustomerSearchBox value={customer} onChange={setCustomer} onSelect={setSelectedCustomer} />

      {/* Schedule */}
      <div className="p-4 border-b border-slate-100">
        <div className="flex items-center justify-between mb-3">
          <span className="flex items-center gap-2 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
            <Calendar size={13} /> Schedule
          </span>
          <button className="text-slate-400 hover:text-slate-600"><Edit3 size={13} /></button>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-8 shrink-0">From</span>
            <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <input type="time" value={fromTime} onChange={e => setFromTime(e.target.value)}
              className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-8 shrink-0">To</span>
            <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <input type="time" value={toTime} onChange={e => setToTime(e.target.value)}
              className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={anytime} onChange={e => setAnytime(e.target.checked)} className="rounded" />
            Anytime
          </label>
        </div>
        <div className="mt-3 space-y-1.5">
          <select value={team} onChange={e => setTeam(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30">
            <option value="">Edit team</option>
            <option value="unassigned">Unassigned</option>
          </select>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <User size={12} className="text-slate-400" />
            <span className="italic">Unassigned</span>
          </div>
        </div>
      </div>

      <SidebarSection label="Checklists" icon={<span className="text-[13px] text-slate-400">☑</span>} />
      <SidebarSection label="Attachments" icon={<Paperclip size={13} className="text-slate-400" />} />
      <SidebarSection label="Fields" icon={<Hash size={13} className="text-slate-400" />} />
      <SidebarSection label="Tags" icon={<Tag size={13} className="text-slate-400" />} />
      <SidebarSection label="Lead source" icon={<Globe size={13} className="text-slate-400" />} />
    </>
  );

  const rightPanel = (
    <>
      <PrivateNotesPanel value={notes} onChange={setNotes} tabs={['This job', 'Customer']} />
      <LineItemsPanel items={items} onChange={setItems} />
    </>
  );

  return (
    <IntakeShell
      title="New job"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Save job"
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      requireCustomer={!prefill}
      prefillCustomer={prefill ? { id: prefill.id ?? '', displayName: prefill.displayName ?? '', phone: prefill.phone ?? '', email: prefill.email ?? '', address: prefill.address ?? '', city: prefill.city ?? '', state: prefill.state ?? '', zip: prefill.zip ?? '' } : null}
      onCustomerConfirmed={handleCustomerConfirmed}
    />
  );
}
