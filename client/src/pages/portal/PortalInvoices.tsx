import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, CreditCard, CheckCircle2, AlertTriangle } from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    due: "bg-amber-100 text-amber-700",
    overdue: "bg-red-100 text-red-700",
    draft: "bg-gray-100 text-gray-600",
    sent: "bg-amber-100 text-amber-700",
  };
  const label: Record<string, string> = {
    due: "Due",
    sent: "Due",
    paid: "Paid",
    overdue: "Overdue",
    draft: "Draft",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {label[status] ?? status}
    </span>
  );
}

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalInvoices() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.portal.getInvoices.useQuery();
  const invoices = data ?? [];

  return (
    <PortalLayout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        <p className="text-xs text-gray-400 mb-1">Customer Portal &rsaquo; Invoices</p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Invoices</h1>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-[#2D5016]" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <FileText className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-base">No invoices yet</p>
          </div>
        ) : (
          <>
            {/* Overdue banner */}
            {invoices.some(inv => inv.status !== 'paid' && inv.dueDate && new Date(inv.dueDate) < new Date()) && (
              <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-semibold text-red-700">You have overdue invoices</p>
                  <p className="text-xs text-red-600 mt-0.5">Please pay the outstanding balance to avoid service interruptions.</p>
                </div>
              </div>
            )}
          <div className="space-y-3">
            {invoices.map((inv) => {
              const isPaid = inv.status === "paid";
              const isOverdue = !isPaid && inv.dueDate ? new Date(inv.dueDate) < new Date() : false;
              const displayStatus = isOverdue ? "overdue" : inv.status;
              const balance = (inv.amountDue ?? 0) - (inv.amountPaid ?? 0);
              return (
                <div
                  key={inv.id}
                  className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-3 hover:shadow-sm transition-shadow cursor-pointer"
                  onClick={() => navigate(`/portal/invoices/${inv.id}`)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {isPaid ? (
                      <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                    ) : isOverdue ? (
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0" />
                    ) : (
                      <FileText className="w-5 h-5 text-orange-500 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 text-sm truncate">
                        #{inv.invoiceNumber ?? inv.id}
                        {inv.jobTitle && <span className="font-normal text-gray-500"> — {inv.jobTitle}</span>}
                      </p>
                      <p className="text-xs text-gray-500 mt-0.5">
                        Issued {fmtDate(inv.sentAt)} · Due {fmtDate(inv.dueDate)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0">
                    <div className="text-right">
                      <p className="font-bold text-gray-900 text-sm">{fmtMoney(inv.amountDue)}</p>
                      {!isPaid && balance < inv.amountDue && (
                        <p className="text-xs text-orange-600">Balance: {fmtMoney(balance)}</p>
                      )}
                    </div>
                    {statusBadge(displayStatus)}
                    {!isPaid && (
                      <Button
                        size="sm"
                        className="bg-[#2D5016] hover:bg-[#1a2e0d] text-white gap-1.5 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(`/portal/invoices/${inv.id}`);
                        }}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        Pay Now
                      </Button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          </>
        )}
      </div>
    </PortalLayout>
  );
}
