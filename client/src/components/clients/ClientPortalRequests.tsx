// ClientPortalRequests — Phase E (read-only, no backend mutation).
//
// The customer's portal service requests, surfaced on the internal
// Opportunities tab where incoming work lives. Reads portal.serviceRequests
// off customers.getFullContext (via useClientUmbrella). Pending requests are
// the action signal: a request the customer submitted that hasn't been
// reviewed or converted to a lead yet. Converting/reviewing stays in the
// existing review flow; a converted request links to its lead here.
import { Inbox, Camera, Clock, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

function fmtWhen(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  return new Date(ts as any).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TIMELINE_LABELS: Record<string, string> = {
  ASAP: 'ASAP',
  within_week: 'Within a week',
  flexible: 'Flexible',
};

function RequestStatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    pending: { bg: 'bg-amber-100 text-amber-700', label: 'Needs review' },
    reviewed: { bg: 'bg-blue-100 text-blue-700', label: 'Reviewed' },
    converted: { bg: 'bg-green-100 text-green-700', label: 'Converted to lead' },
  };
  const s = map[status] ?? { bg: 'bg-gray-100 text-gray-500', label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>{s.label}</span>;
}

const ClientPortalRequests = () => {
  const { customerContext, setActiveOpportunity, opportunities } = useClientUmbrella();
  const requests: any[] = customerContext?.portal?.serviceRequests ?? [];
  if (requests.length === 0) return null;

  const pending = requests.filter((r) => r.status === 'pending').length;

  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900 inline-flex items-center gap-1.5">
            <Inbox className="w-4 h-4 text-gray-400" />Portal requests
          </h3>
          <p className="text-xs text-muted-foreground">Work the customer asked for through their portal.</p>
        </div>
        {pending > 0 && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100 text-amber-700">
            {pending} awaiting review
          </span>
        )}
      </div>
      <div className="divide-y divide-gray-100">
        {requests.map((req) => {
          const photoCount = (() => {
            try {
              const parsed = JSON.parse(req.photoUrls ?? '[]');
              return Array.isArray(parsed) ? parsed.length : 0;
            } catch {
              return 0;
            }
          })();
          const lead = req.leadId ? opportunities.find((o) => o.id === req.leadId) : undefined;
          return (
            <div key={req.id} className="flex items-start gap-3 px-4 py-3">
              {!req.readAt && <span className="mt-1.5 w-2 h-2 rounded-full bg-amber-500 shrink-0" aria-label="Unread" />}
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-medium text-gray-900">
                    {req.requestType === 'off_cycle_visit' ? 'Off-cycle visit request' : 'Service request'}
                  </p>
                  <RequestStatusChip status={req.status} />
                </div>
                <p className="text-sm text-gray-700 mt-1 line-clamp-2">{req.description}</p>
                <p className="text-xs text-gray-500 mt-1 inline-flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {TIMELINE_LABELS[req.timeline] ?? req.timeline}
                  {req.preferredDateRange ? ` · Prefers ${req.preferredDateRange}` : ''}
                  {` · Submitted ${fmtWhen(req.createdAt)}`}
                  {photoCount > 0 && (
                    <span className="inline-flex items-center gap-0.5"><Camera className="w-3 h-3" />{photoCount}</span>
                  )}
                </p>
              </div>
              {lead && (
                <Button
                  size="sm"
                  variant="outline"
                  className="shrink-0 text-xs"
                  onClick={() => setActiveOpportunity(lead.id)}
                >
                  Open lead<ChevronRight className="ml-1 h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ClientPortalRequests;
