/**
 * ConciergeBrief — single-glance situational awareness for a customer.
 *
 * Lives at the top of the customer Profile tab. The intent is "if Marcin
 * opens this profile cold, what's everything he needs to know in 10 seconds?"
 *
 * Sections (single column, hierarchical, calm — not a tabs-everywhere mess):
 *   1. Header strip — primary contact, address, lead source, age, opp counts.
 *   2. Roadmap — embedded preview status of any Priority Translation
 *      deliverables linked to this customer (the customer-facing report
 *      generated from /priority-translation submissions). Magic-link out.
 *   3. AI activity — recent agent runs touching this customer (notifications
 *      addressed to the operator about this customer, e.g. lead nurturer
 *      drafts, customer-success onboarding events).
 *   4. Quick action bar — Email, Call, SMS, Schedule, Generate Estimate.
 *
 * Heavier surfaces (full communications timeline, opportunity boards,
 * attachments, owner notes) live in the existing tabs below. This brief
 * is the "executive summary" that tells the operator which tab to open.
 */
import { useEffect, useMemo } from "react";
import {
  Sparkles, FileText, Mail, Phone, MessageSquare, CalendarPlus,
  Plus, Star, Briefcase, MapPin, Clock, Bot, ArrowUpRight, Globe,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Customer, Opportunity } from "@/lib/types";
import { useEstimator } from "@/contexts/EstimatorContext";
import { Badge } from "@/components/ui/badge";
import PendingReview from "@/components/PendingReview";

interface ConciergeBriefProps {
  customer: Customer;
  opportunities: Opportunity[];
}

function fmtAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  const ms = Date.now() - t;
  const m = Math.floor(ms / 60_000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

const ROADMAP_STATUS_COLOR: Record<string, string> = {
  submitted: "bg-blue-50 text-blue-700 border-blue-200",
  processing: "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
  failed: "bg-rose-50 text-rose-700 border-rose-200",
};

export default function ConciergeBrief({ customer, opportunities }: ConciergeBriefProps) {
  const { state, setCustomerTab, setPendingFocus } = useEstimator();
  const focusToken = state.pendingFocus ?? null;
  // One-shot consumption: clear the focus token after rendering so a later
  // navigation away and back doesn't re-scroll surprisingly.
  useEffect(() => {
    if (!focusToken) return;
    const t = window.setTimeout(() => setPendingFocus(null), 800);
    return () => window.clearTimeout(t);
  }, [focusToken, setPendingFocus]);

  const { data: roadmaps = [] } = trpc.leads.roadmapsForCustomer.useQuery(
    { customerId: customer.id },
    { staleTime: 60_000 },
  );

  // Pull recent notifications about this customer to surface AI / agent
  // activity. The notifications router already enriches with customerName,
  // so we just need to filter to this customer.
  const { data: allNotifications = [] } = trpc.notifications.list.useQuery(
    { limit: 50 },
    { staleTime: 30_000 },
  );
  const aiActivity = useMemo(
    () => allNotifications.filter((n) => n.customerId === customer.id).slice(0, 4),
    [allNotifications, customer.id],
  );

  const counts = useMemo(() => {
    const c = { lead: 0, estimate: 0, job: 0 };
    for (const o of opportunities ?? []) {
      if (o.archived) continue;
      if (o.area in c) c[o.area as keyof typeof c]++;
    }
    return c;
  }, [opportunities]);

  const primaryContact =
    customer.mobilePhone || customer.homePhone || customer.workPhone || customer.email || "—";
  const address = [customer.street, customer.city, customer.state, customer.zip]
    .filter(Boolean)
    .join(", ");

  // Quick actions deep-link into existing tabs in CustomerSection (Communication,
  // Leads/Estimates/Jobs). Where possible they trigger the right modal directly.
  const actions = [
    {
      label: "Email",
      icon: Mail,
      onClick: () => setCustomerTab("communication"),
      enabled: !!customer.email,
    },
    {
      label: "Call",
      icon: Phone,
      onClick: () => {
        const tel = customer.mobilePhone || customer.homePhone || customer.workPhone;
        if (tel) window.location.href = `tel:${tel}`;
      },
      enabled: !!(customer.mobilePhone || customer.homePhone || customer.workPhone),
    },
    {
      label: "SMS",
      icon: MessageSquare,
      onClick: () => setCustomerTab("communication"),
      enabled: !!customer.mobilePhone,
    },
    {
      label: "Schedule",
      icon: CalendarPlus,
      onClick: () => setCustomerTab("jobs"),
      enabled: true,
    },
    {
      label: "Estimate",
      icon: Plus,
      onClick: () => setCustomerTab("estimates"),
      enabled: true,
    },
  ];

  return (
    <>
      {/* ── Pending Review (drafts impossible to miss) ──────── */}
      <PendingReview
        customerId={customer.id}
        customerFirstName={customer.firstName ?? null}
        focusToken={focusToken}
      />

      <div className="rounded-2xl border border-border bg-gradient-to-br from-slate-50 via-white to-amber-50/30 shadow-sm overflow-hidden mb-6">
      {/* ── Header strip ─────────────────────────────────────── */}
      <div className="px-4 sm:px-6 pt-4 pb-3 border-b border-border/60">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="text-[10px] font-bold text-amber-700 uppercase tracking-widest flex items-center gap-1.5">
            <Sparkles className="w-3 h-3" /> Concierge brief
          </div>
          <div className="text-[10px] text-muted-foreground inline-flex items-center gap-1">
            <Clock className="w-3 h-3" /> Customer since {fmtAgo(customer.createdAt)}
          </div>
        </div>

        {/* Quick facts row */}
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-foreground">
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <Phone className="w-3 h-3" /> <span className="text-foreground font-medium">{primaryContact}</span>
          </span>
          {address && (
            <span className="inline-flex items-center gap-1 text-muted-foreground max-w-md truncate">
              <MapPin className="w-3 h-3" /> <span className="text-foreground">{address}</span>
            </span>
          )}
          {customer.leadSource && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <Globe className="w-3 h-3" />
              <span className="text-foreground">via {customer.leadSource}</span>
            </span>
          )}
        </div>

        {/* Pipeline counts */}
        <div className="mt-3 grid grid-cols-3 gap-2">
          <CountTile
            label="Open leads"
            value={counts.lead}
            icon={<Star className="w-3.5 h-3.5" />}
            tone="amber"
            onClick={() => setCustomerTab("leads")}
          />
          <CountTile
            label="Estimates"
            value={counts.estimate}
            icon={<FileText className="w-3.5 h-3.5" />}
            tone="violet"
            onClick={() => setCustomerTab("estimates")}
          />
          <CountTile
            label="Jobs"
            value={counts.job}
            icon={<Briefcase className="w-3.5 h-3.5" />}
            tone="blue"
            onClick={() => setCustomerTab("jobs")}
          />
        </div>
      </div>

      {/* ── Roadmap section ──────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-3 border-b border-border/60">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xs font-bold text-foreground inline-flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-violet-600" /> Home Health Roadmap
          </h3>
          {roadmaps.length > 0 && (
            <span className="text-[10px] text-muted-foreground">{roadmaps.length} on file</span>
          )}
        </div>
        {roadmaps.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No Roadmap deliverable on file yet — this customer hasn't submitted a Priority
            Translation, or it hasn't been linked to their CRM record.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {roadmaps.map((r) => (
              <li
                key={r.id}
                className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-border bg-white"
                style={{ minHeight: 44 }}
              >
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground truncate">
                    Roadmap · {r.id.slice(-6)}
                  </div>
                  <div className="text-[10px] text-muted-foreground">
                    Created {fmtAgo(r.createdAt)}
                    {r.deliveredAt ? ` · delivered ${fmtAgo(r.deliveredAt)}` : ""}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={`text-[10px] py-0 ${ROADMAP_STATUS_COLOR[r.status ?? ""] ?? "bg-slate-50 text-slate-700 border-slate-200"}`}
                >
                  {r.status}
                </Badge>
                {r.reportUrl && (
                  <a
                    href={r.reportUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 inline-flex items-center gap-1 text-[11px] text-primary font-semibold hover:underline px-1"
                    style={{ minHeight: 32 }}
                  >
                    Open <ArrowUpRight className="w-3 h-3" />
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── AI activity ──────────────────────────────────────── */}
      <div className="px-4 sm:px-6 py-3 border-b border-border/60">
        <h3 className="text-xs font-bold text-foreground inline-flex items-center gap-1.5 mb-2">
          <Bot className="w-3.5 h-3.5 text-emerald-600" /> AI activity
        </h3>
        {aiActivity.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">
            No agent runs about {customer.firstName || "this customer"} yet.
          </p>
        ) : (
          <ul className="space-y-1">
            {aiActivity.map((n) => (
              <li
                key={n.id}
                className="flex items-start gap-2 text-[11px] text-muted-foreground"
              >
                <span className="mt-1 w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                <span className="flex-1 min-w-0">
                  <span className="font-semibold text-foreground">{n.title}</span>
                  <span className="text-muted-foreground/80"> · {fmtAgo(n.createdAt)}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* ── Quick action bar ─────────────────────────────────── */}
      <div className="px-2 sm:px-4 py-2 bg-white">
        <div className="grid grid-cols-5 gap-1">
          {actions.map(({ label, icon: Icon, onClick, enabled }) => (
            <button
              key={label}
              onClick={onClick}
              disabled={!enabled}
              className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg text-[10px] font-semibold transition-colors ${
                enabled
                  ? "text-muted-foreground hover:text-primary hover:bg-primary/5"
                  : "text-muted-foreground/30 cursor-not-allowed"
              }`}
              style={{ minHeight: 44 }}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
    </>
  );
}

function CountTile({
  label, value, icon, tone, onClick,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  tone: "amber" | "violet" | "blue";
  onClick?: () => void;
}) {
  const palette = {
    amber: "bg-amber-50 text-amber-800 border-amber-200 hover:border-amber-300",
    violet: "bg-violet-50 text-violet-800 border-violet-200 hover:border-violet-300",
    blue: "bg-blue-50 text-blue-800 border-blue-200 hover:border-blue-300",
  }[tone];
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-left transition-colors ${palette}`}
      style={{ minHeight: 56 }}
    >
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0">
        <div className="text-base font-bold leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wider font-semibold">{label}</div>
      </div>
    </button>
  );
}
