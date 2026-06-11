// Phase D6 — History tab composition, lifted verbatim from CustomerSection.
import { Edit3 } from 'lucide-react';
import CustomerActivityFeed from '@/components/CustomerActivityFeed';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const CustomerHistoryTab = () => {
  const { activeCustomerId, customerProfile, setCustomerProfile, newNote, setNewNote, addNote } = useClientUmbrella();
  return (
    <div className="space-y-5">
      {activeCustomerId && <CustomerActivityFeed customerId={activeCustomerId} />}
      <div className="card-section">
        <div className="card-section-header">
          <Edit3 size={15} />
          <span>Internal Notes</span>
        </div>
        <div className="card-section-body space-y-3">
          <div className="flex gap-2">
            <input type="text" value={newNote} onChange={e => setNewNote(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addNote()}
              placeholder="Add a note..." className="field-input flex-1" />
            <button onClick={addNote} className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-semibold hover:bg-primary/90 transition-colors">
              Add
            </button>
          </div>
          <textarea value={customerProfile.privateNotes} onChange={e => setCustomerProfile({ privateNotes: e.target.value })}
            placeholder="Private notes about this customer..." rows={6} className="field-input w-full resize-none" />
        </div>
      </div>
    </div>
  );
};

export default CustomerHistoryTab;
