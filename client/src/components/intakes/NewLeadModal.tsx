// ============================================================
// NewLeadModal — New Lead intake form
// Design: two-column full-screen layout
// Left: Customer, Lead assignee, Attachments, Tags, Lead source
// Right: Private notes, Line items (item name/qty/unit price rows)
// ============================================================

import { useState } from 'react';
import { Paperclip, Tag, Globe } from 'lucide-react';
import { toast } from 'sonner';
import IntakeShell, {
  CustomerSearchBox, SidebarSection, PrivateNotesPanel, LineItemsPanel, LineItem,
} from './IntakeShell';

export default function NewLeadModal({ onClose, prefill }: { onClose: () => void; prefill?: any }) {
  const [customer, setCustomer] = useState(prefill?.displayName ?? '');
  const [assignee, setAssignee] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);

  const handleSave = () => {
    toast.success('Lead saved');
    onClose();
  };

  const leftPanel = (
    <>
      <CustomerSearchBox value={customer} onChange={setCustomer} />

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
      title="New lead"
      onClose={onClose}
      onSave={handleSave}
      saveLabel="Save lead"
      leftPanel={leftPanel}
      rightPanel={rightPanel}
    />
  );
}
