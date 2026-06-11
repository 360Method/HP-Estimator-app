// ClientPortalPreview — Phase G "view as client" (read-only, no backend).
//
// A full-screen, read-only replica of what THIS customer sees in their client
// portal, rendered inside the staff app from the already-loaded
// customers.getFullContext portal + roadmap bundles. No portal session is
// created or impersonated; every figure shown is portal-side (retail) data,
// matching the portal-leak guardrail. All portal actions are disabled — this
// is a window, not a door.
//
// Visual language replicates PortalLayout + PortalHome: white top bar with the
// HP logo, left nav, gray body, forest green #1a2e1a / gold #c8922a accents.
import { useState } from 'react';
import {
  X, Home, Compass, Calendar, FileText, ClipboardList, FolderOpen,
  MessageSquare, Eye, Clock, CheckCircle, AlertCircle, User,
} from 'lucide-react';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

const HP_LOGO = 'https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg';

type Section = 'home' | 'roadmap' | 'appointments' | 'invoices' | 'estimates' | 'documents' | 'messages';

// Icons are stored as component types (not rendered elements) so this module
// has no JSX execution at import time — the SSR smoke test sets the classic-
// runtime React global after imports resolve.
const NAV: { key: Section; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'home', label: 'Home', icon: Home },
  { key: 'roadmap', label: 'Your Roadmap', icon: Compass },
  { key: 'appointments', label: 'Appointments', icon: Calendar },
  { key: 'invoices', label: 'Invoices', icon: FileText },
  { key: 'estimates', label: 'Estimates', icon: ClipboardList },
  { key: 'documents', label: 'Documents', icon: FolderOpen },
  { key: 'messages', label: 'Messages', icon: MessageSquare },
];

