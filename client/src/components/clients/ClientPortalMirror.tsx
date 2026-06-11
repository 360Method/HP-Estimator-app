// ClientPortalMirror — Phase E (read-only, no backend).
//
// A portal-styled snapshot of exactly what THIS customer sees in their client
// portal, shown at the top of the internal client Overview. Built entirely from
// customers.getFullContext (already loaded via useClientUmbrella) — no new query,
// no schema change. Only portal-side (retail) data is shown; no internal cost or
// margin is referenced here, matching the portal-leak guardrail.
//
// Visual language deliberately mirrors PortalHome (forest green #1a2e1a / gold
// #c8922a, white rounded-xl cards) so staff see the client's view as the client
// sees it.
import { useState } from 'react';
import { ClipboardList, FileText, Calendar, MessageSquare, RefreshCw, Send, ChevronRight, Clock, CheckCircle, X, AlertCircle, Eye } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIER_DEFINITIONS, type MemberTier } from '@shared/threeSixtyTiers';
import ClientPortalPreview from '@/components/clients/ClientPortalPreview';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

interface MirrorEstimate { id: number; estimateNumber: string; title: string; status: string; totalAmount: number; sentAt: string | Date | null }
interface MirrorInvoice { id: number; invoiceNumber: string; jobTitle: string | null; type: string; status: string; amountDue: number; amountPaid: number; dueDate: string | Date | null }
interface MirrorAppointment { id: number; title: string; status: string; scheduledAt: string | Date; techName: string | null }
interface MirrorMessage { id: number; senderRole: string; readAt: string | Date | null }

function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

