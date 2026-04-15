/**
 * FinancialsPage — revenue overview, P&L, outstanding invoices, top customers, recent payments.
 * All amounts from DB are in cents; divide by 100 for display.
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DollarSign, TrendingUp, AlertCircle, CheckCircle2,
  Clock, Users, CreditCard, BarChart3, TrendingDown,
  Download, Mail, MessageSquare, ChevronDown, Receipt, Building2, Briefcase,
} from "lucide-react";
import BusinessExpensesPanel from "@/components/BusinessExpensesPanel";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, LineChart, Line,
} from "recharts";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import jsPDF from "jspdf";

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

/** Returns Tailwind classes for aging badge based on days overdue */
function agingClass(daysOverdue: number): string {
  if (daysOverdue <= 0) return "bg-emerald-100 text-emerald-800 border-emerald-200";
  if (daysOverdue <= 30) return "bg-yellow-100 text-yellow-800 border-yellow-200";
  if (daysOverdue <= 60) return "bg-orange-100 text-orange-800 border-orange-200";
  return "bg-red-100 text-red-800 border-red-200";
}

function agingLabel(daysOverdue: number): string {
  if (daysOverdue <= 0) return "Current";
  if (daysOverdue <= 30) return `${daysOverdue}d`;
  if (daysOverdue <= 60) return `${daysOverdue}d`;
  return `${daysOverdue}d`;
}

const EXPENSE_COLORS: Record<string, string> = {
  materials:     "#3b82f6",
  labor:         "#8b5cf6",
  subcontractor: "#6366f1",
  equipment:     "#f97316",
  fuel:          "#f59e0b",
  permits:       "#14b8a6",
  other:         "#6b7280",
};

