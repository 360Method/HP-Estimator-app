// ============================================================
// ReportingPage — Live DB-backed analytics via snapshot sync
// ============================================================

import { useEffect, useRef } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { trpc } from '@/lib/trpc';
import { BarChart2, TrendingUp, DollarSign, Briefcase, Users, AlertCircle, CheckCircle2, Clock, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

function fmtDollar(v: number) {
  // Values from DB are in cents
  return (v / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}

function fmtPct(v: number) {
  return `${v}%`;
}

// Simple bar chart using CSS
function BarChart({ data, maxValue, color = 'bg-primary' }: {
  data: { label: string; value: number }[];
  maxValue: number;
  color?: string;
}) {
  return (
    <div className="space-y-2">
      {data.map(({ label, value }) => (
        <div key={label} className="flex items-center gap-3">
          <div className="w-20 text-xs text-muted-foreground text-right shrink-0 truncate">{label}</div>
          <div className="flex-1 h-6 bg-muted rounded overflow-hidden">
            <div
              className={`h-full ${color} rounded transition-all duration-500`}
              style={{ width: maxValue > 0 ? `${Math.max(2, (value / maxValue) * 100)}%` : '2%' }}
            />
          </div>
          <div className="w-20 text-xs font-semibold text-right shrink-0">{fmtDollar(value)}</div>
        </div>
      ))}
    </div>
  );
}

export default function ReportingPage() {
  const { state } = useEstimator();
  const { opportunities, invoices, customers } = state;

  // ── Snapshot sync ─────────────────────────────────────────────
  const syncMutation = trpc.reporting.syncSnapshot.useMutation();
  const syncedRef = useRef(false);

  useEffect(() => {
    if (syncedRef.current) return;
    syncedRef.current = true;

    // Build snapshot payload from local state
    const oppPayload = opportunities.map(o => ({
      id: o.id,
      area: o.area,
      stage: o.stage,
      title: o.title,
      value: Math.round((o.value ?? 0) * 100), // dollars → cents
      archived: o.archived ?? false,
      wonAt: o.wonAt ? new Date(o.wonAt).toISOString() : null,
      sentAt: o.sentAt ? new Date(o.sentAt).toISOString() : null,
      customerId: o.customerId ?? null,
      customerName: o.clientSnapshot?.client ?? null,
    }));

    // Collect all invoices across customers
    const allInvoices = [
      ...invoices,
      ...customers.flatMap(c => c.invoices ?? []),
    ];
    const seen = new Set<string>();
    const invPayload = allInvoices
      .filter(inv => { if (seen.has(inv.id)) return false; seen.add(inv.id); return true; })
      .map(inv => ({
        id: inv.id,
        opportunityId: inv.opportunityId ?? null,
        customerId: inv.customerId ?? null,
        customerName: null,
        status: inv.status,
        total: Math.round((inv.total ?? 0) * 100),
        amountPaid: Math.round((inv.amountPaid ?? 0) * 100),
        dueDate: inv.dueDate ?? null,
        issuedAt: inv.issuedAt ?? null,
      }));

    syncMutation.mutate(
      { opportunities: oppPayload, invoices: invPayload },
      { onError: () => {} } // silent — reporting is best-effort
    );
  }, []); // run once on mount

  // ── Live metrics query ────────────────────────────────────────
  const { data: metrics, isLoading, refetch } = trpc.reporting.getMetrics.useQuery(undefined, {
    staleTime: 60_000,
  });

  const handleRefresh = () => {
    syncedRef.current = false;
    // Re-trigger sync
    const oppPayload = opportunities.map(o => ({
      id: o.id,
      area: o.area,
      stage: o.stage,
      title: o.title,
      value: Math.round((o.value ?? 0) * 100),
      archived: o.archived ?? false,
      wonAt: o.wonAt ? new Date(o.wonAt).toISOString() : null,
      sentAt: o.sentAt ? new Date(o.sentAt).toISOString() : null,
      customerId: o.customerId ?? null,
      customerName: o.clientSnapshot?.client ?? null,
    }));
    const allInvoices = [...invoices, ...customers.flatMap(c => c.invoices ?? [])];
    const seen = new Set<string>();
    const invPayload = allInvoices
      .filter(inv => { if (seen.has(inv.id)) return false; seen.add(inv.id); return true; })
      .map(inv => ({
        id: inv.id,
        opportunityId: inv.opportunityId ?? null,
        customerId: inv.customerId ?? null,
        customerName: null,
        status: inv.status,
        total: Math.round((inv.total ?? 0) * 100),
        amountPaid: Math.round((inv.amountPaid ?? 0) * 100),
        dueDate: inv.dueDate ?? null,
        issuedAt: inv.issuedAt ?? null,
      }));
    syncMutation.mutate(
      { opportunities: oppPayload, invoices: invPayload },
      {
        onSuccess: () => {
          refetch();
          toast.success('Reporting data refreshed');
        },
      }
    );
  };

  // ── Derived display values ────────────────────────────────────
  const monthlyRevenue = (metrics?.monthlyRevenue ?? []).map(m => ({
    label: m.month.slice(5), // "MM" from "YYYY-MM"
    value: m.revenue,
  }));
  const maxMonthlyRevenue = Math.max(...monthlyRevenue.map(m => m.value), 1);

  const funnel = metrics?.funnel
    ? [
        { label: 'Leads', value: metrics.funnel.leads, color: 'bg-sky-500' },
        { label: 'Estimates', value: metrics.funnel.estimates, color: 'bg-amber-500' },
        { label: 'Active Jobs', value: metrics.funnel.jobs, color: 'bg-indigo-500' },
        { label: 'Won', value: metrics.funnel.won, color: 'bg-emerald-500' },
      ]
    : [];
  const maxFunnel = Math.max(...funnel.map(f => f.value), 1);

  const topCustomers = (metrics?.topCustomers ?? []).map(c => ({
    label: c.name,
    value: c.value,
  }));
  const maxCustomerValue = Math.max(...topCustomers.map(c => c.value), 1);

  const kpis = metrics?.kpis ?? { totalRevenue: 0, totalJobs: 0, avgJobValue: 0, conversionRate: 0 };
  const openSummary = metrics?.openInvoiceSummary ?? { count: 0, totalOwed: 0 };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-3">
          <RefreshCw className="w-8 h-8 text-muted-foreground animate-spin mx-auto" />
          <p className="text-sm text-muted-foreground">Syncing data…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <BarChart2 className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground">Reporting</h1>
              <p className="text-sm text-muted-foreground">Live business analytics from your data</p>
            </div>
          </div>
          <button
            onClick={handleRefresh}
            disabled={syncMutation.isPending}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={syncMutation.isPending ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign size={15} className="text-emerald-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Revenue</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{fmtDollar(kpis.totalRevenue)}</div>
            <div className="text-xs text-muted-foreground mt-1">All time collected</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Briefcase size={15} className="text-sky-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total Jobs</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{kpis.totalJobs}</div>
            <div className="text-xs text-muted-foreground mt-1">Avg {fmtDollar(kpis.avgJobValue)} / job</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp size={15} className="text-amber-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Conversion</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{fmtPct(kpis.conversionRate)}</div>
            <div className="text-xs text-muted-foreground mt-1">Lead → Won rate</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={15} className="text-violet-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Open Invoices</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{openSummary.count}</div>
            <div className="text-xs text-muted-foreground mt-1">{fmtDollar(openSummary.totalOwed)} owed</div>
          </div>
        </div>

        {/* Revenue Chart + Open Invoices */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Revenue — Last 12 Months</h2>
            {monthlyRevenue.every(m => m.value === 0) ? (
              <div className="py-10 text-center text-muted-foreground text-sm">No revenue data yet. Mark invoices as paid to populate this chart.</div>
            ) : (
              <BarChart data={monthlyRevenue} maxValue={maxMonthlyRevenue} color="bg-emerald-500" />
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Open Invoices</h2>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock size={14} className="text-amber-500" />
                  <span className="text-sm text-muted-foreground">Outstanding</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{fmtDollar(openSummary.totalOwed)}</div>
                  <div className="text-xs text-muted-foreground">{openSummary.count} invoices</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-sm text-muted-foreground">Collected</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-600">{fmtDollar(kpis.totalRevenue)}</div>
                  <div className="text-xs text-muted-foreground">all time</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Job Funnel + Top Customers */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Job Funnel</h2>
            {funnel.every(f => f.value === 0) ? (
              <div className="py-10 text-center text-muted-foreground text-sm">No pipeline data yet.</div>
            ) : (
              <div className="space-y-3">
                {funnel.map(({ label, value, color }) => (
                  <div key={label} className="flex items-center gap-3">
                    <div className="w-24 text-xs text-muted-foreground shrink-0">{label}</div>
                    <div className="flex-1 h-7 bg-muted rounded overflow-hidden">
                      <div
                        className={`h-full ${color} rounded transition-all duration-500 flex items-center px-2`}
                        style={{ width: `${Math.max(8, (value / maxFunnel) * 100)}%` }}
                      >
                        <span className="text-white text-xs font-bold">{value}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Top Customers by Job Value</h2>
            {topCustomers.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">No customer revenue data yet.</div>
            ) : (
              <BarChart data={topCustomers} maxValue={maxCustomerValue} color="bg-violet-500" />
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
