import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, FileText, ChevronRight } from "lucide-react";

function statusBadge(status: string) {
  const map: Record<string, string> = {
    paid: "bg-green-100 text-green-700",
    due: "bg-yellow-100 text-yellow-700",
    overdue: "bg-red-100 text-red-700",
    draft: "bg-gray-100 text-gray-600",
  };
  return (
    <span className={`px-2 py-0.5 rounded text-xs font-medium capitalize ${map[status] ?? "bg-gray-100 text-gray-600"}`}>
      {status}
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
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-xs text-gray-400 mb-1">Customer Portal &rsaquo; Invoices</p>
        <h1 className="text-3xl font-light text-gray-900 mb-6">Invoices</h1>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <FileText className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-base">No invoices yet</p>
          </div>
        ) : (
          <div className="border border-gray-200 rounded-md overflow-hidden">
            <div className="hidden md:grid grid-cols-5 bg-white border-b border-gray-200 text-xs font-semibold text-gray-600 px-4 py-3">
              <span>Invoice #</span>
              <span>Date</span>
              <span>Due date</span>
              <span>Amount</span>
              <span>Status</span>
            </div>
            {invoices.map((inv) => (
              <div
                key={inv.id}
                className="grid grid-cols-1 md:grid-cols-5 gap-1 md:gap-0 px-4 py-3 border-b border-gray-100 last:border-0 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer items-center"
                onClick={() => navigate(`/portal/invoices/${inv.id}`)}
              >
                <span className="font-medium text-blue-600">#{inv.invoiceNumber ?? inv.id}</span>
                <span>{fmtDate(inv.sentAt)}</span>
                <span>{fmtDate(inv.dueDate)}</span>
                <span className="font-semibold">{fmtMoney(inv.amountDue)}</span>
                <div className="flex items-center justify-between">
                  {statusBadge(inv.status)}
                  <ChevronRight className="w-4 h-4 text-gray-400 hidden md:block" />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
