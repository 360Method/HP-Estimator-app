/**
 * LeadsPage — the operator's unified leads inbox.
 *
 * Every lead source (Online Request via /book, Roadmap Generator,
 * inbound/missed call, voicemail, manual, membership intent, baseline
 * walkthrough, contact form, referral) funnels into this single list.
 * The legacy "Requests" page has been retired — its rows show up here
 * as Online Request leads with the original timeline + photos preserved.
 *
 * Click a row → opens the customer profile (the single source of truth
 * for the customer's roadmap, communications, opportunities, files).
 *
 * Design intent (per Marcin):
 *   - Reverse-chronological by default — the freshest steward needs first.
 *   - Source / stage / age / assignee filter chips at the top.
 *   - Persistent gold accent on un-viewed-locally rows < 24h old.
 *   - Stewardship empty state — Handy Pioneers voice, not a stock illustration.
 *   - Mobile-first: 44px tap targets, single column, sticky header,
 *     bottom action bar with the four primary one-touch ops actions.
 */

import { useEffect, useMemo, useState } from "react";
import {
  Star, Search, Filter, X, Phone, Mail, MessageSquare, Calendar,
  Clock, MapPin, ArrowUpRight, Users, Globe, MapPinned, Voicemail,
  Megaphone, Sparkles, PhoneIncoming, PhoneMissed, Hand, FileText,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEstimator } from "@/contexts/EstimatorContext";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { Customer, Opportunity, PipelineArea, OpportunityStage } from "@/lib/types";

// ─── Source icons + colors ────────────────────────────────────────────────────
const SOURCE_META: Record<string, { icon: React.ReactNode; bg: string; fg: string }> = {
  "Online Request":      { icon: <Globe size={11} />,        bg: "bg-emerald-50",  fg: "text-emerald-700" },
  "Roadmap Generator":   { icon: <Sparkles size={11} />,     bg: "bg-violet-50",   fg: "text-violet-700" },
  "Inbound Call":        { icon: <PhoneIncoming size={11} />, bg: "bg-blue-50",     fg: "text-blue-700" },
  "Missed Call":         { icon: <PhoneMissed size={11} />,  bg: "bg-rose-50",     fg: "text-rose-700" },
  "Voicemail":           { icon: <Voicemail size={11} />,    bg: "bg-amber-50",    fg: "text-amber-700" },
  "Membership Intent":   { icon: <Star size={11} />,         bg: "bg-yellow-50",   fg: "text-yellow-700" },
  "Baseline Walkthrough":{ icon: <MapPinned size={11} />,    bg: "bg-indigo-50",   fg: "text-indigo-700" },
  "Manual":              { icon: <Hand size={11} />,         bg: "bg-slate-100",   fg: "text-slate-700" },
  "Contact Form":        { icon: <FileText size={11} />,     bg: "bg-cyan-50",     fg: "text-cyan-700" },
  "Referral":            { icon: <Users size={11} />,        bg: "bg-teal-50",     fg: "text-teal-700" },
  "Other":               { icon: <Megaphone size={11} />,    bg: "bg-slate-100",   fg: "text-slate-700" },
};

