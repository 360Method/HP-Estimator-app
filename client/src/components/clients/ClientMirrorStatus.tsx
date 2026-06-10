// ClientMirrorStatus — Phase E (read-only, no backend).
//
// Side-by-side internal-vs-portal sync status for estimates and invoices, built
// entirely from customers.getFullContext (already loaded via useClientUmbrella).
// Each artifact is labeled Mirrored / Internal only / Portal only, with a drift
// flag when the portal's approval or payment state disagrees with the CRM.
// Internal invoice amounts are stored in dollars while portal amounts are in
// cents, so each side formats its own figures and amounts are never compared
// across sides. Read-only; nothing here writes portal-bound data.
import { ArrowLeftRight, AlertTriangle, EyeOff, Globe, Clock, CheckCircle, X, AlertCircle } from 'lucide-react';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';
import { fmtDollar, stageColor } from '@/components/clients/formatters';

function fmtWhen(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  return new Date(ts as any).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Portal-side amounts are integer cents.
function fmtCents(cents: number | null | undefined) {
  return `$${((cents ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function normNumber(n: string | null | undefined) {
  return (n ?? '').trim().toLowerCase();
}

function SyncChip({ kind }: { kind: 'mirrored' | 'internal' | 'portal' }) {
  if (kind === 'mirrored') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
        <ArrowLeftRight className="w-3 h-3" />Mirrored
      </span>
    );
  }
  if (kind === 'internal') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-gray-100 text-gray-600 border border-gray-200">
        <EyeOff className="w-3 h-3" />Internal only
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
      <Globe className="w-3 h-3" />Portal only
    </span>
  );
}

function DriftNote({ text }: { text: string }) {
  return (
    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
      <AlertTriangle className="w-3 h-3 shrink-0" />{text}
    </p>
  );
}

function PortalEstimateBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
    pending: { bg: 'bg-gray-100 text-gray-600', icon: <Clock className="w-3 h-3" />, label: 'Pending' },
    sent: { bg: 'bg-blue-100 text-blue-700', icon: <Clock className="w-3 h-3" />, label: 'Awaiting Review' },
    viewed: { bg: 'bg-yellow-100 text-yellow-700', icon: <Clock className="w-3 h-3" />, label: 'Viewed' },
    approved: { bg: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" />, label: 'Approved' },
    declined: { bg: 'bg-red-100 text-red-700', icon: <X className="w-3 h-3" />, label: 'Declined' },
    expired: { bg: 'bg-gray-100 text-gray-500', icon: <AlertCircle className="w-3 h-3" />, label: 'Expired' },
  };
  const s = map[status] ?? { bg: 'bg-gray-100 text-gray-500', icon: null, label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>
      {s.icon}{s.label}
    </span>
  );
}

function InvoiceBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    draft: { bg: 'bg-gray-100 text-gray-600', label: 'Draft' },
    sent: { bg: 'bg-sky-100 text-sky-700', label: 'Sent' },
    due: { bg: 'bg-orange-100 text-orange-700', label: 'Due' },
    paid: { bg: 'bg-green-100 text-green-700', label: 'Paid' },
    partial: { bg: 'bg-yellow-100 text-yellow-700', label: 'Partial' },
    void: { bg: 'bg-gray-100 text-gray-400', label: 'Void' },
    pending_signoff: { bg: 'bg-violet-100 text-violet-700', label: 'Pending Sign-off' },
  };
  const s = map[status] ?? { bg: 'bg-gray-100 text-gray-500', label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>{s.label}</span>;
}

function SectionShell({ title, counts, children }: {
  title: string;
  counts: { mirrored: number; internal: number; portal: number };
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-white overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 border-b border-gray-100">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
          <p className="text-xs text-muted-foreground">Internal record next to what the customer's portal shows.</p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          {counts.mirrored} mirrored · {counts.internal} internal only · {counts.portal} portal only
        </p>
      </div>
      <div className="divide-y divide-gray-100">{children}</div>
    </div>
  );
}

function MirrorRow({ left, chip, drift, right }: {
  left: React.ReactNode;
  chip: 'mirrored' | 'internal' | 'portal';
  drift?: string | null;
  right: React.ReactNode;
}) {
  return (
    <div className="px-4 py-2.5">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
        <div className="min-w-0">{left}</div>
        <div className="justify-self-start sm:justify-self-center"><SyncChip kind={chip} /></div>
        <div className="min-w-0 sm:text-right">{right}</div>
      </div>
      {drift ? <DriftNote text={drift} /> : null}
    </div>
  );
}

const NotOnPortal = () => <p className="text-xs text-gray-400 italic">Not on the portal</p>;
const NotInCrm = () => <p className="text-xs text-gray-400 italic">No matching CRM record</p>;

function EstimatesMirror() {
  const { customerContext } = useClientUmbrella();
  const summaries: any[] = customerContext?.opportunitySummaries ?? [];
  const portal = customerContext?.portal ?? null;

  // Internal estimates (live pipeline) plus any opportunity that has a portal
  // estimate attached, whatever its area is now (estimate→job conversions keep
  // the same opportunity id).
  const rows = summaries.filter(
    (s) => s.portalEstimate || (s.opportunity?.area === 'estimate' && !s.opportunity?.archived),
  );
  const portalOnly: any[] = (portal?.estimates ?? []).filter(
    (e: any) => !summaries.some((s) => s.opportunity?.id === e.hpOpportunityId),
  );

  if (rows.length === 0 && portalOnly.length === 0) return null;

  const mirrored = rows.filter((s) => s.portalEstimate).length;
  const counts = { mirrored, internal: rows.length - mirrored, portal: portalOnly.length };

  return (
    <SectionShell title="Portal Sync — Estimates" counts={counts}>
      {rows.map((s) => {
        const opp = s.opportunity;
        const pe = s.portalEstimate;
        let drift: string | null = null;
        if (pe?.status === 'approved' && !opp?.wonAt && !opp?.portalApprovedAt) {
          drift = 'Approved in the portal but not marked Won internally';
        } else if (pe?.status === 'declined' && opp?.stage !== 'Lost' && opp?.stage !== 'Rejected') {
          drift = 'Declined in the portal but still active internally';
        }
        return (
          <MirrorRow
            key={opp.id}
            chip={pe ? 'mirrored' : 'internal'}
            drift={drift}
            left={
              <>
                <p className="text-sm font-medium text-gray-900 truncate">{opp.title || 'Untitled estimate'}</p>
                <p className="text-xs text-gray-500 mt-0.5 flex flex-wrap items-center gap-1.5">
                  <span className={`inline-flex items-center px-1.5 py-0 rounded border text-[11px] ${stageColor(opp.stage)}`}>{opp.stage}</span>
                  {fmtDollar(opp.value || 0)}
                  {opp.sentAt ? <span>· Sent {fmtWhen(opp.sentAt)}</span> : null}
                </p>
              </>
            }
            right={
              pe ? (
                <>
                  <p className="text-sm font-medium text-gray-900 truncate sm:justify-self-end">
                    {pe.estimateNumber} <PortalEstimateBadge status={pe.status} />
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtCents(pe.totalAmount)}
                    {pe.approvedAt ? ` · Approved ${fmtWhen(pe.approvedAt)}` : pe.viewedAt ? ` · Viewed ${fmtWhen(pe.viewedAt)}` : ` · Sent ${fmtWhen(pe.sentAt)}`}
                  </p>
                </>
              ) : (
                <NotOnPortal />
              )
            }
          />
        );
      })}
      {portalOnly.map((pe) => (
        <MirrorRow
          key={`p-${pe.id}`}
          chip="portal"
          left={<NotInCrm />}
          right={
            <>
              <p className="text-sm font-medium text-gray-900 truncate">
                {pe.estimateNumber} <PortalEstimateBadge status={pe.status} />
              </p>
              <p className="text-xs text-gray-500 mt-0.5">{fmtCents(pe.totalAmount)} · Sent {fmtWhen(pe.sentAt)}</p>
            </>
          }
        />
      ))}
    </SectionShell>
  );
}

function InvoicesMirror() {
  const { customerContext } = useClientUmbrella();
  const internalInvoices: any[] = (customerContext?.invoices ?? []).filter((i: any) => i.status !== 'void');
  const portalInvoices: any[] = (customerContext?.portal?.invoices ?? []).filter((i: any) => i.status !== 'void');

  const rows = internalInvoices.map((inv) => ({
    inv,
    match: portalInvoices.find((pi) => normNumber(pi.invoiceNumber) === normNumber(inv.invoiceNumber)) ?? null,
  }));
  const portalOnly = portalInvoices.filter(
    (pi) => !internalInvoices.some((inv) => normNumber(inv.invoiceNumber) === normNumber(pi.invoiceNumber)),
  );

  if (rows.length === 0 && portalOnly.length === 0) return null;

  const mirrored = rows.filter((r) => r.match).length;
  const counts = { mirrored, internal: rows.length - mirrored, portal: portalOnly.length };

  return (
    <SectionShell title="Portal Sync — Invoices" counts={counts}>
      {rows.map(({ inv, match }) => {
        const drift =
          match && (match.status === 'paid') !== (inv.status === 'paid')
            ? match.status === 'paid'
              ? 'Paid in the portal but not marked paid internally'
              : 'Marked paid internally but still open in the portal'
            : null;
        return (
          <MirrorRow
            key={inv.id}
            chip={match ? 'mirrored' : 'internal'}
            drift={drift}
            left={
              <>
                <p className="text-sm font-medium text-gray-900 truncate">
                  {inv.invoiceNumber} <InvoiceBadge status={inv.status} />
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {fmtDollar(inv.total || 0)}
                  {inv.status === 'paid' && inv.paidAt ? ` · Paid ${fmtWhen(inv.paidAt)}` : inv.dueDate ? ` · Due ${fmtWhen(inv.dueDate)}` : ''}
                </p>
              </>
            }
            right={
              match ? (
                <>
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {match.invoiceNumber} <InvoiceBadge status={match.status} />
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtCents(match.amountDue)}
                    {match.amountPaid > 0 ? ` · ${fmtCents(match.amountPaid)} paid` : ''}
                    {match.paidAt ? ` · Paid ${fmtWhen(match.paidAt)}` : ''}
                  </p>
                </>
              ) : (
                <NotOnPortal />
              )
            }
          />
        );
      })}
      {portalOnly.map((pi) => (
        <MirrorRow
          key={`p-${pi.id}`}
          chip="portal"
          left={<NotInCrm />}
          right={
            <>
              <p className="text-sm font-medium text-gray-900 truncate">
                {pi.invoiceNumber} <InvoiceBadge status={pi.status} />
              </p>
              <p className="text-xs text-gray-500 mt-0.5">
                {fmtCents(pi.amountDue)}{pi.type ? ` · ${pi.type}` : ''}{pi.jobTitle ? ` · ${pi.jobTitle}` : ''}
              </p>
            </>
          }
        />
      ))}
    </SectionShell>
  );
}

const ClientMirrorStatus = ({ section }: { section: 'estimates' | 'invoices' }) => {
  const { customerContext, customerContextLoading, customerFullName, displayName } = useClientUmbrella();
  if (!customerContext) return null;
  if (customerContextLoading && !customerContext) return null;

  // No portal account: nothing is mirrored, so a status table is noise. One
  // compact line says it all (the invite action lives in ClientPortalMirror).
  if (!customerContext.portal) {
    const firstName = (customerFullName || displayName || 'This customer').split(' ')[0];
    return (
      <div className="rounded-xl border bg-white px-4 py-3 flex items-center gap-2.5">
        <EyeOff className="w-4 h-4 text-gray-400 shrink-0" />
        <p className="text-xs text-muted-foreground">
          {firstName} has no portal account yet — every {section === 'estimates' ? 'estimate' : 'invoice'} here is internal-only until a portal invite is sent (see the Overview tab).
        </p>
      </div>
    );
  }

  return section === 'estimates' ? <EstimatesMirror /> : <InvoicesMirror />;
};

export default ClientMirrorStatus;
