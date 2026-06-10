// Phase E — Roadmap tab: the customer's portal-side Home Roadmap, surfaced
// internally. Reads the `roadmap` bundle on customers.getFullContext (portal
// account → priority-translation reports + living home-health findings).
// Everything shown here is customer-deliverable content the customer already
// sees in their portal, so it stays clear of the portal-leak guardrail.
// Read-only.
import { TrendingUp, Globe, FileText, ExternalLink, MapPin, CheckCircle, XCircle } from 'lucide-react';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

function fmtWhen(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  return new Date(ts as any).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// Investment ranges are whole dollars (investment_range_*_usd).
function fmtRange(low: number | null | undefined, high: number | null | undefined) {
  const l = low ?? 0;
  const h = high ?? 0;
  if (!l && !h) return null;
  const f = (n: number) => `$${n.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  return l === h ? f(l) : `${f(l)}–${f(h)}`;
}

function UrgencyChip({ urgency }: { urgency: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    NOW: { bg: 'bg-red-100 text-red-700', label: 'Now' },
    SOON: { bg: 'bg-amber-100 text-amber-700', label: 'Soon' },
    WAIT: { bg: 'bg-slate-100 text-slate-600', label: 'Can wait' },
  };
  const s = map[urgency] ?? { bg: 'bg-gray-100 text-gray-500', label: urgency };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold uppercase tracking-wide ${s.bg}`}>{s.label}</span>;
}

function FindingStatusChip({ status }: { status: string }) {
  if (status === 'resolved') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
        <CheckCircle className="w-3 h-3" />Resolved
      </span>
    );
  }
  if (status === 'in_progress') {
    return <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">In progress</span>;
  }
  if (status === 'dismissed') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-500">
        <XCircle className="w-3 h-3" />Dismissed
      </span>
    );
  }
  return null; // open is the default state; no chip needed
}

function ReportStatusChip({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    submitted: { bg: 'bg-blue-100 text-blue-700', label: 'Submitted' },
    processing: { bg: 'bg-yellow-100 text-yellow-700', label: 'Processing' },
    completed: { bg: 'bg-green-100 text-green-700', label: 'Delivered' },
    failed: { bg: 'bg-red-100 text-red-700', label: 'Failed' },
  };
  const s = map[status] ?? { bg: 'bg-gray-100 text-gray-500', label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>{s.label}</span>;
}

const CustomerRoadmapTab = () => {
  const { customerContext, customerFullName, displayName } = useClientUmbrella();
  const firstName = (customerFullName || displayName || 'This customer').split(' ')[0];
  const roadmap = customerContext?.roadmap ?? null;

  if (!roadmap) {
    return (
      <div className="rounded-xl border bg-white p-6 text-center">
        <TrendingUp className="w-8 h-8 mx-auto text-gray-300 mb-2" />
        <p className="text-sm font-medium text-gray-900">No Home Roadmap yet</p>
        <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
          {firstName} hasn't generated a Home Roadmap. Roadmaps come from a baseline walkthrough
          or an inspection-report upload through the roadmap generator.
        </p>
      </div>
    );
  }

  const properties: any[] = roadmap.properties ?? [];
  const reports: any[] = roadmap.reports ?? [];
  const healthRecords: any[] = roadmap.healthRecords ?? [];

  const propertyLabel = (propertyId: string) => {
    const p = properties.find((x) => x.id === propertyId);
    if (!p) return null;
    return [p.street, p.unit, p.city].filter(Boolean).join(', ');
  };

  const allFindings = healthRecords.flatMap((r) => r.findings ?? []);
  const openFindings = allFindings.filter((f: any) => f.status === 'open' || f.status === 'in_progress');
  const byUrgency = (u: string) => openFindings.filter((f: any) => f.urgency === u).length;

  return (
    <div className="space-y-5">
      <div className="rounded-xl border bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">Home Roadmap</h3>
            <p className="text-xs text-muted-foreground">
              The roadmap and home-health findings {firstName} sees in their portal.
            </p>
          </div>
          <div className="flex items-center gap-3">
            {openFindings.length > 0 && (
              <p className="text-xs text-muted-foreground">
                {byUrgency('NOW')} now · {byUrgency('SOON')} soon · {byUrgency('WAIT')} can wait
              </p>
            )}
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-50 text-sky-700 border border-sky-200">
              <Globe className="w-3 h-3" />Customer sees this
            </span>
          </div>
        </div>
      </div>

      {healthRecords.map((record) => {
        const addr = propertyLabel(record.propertyId);
        const findings: any[] = record.findings ?? [];
        return (
          <div key={record.id} className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5" />{addr ?? 'Home health record'} ({findings.length} findings)
            </h3>
            {record.summary && (
              <p className="text-sm text-gray-600 rounded-lg border bg-white px-4 py-3">{record.summary}</p>
            )}
            <div className="rounded-xl border bg-white overflow-hidden divide-y divide-gray-100">
              {findings.map((f: any, i: number) => {
                const range = fmtRange(f.investment_range_low_usd, f.investment_range_high_usd);
                const settled = f.status === 'resolved' || f.status === 'dismissed';
                return (
                  <div key={`${record.id}-${i}`} className={`px-4 py-3 ${settled ? 'opacity-60' : ''}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <UrgencyChip urgency={f.urgency} />
                      <p className="text-sm font-medium text-gray-900">{f.finding}</p>
                      <FindingStatusChip status={f.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">
                      {f.category}
                      {range ? ` · ${range}` : ''}
                      {f.added_at ? ` · Added ${fmtWhen(f.added_at)}` : ''}
                    </p>
                    {f.interpretation && (
                      <p className="text-xs text-gray-600 mt-1.5">{f.interpretation}</p>
                    )}
                  </div>
                );
              })}
              {findings.length === 0 && (
                <p className="px-4 py-5 text-sm text-muted-foreground">No findings on this record.</p>
              )}
            </div>
          </div>
        );
      })}

      {reports.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Roadmap reports ({reports.length})</h3>
          <div className="rounded-xl border bg-white overflow-hidden divide-y divide-gray-100">
            {reports.map((r) => (
              <div key={r.id} className="flex items-start gap-3 px-4 py-3">
                <FileText className="w-4 h-4 text-gray-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium text-gray-900">
                      Roadmap — {fmtWhen(r.deliveredAt ?? r.createdAt)}
                    </p>
                    <ReportStatusChip status={r.status} />
                  </div>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {(r.findings?.length ?? 0)} findings
                    {propertyLabel(r.propertyId) ? ` · ${propertyLabel(r.propertyId)}` : ''}
                  </p>
                  {r.summary && <p className="text-xs text-gray-600 mt-1.5 line-clamp-3">{r.summary}</p>}
                </div>
                {r.reportUrl && (
                  <a
                    href={r.reportUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    Open <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {healthRecords.length === 0 && reports.length === 0 && (
        <div className="rounded-xl border border-dashed bg-white p-6 text-center">
          <p className="text-sm text-muted-foreground">
            {firstName} has a portal roadmap account but no reports or findings yet.
          </p>
        </div>
      )}
    </div>
  );
};

export default CustomerRoadmapTab;