// ─── Local view-state persistence ─────────────────────────────────────────────
// We mark a lead as "viewed locally" so the gold "new" accent disappears
// after the operator has clicked through. Server-side viewedAt would require
// a migration; this is per-browser per-user and good enough for the UX intent.
const VIEWED_KEY = "hp:leads:viewedIds";
function readViewed(): Set<string> {
  try {
    const raw = localStorage.getItem(VIEWED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? (arr as string[]) : []);
  } catch {
    return new Set();
  }
}
function rememberViewed(id: string) {
  try {
    const set = readViewed();
    set.add(id);
    // cap to 1k entries — bound localStorage growth
    const arr = Array.from(set).slice(-1000);
    localStorage.setItem(VIEWED_KEY, JSON.stringify(arr));
  } catch {
    /* ignore quota errors */
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w`;
  return new Date(iso).toLocaleDateString();
}
function isWithin(iso: string, ms: number) {
  return Date.now() - new Date(iso).getTime() <= ms;
}
function fmtDollar(cents: number) {
  if (!cents) return "";
  return "$" + Math.round(cents / 100).toLocaleString();
}

// Bridge a DB customer record into the in-memory Customer shape so navigating
// from a lead row into the profile loads the full state (mirrors the helper
// the old RequestsPage used). Lifted out of the row component so we only
// declare it once.
function dbToCustomer(dbCust: any, dbOpps: any[]): Customer {
  let tags: string[] = [];
  try { tags = JSON.parse(dbCust.tags ?? "[]"); } catch { tags = []; }

  const opportunities: Opportunity[] = (dbOpps ?? []).map((o: any): Opportunity => ({
    id: o.id,
    area: (o.area ?? "lead") as PipelineArea,
    stage: (o.stage ?? "New Lead") as OpportunityStage,
    title: o.title ?? "",
    value: o.value ?? 0,
    jobNumber: o.jobNumber ?? undefined,
    createdAt: o.createdAt instanceof Date ? o.createdAt.toISOString() : (o.createdAt ?? new Date().toISOString()),
    updatedAt: o.updatedAt instanceof Date ? o.updatedAt.toISOString() : (o.updatedAt ?? new Date().toISOString()),
    notes: o.notes ?? "",
    archived: o.archived ?? false,
    archivedAt: o.archivedAt ?? undefined,
    sourceLeadId: o.sourceLeadId ?? undefined,
    sourceEstimateId: o.sourceEstimateId ?? undefined,
  }));

  return {
    id: dbCust.id,
    firstName: dbCust.firstName ?? "",
    lastName: dbCust.lastName ?? "",
    displayName: dbCust.displayName ?? "",
    company: dbCust.company ?? "",
    mobilePhone: dbCust.mobilePhone ?? "",
    homePhone: dbCust.homePhone ?? "",
    workPhone: dbCust.workPhone ?? "",
    email: dbCust.email ?? "",
    role: dbCust.role ?? "",
    customerType: (dbCust.customerType ?? "homeowner") as "homeowner" | "business",
    doNotService: dbCust.doNotService ?? false,
    street: dbCust.street ?? "",
    unit: dbCust.unit ?? "",
    city: dbCust.city ?? "",
    state: dbCust.state ?? "",
    zip: dbCust.zip ?? "",
    addressNotes: dbCust.addressNotes ?? "",
    customerNotes: dbCust.customerNotes ?? "",
    billsTo: dbCust.billsTo ?? "",
    tags,
    leadSource: dbCust.leadSource ?? "",
    referredBy: dbCust.referredBy ?? "",
    sendNotifications: dbCust.sendNotifications ?? true,
    sendMarketingOptIn: dbCust.sendMarketingOptIn ?? false,
    createdAt: dbCust.createdAt instanceof Date ? dbCust.createdAt.toISOString() : (dbCust.createdAt ?? new Date().toISOString()),
    lifetimeValue: dbCust.lifetimeValue ?? 0,
    outstandingBalance: dbCust.outstandingBalance ?? 0,
    opportunities,
  };
}

// ─── Component ────────────────────────────────────────────────────────────────
export default function LeadsPage() {
  const { state, addCustomer, setActiveCustomer } = useEstimator();
  const utils = trpc.useUtils();

  const { data: leads = [], isLoading, refetch } = trpc.leads.list.useQuery(
    { limit: 200 },
    { refetchInterval: 60_000, staleTime: 30_000 },
  );
  const { data: counts } = trpc.leads.counts.useQuery(undefined, {
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const markRead = trpc.leads.markOnlineRequestRead.useMutation();

  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string | null>(null);
  const [ageFilter, setAgeFilter] = useState<"24h" | "7d" | "30d" | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  // Re-read viewed set on every render so freshly-viewed rows lose the gold
  // accent immediately after navigating back from a customer profile.
  const [viewedTick, setViewedTick] = useState(0);
  useEffect(() => {
    const onFocus = () => setViewedTick((t) => t + 1);
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);
  const viewed = useMemo(() => readViewed(), [viewedTick, leads]);

  // ── Derived filter dropdown sets ──
  const sources = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => s.add(l.source));
    return Array.from(s).sort();
  }, [leads]);
  const stages = useMemo(() => {
    const s = new Set<string>();
    leads.forEach((l) => s.add(l.stage));
    return Array.from(s).sort();
  }, [leads]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return leads.filter((l) => {
      if (sourceFilter && l.source !== sourceFilter) return false;
      if (stageFilter && l.stage !== stageFilter) return false;
      if (ageFilter) {
        const limits = { "24h": 24 * 60 * 60_000, "7d": 7 * 24 * 60 * 60_000, "30d": 30 * 24 * 60 * 60_000 } as const;
        if (!isWithin(l.createdAt, limits[ageFilter])) return false;
      }
      if (q) {
        const hay = `${l.customerName} ${l.title} ${l.notes} ${l.city} ${l.customerEmail} ${l.customerPhone}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [leads, search, sourceFilter, stageFilter, ageFilter]);

  const newCount = useMemo(
    () => leads.filter((l) => isWithin(l.createdAt, 24 * 60 * 60_000) && !viewed.has(l.id)).length,
    [leads, viewed],
  );
  const totalCount = leads.length;

  const goToLead = async (lead: typeof leads[number]) => {
    rememberViewed(lead.id);
    setViewedTick((t) => t + 1);
    if (lead.onlineRequestId) {
      markRead.mutate({ opportunityId: lead.id });
    }
    try {
      const existing = state.customers.find((c) => c.id === lead.customerId);
      if (!existing) {
        const [dbCust, dbOpps] = await Promise.all([
          utils.customers.get.fetch({ id: lead.customerId }),
          utils.opportunities.list.fetch({ customerId: lead.customerId, archived: false }),
        ]);
        if (!dbCust) {
          toast.error("Customer not found.");
          return;
        }
        addCustomer(dbToCustomer(dbCust, dbOpps));
      }
      setActiveCustomer(lead.customerId, "list");
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't open this customer.");
    }
  };

  const clearFilters = () => {
    setSourceFilter(null);
    setStageFilter(null);
    setAgeFilter(null);
    setSearch("");
  };
  const hasFilters = !!(sourceFilter || stageFilter || ageFilter || search.trim());

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-0">
      {/* ── Sticky header ────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-white border-b border-border shadow-sm">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-4">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-foreground flex items-center gap-2">
                <Star className="w-5 h-5 text-amber-500" />
                Leads
              </h1>
              <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
                Every new inquiry — wherever it came from — gathers here for stewardship.
              </p>
            </div>
            <div className="flex items-center gap-3 text-xs">
              <span className="inline-flex items-center gap-1 text-muted-foreground">
                <span className="font-bold text-foreground text-base">{totalCount}</span>
                active
              </span>
              {newCount > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-800 font-semibold">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                  {newCount} new today
                </span>
              )}
              {counts && counts.unreadRequests > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 border border-blue-200 text-blue-800">
                  {counts.unreadRequests} online unread
                </span>
              )}
            </div>
          </div>

          {/* Search + filter toggle */}
          <div className="mt-3 flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name, city, email, phone…"
                className="pl-9 h-11 text-sm"
              />
            </div>
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`h-11 px-3 rounded-md border text-xs font-semibold flex items-center gap-1.5 transition-colors ${
                hasFilters
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted"
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filter
              {hasFilters && (
                <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
                  {[sourceFilter, stageFilter, ageFilter, search.trim() || null].filter(Boolean).length}
                </span>
              )}
            </button>
          </div>

          {/* Filter chips */}
          {showFilters && (
            <div className="mt-3 space-y-2">
              <ChipRow
                label="Source"
                value={sourceFilter}
                options={sources}
                onSelect={setSourceFilter}
                meta={SOURCE_META}
              />
              <ChipRow label="Stage" value={stageFilter} options={stages} onSelect={setStageFilter} />
              <div>
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Age</div>
                <div className="flex flex-wrap gap-1.5">
                  {(["24h", "7d", "30d"] as const).map((b) => (
                    <button
                      key={b}
                      onClick={() => setAgeFilter(ageFilter === b ? null : b)}
                      className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                        ageFilter === b
                          ? "bg-primary text-primary-foreground border-primary"
                          : "bg-white text-muted-foreground border-border hover:border-primary/40"
                      }`}
                    >
                      {b === "24h" ? "Last 24 hours" : b === "7d" ? "Last 7 days" : "Last 30 days"}
                    </button>
                  ))}
                </div>
              </div>
              {hasFilters && (
                <button
                  onClick={clearFilters}
                  className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline"
                >
                  <X className="w-3 h-3" /> Clear all filters
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── List ────────────────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-3 sm:px-6 py-4">
        {isLoading ? (
          <div className="text-center py-16 text-muted-foreground text-sm">Gathering leads…</div>
        ) : filtered.length === 0 ? (
          <EmptyState hasFilters={hasFilters} totalCount={totalCount} onClear={clearFilters} />
        ) : (
          <ul className="space-y-2">
            {filtered.map((lead) => {
              const isFresh = isWithin(lead.createdAt, 24 * 60 * 60_000) && !viewed.has(lead.id);
              return (
                <LeadRow key={lead.id} lead={lead} isFresh={isFresh} onOpen={() => goToLead(lead)} />
              );
            })}
          </ul>
        )}
      </div>

      {/* ── Mobile bottom action bar ──────────────────────────────
            Single tap on any of the four primary ops actions.
            Visible only on mobile (md:hidden). ≥ 44px tap targets. */}
      <MobileActionBar onRefresh={() => refetch()} />
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function ChipRow({
  label, value, options, onSelect, meta,
}: {
  label: string;
  value: string | null;
  options: string[];
  onSelect: (v: string | null) => void;
  meta?: Record<string, { icon: React.ReactNode; bg: string; fg: string }>;
}) {
  if (options.length === 0) return null;
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => {
          const m = meta?.[opt];
          const active = value === opt;
          return (
            <button
              key={opt}
              onClick={() => onSelect(active ? null : opt)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors flex items-center gap-1 ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : `${m?.bg ?? "bg-white"} ${m?.fg ?? "text-muted-foreground"} border-border hover:border-primary/40`
              }`}
            >
              {m?.icon}
              {opt}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LeadRow({
  lead, isFresh, onOpen,
}: {
  lead: NonNullable<ReturnType<typeof useLeadsList>>[number];
  isFresh: boolean;
  onOpen: () => void;
}) {
  const meta = SOURCE_META[lead.source] ?? SOURCE_META.Other;
  return (
    <li>
      <button
        onClick={onOpen}
        className={`w-full text-left rounded-xl border bg-white p-3 sm:p-4 transition-all hover:shadow-sm hover:border-primary/30 ${
          isFresh
            ? "border-amber-300 bg-gradient-to-r from-amber-50/60 via-white to-white shadow-sm ring-1 ring-amber-200/50"
            : "border-border"
        }`}
        style={{ minHeight: 64 }} // mobile: comfortable tap target
      >
        <div className="flex items-start gap-3">
          {/* Avatar bubble */}
          <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
            isFresh ? "bg-amber-100 text-amber-800" : "bg-slate-100 text-slate-600"
          }`}>
            {(lead.customerName?.[0] ?? "?").toUpperCase()}
          </div>

          {/* Body */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-foreground truncate">{lead.customerName}</span>
              {isFresh && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-500 text-white text-[9px] font-bold uppercase tracking-wider">
                  New
                </span>
              )}
              {lead.hasRoadmap && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-800 text-[9px] font-bold uppercase tracking-wider border border-violet-200">
                  <Sparkles className="w-2.5 h-2.5" /> Roadmap
                </span>
              )}
            </div>

            <div className="text-xs text-muted-foreground mt-0.5 truncate">
              {lead.title || "(no description)"}
            </div>

            {/* Meta row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
              <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border ${meta.bg} ${meta.fg} border-current/10`}>
                {meta.icon}
                <span className="font-medium">{lead.source}</span>
              </span>
              <Badge variant="outline" className="text-[10px] py-0 font-normal">
                {lead.stage}
              </Badge>
              <span className="inline-flex items-center gap-0.5">
                <Clock className="w-3 h-3" /> {fmtRelative(lead.createdAt)}
              </span>
              {(lead.city || lead.state) && (
                <span className="inline-flex items-center gap-0.5 max-w-[160px] truncate">
                  <MapPin className="w-3 h-3" /> {[lead.city, lead.state].filter(Boolean).join(", ")}
                </span>
              )}
              {lead.value > 0 && (
                <span className="font-semibold text-foreground">{fmtDollar(lead.value)}</span>
              )}
              {lead.assignedRole && (
                <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 capitalize">
                  {lead.assignedRole.replace("_", " ")}
                </span>
              )}
            </div>

            {/* Online-request bonus row: timeline + photo count */}
            {lead.source === "Online Request" && (
              <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                {lead.onlineRequestTimeline && (
                  <span className="px-1.5 py-0.5 rounded-full bg-slate-100 font-medium">
                    Timeline: {lead.onlineRequestTimeline}
                  </span>
                )}
                {lead.onlineRequestPhotoUrls.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                    {lead.onlineRequestPhotoUrls.length} photo{lead.onlineRequestPhotoUrls.length !== 1 ? "s" : ""}
                  </span>
                )}
              </div>
            )}
          </div>

          <ArrowUpRight className="w-4 h-4 text-muted-foreground/40 shrink-0 mt-1" />
        </div>
      </button>
    </li>
  );
}

