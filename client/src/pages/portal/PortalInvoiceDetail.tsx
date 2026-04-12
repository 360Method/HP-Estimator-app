import { useEffect } from "react";
import { useParams, useLocation, useSearch } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CreditCard, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

const HP_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalInvoiceDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const search = useSearch();
  const invoiceId = Number(id);
  const returnedPaid = new URLSearchParams(search).get("paid") === "1";

  const utils = trpc.useUtils();
  const { data, isLoading, refetch } = trpc.portal.getInvoice.useQuery(
    { id: invoiceId },
    { enabled: !isNaN(invoiceId) }
  );

  // On return from Stripe Checkout with ?paid=1, refetch to pick up webhook update
  useEffect(() => {
    if (returnedPaid) {
      const timer = setTimeout(() => refetch(), 1500);
      return () => clearTimeout(timer);
    }
  }, [returnedPaid, refetch]);

  const checkoutMutation = trpc.portal.createCheckoutSession.useMutation({
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-[#2D5016]" />
        </div>
      </PortalLayout>
    );
  }

  const inv = data;
  if (!inv) {
    return (
      <PortalLayout>
        <div className="p-6 text-gray-500">Invoice not found.</div>
      </PortalLayout>
    );
  }

  const lineItems: Array<{ description: string; qty: number; unitPrice: number; amount: number }> =
    inv.lineItemsJson ? (() => {
      try { return JSON.parse(inv.lineItemsJson as string); } catch { return []; }
    })() : [];

  const isPaid = inv.status === "paid";
  const balance = inv.amountDue - (inv.amountPaid ?? 0);

  return (
    <PortalLayout>
      <div className="p-4 sm:p-6 max-w-3xl mx-auto">
        {/* Breadcrumb */}
        <p className="text-xs text-gray-400 mb-1">
          Customer Portal &rsaquo; Invoices &rsaquo; #{inv.invoiceNumber ?? inv.id}
        </p>

        {/* Back */}
        <button
          onClick={() => navigate("/portal/invoices")}
          className="flex items-center gap-1 text-sm text-[#2D5016] hover:underline mb-5"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Invoices
        </button>

        {/* ── Paid banner ── */}
        {isPaid && (
          <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
            <div>
              <p className="text-green-800 font-semibold text-sm">Payment received — thank you!</p>
              {inv.paidAt && (
                <p className="text-green-600 text-xs mt-0.5">Paid on {fmtDate(inv.paidAt)}</p>
              )}
            </div>
          </div>
        )}

        {/* ── Return-from-checkout pending banner ── */}
        {returnedPaid && !isPaid && (
          <div className="flex items-center gap-3 bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <Loader2 className="w-4 h-4 text-blue-500 animate-spin shrink-0" />
            <p className="text-blue-700 text-sm">Confirming your payment…</p>
          </div>
        )}

        {/* ── Pay section ── */}
        {!isPaid && !returnedPaid && (
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-6 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Pay Invoice #{inv.invoiceNumber}
            </h2>
            <p className="text-sm text-gray-500 mb-4">
              Amount due: <span className="font-semibold text-gray-800">{fmtMoney(balance > 0 ? balance : inv.amountDue)}</span>
            </p>
            <Button
              className="bg-[#2D5016] hover:bg-[#1a2e0d] text-white w-full sm:w-auto gap-2"
              disabled={checkoutMutation.isPending}
              onClick={() => checkoutMutation.mutate({ invoiceId: inv.id })}
            >
              {checkoutMutation.isPending ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Redirecting to payment…</>
              ) : (
                <><CreditCard className="w-4 h-4" /> Pay Now — {fmtMoney(balance > 0 ? balance : inv.amountDue)}</>
              )}
            </Button>
            <p className="text-xs text-gray-400 mt-3">
              Secure payment processed by Stripe. You'll be redirected to complete your payment.
            </p>
          </div>
        )}

        {/* ── Invoice document ── */}
        <div className="bg-white border border-gray-200 rounded-xl p-6 sm:p-8 shadow-sm">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="font-bold text-gray-900 text-lg">Handy Pioneers</p>
              <p className="text-xs text-gray-500 mt-0.5">808 SE Chkalov Dr 3-433</p>
              <p className="text-xs text-gray-500">Vancouver, WA 98683</p>
              <p className="text-xs text-gray-500">(360) 544-9858 | help@handypioneers.com</p>
            </div>
            <img
              src={HP_LOGO}
              alt="Handy Pioneers"
              className="h-14 w-auto object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>

          {/* Status badge */}
          <div className="mb-6">
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wide ${
              isPaid
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}>
              {isPaid ? "Paid" : "Payment Due"}
            </span>
          </div>

          {/* Bill to + Invoice meta */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mb-8 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Bill To</p>
              <p className="font-medium text-gray-900">{inv.customerName}</p>
              {inv.customerAddress && <p className="text-gray-500 text-xs mt-0.5">{inv.customerAddress}</p>}
              {inv.customerEmail && <p className="text-gray-500 text-xs">{inv.customerEmail}</p>}
            </div>
            <div className="sm:text-right">
              <div className="inline-grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
                <span className="text-gray-400">Invoice #</span>
                <span className="font-medium">{inv.invoiceNumber ?? inv.id}</span>
                {inv.jobTitle && (
                  <>
                    <span className="text-gray-400">Job</span>
                    <span className="font-medium">{inv.jobTitle}</span>
                  </>
                )}
                <span className="text-gray-400">Invoice Date</span>
                <span>{fmtDate(inv.sentAt)}</span>
                <span className="text-gray-400">Due Date</span>
                <span>{fmtDate(inv.dueDate)}</span>
                <span className="text-gray-400 font-semibold">Amount Due</span>
                <span className="font-bold text-gray-900">{fmtMoney(inv.amountDue)}</span>
              </div>
            </div>
          </div>

          {/* Line items */}
          {lineItems.length > 0 && (
            <div className="mb-6 overflow-x-auto">
              <table className="w-full text-sm min-w-[400px]">
                <thead>
                  <tr className="bg-[#2D5016] text-white text-xs">
                    <th className="text-left px-3 py-2 rounded-tl-md">Services</th>
                    <th className="text-right px-3 py-2">Qty</th>
                    <th className="text-right px-3 py-2">Unit Price</th>
                    <th className="text-right px-3 py-2 rounded-tr-md">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lineItems.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-3 py-2.5 text-gray-700">{item.description}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{item.qty}</td>
                      <td className="px-3 py-2.5 text-right text-gray-500">{fmtMoney(item.unitPrice)}</td>
                      <td className="px-3 py-2.5 text-right font-medium">{fmtMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-60 space-y-1.5 text-sm">
              <div className="flex justify-between text-gray-500">
                <span>Subtotal</span>
                <span>{fmtMoney(inv.amountDue)}</span>
              </div>
              <div className="flex justify-between text-gray-500">
                <span>Tax</span>
                <span>$0.00</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
                <span>Total</span>
                <span>{fmtMoney(inv.amountDue)}</span>
              </div>
              {(inv.amountPaid ?? 0) > 0 && (
                <>
                  <div className="flex justify-between text-green-600 text-sm">
                    <span>Amount Paid</span>
                    <span>−{fmtMoney(inv.amountPaid ?? 0)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
                    <span>Balance Due</span>
                    <span>{fmtMoney(Math.max(0, inv.amountDue - (inv.amountPaid ?? 0)))}</span>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-100 text-center text-xs text-gray-400 space-y-0.5">
            <p>Handy Pioneers &bull; (360) 544-9858 &bull; help@handypioneers.com</p>
            <p>808 SE Chkalov Dr 3-433, Vancouver, WA 98683</p>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