function fmtDate(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(ts: string | Date | null | undefined) {
  if (!ts) return '—';
  return new Date(ts).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function EstimateStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; icon: React.ReactNode; label: string }> = {
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

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { bg: string; label: string }> = {
    sent: { bg: 'bg-orange-100 text-orange-700', label: 'Due' },
    due: { bg: 'bg-orange-100 text-orange-700', label: 'Due' },
    paid: { bg: 'bg-green-100 text-green-700', label: 'Paid' },
    partial: { bg: 'bg-yellow-100 text-yellow-700', label: 'Partial' },
    overdue: { bg: 'bg-red-100 text-red-700', label: 'Overdue' },
  };
  const s = map[status] ?? { bg: 'bg-gray-100 text-gray-500', label: status };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>{s.label}</span>;
}

const ClientPortalMirror = () => {
  const { customerContext, customerFullName, displayName, sendPortalInvite, inviteToPortalMutation } = useClientUmbrella();
  const [previewOpen, setPreviewOpen] = useState(false);

  const firstName = (customerFullName || displayName || 'this customer').split(' ')[0];
  const portal = customerContext?.portal ?? null;
  const memberships: any[] = customerContext?.memberships ?? [];
  const membership = memberships[0] ?? null;
  const tierLabel = membership
    ? (TIER_DEFINITIONS[membership.tier as MemberTier]?.label ?? membership.tier)
    : null;

  const estimates: MirrorEstimate[] = portal?.estimates ?? [];
  const invoices: MirrorInvoice[] = portal?.invoices ?? [];
  const appointments: MirrorAppointment[] = portal?.appointments ?? [];
  const messages: MirrorMessage[] = portal?.messages ?? [];

  const pendingEstimates = estimates.filter((e) => e.status === 'sent' || e.status === 'viewed');
  const openInvoices = invoices.filter((i) => i.status !== 'paid' && i.status !== 'void');
  const upcomingAppts = appointments.filter(
    (a) => new Date(a.scheduledAt).getTime() >= Date.now() && a.status === 'scheduled',
  );
  const unreadMessages = messages.filter((m) => m.senderRole === 'customer' && !m.readAt).length;
  const totalDue = openInvoices.reduce((sum, inv) => sum + ((inv.amountDue ?? 0) - (inv.amountPaid ?? 0)), 0);

  return (
    <div className="rounded-xl overflow-hidden border border-gray-200">
      {/* Banner — concierge greeting, portal palette */}
      <div className="p-5 text-white" style={{ background: 'linear-gradient(135deg,#1a2e1a 0%,#2d4a2d 100%)' }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] mb-1" style={{ color: '#e2b96a' }}>
              Client Portal View
            </p>
            <h3 className="hp-serif" style={{ fontSize: '1.4rem', lineHeight: 1.15, color: 'white' }}>
              What {firstName} sees in their portal
            </h3>
            {tierLabel ? (
              <p className="mt-1 text-sm text-white/75 inline-flex items-center gap-1.5">
                <RefreshCw className="w-3.5 h-3.5" style={{ color: '#e2b96a' }} />
                360° Member · {tierLabel} plan
              </p>
            ) : (
              <p className="mt-1 text-sm text-white/75">Not a 360° member yet</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-2">
            {totalDue > 0 && (
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-wide text-white/60">Balance they owe</p>
                <p className="text-lg font-bold" style={{ color: '#e2b96a' }}>{fmtMoney(totalDue)}</p>
              </div>
            )}
            {portal && (
              <button
                onClick={() => setPreviewOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors"
                style={{ background: '#c8922a', color: '#fff' }}
              >
                <Eye className="w-3.5 h-3.5" /> View as {firstName}
              </button>
            )}
          </div>
        </div>
      </div>
      {previewOpen && <ClientPortalPreview onClose={() => setPreviewOpen(false)} />}

      {portal ? (
        <div className="bg-white p-4 space-y-4">
          {/* Quick stats — exactly the counts the customer's portal home shows */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'Pending Estimates', value: pendingEstimates.length, icon: <ClipboardList className="w-5 h-5" />, color: 'text-blue-600', bg: 'bg-blue-50' },
              { label: 'Open Invoices', value: openInvoices.length, icon: <FileText className="w-5 h-5" />, color: 'text-orange-600', bg: 'bg-orange-50' },
              { label: 'Upcoming Appts', value: upcomingAppts.length, icon: <Calendar className="w-5 h-5" />, color: 'text-green-600', bg: 'bg-green-50' },
              { label: 'Unread Messages', value: unreadMessages, icon: <MessageSquare className="w-5 h-5" />, color: 'text-purple-600', bg: 'bg-purple-50' },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-gray-200 p-4">
                <div className={`w-9 h-9 rounded-lg ${stat.bg} ${stat.color} flex items-center justify-center mb-2`}>
                  {stat.icon}
                </div>
                <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{stat.label}</p>
              </div>
            ))}
          </div>

          {/* Estimates awaiting their review */}
          {pendingEstimates.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <h4 className="font-semibold text-gray-900 text-sm">Estimates awaiting their review</h4>
              </div>
              <div className="divide-y divide-gray-100">
                {pendingEstimates.slice(0, 5).map((est) => (
                  <div key={est.id} className="flex items-center gap-3 px-4 py-2.5">
                    <ClipboardList className="w-4 h-4 text-blue-500 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{est.estimateNumber} — {est.title}</p>
                      <p className="text-xs text-gray-500">Sent {fmtDate(est.sentAt)} · {fmtMoney(est.totalAmount)}</p>
                    </div>
                    <EstimateStatusBadge status={est.status} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Outstanding invoices */}
          {openInvoices.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <h4 className="font-semibold text-gray-900 text-sm">Outstanding invoices</h4>
              </div>
              <div className="divide-y divide-gray-100">
                {openInvoices.slice(0, 5).map((inv) => {
                  const balance = (inv.amountDue ?? 0) - (inv.amountPaid ?? 0);
                  const overdue = !!inv.dueDate && new Date(inv.dueDate) < new Date();
                  return (
                    <div key={inv.id} className="flex items-center gap-3 px-4 py-2.5">
                      <FileText className={`w-4 h-4 shrink-0 ${overdue ? 'text-red-500' : 'text-orange-500'}`} />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{inv.invoiceNumber} — {inv.jobTitle ?? inv.type}</p>
                        <p className="text-xs text-gray-500">Due {fmtDate(inv.dueDate)} · Balance {fmtMoney(balance)}</p>
                      </div>
                      <InvoiceStatusBadge status={overdue ? 'overdue' : inv.status} />
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Upcoming appointments */}
          {upcomingAppts.length > 0 && (
            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-2.5 border-b border-gray-100">
                <h4 className="font-semibold text-gray-900 text-sm">Upcoming appointments</h4>
              </div>
              <div className="divide-y divide-gray-100">
                {upcomingAppts.slice(0, 5).map((appt) => (
                  <div key={appt.id} className="flex items-center gap-3 px-4 py-2.5">
                    <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{appt.title}</p>
                      <p className="text-xs text-gray-500">{fmtDateShort(appt.scheduledAt)}{appt.techName ? ` · Tech: ${appt.techName}` : ''}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* No portal account yet — the customer currently sees nothing */
        <div className="bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-gray-300 px-4 py-4">
            <div className="flex items-start gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 text-[#c8922a] flex items-center justify-center shrink-0">
                <Send className="w-4 h-4" />
              </div>
              <div>
                <p className="text-sm font-semibold text-gray-900">No portal access yet</p>
                <p className="text-xs text-gray-500">
                  {firstName} can't see estimates, invoices, appointments, or messages until you send a portal invite.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white text-xs shrink-0"
              onClick={() => sendPortalInvite()}
              disabled={inviteToPortalMutation.isPending}
            >
              {inviteToPortalMutation.isPending ? 'Sending…' : 'Invite to portal'}
              <ChevronRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientPortalMirror;
