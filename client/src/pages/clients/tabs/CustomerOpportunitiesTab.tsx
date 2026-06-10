// Phase D6 — Opportunities tab composition, lifted verbatim from CustomerSection.
import { Button } from '@/components/ui/button';
import { Opportunity } from '@/lib/types';
import { CustomerOpportunityCommandCard } from '@/components/clients/ClientPanels';
import ClientMirrorStatus from '@/components/clients/ClientMirrorStatus';
import ClientPortalRequests from '@/components/clients/ClientPortalRequests';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const CustomerOpportunitiesTab = () => {
  const { leadOpps, estimateOpps, jobOpps, setIntakeModal } = useClientUmbrella();
  const groups: Array<[string, Opportunity[]]> = [
    ['Lead', leadOpps],
    ['Estimate', estimateOpps],
    ['Job', jobOpps],
  ];
  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Customer Opportunities</h3>
            <p className="text-xs text-muted-foreground">All revenue work for this customer, regardless of which desk owns the next action.</p>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setIntakeModal('lead')}>New Lead</Button>
            <Button size="sm" variant="outline" onClick={() => setIntakeModal('estimate')}>New Estimate</Button>
            <Button size="sm" variant="outline" onClick={() => setIntakeModal('job')}>New Job</Button>
          </div>
        </div>
      </div>
      <ClientPortalRequests />
      <ClientMirrorStatus section="estimates" />
      {groups.map(([label, opps]) => (
        <div key={label} className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}s ({opps.length})</h3>
          {opps.length === 0 ? (
            <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">No {label.toLowerCase()} opportunities.</p>
          ) : (
            <div className="space-y-3">
              {opps.map(opp => <CustomerOpportunityCommandCard key={opp.id} opp={opp} />)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default CustomerOpportunitiesTab;
