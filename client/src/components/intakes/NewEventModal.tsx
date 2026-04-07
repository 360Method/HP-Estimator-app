// ============================================================
// NewEventModal — New Event / appointment intake
// Design: two-column full-screen layout
// Left: Customer, Event details (type, date/time, location, team)
// Right: Private notes
// ============================================================

import { useState } from 'react';
import { Calendar, MapPin, Tag, Globe, User } from 'lucide-react';
import { toast } from 'sonner';
import IntakeShell, { CustomerSearchBox, SidebarSection, SelectedCustomer } from './IntakeShell';

const EVENT_TYPES = ['Site Visit', 'Estimate Appointment', 'Follow-up Call', 'Job Start', 'Job Completion', 'Team Meeting', 'Other'];

export default function NewEventModal({ onClose, prefill }: { onClose: () => void; prefill?: any }) {
  const [customer, setCustomer] = useState(prefill?.displayName ?? '');
  const [eventType, setEventType] = useState('');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [location, setLocation] = useState('');
  const [team, setTeam] = useState('');
  const [notes, setNotes] = useState('');

  const handleCustomerConfirmed = (c: SelectedCustomer) => {
    setCustomer(c.displayName);
    if (c.address) setLocation(`${c.address}, ${c.city}, ${c.state} ${c.zip}`.trim());
  };

  const handleSave = () => {
    toast.success('Event saved');
    onClose();
  };

  const leftPanel = (
    <>
      <CustomerSearchBox value={customer} onChange={setCustomer} />

      {/* Event details */}
      <div className="p-4 border-b border-slate-100 space-y-3">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider flex items-center gap-2">
          <Calendar size={13} /> Event details
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Event type</label>
          <select value={eventType} onChange={e => setEventType(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30">
            <option value="">Select type</option>
            {EVENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-8 shrink-0">From</span>
            <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
              className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-8 shrink-0">To</span>
            <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
              className="flex-1 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
            <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
              className="w-20 px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
          </div>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
            <MapPin size={11} /> Location
          </label>
          <input type="text" value={location} onChange={e => setLocation(e.target.value)}
            placeholder="Address or meeting link"
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1 flex items-center gap-1">
            <User size={11} /> Team
          </label>
          <select value={team} onChange={e => setTeam(e.target.value)}
            className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30">
            <option value="">Edit team</option>
            <option value="unassigned">Unassigned</option>
          </select>
        </div>
      </div>

      <SidebarSection label="Tags" icon={<Tag size={13} className="text-slate-400" />} />
      <SidebarSection label="Lead source" icon={<Globe size={13} className="text-slate-400" />} />
    </>
  );

  const rightPanel = (
    <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-100">
        <span className="text-base font-semibold text-slate-800">Private notes</span>
      </div>
      <div className="p-4">
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          placeholder="Add a private note here"
          rows={8}
          className="w-full text-sm text-slate-700 placeholder:text-slate-400 resize-none focus:outline-none"
        />
      </div>
    </div>
  );

  return (
    <IntakeShell
      title="New event"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Save event"
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      requireCustomer={!prefill}
      prefillCustomer={prefill ? { id: prefill.id ?? '', displayName: prefill.displayName ?? '', phone: prefill.phone ?? '', email: prefill.email ?? '', address: prefill.address ?? '', city: prefill.city ?? '', state: prefill.state ?? '', zip: prefill.zip ?? '' } : null}
      onCustomerConfirmed={handleCustomerConfirmed}
    />
  );
}
