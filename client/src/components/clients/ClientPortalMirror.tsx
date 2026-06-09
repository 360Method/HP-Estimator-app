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
import { ClipboardList, FileText, Calendar, MessageSquare, RefreshCw, Send, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TIER_DEFINITIONS, type MemberTier } from '@shared/threeSixtyTiers';
import { useClientUmbrella } from '@/components/clients/ClientUmbrellaContext';

interface MirrorEstimate { id: number; status: string; totalAmount: number }
interface MirrorInvoice { id: number; status: string; amountDue: number; amountPaid: number }
interface MirrorAppointment { id: number; status: string; scheduledAt: string | Date }
interface MirrorMessage { id: number; senderRole: string; readAt: string | Date | null }

function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
}

const ClientPortalMirror = () => {
  const { customerContext, customerFullName, displayName, sendPortalInvite, inviteToPortalMutation } = useClientUmbrella();

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
          {totalDue > 0 && (
            <div className="shrink-0 text-right">
              <p className="text-[10px] uppercase tracking-wide text-white/60">Balance they owe</p>
              <p className="text-lg font-bold" style={{ color: '#e2b96a' }}>{fmtMoney(totalDue)}</p>
            </div>
          )}
        </div>
      </div>

      {portal ? (
        /* Quick stats — exactly the counts the customer's portal home shows */
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-white p-4">
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
