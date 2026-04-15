/**
 * FinancialsPage — revenue overview, outstanding invoices, top customers, recent payments.
 * All amounts from DB are in cents; divide by 100 for display.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, AlertCircle, CheckCircle2,
  Clock, Users, ArrowUpRight, CreditCard, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer,
} from "recharts";

// ─── HELPERS ─────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(
    (cents ?? 0) / 100
  );

const fmtShort = (cents: number) => {
  const v = (cents ?? 0) / 100;
  if (v >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `$${(v / 1_000).toFixed(1)}k`;
  return `$${v.toFixed(0)}`;
};

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft:           { label: "Draft",    variant: "secondary" },
  sent:            { label: "Sent",     variant: "outline" },
  due:             { label: "Due",      variant: "default" },
  partial:         { label: "Partial",  variant: "default" },
  pending_signoff: { label: "Signoff",  variant: "outline" },
  paid:            { label: "Paid",     variant: "default" },
  void:            { label: "Void",     variant: "secondary" },
};

// ─── KPI CARD ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  color: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{label}</p>
            <p className="text-2xl font-bold mt-1">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
            <Icon className="w-5 h-5 text-white" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── CUSTOM TOOLTIP ──────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.name} style={{ color: p.color }}>
          {p.name}: {fmtShort(p.value * 100)}
        </p>
      ))}
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function FinancialsPage() {
  const [chartMonths, setChartMonths] = useState(12);

  const { data: summary, isLoading: summaryLoading } = trpc.financials.getSummary.useQuery();
  const { data: revenueData, isLoading: revenueLoading } = trpc.financials.getRevenueByMonth.useQuery(
    { months: chartMonths }
  );
  const { data: outstanding, isLoading: outstandingLoading } = trpc.financials.getOutstandingInvoices.useQuery(
    { limit: 50 }
  );
  const { data: topCustomers, isLoading: topLoading } = trpc.financials.getTopCustomers.useQuery(
    { limit: 10 }
  );
  const { data: recentPayments, isLoading: paymentsLoading } = trpc.financials.getRecentPayments.useQuery(
    { limit: 20 }
  );

  // Chart data: convert cents → dollars for recharts display
  const chartData = (revenueData ?? []).map((r) => ({
    label: r.label,
    Invoiced: r.invoiced / 100,
    Collected: r.collected / 100,
  }));

  const collectionRate =
    summary && summary.totalInvoiced > 0
      ? Math.round((summary.totalCollected / summary.totalInvoiced) * 100)
      : 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6 max-w-7xl">

        {/* ── PAGE HEADER ───────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-600" />
              Financials
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Revenue, invoices, payments, and collection metrics
            </p>
          </div>
        </div>

        {/* ── KPI CARDS ─────────────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          {summaryLoading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-5 pb-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <KpiCard
                label="Total Invoiced"
                value={fmtShort(summary?.totalInvoiced ?? 0)}
                sub={`${summary?.invoiceCount ?? 0} invoices`}
                icon={BarChart3}
                color="bg-blue-500"
              />
              <KpiCard
                label="Collected"
                value={fmtShort(summary?.totalCollected ?? 0)}
                sub={`${collectionRate}% collection rate`}
                icon={CheckCircle2}
                color="bg-emerald-500"
              />
              <KpiCard
                label="Outstanding"
                value={fmtShort(summary?.outstanding ?? 0)}
                sub={`${(outstanding ?? []).length} open invoices`}
                icon={Clock}
                color="bg-amber-500"
              />
              <KpiCard
                label="Overdue"
                value={fmtShort(summary?.overdue ?? 0)}
                sub={summary?.overdue ? "Needs attention" : "All current"}
                icon={AlertCircle}
                color={(summary?.overdue ?? 0) > 0 ? "bg-red-500" : "bg-slate-400"}
              />
            </>
          )}
        </div>

        {/* ── REVENUE CHART ─────────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle className="text-base">Revenue Overview</CardTitle>
                <CardDescription>Invoiced vs. collected by month</CardDescription>
              </div>
              <div className="flex gap-1">
                {[3, 6, 12].map((m) => (
                  <Button
                    key={m}
                    size="sm"
                    variant={chartMonths === m ? "default" : "outline"}
                    className="h-7 px-2 text-xs"
                    onClick={() => setChartMonths(m)}
                  >
                    {m}M
                  </Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {revenueLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis
                    tick={{ fontSize: 11 }}
                    tickFormatter={(v) => fmtShort(v * 100)}
                    width={56}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Invoiced" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Collected" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* ── OUTSTANDING INVOICES ──────────────────────────────── */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Outstanding Invoices</CardTitle>
                <CardDescription>Unpaid invoices with remaining balance</CardDescription>
              </CardHeader>
              <CardContent>
                {outstandingLoading ? (
                  <div className="space-y-2">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Skeleton key={i} className="h-10 w-full" />
                    ))}
                  </div>
                ) : !outstanding?.length ? (
                  <div className="flex flex-col items-center justify-center py-10 text-muted-foreground gap-2">
                    <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                    <p className="text-sm font-medium">All invoices are paid</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-xs text-muted-foreground">
                          <th className="text-left pb-2 font-medium">Invoice</th>
                          <th className="text-left pb-2 font-medium">Customer</th>
                          <th className="text-right pb-2 font-medium">Balance</th>
                          <th className="text-right pb-2 font-medium">Due</th>
                          <th className="text-right pb-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outstanding.map((inv) => (
                          <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                            <td className="py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                            <td className="py-2 max-w-[140px] truncate">{inv.customerName}</td>
                            <td className="py-2 text-right font-semibold">{fmt(inv.balance)}</td>
                            <td className="py-2 text-right text-xs">
                              {inv.daysOverdue > 0 ? (
                                <span className="text-red-600 font-medium">{inv.daysOverdue}d overdue</span>
                              ) : (
                                <span className="text-muted-foreground">{inv.dueDate}</span>
                              )}
                            </td>
                            <td className="py-2 text-right">
                              <Badge variant={STATUS_BADGE[inv.status]?.variant ?? "outline"} className="text-[10px]">
                                {STATUS_BADGE[inv.status]?.label ?? inv.status}
                              </Badge>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* ── TOP CUSTOMERS ─────────────────────────────────────── */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                Top Customers
              </CardTitle>
              <CardDescription>By lifetime invoiced value</CardDescription>
            </CardHeader>
            <CardContent>
              {topLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : !topCustomers?.length ? (
                <p className="text-sm text-muted-foreground py-4 text-center">No invoice data yet</p>
              ) : (
                <div className="space-y-2">
                  {topCustomers.map((c, i) => (
                    <div key={c.customerId} className="flex items-center gap-2">
                      <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{c.customerName}</p>
                        <p className="text-xs text-muted-foreground">{c.invoiceCount} invoices</p>
                      </div>
                      <span className="text-sm font-semibold text-emerald-700 shrink-0">
                        {fmtShort(c.totalInvoiced)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── RECENT PAYMENTS ───────────────────────────────────── */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-1.5">
              <CreditCard className="w-4 h-4" />
              Recent Payments
            </CardTitle>
            <CardDescription>Last 20 payments recorded</CardDescription>
          </CardHeader>
          <CardContent>
            {paymentsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : !recentPayments?.length ? (
              <p className="text-sm text-muted-foreground py-4 text-center">No payments recorded yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-xs text-muted-foreground">
                      <th className="text-left pb-2 font-medium">Date</th>
                      <th className="text-left pb-2 font-medium">Customer</th>
                      <th className="text-left pb-2 font-medium">Invoice</th>
                      <th className="text-left pb-2 font-medium">Method</th>
                      <th className="text-right pb-2 font-medium">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentPayments.map((p) => (
                      <tr key={p.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                        <td className="py-2 text-xs text-muted-foreground">{p.paidAt?.slice(0, 10)}</td>
                        <td className="py-2 max-w-[140px] truncate">{p.customerName}</td>
                        <td className="py-2 font-mono text-xs">{p.invoiceNumber}</td>
                        <td className="py-2 capitalize text-xs">{p.method}</td>
                        <td className="py-2 text-right font-semibold text-emerald-700">{fmt(p.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