function fmtMoney(cents: number) {
  return `$${((cents ?? 0) / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}
function fmtDate(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateTime(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function StatusChip({ kind, status }: { kind: 'estimate' | 'invoice' | 'appointment'; status: string }) {
  const maps: Record<string, Record<string, { bg: string; label: string }>> = {
    estimate: {
      sent: { bg: 'bg-blue-100 text-blue-700', label: 'Awaiting Review' },
      viewed: { bg: 'bg-yellow-100 text-yellow-700', label: 'Viewed' },
      approved: { bg: 'bg-green-100 text-green-700', label: 'Approved' },
      declined: { bg: 'bg-red-100 text-red-700', label: 'Declined' },
      expired: { bg: 'bg-gray-100 text-gray-500', label: 'Expired' },
    },
    invoice: {
      sent: { bg: 'bg-orange-100 text-orange-700', label: 'Due' },
      due: { bg: 'bg-orange-100 text-orange-700', label: 'Due' },
      paid: { bg: 'bg-green-100 text-green-700', label: 'Paid' },
      partial: { bg: 'bg-yellow-100 text-yellow-700', label: 'Partial' },
      overdue: { bg: 'bg-red-100 text-red-700', label: 'Overdue' },
    },
    appointment: {
      scheduled: { bg: 'bg-blue-100 text-blue-700', label: 'Scheduled' },
      completed: { bg: 'bg-green-100 text-green-700', label: 'Completed' },
      cancelled: { bg: 'bg-gray-100 text-gray-500', label: 'Cancelled' },
      rescheduled: { bg: 'bg-yellow-100 text-yellow-700', label: 'Rescheduled' },
    },
  };
  const s = maps[kind][status] ?? { bg: 'bg-gray-100 text-gray-500', label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>{s.label}</span>;
}

const URGENCY_CHIP: Record<string, string> = {
  NOW: 'bg-red-100 text-red-700',
  SOON: 'bg-amber-100 text-amber-700',
  WAIT: 'bg-gray-100 text-gray-600',
};

function EmptyState({ text }: { text: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-10 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}

export default function ClientPortalPreview({ onClose }: { onClose: () => void }) {
  const { customerContext, customerFullName, displayName } = useClientUmbrella();
  const [section, setSection] = useState<Section>('home');

  const portal = customerContext?.portal ?? null;
  const roadmap = customerContext?.roadmap ?? null;
  const name = portal?.customer?.name || customerFullName || displayName || 'Customer';
  const firstName = name.split(' ')[0];

  const estimates: any[] = portal?.estimates ?? [];
  const invoices: any[] = portal?.invoices ?? [];
  const appointments: any[] = portal?.appointments ?? [];
  const messages: any[] = portal?.messages ?? [];
  const documents: any[] = portal?.documents ?? [];
  const healthRecords: any[] = roadmap?.healthRecords ?? [];
  const findings: any[] = healthRecords.flatMap((r: any) => r.findings ?? []);
  const openFindings = findings.filter((f: any) => f.status === 'open' || f.status === 'in_progress');

  const pendingEstimates = estimates.filter((e) => e.status === 'sent' || e.status === 'viewed');
  const openInvoices = invoices.filter((i) => i.status !== 'paid' && i.status !== 'void');
  const upcomingAppts = appointments
    .filter((a) => a.scheduledAt && new Date(a.scheduledAt).getTime() >= Date.now() && a.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
  const totalDue = openInvoices.reduce((sum, inv) => sum + ((inv.amountDue ?? 0) - (inv.amountPaid ?? 0)), 0);

  const body = (() => {
    switch (section) {
      case 'home':
        return (
          <div className="space-y-5">
            <div className="rounded-xl p-6 text-white" style={{ background: 'linear-gradient(135deg,#1a2e1a 0%,#2d4a2d 100%)' }}>
              <p className="text-[11px] uppercase tracking-[0.18em] mb-2" style={{ color: '#e2b96a' }}>Handy Pioneers Client Portal</p>
              <h1 className="hp-serif" style={{ fontSize: '1.85rem', lineHeight: 1.1, color: 'white' }}>
                Welcome home, {firstName}
              </h1>
              {totalDue > 0 && (
                <p className="text-sm mt-3" style={{ color: 'rgba(255,255,255,0.85)' }}>
                  Balance due: <span className="font-bold" style={{ color: '#e2b96a' }}>{fmtMoney(totalDue)}</span>
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                { label: 'Estimates to review', value: pendingEstimates.length, go: 'estimates' as Section },
                { label: 'Open invoices', value: openInvoices.length, go: 'invoices' as Section },
                { label: 'Upcoming visits', value: upcomingAppts.length, go: 'appointments' as Section },
                { label: 'Messages', value: messages.length, go: 'messages' as Section },
              ].map((card) => (
                <button
                  key={card.label}
                  onClick={() => setSection(card.go)}
                  className="bg-white rounded-xl border border-gray-200 p-4 text-left hover:border-[#c8922a] transition-colors"
                >
                  <p className="text-xs text-gray-500">{card.label}</p>
                  <p className="mt-1 text-2xl font-bold text-[#1a2e1a]">{card.value}</p>
                </button>
              ))}
            </div>
            {upcomingAppts.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 p-5">
                <h3 className="text-sm font-semibold text-gray-900 mb-3">Next visit</h3>
                <div className="flex items-center gap-3 text-sm text-gray-700">
                  <Calendar className="w-4 h-4 text-[#c8922a]" />
                  <span className="font-medium">{upcomingAppts[0].title || 'Appointment'}</span>
                  <span className="text-gray-500">{fmtDateTime(upcomingAppts[0].scheduledAt)}</span>
                  {upcomingAppts[0].techName && (
                    <span className="text-gray-500 inline-flex items-center gap-1"><User className="w-3.5 h-3.5" />{upcomingAppts[0].techName}</span>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      case 'roadmap':
        return openFindings.length === 0 ? (
          <EmptyState text={`No open roadmap items. ${firstName}'s Home Roadmap is clear right now.`} />
        ) : (
          <div className="space-y-3">
            {openFindings.map((f: any, i: number) => (
              <div key={f.id ?? i} className="bg-white rounded-xl border border-gray-200 p-4 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900">{f.finding || 'Finding'}</p>
                  {f.interpretation && <p className="text-xs text-gray-500 mt-1">{f.interpretation}</p>}
                  {(f.investment_range_low_usd != null || f.investment_range_high_usd != null) && (
                    <p className="text-xs text-gray-600 mt-1">
                      Typical investment: {f.investment_range_low_usd != null ? `$${Number(f.investment_range_low_usd).toLocaleString()}` : ''}
                      {f.investment_range_high_usd != null ? ` – $${Number(f.investment_range_high_usd).toLocaleString()}` : ''}
                    </p>
                  )}
                </div>
                <span className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${URGENCY_CHIP[f.urgency] ?? 'bg-gray-100 text-gray-600'}`}>
                  {f.urgency ?? '—'}
                </span>
              </div>
            ))}
          </div>
        );
      case 'appointments':
        return appointments.length === 0 ? (
          <EmptyState text="No appointments yet." />
        ) : (
          <div className="space-y-3">
            {[...appointments]
              .sort((a, b) => new Date(b.scheduledAt ?? 0).getTime() - new Date(a.scheduledAt ?? 0).getTime())
              .map((a) => (
                <div key={a.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900 truncate">{a.title || 'Appointment'}</p>
                    <p className="text-xs text-gray-500 mt-0.5">{fmtDateTime(a.scheduledAt)}{a.techName ? ` · ${a.techName}` : ''}</p>
                  </div>
                  <StatusChip kind="appointment" status={a.status} />
                </div>
              ))}
          </div>
        );
      case 'invoices':
        return invoices.length === 0 ? (
          <EmptyState text="No invoices yet." />
        ) : (
          <div className="space-y-3">
            {invoices.map((inv) => (
              <div key={inv.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{inv.invoiceNumber} {inv.jobTitle ? `· ${inv.jobTitle}` : ''}</p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {fmtMoney(inv.amountDue)} {inv.amountPaid > 0 ? `· ${fmtMoney(inv.amountPaid)} paid` : ''}
                    {inv.dueDate ? ` · due ${fmtDate(inv.dueDate)}` : ''}
                  </p>
                </div>
                <StatusChip kind="invoice" status={inv.status} />
              </div>
            ))}
          </div>
        );
      case 'estimates':
        return estimates.length === 0 ? (
          <EmptyState text="No estimates yet." />
        ) : (
          <div className="space-y-3">
            {estimates.map((est) => (
              <div key={est.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{est.estimateNumber} · {est.title}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{fmtMoney(est.totalAmount)}{est.sentAt ? ` · sent ${fmtDate(est.sentAt)}` : ''}</p>
                </div>
                <StatusChip kind="estimate" status={est.status} />
              </div>
            ))}
          </div>
        );
      case 'documents':
        return documents.length === 0 ? (
          <EmptyState text="No shared documents yet." />
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
                <FolderOpen className="w-4 h-4 text-[#c8922a] shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-gray-900 truncate">{doc.title || doc.fileName || 'Document'}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Shared {fmtDate(doc.createdAt)}</p>
                </div>
              </div>
            ))}
          </div>
        );
      case 'messages':
        return messages.length === 0 ? (
          <EmptyState text="No messages yet." />
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            {[...messages]
              .sort((a, b) => new Date(a.createdAt ?? 0).getTime() - new Date(b.createdAt ?? 0).getTime())
              .slice(-30)
              .map((m) => {
                const fromCustomer = m.senderRole === 'customer';
                return (
                  <div key={m.id} className={`flex ${fromCustomer ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[75%] rounded-xl px-3 py-2 text-sm ${fromCustomer ? 'bg-[#1a2e1a] text-white' : 'bg-gray-100 text-gray-800'}`}>
                      <p className="whitespace-pre-wrap break-words">{m.body || m.message}</p>
                      <p className={`text-[10px] mt-1 ${fromCustomer ? 'text-white/60' : 'text-gray-400'}`}>
                        {fromCustomer ? firstName : 'Handy Pioneers'} · {fmtDateTime(m.createdAt)}
                      </p>
                    </div>
                  </div>
                );
              })}
          </div>
        );
    }
  })();

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-gray-50">
      {/* Preview ribbon — unmistakably staff-side */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 bg-[#c8922a] text-white">
        <p className="text-xs font-semibold inline-flex items-center gap-2 min-w-0">
          <Eye className="w-4 h-4 shrink-0" />
          <span className="truncate">Read-only preview — this is what {firstName} sees in their portal. Actions are disabled.</span>
        </p>
        <button
          onClick={onClose}
          className="shrink-0 inline-flex items-center gap-1.5 px-3 py-1 rounded-lg bg-white/15 hover:bg-white/25 text-xs font-semibold transition-colors"
        >
          <X className="w-3.5 h-3.5" /> Exit preview
        </button>
      </div>

      {/* Replica portal top bar */}
      <header className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-2">
            <img src={HP_LOGO} alt="Handy Pioneers" className="h-8 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            <span className="font-bold text-gray-900 text-base">Handy Pioneers</span>
          </div>
          <span className="text-xs text-gray-500 hidden sm:block">LOGGED IN AS: {name.toUpperCase()}</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Replica sidebar */}
        <aside className="hidden md:flex flex-col bg-white border-r border-gray-200 w-56 shrink-0">
          <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
            {NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors text-left ${
                  section === item.key
                    ? 'bg-[#1a2e1a]/5 text-[#1a2e1a] font-semibold border-l-2 border-[#c8922a]'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <item.icon className="w-4 h-4" />
                <span className="flex-1">{item.label}</span>
              </button>
            ))}
          </nav>
        </aside>

        {/* Main */}
        <main className="flex-1 overflow-auto">
          {/* Mobile section chips */}
          <div className="md:hidden flex gap-2 overflow-x-auto px-4 pt-3">
            {NAV.map((item) => (
              <button
                key={item.key}
                onClick={() => setSection(item.key)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold border ${
                  section === item.key ? 'bg-[#1a2e1a] text-white border-[#1a2e1a]' : 'bg-white text-gray-600 border-gray-200'
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
          <div className="p-4 sm:p-6 max-w-5xl mx-auto">
            {portal ? body : <EmptyState text="This customer has no portal account yet, so there is nothing to preview." />}
          </div>
        </main>
      </div>
    </div>
  );
}
