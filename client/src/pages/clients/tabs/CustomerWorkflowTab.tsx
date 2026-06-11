// Phase D6 — Workflow tab composition, lifted verbatim from CustomerSection.
import { Badge } from '@/components/ui/badge';
import { CustomerActionQueuePanel, CustomerOpportunityCommandCard, roleForOpportunity } from '@/components/clients/ClientPanels';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const CustomerWorkflowTab = () => {
  const { activeOpps } = useClientUmbrella();
  const desks = ['Lead Desk', 'Consultant Desk', 'PM Desk', 'Field Desk', 'Closeout Desk', 'Retainment Desk'];
  return (
    <div className="space-y-4">
      <CustomerActionQueuePanel />
      {desks.map(desk => {
        const deskOpps = activeOpps.filter(opp => roleForOpportunity(opp) === desk);
        return (
          <div key={desk} className="rounded-xl border border-[#e7e1d4] bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h3 className="hp-serif text-base text-[#1a2e1a]">{desk}</h3>
                <p className="text-xs text-[#5b574f]">This customer's work owned by this role.</p>
              </div>
              <Badge variant="secondary">{deskOpps.length}</Badge>
            </div>
            {deskOpps.length === 0 ? (
              <p className="rounded-lg border border-dashed border-[#d9d2c1] bg-white/60 p-4 text-sm text-[#5b574f]">Nothing on this desk for this customer.</p>
            ) : (
              <div className="space-y-3">
                {deskOpps.map(opp => <CustomerOpportunityCommandCard key={opp.id} opp={opp} />)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default CustomerWorkflowTab;
