/**
 * PortalEstimateDetail — full estimate review page matching HouseCall Pro style.
 * - Shows estimate document with line items
 * - Approve button opens modal: name input + signature (type/draw) + checkbox + Approve
 * - On approval: if deposit required → redirect to Stripe checkout
 */
import { useParams, useLocation } from "wouter";
import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Pen, Type } from "lucide-react";
import { toast } from "sonner";
import SignaturePad from "signature_pad";

const HP_LOGO = "https://cdn.manus.space/webdev-static-assets/hp-logo.png";

function fmtMoney(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}
function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export default function PortalEstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const estimateId = Number(id);

  const { data, isLoading, refetch } = trpc.portal.getEstimate.useQuery({ id: estimateId });
  const approveMutation = trpc.portal.approveEstimate.useMutation({
    onSuccess: (res) => {
      setApproveOpen(false);
      toast.success("Estimate approved!");
      refetch();
      // If deposit invoice was created, navigate to it for payment
      if (res.depositInvoice) {
        navigate(`/portal/invoices/${res.depositInvoice.id}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const declineMutation = trpc.portal.declineEstimate.useMutation({
    onSuccess: () => {
      toast.info("Estimate declined.");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  // Approve modal state
  const [approveOpen, setApproveOpen] = useState(false);
  const [signerName, setSignerName] = useState("");
  const [sigMode, setSigMode] = useState<"type" | "draw">("type");
  const [agreed, setAgreed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (approveOpen && sigMode === "draw" && canvasRef.current) {
      sigPadRef.current = new SignaturePad(canvasRef.current, {
        backgroundColor: "rgb(255,255,255)",
      });
    }
    return () => {
      sigPadRef.current?.off();
      sigPadRef.current = null;
    };
  }, [approveOpen, sigMode]);

  const handleApprove = () => {
    if (!signerName.trim()) { toast.error("Please enter your name"); return; }
    if (!agreed) { toast.error("Please agree to conduct business electronically"); return; }

    let signatureData: string | undefined;
    if (sigMode === "draw") {
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) {
        toast.error("Please draw your signature");
        return;
      }
      signatureData = sigPadRef.current.toDataURL();
    } else {
      signatureData = `typed:${signerName}`;
    }

    approveMutation.mutate({ id: estimateId, signerName, signatureDataUrl: signatureData ?? `typed:${signerName}` });
  };

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
        </div>
      </PortalLayout>
    );
  }

  const est = data;
  if (!est) {
    return (
      <PortalLayout>
        <div className="p-6 text-gray-500">Estimate not found.</div>
      </PortalLayout>
    );
  }

  const lineItems: Array<{ description: string; qty: number; unitPrice: number; amount: number }> =
    est.lineItemsJson ? JSON.parse(est.lineItemsJson as string) : [];
  const canApprove = est.status === "sent" || est.status === "viewed";
  const isApproved = est.status === "approved";
  const isDeclined = est.status === "declined";

  return (
    <PortalLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <p className="text-xs text-gray-400 mb-1">
          Customer Portal &rsaquo; Estimates &rsaquo; View Estimate
        </p>
        <button
          onClick={() => navigate("/portal/estimates")}
          className="flex items-center gap-1 text-sm text-blue-600 hover:underline mb-4"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Estimates
        </button>

        {/* Status banners */}
        {isApproved && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700 text-sm font-medium">
            ✓ Estimate approved on {fmtDate(est.approvedAt)} — Thank you, {est.signerName}!
          </div>
        )}
        {isDeclined && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 text-sm font-medium">
            This estimate was declined.
          </div>
        )}

        {/* Estimate document */}
        <div className="bg-white border border-gray-200 rounded-lg p-8">
          {/* Header */}
          <div className="flex justify-between items-start mb-6">
            <div>
              <p className="font-bold text-gray-900">Handy Pioneers</p>
              <p className="text-xs text-gray-500">808 SE Chkalov Dr 3-433, Vancouver, WA 98683</p>
              <p className="text-xs text-blue-500">3605449858 | help@handypioneers.com</p>
            </div>
            <img
              src={HP_LOGO}
              alt="Handy Pioneers"
              className="h-12 w-auto object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>

          <p className="text-xs text-gray-400 mb-1">Estimate #{est.estimateNumber ?? est.id}</p>
          <h2 className="text-2xl font-semibold text-gray-900 mb-6">Estimate for {est.customerName}</h2>

          <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
            <div>
              <p className="text-xs text-gray-400 mb-1">For:</p>
              <p className="font-medium">{est.customerName}</p>
              {est.customerAddress && <p className="text-xs text-gray-500">{est.customerAddress}</p>}
            </div>
            <div>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                <span className="text-gray-400">Created on:</span>
                <span>{fmtDate(est.sentAt)}</span>
                <span className="text-gray-400">Expires on:</span>
                <span>{fmtDate(est.expiresAt)}</span>
              </div>
            </div>
          </div>

          {/* Options */}
          <div className="border border-gray-200 rounded-lg overflow-hidden mb-6">
            <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div>
                <p className="font-semibold text-gray-900">Option #1</p>
                <p className="text-sm text-gray-600">{fmtMoney(est.totalAmount)}</p>
              </div>
              {canApprove && (
                <Button
                  className="bg-blue-600 hover:bg-blue-700 text-white text-sm"
                  onClick={() => setApproveOpen(true)}
                >
                  Approve
                </Button>
              )}
            </div>

            {/* Line items table */}
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-xs text-gray-500">
                  <th className="text-left px-4 py-2">Services</th>
                  <th className="text-right px-4 py-2">Qty</th>
                  <th className="text-right px-4 py-2">Unit price</th>
                  <th className="text-right px-4 py-2">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lineItems.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100 last:border-0">
                    <td className="px-4 py-3 text-gray-700 whitespace-pre-wrap">{item.description}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{item.qty?.toFixed(2)}</td>
                    <td className="px-4 py-3 text-right text-gray-500">{fmtMoney(item.unitPrice)}</td>
                    <td className="px-4 py-3 text-right font-medium">{fmtMoney(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="px-4 py-3 border-t border-gray-200 space-y-1 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">Services subtotal</span>
                <span>{fmtMoney(est.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Subtotal</span>
                <span>{fmtMoney(est.totalAmount)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Tax<br /><span className="text-xs">Out of scope</span></span>
                <span>$0.00</span>
              </div>
              <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-2 mt-2">
                <span>Total</span>
                <span>{fmtMoney(est.totalAmount)}</span>
              </div>
            </div>
          </div>

          {/* Footer CTA */}
          {canApprove && (
            <div className="text-center py-4 border-t border-gray-100">
              <p className="text-sm text-gray-500 mb-3">Not what you were looking for?</p>
              <p className="text-xs text-gray-400 mb-3">
                Please let us know if you'd like to request some changes. We'd love to win your business.
              </p>
              <div className="flex gap-3 justify-center">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => declineMutation.mutate({ id: estimateId })}
                  disabled={declineMutation.isPending}
                >
                  Decline estimate
                </Button>
                <Button variant="outline" size="sm" asChild>
                  <a href="mailto:help@handypioneers.com">Contact us</a>
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Approve modal */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Approve estimate</DialogTitle>
          </DialogHeader>

          {/* Option summary */}
          <div className="flex items-center gap-3 bg-gray-50 rounded-lg p-3 mb-4">
            <div className="w-10 h-10 bg-gray-200 rounded flex items-center justify-center text-gray-400">
              <Pen className="w-4 h-4" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium">Option #1</p>
            </div>
            <p className="font-semibold text-sm">{fmtMoney(est.totalAmount)}</p>
          </div>

          {/* Name */}
          <Input
            placeholder="Your name *"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="mb-4"
          />

          {/* Signature */}
          <p className="text-sm text-gray-600 mb-2">Confirm with your signature</p>
          <div className="flex gap-2 mb-3">
            <Button
              size="sm"
              variant={sigMode === "type" ? "default" : "outline"}
              className={sigMode === "type" ? "bg-blue-600 text-white" : ""}
              onClick={() => setSigMode("type")}
            >
              <Type className="w-3.5 h-3.5 mr-1" /> Type
            </Button>
            <Button
              size="sm"
              variant={sigMode === "draw" ? "default" : "outline"}
              className={sigMode === "draw" ? "bg-blue-600 text-white" : ""}
              onClick={() => setSigMode("draw")}
            >
              <Pen className="w-3.5 h-3.5 mr-1" /> Draw
            </Button>
          </div>

          {sigMode === "type" ? (
            <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white min-h-16 flex items-end">
              <span
                className="text-2xl text-gray-700"
                style={{ fontFamily: "Dancing Script, cursive", borderBottom: "1px solid #ccc", width: "100%" }}
              >
                {signerName || "Your name"}
              </span>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg mb-4 bg-white overflow-hidden">
              <canvas
                ref={canvasRef}
                width={380}
                height={100}
                className="w-full"
                style={{ touchAction: "none" }}
              />
              <button
                className="text-xs text-gray-400 px-3 py-1 hover:text-gray-600"
                onClick={() => sigPadRef.current?.clear()}
              >
                Clear
              </button>
            </div>
          )}

          {/* Legal text */}
          <p className="text-xs text-gray-500 mb-3">
            By signing, you accept this estimate, its associated costs, and the{" "}
            <a href="https://handypioneers.com/terms" className="text-blue-500 underline">Terms and Conditions</a>.
            Typing or drawing your signature here will have the same force and effect as your written signature.
          </p>

          {/* Agree checkbox */}
          <label className="flex items-start gap-2 text-xs text-gray-600 mb-4 cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="mt-0.5"
            />
            I agree to conduct business electronically with Handy Pioneers
          </label>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button
              className="bg-blue-600 hover:bg-blue-700 text-white"
              disabled={approveMutation.isPending || !signerName || !agreed}
              onClick={handleApprove}
            >
              {approveMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving…</>
              ) : "Approve"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