function EmptyState({
  hasFilters, totalCount, onClear,
}: { hasFilters: boolean; totalCount: number; onClear: () => void }) {
  if (hasFilters) {
    return (
      <div className="text-center py-16 px-6 bg-white rounded-xl border border-border">
        <Filter className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
        <p className="text-sm font-semibold text-foreground">No leads match these filters.</p>
        <p className="text-xs text-muted-foreground mt-1">
          {totalCount} lead{totalCount !== 1 ? "s" : ""} are still active overall.
        </p>
        <Button variant="outline" size="sm" className="mt-4" onClick={onClear}>
          Clear filters
        </Button>
      </div>
    );
  }
  return (
    <div className="text-center py-20 px-6 bg-white rounded-xl border border-border border-dashed">
      <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-amber-50 text-amber-600 mb-3">
        <Star className="w-6 h-6" />
      </div>
      <p className="text-base font-semibold text-foreground">Your customer roster awaits its first steward.</p>
      <p className="text-sm text-muted-foreground mt-1.5 max-w-md mx-auto leading-relaxed">
        Soon, leads from every source — online requests, the Roadmap Generator,
        inbound calls, voicemails, referrals — will gather here for tending.
      </p>
    </div>
  );
}

function MobileActionBar({ onRefresh }: { onRefresh: () => void }) {
  // The four primary operator actions, kept consistent with the
  // customer profile bottom bar (cross-page muscle memory).
  const actions = [
    { icon: Mail, label: "Email", onClick: () => toast.info("Open a lead first to email.") },
    { icon: Phone, label: "Call", onClick: () => toast.info("Open a lead first to call.") },
    { icon: MessageSquare, label: "SMS", onClick: () => toast.info("Open a lead first to text.") },
    { icon: Calendar, label: "Schedule", onClick: () => toast.info("Open a lead first to schedule.") },
  ];
  return (
    <div className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-white border-t border-border shadow-[0_-2px_8px_rgba(0,0,0,0.04)]">
      <div className="flex items-stretch">
        {actions.map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            onClick={onClick}
            className="flex-1 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50"
            style={{ minHeight: 56 }}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
        <button
          onClick={onRefresh}
          className="px-4 flex flex-col items-center justify-center gap-0.5 py-2.5 text-[10px] font-semibold text-muted-foreground hover:text-foreground hover:bg-muted/50 border-l border-border"
          style={{ minHeight: 56 }}
        >
          <ArrowUpRight className="w-4 h-4" />
          Refresh
        </button>
      </div>
    </div>
  );
}

// Helper type alias so the row component is decoupled from the trpc query
function useLeadsList() {
  return trpc.leads.list.useQuery({ limit: 200 }).data ?? [];
}
