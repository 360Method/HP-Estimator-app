// ============================================================
// NewLeadModal — New Lead intake form
// Design: two-column full-screen layout
// Left: Customer, Lead assignee, Attachments, Tags, Lead source
// Right: Private notes, Line items (item name/qty/unit price rows)
// ============================================================

import { useState } from 'react';
import { Paperclip, Tag, Globe } from 'lucide-react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import { useEstimator } from '@/contexts/EstimatorContext';
import IntakeShell, {
  CustomerSearchBox, SidebarSection, PrivateNotesPanel, LineItemsPanel, LineItem, SelectedCustomer,
} from './IntakeShell';

export default function NewLeadModal({ onClose, prefill, onSaved }: { onClose: () => void; prefill?: any; onSaved?: (oppId: string) => void }) {
  const { addOpportunity, addCustomer, setActiveCustomer, state } = useEstimator();
  const [customer, setCustomer] = useState(prefill?.displayName ?? '');
  const [selectedCustomer, setSelectedCustomer] = useState<SelectedCustomer | null>(
    prefill ? { id: prefill.id ?? '', displayName: prefill.displayName ?? '', phone: prefill.phone ?? '', email: prefill.email ?? '', address: prefill.address ?? '', city: prefill.city ?? '', state: prefill.state ?? '', zip: prefill.zip ?? '' } : null
  );
  const [assignee, setAssignee] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const leadCount = state.opportunities.filter(o => o.area === 'lead').length;
  const seqNum = leadCount + 1;
  const trackingNumber = `L-${String(seqNum).padStart(3, '0')}`;
  const defaultTitle = prefill?.displayName ? `Lead — ${prefill.displayName}` : 'New Lead';
  const [oppTitle, setOppTitle] = useState(defaultTitle);

  const handleCustomerConfirmed = (c: SelectedCustomer) => {
    setCustomer(c.displayName);
    setSelectedCustomer(c);
  };

  const handleSave = () => {
    if (!customer.trim()) { toast.error('Please select or enter a customer'); return; }
    let customerId = selectedCustomer?.id ?? '';
    if (!customerId) {
      customerId = nanoid(8);
      addCustomer({ id: customerId, displayName: customer.trim(), firstName: '', lastName: '', company: '', mobilePhone: '', homePhone: '', workPhone: '', email: '', role: '', customerType: 'homeowner', doNotService: false, street: '', unit: '', city: '', state: 'WA', zip: '', addressNotes: '', customerNotes: '', billsTo: '', tags: [], leadSource: '', referredBy: '', sendNotifications: true, sendMarketingOptIn: false, createdAt: new Date().toISOString(), lifetimeValue: 0, outstandingBalance: 0 });
    }
    const totalValue = items.reduce((s, i) => s + i.qty * i.unitPrice, 0);
    const oppId = nanoid(8);
    addOpportunity({
      id: oppId,
      area: 'lead',
      stage: 'New Lead',
      title: oppTitle.trim() || `Lead — ${customer.trim()}`,
      seqNumber: seqNum,
      value: totalValue,
      notes,
      archived: false,
      clientSnapshot: { client: customer.trim(), companyName: '', phone: selectedCustomer?.phone ?? '', email: selectedCustomer?.email ?? '', address: selectedCustomer?.address ?? '', city: selectedCustomer?.city ?? '', state: selectedCustomer?.state ?? '', zip: selectedCustomer?.zip ?? '', jobType: '', scope: '' },
    });
    setActiveCustomer(customerId);
    toast.success('Lead created');
    onClose();
    onSaved?.(oppId);
  };

  const leftPanel = (
    <>
      <CustomerSearchBox value={customer} onChange={setCustomer} onSelect={setSelectedCustomer} />

      {/* Lead assignee */}
      <div className="p-4 border-b border-slate-100">
        <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider mb-3">Lead assignee</div>
        <input
          type="text"
          value={assignee}
          onChange={e => setAssignee(e.target.value)}
          placeholder="Assign to"
          className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary bg-white"
        />
      </div>

      <SidebarSection label="Attachments" icon={<Paperclip size={13} className="text-slate-400" />} />
      <SidebarSection label="Tags" icon={<Tag size={13} className="text-slate-400" />} />
      <SidebarSection label="Lead source" icon={<Globe size={13} className="text-slate-400" />} />
    </>
  );

  const rightPanel = (
    <>
      <PrivateNotesPanel value={notes} onChange={setNotes} tabs={['This lead', 'Customer']} />
      <LineItemsPanel items={items} onChange={setItems} />
    </>
  );

  return (
    <IntakeShell
      title={oppTitle}
      onTitleChange={setOppTitle}
      trackingNumber={trackingNumber}
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Save lead"
      leftPanel={leftPanel}
      rightPanel={rightPanel}
      requireCustomer={!prefill}
      prefillCustomer={prefill ? { id: prefill.id ?? '', displayName: prefill.displayName ?? '', phone: prefill.phone ?? '', email: prefill.email ?? '', address: prefill.address ?? '', city: prefill.city ?? '', state: prefill.state ?? '', zip: prefill.zip ?? '' } : null}
      onCustomerConfirmed={handleCustomerConfirmed}
    />
  );
}