const EXPENSE_LABELS: Record<string, string> = {
  materials:     "Materials",
  labor:         "Labor",
  subcontractor: "Subcontractor",
  equipment:     "Equipment",
  fuel:          "Fuel/Travel",
  permits:       "Permits",
  other:         "Other",
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

// ─── SEND REMINDER DIALOG ────────────────────────────────────────────────────

function SendReminderDialog({
  invoiceId,
  invoiceNumber,
  customerName,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string;
  customerName: string;
  onClose: () => void;
}) {
  const [channels, setChannels] = useState<string[]>(["email"]);
  const sendMutation = trpc.financials.sendReminder.useMutation({
    onSuccess: (data) => {
      const ok = data.results.filter(r => r.success).map(r => r.channel).join(", ");
      const fail = data.results.filter(r => !r.success);
      if (ok) toast.success(`Reminder sent via ${ok}`);
      if (fail.length) toast.error(`Failed: ${fail.map(r => `${r.channel}: ${r.error}`).join("; ")}`);
      onClose();
    },
    onError: (e) => {
      toast.error(e.message);
    },
  });

  const toggle = (ch: string) => {
    setChannels(prev =>
      prev.includes(ch) ? prev.filter(c => c !== ch) : [...prev, ch]
    );
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="w-4 h-4 text-blue-600" />
            Send Payment Reminder
          </DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-3">
          <p className="text-sm text-muted-foreground">
            Send a reminder to <strong>{customerName}</strong> for invoice{" "}
            <strong>{invoiceNumber}</strong>.
          </p>
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Send via</p>
            {["email", "sms"].map(ch => (
              <label key={ch} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={channels.includes(ch)}
                  onChange={() => toggle(ch)}
                  className="rounded"
                />
                <span className="text-sm capitalize flex items-center gap-1.5">
                  {ch === "email" ? <Mail className="w-3.5 h-3.5" /> : <MessageSquare className="w-3.5 h-3.5" />}
                  {ch === "email" ? "Email" : "SMS"}
                </span>
              </label>
            ))}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button
            size="sm"
            disabled={channels.length === 0 || sendMutation.isPending}
            onClick={() =>
              sendMutation.mutate({
                invoiceId,
                channels: channels as ("email" | "sms")[],
                origin: window.location.origin,
              })
            }
          >
            {sendMutation.isPending ? "Sending…" : "Send Reminder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────

export default function FinancialsPage() {
  const [chartMonths, setChartMonths] = useState(12);
  const [reminderInvoice, setReminderInvoice] = useState<{
    id: string; invoiceNumber: string; customerName: string;
  } | null>(null);

  const { data: summary, isLoading: summaryLoading } = trpc.financials.getSummary.useQuery();
  const { data: revenueData, isLoading: revenueLoading } = trpc.financials.getRevenueByMonth.useQuery(
    { months: chartMonths }
  );
  const { data: pnlData, isLoading: pnlLoading } = trpc.financials.getPnLByMonth.useQuery(
    { months: chartMonths }
  );
  const { data: expenseSummary } = trpc.financials.getExpenseSummary.useQuery({});
  const { data: outstanding, isLoading: outstandingLoading } = trpc.financials.getOutstandingInvoices.useQuery(
    { limit: 50 }
  );
  const { data: topCustomers, isLoading: topLoading } = trpc.financials.getTopCustomers.useQuery(
    { limit: 10 }
  );
  const { data: recentPayments, isLoading: paymentsLoading } = trpc.financials.getRecentPayments.useQuery(
    { limit: 20 }
  );
  const { data: csvData } = trpc.financials.exportCsv.useQuery(
    { months: chartMonths },
    { enabled: false }
  );
  const exportCsvQuery = trpc.financials.exportCsv.useQuery(
    { months: chartMonths },
    { enabled: false }
  );

  // Chart data: convert cents → dollars for recharts display
  const chartData = (revenueData ?? []).map((r) => ({
    label: r.label,
    Invoiced: r.invoiced / 100,
    Collected: r.collected / 100,
  }));

  const pnlChartData = (pnlData ?? []).map((r) => ({
    label: r.label,
    Revenue: r.revenue / 100,
    Expenses: r.expenseTotal / 100,
    "Gross Profit": r.grossProfit / 100,
  }));

  const collectionRate =
    summary && summary.totalInvoiced > 0
      ? Math.round((summary.totalCollected / summary.totalInvoiced) * 100)
      : 0;

  // P&L totals from pnlData
  const totalRevenue = (pnlData ?? []).reduce((s, r) => s + r.revenue, 0);
  const totalExpenses = (pnlData ?? []).reduce((s, r) => s + r.expenseTotal, 0);
  const totalGrossProfit = totalRevenue - totalExpenses;
  const grossMargin = totalRevenue > 0 ? Math.round((totalGrossProfit / totalRevenue) * 100) : 0;

  // Aging buckets
  const aging = {
    current: (outstanding ?? []).filter(i => i.daysOverdue <= 0).length,
    d30: (outstanding ?? []).filter(i => i.daysOverdue > 0 && i.daysOverdue <= 30).length,
    d60: (outstanding ?? []).filter(i => i.daysOverdue > 30 && i.daysOverdue <= 60).length,
    d90: (outstanding ?? []).filter(i => i.daysOverdue > 60).length,
  };

  const handleExportCsv = useCallback(async () => {
    const result = await exportCsvQuery.refetch();
    const csv = result.data;
    if (!csv) { toast.error("No data to export"); return; }
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `hp-financials-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exported");
  }, [exportCsvQuery]);

  const handleExportPdf = useCallback(() => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    let y = 20;

    // Header
    doc.setFontSize(18);
    doc.setFont("helvetica", "bold");
    doc.text("Handy Pioneers — Financial Summary", 20, y);
    y += 8;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(100);
    doc.text(`Generated: ${new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}`, 20, y);
    doc.text(`Period: Last ${chartMonths} months`, pageW - 20, y, { align: "right" });
    y += 10;

    // KPI row
    doc.setTextColor(0);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("P&L Summary", 20, y);
    y += 6;
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    const kpis = [
      ["Total Revenue (Collected)", fmtShort(totalRevenue)],
      ["Total Expenses", fmtShort(totalExpenses)],
      ["Gross Profit", fmtShort(totalGrossProfit)],
      ["Gross Margin", `${grossMargin}%`],
    ];
    for (const [k, v] of kpis) {
      doc.text(k, 20, y);
      doc.text(v, pageW - 20, y, { align: "right" });
      y += 6;
    }
    y += 4;

    // Monthly P&L table
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.text("Monthly P&L", 20, y);
    y += 6;
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Month", 20, y);
    doc.text("Revenue", 70, y, { align: "right" });
    doc.text("Expenses", 110, y, { align: "right" });
    doc.text("Gross Profit", 155, y, { align: "right" });
    doc.text("Margin", pageW - 20, y, { align: "right" });
    y += 1;
    doc.line(20, y, pageW - 20, y);
    y += 4;
    doc.setFont("helvetica", "normal");
    for (const r of pnlData ?? []) {
      const margin = r.revenue > 0 ? Math.round((r.grossProfit / r.revenue) * 100) : 0;
      doc.text(r.label, 20, y);
      doc.text(fmtShort(r.revenue), 70, y, { align: "right" });
      doc.text(fmtShort(r.expenseTotal), 110, y, { align: "right" });
      doc.text(fmtShort(r.grossProfit), 155, y, { align: "right" });
      doc.text(`${margin}%`, pageW - 20, y, { align: "right" });
      y += 5;
      if (y > 270) { doc.addPage(); y = 20; }
    }
    y += 4;

    // Expense breakdown
    if (expenseSummary && expenseSummary.total > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Expense Breakdown by Category", 20, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      for (const [cat, amt] of Object.entries(expenseSummary.byCategory)) {
        const pct = Math.round((amt / expenseSummary.total) * 100);
        doc.text(EXPENSE_LABELS[cat] ?? cat, 20, y);
        doc.text(`${fmtShort(amt)} (${pct}%)`, pageW - 20, y, { align: "right" });
        y += 5;
      }
      y += 4;
    }

    // Outstanding invoices
    if ((outstanding ?? []).length > 0) {
      if (y > 220) { doc.addPage(); y = 20; }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(11);
      doc.text("Outstanding Invoices", 20, y);
      y += 6;
      doc.setFontSize(9);
      doc.setFont("helvetica", "bold");
      doc.text("Invoice #", 20, y);
      doc.text("Customer", 60, y);
      doc.text("Balance", 130, y, { align: "right" });
      doc.text("Days Overdue", pageW - 20, y, { align: "right" });
      y += 1;
      doc.line(20, y, pageW - 20, y);
      y += 4;
      doc.setFont("helvetica", "normal");
      for (const inv of outstanding ?? []) {
        doc.text(inv.invoiceNumber ?? "", 20, y);
        doc.text(inv.customerName.slice(0, 30), 60, y);
        doc.text(fmtShort(inv.balance), 130, y, { align: "right" });
        doc.text(inv.daysOverdue > 0 ? `${inv.daysOverdue}d` : "Current", pageW - 20, y, { align: "right" });
        y += 5;
        if (y > 270) { doc.addPage(); y = 20; }
      }
    }

    doc.save(`hp-financials-${new Date().toISOString().slice(0, 10)}.pdf`);
    toast.success("PDF exported");
  }, [pnlData, expenseSummary, outstanding, totalRevenue, totalExpenses, totalGrossProfit, grossMargin, chartMonths]);

  return (
    <div className="min-h-screen bg-background">
      <div className="container py-6 max-w-7xl">

        {/* ── PAGE HEADER ───────────────────────────────────────── */}
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <DollarSign className="w-6 h-6 text-emerald-600" />
              Financials
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Revenue, P&amp;L, invoices, payments, and collection metrics
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Export
                <ChevronDown className="w-3 h-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleExportCsv}>
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportPdf}>
                Export PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
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

        {/* ── P&L KPI CARDS ───────────────────────────────────── */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-6">
          {pnlLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <Card key={i}><CardContent className="pt-5 pb-4"><Skeleton className="h-16 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <KpiCard
                label="Revenue (Collected)"
                value={fmtShort(totalRevenue)}
                sub={`Last ${chartMonths} months`}
                icon={TrendingUp}
                color="bg-emerald-600"
              />
              <KpiCard
                label="Job Expenses"
                value={fmtShort(expenseSummary?.byScope?.job ?? 0)}
                sub="Linked to jobs"
                icon={Briefcase}
                color="bg-amber-500"
              />
              <KpiCard
                label="Business Overhead"
                value={fmtShort(expenseSummary?.byScope?.business ?? 0)}
                sub="General operating costs"
                icon={Building2}
                color="bg-orange-500"
              />
              <KpiCard
                label="Gross Profit"
                value={fmtShort(totalGrossProfit)}
                sub={totalGrossProfit >= 0 ? "Positive margin" : "Negative margin"}
                icon={totalGrossProfit >= 0 ? TrendingUp : TrendingDown}
                color={totalGrossProfit >= 0 ? "bg-teal-500" : "bg-red-500"}
              />
              <KpiCard
                label="Gross Margin"
                value={`${grossMargin}%`}
                sub={grossMargin >= 30 ? "Above 30% floor ✓" : "Below 30% floor ⚠"}
                icon={BarChart3}
                color={grossMargin >= 30 ? "bg-emerald-500" : "bg-red-500"}
              />
            </>
          )}
        </div>

        {/* ── INVOICE AGING SUMMARY ─────────────────────────────── */}
        {(outstanding ?? []).length > 0 && (
          <div className="grid grid-cols-4 gap-3 mb-6">
            {[
              { label: "Current", count: aging.current, cls: "bg-emerald-50 border-emerald-200 text-emerald-800" },
              { label: "1–30 days", count: aging.d30, cls: "bg-yellow-50 border-yellow-200 text-yellow-800" },
              { label: "31–60 days", count: aging.d60, cls: "bg-orange-50 border-orange-200 text-orange-800" },
              { label: "60+ days", count: aging.d90, cls: "bg-red-50 border-red-200 text-red-800" },
            ].map(b => (
              <div key={b.label} className={`rounded-lg border px-4 py-3 text-center ${b.cls}`}>
                <p className="text-2xl font-bold">{b.count}</p>
                <p className="text-xs font-medium mt-0.5">{b.label}</p>
              </div>
            ))}
          </div>
        )}

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
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtShort(v * 100)} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Invoiced" fill="#3b82f6" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Collected" fill="#10b981" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── P&L CHART ─────────────────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Profit &amp; Loss</CardTitle>
            <CardDescription>Revenue vs. expenses and gross profit by month</CardDescription>
          </CardHeader>
          <CardContent>
            {pnlLoading ? (
              <Skeleton className="h-56 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={pnlChartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => fmtShort(v * 100)} width={56} />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="Revenue" fill="#10b981" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Expenses" fill="#f97316" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="Gross Profit" fill="#6366f1" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── EXPENSE BREAKDOWN ─────────────────────────────────── */}
        {expenseSummary && expenseSummary.total > 0 && (
          <Card className="mb-6">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-orange-600" />
                Expense Breakdown by Category
              </CardTitle>
              <CardDescription>
                All expenses (job + business) · Job: {fmtShort(expenseSummary.byScope?.job ?? 0)} · Business overhead: {fmtShort(expenseSummary.byScope?.business ?? 0)}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {Object.entries(expenseSummary.byCategory)
                  .sort(([, a], [, b]) => b - a)
                  .map(([cat, amt]) => {
                    const pct = Math.round((amt / expenseSummary.total) * 100);
                    return (
                      <div key={cat} className="flex items-center gap-3">
                        <div className="w-24 shrink-0 text-xs font-medium text-muted-foreground">
                          {EXPENSE_LABELS[cat] ?? cat}
                        </div>
                        <div className="flex-1 bg-muted rounded-full h-2 overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: EXPENSE_COLORS[cat] ?? "#6b7280",
                            }}
                          />
                        </div>
                        <div className="w-20 text-right text-xs font-semibold shrink-0">
                          {fmtShort(amt)}
                          <span className="text-muted-foreground font-normal ml-1">({pct}%)</span>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </CardContent>
          </Card>
        )}

        {/* ── FULL EXPENSE LEDGER ───────────────────────────────── */}
        <Card className="mb-6">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-1.5">
                  <Receipt className="w-4 h-4 text-orange-600" />
                  Expense Ledger
                </CardTitle>
                <CardDescription>
                  All job and business expenses — add overhead costs directly here
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <BusinessExpensesPanel />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">

          {/* ── OUTSTANDING INVOICES ──────────────────────────────── */}
          <div className="lg:col-span-2">
            <Card className="h-full">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Outstanding Invoices</CardTitle>
                <CardDescription>Unpaid invoices with aging badges — click bell to send reminder</CardDescription>
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
                          <th className="text-center pb-2 font-medium">Age</th>
                          <th className="text-right pb-2 font-medium">Status</th>
                          <th className="text-right pb-2 font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {outstanding.map((inv) => (
                          <tr key={inv.id} className="border-b last:border-0 hover:bg-muted/40 transition-colors">
                            <td className="py-2 font-mono text-xs">{inv.invoiceNumber}</td>
                            <td className="py-2 max-w-[120px] truncate">{inv.customerName}</td>
                            <td className="py-2 text-right font-semibold">{fmt(inv.balance)}</td>
                            <td className="py-2 text-center">
                              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold border ${agingClass(inv.daysOverdue)}`}>
                                {agingLabel(inv.daysOverdue)}
                              </span>
                            </td>
                            <td className="py-2 text-right">
                              <Badge variant={STATUS_BADGE[inv.status]?.variant ?? "outline"} className="text-[10px]">
                                {STATUS_BADGE[inv.status]?.label ?? inv.status}
                              </Badge>
                            </td>
                            <td className="py-2 text-right">
                              {inv.daysOverdue > 0 && (
                                <button
                                  onClick={() => setReminderInvoice({
                                    id: inv.id,
                                    invoiceNumber: inv.invoiceNumber ?? inv.id,
                                    customerName: inv.customerName,
                                  })}
                                  className="text-xs text-blue-600 hover:text-blue-800 font-medium transition-colors"
                                  title="Send payment reminder"
                                >
                                  Remind
                                </button>
                              )}
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

      {/* ── SEND REMINDER DIALOG ──────────────────────────────────── */}
      {reminderInvoice && (
        <SendReminderDialog
          invoiceId={reminderInvoice.id}
          invoiceNumber={reminderInvoice.invoiceNumber}
          customerName={reminderInvoice.customerName}
          onClose={() => setReminderInvoice(null)}
        />
      )}
    </div>
  );
}
