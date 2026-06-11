// ClientProfileDrift — Phase F #5 (review gate, no schema).
//
// When the customer edits their profile in the portal, the change lands only
// on the portal record. This card surfaces any drift between the portal
// identity and the CRM on the internal Overview, with a one-click
// "Use portal value" for the safe fields (name, phone). Email and address
// drift are shown for awareness only. Per the reflection plan, portal→CRM is
// review-gated: nothing applies without a staff click.
import { UserCheck, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { trpc } from '@/lib/trpc';
import { computeProfileDrift } from '@/lib/profileDrift';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const ClientProfileDrift = () => {
  const { customerContext, activeCustomerId, syncToDbMutation } = useClientUmbrella();
  const utils = trpc.useUtils();

  const crmCustomer = customerContext?.customer;
  const portalCustomer = customerContext?.portal?.customer ?? null;
  if (!crmCustomer || !portalCustomer || !activeCustomerId) return null;

  const drift = computeProfileDrift(
    { ...crmCustomer, addresses: customerContext?.addresses ?? [] },
    portalCustomer,
  );
  if (drift.length === 0) return null;

  const applyItem = (apply: Record<string, string>) => {
    syncToDbMutation.mutate(
      { id: activeCustomerId, ...apply },
      { onSuccess: () => utils.customers.getFullContext.invalidate({ id: activeCustomerId }) },
    );
  };

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50/60 overflow-hidden">
      <div className="px-4 py-3 border-b border-amber-100 flex items-center gap-2">
        <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
        <div>
          <h3 className="text-sm font-semibold text-gray-900">Profile updated in the portal</h3>
          <p className="text-xs text-gray-600">
            The customer's portal profile differs from the CRM. Review and apply what's correct.
          </p>
        </div>
      </div>
      <div className="divide-y divide-amber-100 bg-white/60">
        {drift.map((item) => (
          <div key={item.field} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
            <p className="w-16 text-xs font-semibold uppercase tracking-wide text-gray-500">{item.label}</p>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{item.portalValue}</p>
              <p className="text-xs text-gray-500 truncate inline-flex items-center gap-1">
                <ArrowLeft className="w-3 h-3" />CRM has: {item.crmValue}
              </p>
            </div>
            {item.apply ? (
              <Button
                size="sm"
                variant="outline"
                className="shrink-0 text-xs border-amber-300"
                disabled={syncToDbMutation.isPending}
                onClick={() => applyItem(item.apply!)}
              >
                Use portal value
              </Button>
            ) : (
              <span className="shrink-0 text-[11px] text-gray-400 italic">review manually</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default ClientProfileDrift;
