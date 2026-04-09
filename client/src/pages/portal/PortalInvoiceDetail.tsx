import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Loader2, ArrowLeft, CreditCard } from "lucide-react";
import { toast } from "sonner";

const HP_LOGO = "https://cdn.manus.space/webdev-static-assets/hp-logo.png";

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
  const invoiceId = Number(id);

  const { data, isLoading } = trpc.portal.getInvoice.useQuery({ id: invoiceId }, { enabled: !isNaN(invoiceId) });
  const payMutation = trpc.portal.createInvoicePaymentIntent.useMutation({
    onSuccess: (res) => {
      if (res.clientSecret) { toast.success("Payment session created"); }
    },
    onError: (err) => toast.error(err.message),
  });

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
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
    inv.lineItemsJson ? JSON.parse(inv.lineItemsJson as string) : [];
  const isPaid = inv.status === "paid";

  return (
    <PortalLayout>
      <div className="p-6 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <p className="text-xs text-gray-400 mb-1">
          Customer Portal &rsaquo; Invoices &rsaquo; View Invoice
        </p>

        {/* Back */}
        <button
          onClick={() => navigate("/portal/invoices")}
          className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Invoices
        </button>

        {/* Pay section */}
        {!isPaid && (
          <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
            <h2 className="text-base font-semibold text-gray-900 mb-1">
              Review &amp; pay your invoice from Handy Pioneers
            </h2>
            <p className="text-sm text-gray-500 mb-4">{fmtMoney(inv.amountDue)} due</p>

            <div className="space-y-2 mb-4">
              <p className="text-xs font-semibold text-gray-500 uppercase">Add a tip</p>
              <div className="flex gap-2 flex-wrap">
                {["10%", "15%", "20%", "No Tip"].map((t) => (
                  <button
                    key={t}
                    className="px-3 py-1.5 border border-gray-300 rounded text-xs hover:bg-gray-50"
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white w-full sm:w-auto"
              disabled={payMutation.isPending}
              onClick={() => payMutation.mutate({ invoiceId: inv.id, tipCents: 0 })}

            >
              {payMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Redirecting…</>
              ) : (
                <><CreditCard className="w-4 h-4 mr-2" /> Pay {fmtMoney(inv.amountDue)}</>
              )}
            </Button>
          </div>
        )}

        {isPaid && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700 text-sm font-medium">
            ✓ Paid on {fmtDate(inv.paidAt)} — Thank you!
          </div>
        )}

        {/* Invoice document */}
        <div className="bg-white border border-gray-200 rounded-lg p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-8">
            <div>
              <p className="font-bold text-gray-900">Handy Pioneers</p>
              <p className="text-xs text-gray-500">808 SE Chkalov Dr 3-433, Vancouver, WA 98683</p>
              <p className="text-xs text-gray-500">3605449858 | help@handypioneers.com</p>
            </div>
            <img
              src={HP_LOGO}
              alt="Handy Pioneers"
              className="h-12 w-auto object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>

          <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
            <div>
              <p className="text-xs text-gray-400 uppercase mb-1">Bill to</p>
              <p className="font-medium text-gray-900">{inv.customerName}</p>
              {inv.customerAddress && <p className="text-gray-500 text-xs">{inv.customerAddress}</p>}
              {inv.customerEmail && <p className="text-gray-500 text-xs">{inv.customerEmail}</p>}
            </div>
            <div className="text-right">
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-gray-400">Invoice</span>
                <span>#{inv.invoiceNumber ?? inv.id}</span>
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
            <table className="w-full text-sm mb-6">
              <thead>
                <tr className="bg-gray-800 text-white text-xs">
                  <th className="text-left px-3 py-2 rounded-tl">Services</th>
                  <th className="text-right px-3 py-2">Qty</th>
                  <th className="text-right px-3 py-2">Unit price</th>
                  <th className="text-right px-3 py-2 rounded-tr">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="px-3 py-2 text-gray-700">{item.description}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{item.qty}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{fmtMoney(item.unitPrice)}</td>
                    <td className="px-3 py-2 text-right font-medium">{fmtMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {/* Totals */}
          <div className="flex justify-end">
            <div className="w-56 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
              <span>{fmtMoney(inv.amountDue)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Tax</span>
              <span>$0.00</span>
            </div>
            <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
              <span>Invoice Amount</span>
              <span>{fmtMoney(inv.amountDue)}</span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-8 pt-4 border-t border-gray-100 text-center text-xs text-gray-400 space-y-1">
            <p>Handy Pioneers | (360) 544-9858 | http://handypioneers.com</p>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
