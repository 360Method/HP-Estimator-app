// Phase D6 — Overview tab composition, lifted verbatim from CustomerSection.
import { Button } from '@/components/ui/button';
import ConciergeBrief from '@/components/ConciergeBrief';
import ProfileTab from '@/components/clients/ProfileTab';
import ClientPortalMirror from '@/components/clients/ClientPortalMirror';
import ClientProfileDrift from '@/components/clients/ClientProfileDrift';
import { fmtDollar } from '@/components/clients/formatters';
import {
  CustomerActionQueuePanel,
  PropertyThreeSixtyWorkspace,
  CustomerThreeSixtyStatusPanel,
  CustomerOpportunityCommandCard,
} from '@/components/clients/ClientPanels';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const CustomerOverviewTab = () => {
  const {
    activeCustomer, opportunities, activeOpps, hotOpps, customerProfile, handleTabClick,
  } = useClientUmbrella();
  return (
    <div className="space-y-5">
      <ClientProfileDrift />
      <ClientPortalMirror />
      {activeCustomer && <ConciergeBrief customer={activeCustomer} opportunities={opportunities} />}
      <CustomerActionQueuePanel />
      <PropertyThreeSixtyWorkspace />
      <CustomerThreeSixtyStatusPanel />
      <div className="grid gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
          <p className="text-xs text-[#5b574f]">Active opportunities</p>
          <p className="mt-1 text-2xl font-bold text-[#1a2e1a]">{activeOpps.length}</p>
        </div>
        <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
          <p className="text-xs text-[#5b574f]">Hot items</p>
          <p className="mt-1 text-2xl font-bold text-rose-600">{hotOpps.length}</p>
        </div>
        <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
          <p className="text-xs text-[#5b574f]">Pipeline value</p>
          <p className="mt-1 text-2xl font-bold text-[#1a2e1a]">{fmtDollar(activeOpps.reduce((s, o) => s + (o.value || 0), 0))}</p>
        </div>
        <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
          <p className="text-xs text-[#5b574f]">Open balance</p>
          <p className="mt-1 text-2xl font-bold text-[#1a2e1a]">{fmtDollar(customerProfile.outstandingBalance || 0)}</p>
        </div>
      </div>
      <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="hp-serif text-base text-[#1a2e1a]">360 Membership Flywheel</h3>
            <p className="text-xs text-[#5b574f]">Move this customer toward recurring care, seasonal visits, and future repair opportunities.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleTabClick('membership')}>
            Open Membership Vault
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-lg border border-[#cfdec9] bg-[#e9f0e6] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#3f6b3a]">Core offer</p>
            <p className="mt-1 text-sm font-medium text-[#1a2e1a]">360 Home Method</p>
          </div>
          <div className="rounded-lg border border-[#e7e1d4] bg-[#fdfaf3] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5b574f]">Recurring value</p>
            <p className="mt-1 text-sm">Seasonal visits, labor bank, member discounts, reports.</p>
          </div>
          <div className="rounded-lg border border-[#e7e1d4] bg-[#fdfaf3] px-3 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5b574f]">Next business move</p>
            <p className="mt-1 text-sm">Keep them in the membership loop after every one-off job.</p>
          </div>
        </div>
      </div>
      <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h3 className="hp-serif text-base text-[#1a2e1a]">Needs Attention</h3>
            <p className="text-xs text-[#5b574f]">Priority opportunities for this customer.</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => handleTabClick('workflow')}>View Workflow</Button>
        </div>
        {hotOpps.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[#d9d2c1] p-6 text-center text-sm text-[#5b574f]">No hot opportunities for this customer right now.</p>
        ) : (
          <div className="space-y-3">
            {hotOpps.slice(0, 4).map(opp => <CustomerOpportunityCommandCard key={opp.id} opp={opp} />)}
          </div>
        )}
      </div>
      <ProfileTab />
    </div>
  );
};

export default CustomerOverviewTab;
