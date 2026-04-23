import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Loader2, FolderOpen, FileText, DollarSign, ChevronRight } from "lucide-react";

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
function estimateBadge(status: string) {
  const map: Record<string, { bg: string; label: string }> = {
    sent: { bg: "bg-blue-100 text-blue-700", label: "Awaiting review" },
    viewed: { bg: "bg-yellow-100 text-yellow-700", label: "Viewed" },
    approved: { bg: "bg-green-100 text-green-700", label: "Approved" },
    declined: { bg: "bg-red-100 text-red-700", label: "Declined" },
    expired: { bg: "bg-gray-100 text-gray-500", label: "Expired" },
  };
  const s = map[status] ?? { bg: "bg-gray-100 text-gray-500", label: status };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>{s.label}</span>;
}
function invoiceBadge(status: string) {
  const map: Record<string, { bg: string; label: string }> = {
    due: { bg: "bg-orange-100 text-orange-700", label: "Due" },
    overdue: { bg: "bg-red-100 text-red-700", label: "Overdue" },
    paid: { bg: "bg-green-100 text-green-700", label: "Paid" },
    draft: { bg: "bg-gray-100 text-gray-500", label: "Draft" },
  };
  const s = map[status] ?? { bg: "bg-gray-100 text-gray-500", label: status };
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${s.bg}`}>{s.label}</span>;
}

export default function PortalDocuments() {
  const [, navigate] = useLocation();
  const { data, isLoading } = trpc.portal.getDocuments.useQuery();
  const estimates = data?.estimates ?? [];
  const invoices = data?.invoices ?? [];
  const totalDocs = estimates.length + invoices.length;
  const pendingCount =
    estimates.filter((e) => e.status === "sent" || e.status === "viewed").length +
    invoices.filter((i) => i.status === "due" || i.status === "overdue").length;

  return (
    <PortalLayout>
      <div className="p-6 max-w-5xl mx-auto">
        <p className="text-xs text-gray-400 mb-1">Customer Portal &rsaquo; Documents</p>
        <div className="flex items-center gap-3 mb-6">
          <h1 className="text-3xl font-light text-gray-900">Documents</h1>
          {pendingCount > 0 && (
            <span className="bg-blue-600 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
              {pendingCount}
            </span>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : totalDocs === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-400">
            <FolderOpen className="w-16 h-16 mb-4 text-gray-300" />
            <p className="text-base">No documents yet</p>
            <p className="text-sm mt-1">Estimates and invoices sent to you will appear here.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {/* Estimates */}
            {estimates.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <FileText className="w-4 h-4" /> Estimates
                </h2>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="hidden md:grid grid-cols-5 bg-white border-b border-gray-200 text-xs font-semibold text-gray-600 px-4 py-3">
                    <span>Estimate #</span>
                    <span>Sent</span>
                    <span>Expires</span>
                    <span>Total</span>
                    <span>Status</span>
                  </div>
                  {estimates.map((est) => (
                    <div
                      key={est.id}
                      className="grid grid-cols-1 md:grid-cols-5 gap-1 md:gap-0 px-4 py-3 border-b border-gray-100 last:border-0 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer items-center"
                      onClick={() => navigate(`/portal/estimates/${est.id}`)}
                    >
                      <span className="font-medium text-blue-600">#{est.estimateNumber ?? est.id}</span>
                      <span>{fmtDate(est.sentAt)}</span>
                      <span>{fmtDate(est.expiresAt)}</span>
                      <span className="font-semibold">{fmtMoney(est.totalAmount)}</span>
                      <div className="flex items-center justify-between">
                        {estimateBadge(est.status)}
                        <ChevronRight className="w-4 h-4 text-gray-400 hidden md:block" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Invoices */}
            {invoices.length > 0 && (
              <section>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <DollarSign className="w-4 h-4" /> Invoices
                </h2>
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="hidden md:grid grid-cols-5 bg-white border-b border-gray-200 text-xs font-semibold text-gray-600 px-4 py-3">
                    <span>Invoice #</span>
                    <span>Sent</span>
                    <span>Due</span>
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
                      <span className="font-semibold">{fmtMoney(inv.amountDue ?? 0)}</span>
                      <div className="flex items-center justify-between">
                        {invoiceBadge(inv.status)}
                        <ChevronRight className="w-4 h-4 text-gray-400 hidden md:block" />
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
