// Phase D6 — Documents tab composition, lifted verbatim from CustomerSection.
import CustomerAttachmentsTab from '@/components/clients/CustomerAttachmentsTab';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const CustomerDocumentsTab = () => {
  const { activeCustomerId } = useClientUmbrella();
  return (
    <div className="space-y-4">
      <CustomerAttachmentsTab customerId={activeCustomerId ?? ''} />
    </div>
  );
};

export default CustomerDocumentsTab;
