// ============================================================
// EstimatorDashboard — World-class estimator command center
// Shows the business at a glance: KPIs, pipeline funnel,
// revenue chart, today's jobs, recent activity, quick actions.
// ============================================================

import React, { useMemo, useState } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, CartesianGrid,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Minus,
  Users, Briefcase, FileText, DollarSign, Star,
  ArrowRight, Plus, Phone, Mail, MapPin,
  Clock, CheckCircle2, AlertCircle, Circle,
  ChevronRight, Activity, Zap, Target,
  UserPlus, ClipboardList, Wrench, Receipt,
} from 'lucide-react';
import { Customer, Opportunity, Invoice } from '@/lib/types';
import { trpc } from '@/lib/trpc';

// ── Helpers ──────────────────────────────────────────────────
const fmt$ = (n: number) =>
  n >= 1_000_000
    ? `$${(n / 1_000_000).toFixed(1)}M`
    : n >= 1_000
    ? `$${(n / 1_000).toFixed(1)}k`
    : `$${n.toFixed(0)}`;

const fmtFull$ = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);

const daysSince = (iso: string) =>
  Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);

const isToday = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate();
};

const isThisMonth = (iso: string) => {
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
};

const isThisWeek = (iso: string) => daysSince(iso) <= 7;

const STAGE_COLOR: Record<string, string> = {
  'New Lead': 'bg-sky-100 text-sky-700',
  'First Contact': 'bg-blue-100 text-blue-700',
  'Second Contact': 'bg-indigo-100 text-indigo-700',
  'Return Call Needed': 'bg-amber-100 text-amber-700',
  'On Hold': 'bg-gray-100 text-gray-600',
  'Won': 'bg-emerald-100 text-emerald-700',
  'Lost': 'bg-red-100 text-red-600',
  'Unscheduled': 'bg-slate-100 text-slate-600',
  'Scheduled': 'bg-blue-100 text-blue-700',
  'In Progress': 'bg-violet-100 text-violet-700',
  'Completed': 'bg-emerald-100 text-emerald-700',
  'Approved': 'bg-emerald-100 text-emerald-700',
  'Sent': 'bg-blue-100 text-blue-700',
  'Draft': 'bg-gray-100 text-gray-600',
  'New Job': 'bg-sky-100 text-sky-700',
  'Deposit Needed': 'bg-amber-100 text-amber-700',
  'Deposit Collected': 'bg-lime-100 text-lime-700',
  'Invoice Sent': 'bg-purple-100 text-purple-700',
  'Invoice Paid': 'bg-emerald-100 text-emerald-700',
};

const stageColor = (stage: string) => STAGE_COLOR[stage] ?? 'bg-gray-100 text-gray-600';

const ACTIVITY_ICON: Record<string, React.ElementType> = {
  estimate_created: FileText,
  estimate_sent: Mail,
  estimate_approved: CheckCircle2,
  job_created: Briefcase,
  note_added: ClipboardList,
  call_logged: Phone,
  payment_received: DollarSign,
  stage_changed: Activity,
};

