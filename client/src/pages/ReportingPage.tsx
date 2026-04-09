// ============================================================
// ReportingPage — Revenue analytics, job funnel, top customers
// HP Industrial design: dark slate, amber accents
// ============================================================

import { useMemo } from 'react';
import { useEstimator } from '@/contexts/EstimatorContext';
import { BarChart2, TrendingUp, DollarSign, Briefcase, Users, AlertCircle, CheckCircle2, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function fmtDollar(v: number) {
  return v.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 });
}

function fmtPct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
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
  const { opportunities, customers, invoices } = state;

  // ── Revenue by month (last 6 months) ──────────────────────────
  const monthlyRevenue = useMemo(() => {
    const now = new Date();
    const months: { label: string; value: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = d.toLocaleString('en-US', { month: 'short', year: '2-digit' });
      const monthStart = d.getTime();
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime();
      const value = invoices
        .filter(inv => {
          const t = inv.issuedAt ? new Date(inv.issuedAt).getTime() : 0;
          return t >= monthStart && t <= monthEnd && (inv.status === 'paid' || inv.status === 'partial');
        })
        .reduce((s, inv) => s + (inv.amountPaid ?? 0), 0);
      months.push({ label, value });
    }
    return months;
  }, [invoices]);

  const maxMonthlyRevenue = Math.max(...monthlyRevenue.map(m => m.value), 1);

  // ── Job funnel ────────────────────────────────────────────────
  const funnel = useMemo(() => {
    const leads = opportunities.filter(o => o.area === 'lead' && !o.archived).length;
    const estimates = opportunities.filter(o => o.area === 'estimate' && !o.archived).length;
    const jobs = opportunities.filter(o => o.area === 'job' && !o.archived).length;
    const won = opportunities.filter(o => o.wonAt).length;
    return [
      { label: 'Leads', value: leads, color: 'bg-sky-500' },
      { label: 'Estimates', value: estimates, color: 'bg-amber-500' },
      { label: 'Active Jobs', value: jobs, color: 'bg-indigo-500' },
      { label: 'Won', value: won, color: 'bg-emerald-500' },
    ];
  }, [opportunities]);

  const maxFunnel = Math.max(...funnel.map(f => f.value), 1);

  // ── Top customers by lifetime value ──────────────────────────
  const topCustomers = useMemo(() => {
    return [...customers]
      .filter(c => c.lifetimeValue > 0)
      .sort((a, b) => b.lifetimeValue - a.lifetimeValue)
      .slice(0, 8)
      .map(c => ({
        label: c.displayName || `${c.firstName} ${c.lastName}`.trim() || 'Unknown',
        value: c.lifetimeValue,
      }));
  }, [customers]);

  const maxCustomerValue = Math.max(...topCustomers.map(c => c.value), 1);

  // ── Open invoices summary ─────────────────────────────────────
  const openInvoices = useMemo(() => {
    const open = invoices.filter(inv => inv.status === 'unpaid' || inv.status === 'partial');
    const overdue = open.filter(inv => inv.dueDate && new Date(inv.dueDate).getTime() < Date.now());
    const totalOpen = open.reduce((s, inv) => s + (inv.total - (inv.amountPaid ?? 0)), 0);
    const totalOverdue = overdue.reduce((s, inv) => s + (inv.total - (inv.amountPaid ?? 0)), 0);
    return { count: open.length, overdueCount: overdue.length, totalOpen, totalOverdue };
  }, [invoices]);

  // ── KPI cards ─────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const totalRevenue = invoices.reduce((s, inv) => s + (inv.amountPaid ?? 0), 0);
    const totalJobs = opportunities.filter(o => o.area === 'job').length;
    const avgJobValue = totalJobs > 0 ? opportunities.filter(o => o.area === 'job').reduce((s, o) => s + o.value, 0) / totalJobs : 0;
    const wonOpps = opportunities.filter(o => o.wonAt).length;
    const totalOpps = opportunities.length;
    const winRate = totalOpps > 0 ? wonOpps / totalOpps : 0;
    return { totalRevenue, totalJobs, avgJobValue, winRate };
  }, [opportunities, invoices]);

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <BarChart2 className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-foreground">Reporting</h1>
            <p className="text-sm text-muted-foreground">Business analytics and performance overview</p>
          </div>
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
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Win Rate</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{fmtPct(kpis.winRate)}</div>
            <div className="text-xs text-muted-foreground mt-1">{opportunities.filter(o => o.wonAt).length} won of {opportunities.length}</div>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <div className="flex items-center gap-2 mb-2">
              <Users size={15} className="text-violet-500" />
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Customers</span>
            </div>
            <div className="text-2xl font-bold text-foreground">{customers.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Total in CRM</div>
          </div>
        </div>

        {/* Revenue Chart + Open Invoices */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 rounded-xl border bg-card p-5">
            <h2 className="text-sm font-semibold text-foreground mb-4">Revenue — Last 6 Months</h2>
            {monthlyRevenue.every(m => m.value === 0) ? (
              <div className="py-10 text-center text-muted-foreground text-sm">No revenue data yet. Invoices will populate this chart.</div>
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
                  <span className="text-sm text-muted-foreground">Open</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold">{fmtDollar(openInvoices.totalOpen)}</div>
                  <div className="text-xs text-muted-foreground">{openInvoices.count} invoices</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle size={14} className="text-rose-500" />
                  <span className="text-sm text-muted-foreground">Overdue</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-rose-600">{fmtDollar(openInvoices.totalOverdue)}</div>
                  <div className="text-xs text-muted-foreground">{openInvoices.overdueCount} invoices</div>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={14} className="text-emerald-500" />
                  <span className="text-sm text-muted-foreground">Collected</span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-bold text-emerald-600">{fmtDollar(kpis.totalRevenue)}</div>
                  <div className="text-xs text-muted-foreground">{invoices.filter(i => i.status === 'paid').length} paid</div>
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
            <h2 className="text-sm font-semibold text-foreground mb-4">Top Customers by LTV</h2>
            {topCustomers.length === 0 ? (
              <div className="py-10 text-center text-muted-foreground text-sm">No customer revenue data yet.</div>
            ) : (
              <BarChart data={topCustomers} maxValue={maxCustomerValue} color="bg-violet-500" />
            )}
          </div>
        </div>

        {/* Invoice status breakdown */}
        <div className="rounded-xl border bg-card p-5">
          <h2 className="text-sm font-semibold text-foreground mb-4">Invoice Status Breakdown</h2>
          {invoices.length === 0 ? (
            <div className="py-6 text-center text-muted-foreground text-sm">No invoices yet.</div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {(['draft', 'sent', 'due', 'partial', 'paid', 'void'] as const).map(status => {
                const count = invoices.filter(i => i.status === status).length;
                const total = invoices.filter(i => i.status === status).reduce((s, i) => s + i.total, 0);
                const colorMap: Record<string, string> = {
                  draft: 'bg-slate-100 text-slate-700',
                  sent: 'bg-sky-100 text-sky-800',
                  due: 'bg-orange-100 text-orange-800',
                  partial: 'bg-amber-100 text-amber-800',
                  paid: 'bg-emerald-100 text-emerald-800',
                  void: 'bg-rose-100 text-rose-800',
                  pending_signoff: 'bg-violet-100 text-violet-800',
                };
                return (
                  <div key={status} className={`rounded-lg px-4 py-3 ${colorMap[status]} min-w-[120px]`}>
                    <div className="text-xs font-semibold uppercase tracking-wider capitalize mb-1">{status}</div>
                    <div className="text-lg font-bold">{count}</div>
                    <div className="text-xs opacity-75">{fmtDollar(total)}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
