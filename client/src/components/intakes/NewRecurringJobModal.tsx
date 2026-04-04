// ============================================================
// NewRecurringJobModal — New Recurring Job intake form
// Design: two-column full-screen layout
// Left: Customer, Checklists, Fields, Tags, Lead source
// Right: Private notes, Line items, Schedule (frequency radio + recurrence dates)
// ============================================================

import { useState } from 'react';
import { Hash, Tag, Globe, User } from 'lucide-react';
import { toast } from 'sonner';
import IntakeShell, {
  CustomerSearchBox, SidebarSection, PrivateNotesPanel, LineItemsPanel, LineItem,
} from './IntakeShell';

const FREQUENCIES = [
  'Does not repeat',
  'Daily',
  'Every weekday (Monday to Friday)',
  'Weekly on Friday',
  'Monthly on the first Friday',
  'Yearly on Apr 03',
  'Custom',
];

export default function NewRecurringJobModal({ onClose, prefill }: { onClose: () => void; prefill?: any }) {
  const [customer, setCustomer] = useState(prefill?.displayName ?? '');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [frequency, setFrequency] = useState('Does not repeat');
  const [startDate, setStartDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('');
  const [anytime, setAnytime] = useState(false);
  const [team, setTeam] = useState('');
  const [arrivalWindow, setArrivalWindow] = useState('None');
  const [notifyCustomer, setNotifyCustomer] = useState(false);

  const handleSave = () => {
    toast.success('Recurring job saved');
    onClose();
  };

  const leftPanel = (
    <>
      <CustomerSearchBox value={customer} onChange={setCustomer} />
      <SidebarSection label="Checklists" icon={<span className="text-[13px] text-slate-400">☑</span>} />
      <SidebarSection label="Fields" icon={<Hash size={13} className="text-slate-400" />} />
      <SidebarSection label="Tags" icon={<Tag size={13} className="text-slate-400" />} />
      <SidebarSection label="Lead source" icon={<Globe size={13} className="text-slate-400" />} />
    </>
  );

  const rightPanel = (
    <>
      <PrivateNotesPanel value={notes} onChange={setNotes} tabs={['This recurring job', 'Customer']} />
      <LineItemsPanel items={items} onChange={setItems} />

      {/* Schedule section */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100">
          <span className="text-base font-semibold text-slate-800">Schedule</span>
          <button className="text-xs text-primary font-medium hover:underline">Edit on calendar</button>
        </div>
        <div className="px-4 py-4 space-y-4">
          {/* Frequency */}
          <div>
            <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">Frequency</div>
            <div className="space-y-1">
              {FREQUENCIES.map(f => (
                <label key={f} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                  frequency === f
                    ? 'bg-primary text-white'
                    : 'hover:bg-slate-50 text-slate-700 border border-slate-200'
                }`}>
                  <input type="radio" name="freq" value={f} checked={frequency === f}
                    onChange={() => setFrequency(f)} className="sr-only" />
                  {f}
                </label>
              ))}
            </div>
          </div>

          {/* Recurrence starts */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recurrence starts</div>
              <div className="flex rounded-lg border border-slate-200 overflow-hidden text-xs">
                <button className="px-3 py-1 bg-slate-100 text-slate-800 font-medium">Schedule</button>
                <button className="px-3 py-1 text-slate-500 hover:bg-slate-50">Find a time</button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-slate-500 mb-1">Start date</label>
                <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Start time</label>
                <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">End date</label>
                <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">End time</label>
                <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)}
                  className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30" />
              </div>
            </div>
          </div>

          {/* Anytime + Team */}
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={anytime} onChange={e => setAnytime(e.target.checked)} className="rounded" />
              Anytime
            </label>
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

          {/* Arrival window */}
          <div>
            <label className="block text-xs text-slate-500 mb-1">Arrival window</label>
            <select value={arrivalWindow} onChange={e => setArrivalWindow(e.target.value)}
              className="w-full px-2 py-1.5 text-xs border border-slate-200 rounded focus:outline-none focus:ring-1 focus:ring-primary/30">
              <option>None</option>
              <option>30 minutes</option>
              <option>1 hour</option>
              <option>2 hours</option>
            </select>
            <p className="text-[11px] text-slate-400 mt-1">Notify customer is scheduled to arrive by 9:00pm</p>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input type="checkbox" checked={notifyCustomer} onChange={e => setNotifyCustomer(e.target.checked)} className="rounded" />
            Notify customer
          </label>
        </div>
      </div>
    </>
  );

  return (
    <IntakeShell
      title="New recurring job"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Save recurring job"
      leftPanel={leftPanel}
      rightPanel={rightPanel}
    />
  );
}
