// ============================================================
// NewEstimateModal — New Estimate intake form
// Design: two-column full-screen layout
// Left: Customer, Schedule (From/To/Team), Checklists, Attachments, Fields, Tags, Lead source
// Right: Private notes, Line items with cost breakdown + Profit/Loss
// ============================================================

import { useState } from 'react';
import { Calendar, Edit3, Paperclip, Hash, Tag, Globe, User } from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { useEstimator } from '@/contexts/EstimatorContext';
import IntakeShell, {
  CustomerSearchBox, SidebarSection, PrivateNotesPanel, LineItemsPanel, LineItem, SelectedCustomer,
} from './IntakeShell';

export default function NewEstimateModal({ onClose, prefill }: { onClose: () => void; prefill?: any }) {
  const { addOpportunity, addCustomer, setActiveCustomer } = useEstimator();
  const [customer, setCustomer] = useState(prefill?.displayName ?? '');
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(
    prefill ? { id: prefill.id ?? '', displayName: prefill.displayName ?? '', phone: prefill.phone ?? '', email: prefill.email ?? '', address: prefill.address ?? '', city: prefill.city ?? '', state: prefill.state ?? '', zip: prefill.zip ?? '' } : null
  );
  const [fromDate, setFromDate] = useState('');
  const [fromTime, setFromTime] = useState('');
  const [toDate, setToDate] = useState('');
  const [toTime, setToTime] = useState('');
  const [team, setTeam] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);

  const handleSave = () => {
    if (!customer.trim()) { toast.error('Please select or enter a customer'); return; }
    let customerId = selectedCustomer?.id ?? '';
    if (!customerId) {
      customerId = nanoid(8);
      addCustomer({ id: customerId, displayName: customer.trim(), firstName: '', lastName: '', company: '', mobilePhone: '', homePhone: '', workPhone: '', email: '', role: '', customerType: 'homeowner', doNotService: false, street: '', unit: '', city: '', state: 'WA', zip: '', addressNotes: '', customerNotes: '', billsTo: '', tags: [], leadSource: '', referredBy: '', sendNotifications: true, sendMarketingOptIn: false, createdAt: new Date().toISOString(), lifetimeValue: 0, outstandingBalance: 0 });
    }
    const totalValue = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    addOpportunity({
      area: 'estimate',
      stage: 'Draft',
      title: `Estimate — ${customer.trim()}`,
      value: totalValue,
      notes,
      archived: false,
      clientSnapshot: { client: customer.trim(), companyName: '', phone: selectedCustomer?.phone ?? '', email: selectedCustomer?.email ?? '', address: selectedCustomer?.address ?? '', city: selectedCustomer?.city ?? '', state: selectedCustomer?.state ?? '', zip: selectedCustomer?.zip ?? '', jobType: '', scope: '' },
    });
    setActiveCustomer(customerId);
    toast.success('Estimate created');
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
      <PrivateNotesPanel value={notes} onChange={setNotes} tabs={['This estimate', 'Customer']} />
      <LineItemsPanel items={items} onChange={setItems} showCostBreakdown />
    </>
  );

  return (
    <IntakeShell
      title="New estimate"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Save estimate"
      leftPanel={leftPanel}
      rightPanel={rightPanel}
    />
  );
}
