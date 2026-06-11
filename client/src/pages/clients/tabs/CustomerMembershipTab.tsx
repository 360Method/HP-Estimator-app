// Phase D6 — Membership tab composition, lifted verbatim from CustomerSection.
import { Badge } from '@/components/ui/badge';
import CustomerMembershipPanel from '@/components/CustomerMembershipPanel';
import { CustomerThreeSixtyStatusPanel } from '@/components/clients/ClientPanels';
import {
  THREE_SIXTY_METHOD_PHASES,
  THREE_SIXTY_OPERATOR_LADDER,
  VANCOUVER_PNW_SEASONAL_FOCUS,
} from '@/lib/threeSixtyMethod';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const CustomerMembershipTab = () => {
  const { activeCustomerId } = useClientUmbrella();
  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#cfdec9] bg-[#e9f0e6] p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#3f6b3a]">Core operating system</p>
            <h3 className="hp-serif mt-1 text-xl text-[#1a2e1a]">360 Method Membership Vault</h3>
            <p className="mt-1 max-w-3xl text-sm text-[#5b574f]">
              The membership is the recurring care engine for this customer. One-off jobs should feed back into baseline, seasonal walkthroughs, priority planning, labor bank, reports, and the next recommended action.
            </p>
          </div>
          <Badge className="bg-[#f7ecd6] text-[#a07320] hover:bg-[#f7ecd6]">Aware - Act - Advance</Badge>
        </div>
      </div>

      <CustomerThreeSixtyStatusPanel />

      <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="hp-serif text-base text-[#1a2e1a]">Operator Delivery Roadmap</h3>
            <p className="mt-1 text-xs text-[#5b574f]">
              This is the professional version of the DIY 360 Method: HP owns the walkthrough, prioritization, execution, and retainment loop.
            </p>
          </div>
          <Badge variant="outline">9 steps / 3 phases</Badge>
        </div>
        <div className="grid gap-3 lg:grid-cols-3">
          {THREE_SIXTY_METHOD_PHASES.map(phase => (
            <div key={phase.id} className="rounded-lg border border-[#e7e1d4] bg-[#fdfaf3] p-3">
              <div className="mb-3">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-[#5b574f]">Phase</p>
                <h4 className="text-sm font-semibold text-[#1a2e1a]">{phase.name}</h4>
                <p className="mt-1 text-xs text-[#5b574f]">{phase.promise}</p>
              </div>
              <div className="space-y-2">
                {phase.steps.map(step => (
                  <div key={step.key} className="rounded-md border border-[#e7e1d4] bg-white px-3 py-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium">{step.number}. {step.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{step.operatorOutcome}</p>
                      </div>
                      <Badge variant="secondary" className="shrink-0 text-[10px]">{step.owner}</Badge>
                    </div>
                    <p className="mt-2 border-t pt-2 text-[11px] text-muted-foreground">
                      AI support: {step.aiSupport}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
          <h3 className="hp-serif text-base text-[#1a2e1a]">Pacific Northwest Seasonal Focus</h3>
          <p className="mt-1 text-xs text-[#5b574f]">Default regional operating lens for Vancouver / Clark County customers.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {VANCOUVER_PNW_SEASONAL_FOCUS.map(item => (
              <div key={item.season} className="rounded-lg border border-[#e7e1d4] bg-[#fdfaf3] px-3 py-2">
                <p className="text-sm font-medium text-[#1a2e1a]">{item.season}</p>
                <p className="mt-1 text-xs text-[#5b574f]">{item.focus}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-[#e7e1d4] bg-white p-4">
          <h3 className="hp-serif text-base text-[#1a2e1a]">How one-off jobs feed the flywheel</h3>
          <div className="mt-3 space-y-2">
            {THREE_SIXTY_OPERATOR_LADDER.map((item, index) => (
              <div key={item} className="flex gap-2 text-sm">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#e9f0e6] text-[11px] font-semibold text-[#3f6b3a]">
                  {index + 1}
                </span>
                <span className="text-[#5b574f]">{item}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <CustomerMembershipPanel customerId={activeCustomerId ?? ''} />
    </div>
  );
};

export default CustomerMembershipTab;