const ACTIVITY_COLOR: Record<string, string> = {
  estimate_created: 'bg-blue-100 text-blue-600',
  estimate_sent: 'bg-sky-100 text-sky-600',
  estimate_approved: 'bg-emerald-100 text-emerald-600',
  job_created: 'bg-violet-100 text-violet-600',
  note_added: 'bg-gray-100 text-gray-500',
  call_logged: 'bg-amber-100 text-amber-600',
  payment_received: 'bg-green-100 text-green-600',
  stage_changed: 'bg-indigo-100 text-indigo-600',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── KPI Card ─────────────────────────────────────────────────
interface KpiCardProps {
  icon: React.ElementType;
  iconColor: string;
  label: string;
  value: string;
  sub?: string;
  trend?: 'up' | 'down' | 'flat';
  trendLabel?: string;
  sparkData?: number[];
  sparkColor?: string;
  onClick?: () => void;
}

function KpiCard({ icon: Icon, iconColor, label, value, sub, trend, trendLabel, sparkData, sparkColor = '#3b82f6', onClick }: KpiCardProps) {
  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendCls = trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-gray-400';

  return (
    <div
      className={`bg-white rounded-xl border border-border p-5 flex flex-col gap-3 shadow-sm hover:shadow-md transition-shadow ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${iconColor}`}>
          <Icon className="w-5 h-5" />
        </div>
        {trend && (
          <div className={`flex items-center gap-1 text-xs font-medium ${trendCls}`}>
            <TrendIcon className="w-3.5 h-3.5" />
            {trendLabel}
          </div>
        )}
      </div>
      <div>
        <div className="text-2xl font-bold text-foreground font-mono tracking-tight">{value}</div>
        <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-xs text-muted-foreground mt-1">{sub}</div>}
      </div>
      {sparkData && sparkData.length > 0 && (
        <div className="h-10 -mx-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={sparkData.map((v, i) => ({ i, v }))}>
              <Line type="monotone" dataKey="v" stroke={sparkColor} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// ── Section header ────────────────────────────────────────────
function SectionHeader({ title, sub, action, onAction }: { title: string; sub?: string; action?: string; onAction?: () => void }) {
  return (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </div>
      {action && (
        <button onClick={onAction} className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
          {action} <ChevronRight className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────
export default function EstimatorDashboard() {
  const { state, setSection, setActiveCustomer, setActiveOpportunity } = useEstimator();
  const [revenueRange] = useState<'6m' | '12m'>('6m');
  const [onboardingDismissed, setOnboardingDismissed] = useState(() => {
    try { return localStorage.getItem('hp_onboarding_dismissed') === '1'; } catch { return false; }
  });

  // ── DB-backed revenue stats (portal payments) ───────────────
  const { data: revenueStats } = trpc.portal.getRevenueStats.useQuery(undefined, {
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  // ── Aggregate all data ──────────────────────────────────────
  const allCustomers: Customer[] = state.customers;

  const allOpportunities: Opportunity[] = useMemo(() => {
    const seen = new Set<string>();
    const result: Opportunity[] = [];
    // Active customer's working set first
    for (const o of state.opportunities) {
      seen.add(o.id);
      result.push(o);
    }
    // All persisted customers
    for (const c of state.customers) {
      for (const o of (c.opportunities ?? [])) {
        if (!seen.has(o.id)) {
          seen.add(o.id);
          result.push(o);
        }
      }
    }
    return result;
  }, [state.customers, state.opportunities]);

  const allInvoices: Invoice[] = useMemo(() => {
    const seen = new Set<string>();
    const result: Invoice[] = [];
    for (const inv of state.invoices) { seen.add(inv.id); result.push(inv); }
    for (const c of state.customers) {
      for (const inv of (c.invoices ?? [])) {
        if (!seen.has(inv.id)) { seen.add(inv.id); result.push(inv); }
      }
    }
    return result;
  }, [state.customers, state.invoices]);

  // ── KPI derivations ─────────────────────────────────────────
  const leads = allOpportunities.filter(o => o.area === 'lead' && !o.archived);
  const estimates = allOpportunities.filter(o => o.area === 'estimate' && !o.archived);
  const jobs = allOpportunities.filter(o => o.area === 'job' && !o.archived);

  const pipelineValue = [...leads, ...estimates, ...jobs].reduce((s, o) => s + (o.value || 0), 0);
  const activeJobsCount = jobs.filter(j => ['In Progress', 'Scheduled', 'New Job', 'Deposit Collected', 'Materials Received'].includes(j.stage)).length;
  const openEstimatesCount = estimates.filter(e => !['Approved', 'Rejected'].includes(e.stage)).length;
  const leadsThisMonth = leads.filter(l => isThisMonth(l.createdAt)).length;
  // Use DB-backed portal totals when available; fall back to local state
  const revenueCollected = revenueStats
    ? revenueStats.totalCollectedCents / 100
    : allInvoices.reduce((s, inv) => s + (inv.amountPaid || 0), 0);
  const outstandingBalance = revenueStats
    ? revenueStats.totalOutstandingCents / 100
    : allInvoices.reduce((s, inv) => s + (inv.balance || 0), 0);

  // Conversion rates
  const wonLeads = leads.filter(l => l.stage === 'Won').length;
  const leadConvRate = leads.length > 0 ? Math.round((wonLeads / leads.length) * 100) : 0;
  const approvedEsts = estimates.filter(e => e.stage === 'Approved').length;
  const estConvRate = estimates.length > 0 ? Math.round((approvedEsts / estimates.length) * 100) : 0;

  // ── Revenue by month (last 6 months) ────────────────────────
  const revenueByMonth = useMemo(() => {
    const months: { label: string; revenue: number; invoiced: number }[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const revenue = allInvoices
        .filter(inv => {
          const pd = new Date(inv.issuedAt);
          return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
        })
        .reduce((s, inv) => s + inv.amountPaid, 0);
      const invoiced = allInvoices
        .filter(inv => {
          const pd = new Date(inv.issuedAt);
          return pd.getFullYear() === d.getFullYear() && pd.getMonth() === d.getMonth();
        })
        .reduce((s, inv) => s + inv.total, 0);
      months.push({ label, revenue, invoiced });
    }
    return months;
  }, [allInvoices]);

  // ── Pipeline funnel ──────────────────────────────────────────
  const funnelData = [
    { label: 'Leads', count: leads.length, value: leads.reduce((s, o) => s + o.value, 0), color: 'bg-sky-500', pct: 100 },
    { label: 'Estimates', count: estimates.length, value: estimates.reduce((s, o) => s + o.value, 0), color: 'bg-blue-500', pct: leads.length > 0 ? Math.round((estimates.length / Math.max(leads.length, 1)) * 100) : 100 },
    { label: 'Jobs', count: jobs.length, value: jobs.reduce((s, o) => s + o.value, 0), color: 'bg-violet-500', pct: estimates.length > 0 ? Math.round((jobs.length / Math.max(estimates.length, 1)) * 100) : 100 },
    { label: 'Invoiced', count: allInvoices.length, value: allInvoices.reduce((s, inv) => s + inv.total, 0), color: 'bg-emerald-500', pct: jobs.length > 0 ? Math.round((allInvoices.length / Math.max(jobs.length, 1)) * 100) : 100 },
  ];

  // ── Today's jobs / urgent items ──────────────────────────────
  const urgentJobs = useMemo(() => {
    return jobs
      .filter(j => ['In Progress', 'Scheduled', 'Deposit Needed'].includes(j.stage))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [jobs]);

  // ── Recent activity across all customers ────────────────────
  const recentActivity = useMemo(() => {
    const events: { event: { id: string; type: string; title: string; description: string; timestamp: string }; customerName: string; customerId: string }[] = [];
    for (const c of state.customers) {
      for (const ev of (c.activityFeed ?? [])) {
        events.push({ event: ev, customerName: c.displayName || `${c.firstName} ${c.lastName}`, customerId: c.id });
      }
    }
    return events
      .sort((a, b) => new Date(b.event.timestamp).getTime() - new Date(a.event.timestamp).getTime())
      .slice(0, 12);
  }, [state.customers]);

  // ── Estimates needing attention ──────────────────────────────
  const needsAttention = useMemo(() => {
    return estimates
      .filter(e => ['Sent', 'Verbal Acceptance', 'Return Call Needed'].includes(e.stage))
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5);
  }, [estimates]);

  // ── Customer lookup ──────────────────────────────────────────
  const customerById = useMemo(() => {
    const map: Record<string, Customer> = {};
    for (const c of state.customers) map[c.id] = c;
    return map;
  }, [state.customers]);

  const oppCustomer = (opp: Opportunity): Customer | undefined => {
    return state.customers.find(c => (c.opportunities ?? []).some(o => o.id === opp.id));
  };

  const openOpp = (opp: Opportunity) => {
    const customer = oppCustomer(opp);
    if (customer) {
      setActiveCustomer(customer.id);
      setActiveOpportunity(opp.id);
    }
  };

  // ── Quick actions ────────────────────────────────────────────
  const quickActions = [
    { icon: UserPlus,    label: 'New Customer',  color: 'bg-sky-50 text-sky-600 border-sky-200',     action: () => setSection('customers') },
    { icon: Star,        label: 'New Lead',       color: 'bg-amber-50 text-amber-600 border-amber-200', action: () => setSection('pipeline') },
    { icon: FileText,    label: 'New Estimate',   color: 'bg-blue-50 text-blue-600 border-blue-200',  action: () => setSection('pipeline') },
    { icon: Wrench,      label: 'New Job',        color: 'bg-violet-50 text-violet-600 border-violet-200', action: () => setSection('jobs') },
    { icon: Receipt,     label: 'New Invoice',    color: 'bg-emerald-50 text-emerald-600 border-emerald-200', action: () => setSection('customers') },
    { icon: Users,       label: 'All Customers',  color: 'bg-slate-50 text-slate-600 border-slate-200', action: () => setSection('customers') },
  ];

  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  const showOnboardingBanner = !onboardingDismissed && state.customers.length === 0;

  return (
    <div className="min-h-screen bg-background">

      {/* ── Onboarding banner (shown when no customers exist) ── */}
      {showOnboardingBanner && (
        <div className="bg-amber-50 dark:bg-amber-950/30 border-b border-amber-200 dark:border-amber-800 px-4 py-3">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/50 flex items-center justify-center shrink-0">
                <Users className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <p className="text-sm font-medium text-amber-900 dark:text-amber-100">Welcome! Import your existing clients and job history to get started.</p>
                <p className="text-xs text-amber-700 dark:text-amber-300">Supports HouseCall Pro exports, Google Contacts, and generic CSV files.</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <a
                href="/onboarding"
                className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
              >
                <Upload className="w-3.5 h-3.5" /> Import Data
              </a>
              <button
                type="button"
                onClick={() => {
                  try { localStorage.setItem('hp_onboarding_dismissed', '1'); } catch {}
                  setOnboardingDismissed(true);
                }}
                className="text-xs text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Hero header ──────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-[oklch(0.32_0.14_255)] to-[oklch(0.42_0.14_255)] text-white px-6 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Good {new Date().getHours() < 12 ? 'morning' : new Date().getHours() < 17 ? 'afternoon' : 'evening'}, Estimator 👋</h1>
              <p className="text-white/70 text-sm mt-1">{today}</p>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <div className="bg-white/10 rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold font-mono">{activeJobsCount}</div>
                <div className="text-xs text-white/70">Active Jobs</div>
              </div>
              <div className="bg-white/10 rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold font-mono">{openEstimatesCount}</div>
                <div className="text-xs text-white/70">Open Estimates</div>
              </div>
              <div className="bg-white/10 rounded-lg px-4 py-2 text-center">
                <div className="text-xl font-bold font-mono">{fmt$(outstandingBalance)}</div>
                <div className="text-xs text-white/70">Outstanding</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 space-y-8">

        {/* ── KPI Cards ─────────────────────────────────────── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
          <KpiCard
            icon={Target}
            iconColor="bg-blue-100 text-blue-600"
            label="Pipeline Value"
            value={fmt$(pipelineValue)}
            sub={`${leads.length + estimates.length + jobs.length} opportunities`}
            trend="up"
            trendLabel="active"
            sparkData={revenueByMonth.map(m => m.invoiced)}
            sparkColor="#3b82f6"
            onClick={() => setSection('pipeline')}
          />
          <KpiCard
            icon={Briefcase}
            iconColor="bg-violet-100 text-violet-600"
            label="Active Jobs"
            value={String(activeJobsCount)}
            sub={`${jobs.length} total jobs`}
            trend={activeJobsCount > 0 ? 'up' : 'flat'}
            trendLabel={activeJobsCount > 0 ? 'in pipeline' : 'none'}
            onClick={() => setSection('jobs')}
          />
          <KpiCard
            icon={FileText}
            iconColor="bg-amber-100 text-amber-600"
            label="Open Estimates"
            value={String(openEstimatesCount)}
            sub={`${estConvRate}% close rate`}
            trend={openEstimatesCount > 0 ? 'up' : 'flat'}
            trendLabel={`${approvedEsts} approved`}
            onClick={() => setSection('pipeline')}
          />
          <KpiCard
            icon={Users}
            iconColor="bg-sky-100 text-sky-600"
            label="Total Customers"
            value={String(allCustomers.length)}
            sub={`${leads.filter(l => isThisMonth(l.createdAt)).length} new leads this month`}
            trend={leadsThisMonth > 0 ? 'up' : 'flat'}
            trendLabel={`${leadsThisMonth} this month`}
            onClick={() => setSection('customers')}
          />
          <KpiCard
            icon={DollarSign}
            iconColor="bg-emerald-100 text-emerald-600"
            label="Revenue Collected"
            value={fmt$(revenueCollected)}
            sub={`${fmt$(outstandingBalance)} outstanding`}
            trend={revenueCollected > 0 ? 'up' : 'flat'}
            trendLabel="collected"
            sparkData={revenueByMonth.map(m => m.revenue)}
            sparkColor="#10b981"
          />
        </div>

        {/* ── Revenue Chart + Pipeline Funnel ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">

          {/* Revenue chart (3/5 width) */}
          <div className="lg:col-span-3 bg-white rounded-xl border border-border p-5 shadow-sm">
            <SectionHeader
              title="Revenue Overview"
              sub="Invoiced vs. collected — last 6 months"
            />
            <div className="h-52">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={revenueByMonth} barGap={4} barCategoryGap="30%">
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => v === 0 ? '$0' : fmt$(v)} width={52} />
                  <Tooltip
                    formatter={(value: number, name: string) => [fmtFull$(value), name === 'invoiced' ? 'Invoiced' : 'Collected']}
                    contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                  />
                  <Bar dataKey="invoiced" fill="#bfdbfe" radius={[4, 4, 0, 0]} name="invoiced" />
                  <Bar dataKey="revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} name="revenue" />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-200 inline-block" /> Invoiced</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-blue-500 inline-block" /> Collected</span>
            </div>
          </div>

          {/* Pipeline funnel (2/5 width) */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-border p-5 shadow-sm">
            <SectionHeader
              title="Pipeline Funnel"
              sub="Leads → Estimates → Jobs → Invoiced"
              action="View Pipeline"
              onAction={() => setSection('pipeline')}
            />
            <div className="space-y-3">
              {funnelData.map((stage, i) => (
                <div key={stage.label}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium text-foreground">{stage.label}</span>
                    <span className="text-muted-foreground font-mono text-xs">{stage.count} · {fmt$(stage.value)}</span>
                  </div>
                  <div className="h-2.5 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${stage.color}`}
                      style={{ width: `${Math.min(stage.pct, 100)}%` }}
                    />
                  </div>
                  {i < funnelData.length - 1 && (
                    <div className="text-xs text-muted-foreground mt-1 text-right">
                      {funnelData[i + 1].count > 0 && stage.count > 0
                        ? `${Math.round((funnelData[i + 1].count / stage.count) * 100)}% converted`
                        : '—'}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Conversion summary */}
            <div className="mt-5 pt-4 border-t border-border grid grid-cols-2 gap-3">
              <div className="text-center">
                <div className="text-xl font-bold font-mono text-emerald-600">{leadConvRate}%</div>
                <div className="text-xs text-muted-foreground">Lead → Won</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-bold font-mono text-blue-600">{estConvRate}%</div>
                <div className="text-xs text-muted-foreground">Est. Close Rate</div>
              </div>
            </div>
          </div>
        </div>

        {/* ── Active Jobs + Estimates Needing Attention ─────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

          {/* Active jobs */}
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <SectionHeader
              title="Active Jobs"
              sub="In Progress, Scheduled, Deposit Needed"
              action="All Jobs"
              onAction={() => setSection('jobs')}
            />
            {urgentJobs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Briefcase className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No active jobs right now</p>
              </div>
            ) : (
              <div className="space-y-2">
                {urgentJobs.map(job => {
                  const customer = oppCustomer(job);
                  return (
                    <button
                      key={job.id}
                      onClick={() => openOpp(job)}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                        <Wrench className="w-4 h-4 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground truncate">{job.title}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${stageColor(job.stage)}`}>
                            {job.stage}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {customer?.displayName || customer?.firstName} · {job.jobNumber || '—'} · {fmtFull$(job.value)}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Estimates needing attention */}
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <SectionHeader
              title="Estimates Needing Attention"
              sub="Sent, Verbal Acceptance, Return Call Needed"
              action="All Estimates"
              onAction={() => setSection('pipeline')}
            />
            {needsAttention.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <FileText className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No estimates pending follow-up</p>
              </div>
            ) : (
              <div className="space-y-2">
                {needsAttention.map(est => {
                  const customer = oppCustomer(est);
                  const age = daysSince(est.updatedAt);
                  const ageColor = age > 7 ? 'text-red-500' : age > 3 ? 'text-amber-500' : 'text-muted-foreground';
                  return (
                    <button
                      key={est.id}
                      onClick={() => openOpp(est)}
                      className="w-full text-left flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center shrink-0">
                        <FileText className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm text-foreground truncate">{est.title}</span>
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium shrink-0 ${stageColor(est.stage)}`}>
                            {est.stage}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {customer?.displayName || customer?.firstName} · {fmtFull$(est.value)}
                          <span className={`ml-2 ${ageColor}`}>{age}d ago</span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Recent Activity + Quick Actions ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

          {/* Recent activity (2/3) */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-border p-5 shadow-sm">
            <SectionHeader
              title="Recent Activity"
              sub="Latest events across all customers"
            />
            {recentActivity.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="w-8 h-8 mx-auto mb-2 opacity-30" />
                <p className="text-sm">No activity yet — start by adding a customer</p>
              </div>
            ) : (
              <div className="space-y-1">
                {recentActivity.map(({ event, customerName, customerId }) => {
                  const Icon = ACTIVITY_ICON[event.type] ?? Activity;
                  const iconCls = ACTIVITY_COLOR[event.type] ?? 'bg-gray-100 text-gray-500';
                  return (
                    <button
                      key={event.id}
                      onClick={() => setActiveCustomer(customerId)}
                      className="w-full text-left flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors group"
                    >
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${iconCls}`}>
                        <Icon className="w-3.5 h-3.5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{event.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{customerName} · {event.description}</div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0">{timeAgo(event.timestamp)}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick actions (1/3) */}
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <SectionHeader title="Quick Actions" sub="Jump to common tasks" />
            <div className="grid grid-cols-2 gap-2">
              {quickActions.map(qa => (
                <button
                  key={qa.label}
                  onClick={qa.action}
                  className={`flex flex-col items-center gap-2 p-3 rounded-xl border text-center transition-all hover:shadow-sm hover:scale-[1.02] active:scale-[0.98] ${qa.color}`}
                >
                  <qa.icon className="w-5 h-5" />
                  <span className="text-xs font-medium leading-tight">{qa.label}</span>
                </button>
              ))}
            </div>

            {/* Outstanding invoices summary */}
            {outstandingBalance > 0 && (
              <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="flex items-center gap-2 text-amber-700">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <div>
                    <div className="text-xs font-semibold">Outstanding Balance</div>
                    <div className="text-base font-bold font-mono">{fmtFull$(outstandingBalance)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Top Customers ─────────────────────────────────── */}
        {allCustomers.length > 0 && (
          <div className="bg-white rounded-xl border border-border p-5 shadow-sm">
            <SectionHeader
              title="Top Customers"
              sub="By lifetime value"
              action="All Customers"
              onAction={() => setSection('customers')}
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[...allCustomers]
                .sort((a, b) => (b.lifetimeValue || 0) - (a.lifetimeValue || 0))
                .slice(0, 6)
                .map(customer => {
                  const custOpps = (customer.opportunities ?? []).filter(o => !o.archived);
                  return (
                    <button
                      key={customer.id}
                      onClick={() => setActiveCustomer(customer.id)}
                      className="flex items-center gap-3 p-3 rounded-lg border border-border hover:bg-accent transition-colors text-left group"
                    >
                      <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-primary font-bold text-sm">
                        {(customer.firstName?.[0] || customer.displayName?.[0] || '?').toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-foreground truncate">
                          {customer.displayName || `${customer.firstName} ${customer.lastName}`}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {custOpps.length} opp{custOpps.length !== 1 ? 's' : ''} · {fmtFull$(customer.lifetimeValue || 0)}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                    </button>
                  );
                })}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
