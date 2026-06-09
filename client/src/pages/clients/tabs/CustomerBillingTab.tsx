// Phase D6 — Billing tab composition, lifted verbatim from CustomerSection.
import InvoiceSection from '@/components/sections/InvoiceSection';
import CustomerExpensesTab from '@/components/CustomerExpensesTab';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const CustomerBillingTab = () => {
  const { opportunities, activeCustomerId } = useClientUmbrella();
  return (
    <div className="space-y-6">
      <InvoiceSection />
      <CustomerExpensesTab
        customerId={activeCustomerId ?? ''}
        opportunityOptions={opportunities
          .filter(o => o.area === 'job' && !o.archived)
          .map(o => ({ id: o.id, title: o.title || o.coNumber || o.id }))}
      />
    </div>
  );
};

export default CustomerBillingTab;
