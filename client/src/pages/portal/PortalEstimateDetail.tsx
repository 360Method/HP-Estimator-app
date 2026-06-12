/**
 * PortalEstimateDetail — full estimate review page matching the pro-side PDF exactly.
 * - Renders phase sections with name, description, SOW bullets, qty, unit price, amount
 * - Approve button opens modal: name input + signature (type/draw) + checkbox
 * - Print / PDF button triggers window.print()
 */
import { useParams, useLocation } from "wouter";
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Pen, Printer } from "lucide-react";
import { toast } from "sonner";
import SignatureCapture from "@/components/SignatureCapture";
import EstimateDocument, { fmtMoney, fmtDate } from "@/components/portal/EstimateDocument";
import EstimateTierHint from "@/components/portal/continuity/EstimateTierHint";

export default function PortalEstimateDetail() {
  const { id } = useParams<{ id: string }>();
  const [, navigate] = useLocation();
  const estimateId = Number(id);

  const { data, isLoading, refetch } = trpc.portal.getEstimate.useQuery({ id: estimateId });
  const { data: membershipData } = trpc.portal.getMembership360.useQuery(undefined, {
    refetchOnWindowFocus: false,
  });
  const approveMutation = trpc.portal.approveEstimate.useMutation({
    onSuccess: (res) => {
      setApproveOpen(false);
      toast.success("Estimate approved!");
      refetch();
      if (res.depositInvoice) {
        navigate(`/portal/invoices/${res.depositInvoice.id}`);
      }
    },
    onError: (err) => toast.error(err.message),
  });
  const declineMutation = trpc.portal.declineEstimate.useMutation({
    onSuccess: () => { toast.info("Estimate declined."); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  // Approve modal state
  const [approveOpen, setApproveOpen] = useState(false);

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-blue-500" /></div>
      </PortalLayout>
    );
  }

  const est = data;
  if (!est) {
    return <PortalLayout><div className="p-6 text-gray-500">Estimate not found.</div></PortalLayout>;
  }

  const canApprove = est.status === "sent" || est.status === "viewed";
  const isApproved = est.status === "approved";
  const isDeclined = est.status === "declined";

  const totalCents = est.totalAmount;
  const depositCents = est.depositAmount ?? Math.round(totalCents * 0.5);
  const depositPct = est.depositPercent ?? 50;

  return (
    <PortalLayout>
      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        {/* Breadcrumb */}
        <p className="text-xs text-gray-400 mb-1">Customer Portal › Estimates › View Estimate</p>
        <div className="flex items-center justify-between mb-4">
          <button
            onClick={() => navigate("/portal/estimates")}
            className="flex items-center gap-1 text-sm text-blue-600 hover:underline"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Estimates
          </button>
          <a
            href={`/api/portal/estimate-pdf/${est.id}`}
            download={`Estimate-${est.estimateNumber ?? est.id}.pdf`}
            className="print:hidden inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-border text-sm font-medium hover:bg-muted transition-colors"
          >
            <Printer className="w-4 h-4" /> Download PDF
          </a>
        </div>

        {/* Status banners */}
        {isApproved && (
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6 text-green-700 text-sm">
            <div className="flex items-center justify-between flex-wrap gap-3">
              <span className="font-medium">✓ Estimate approved on {fmtDate(est.approvedAt)} — Thank you, {est.signerName}!</span>
              <div className="flex items-center gap-2 flex-wrap">
                {est.depositInvoiceId && !est.depositInvoicePaidAt && (
                  <button
                    onClick={() => navigate(`/portal/invoices/${est.depositInvoiceId}`)}
                    className="inline-flex items-center gap-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold px-3 py-1.5 rounded-md transition-colors"
                  >
                    Pay Deposit →
                  </button>
                )}
                {est.hpOpportunityId && (
                  <button
                    onClick={() => navigate(`/portal/job/${est.hpOpportunityId}`)}
                    className="inline-flex items-center gap-1.5 bg-[#2d4a2d] hover:bg-[#1a2e1a] text-white text-xs font-medium px-3 py-1.5 rounded-md transition-colors"
                  >
                    View Job Progress →
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
        {isDeclined && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 text-sm font-medium">
            This estimate was declined.
          </div>
        )}

        {/* ── Progress Stepper ── */}
        {(isApproved || canApprove) && (
          <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6 shadow-sm">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Project Progress</p>
            <div className="flex items-center gap-0">
              {[
                { label: 'Estimate Sent', done: true },
                { label: 'Approved', done: isApproved },
                { label: 'Deposit Paid', done: isApproved && !!est.depositInvoicePaidAt },
                { label: 'Work Scheduled', done: false },
                { label: 'Complete', done: false },
              ].map((step, i, arr) => (
                <div key={step.label} className="flex items-center flex-1 min-w-0">
                  <div className="flex flex-col items-center flex-1 min-w-0">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                      step.done ? 'bg-emerald-500 text-white' : 'bg-gray-200 text-gray-400'
                    }`}>
                      {step.done ? '✓' : i + 1}
                    </div>
                    <span className={`text-[9px] mt-1 text-center leading-tight ${
                      step.done ? 'text-emerald-600 font-semibold' : 'text-gray-400'
                    }`}>{step.label}</span>
                  </div>
                  {i < arr.length - 1 && (
                    <div className={`h-0.5 flex-1 mx-1 shrink-0 ${
                      arr[i + 1].done ? 'bg-emerald-400' : 'bg-gray-200'
                    }`} />
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Continuity: 360° tier context for this specific estimate ── */}
        <div className="mb-4">
          <EstimateTierHint
            totalCents={totalCents}
            scopeText={[est.scopeOfWork, est.title].filter(Boolean).join(" ")}
            isMember={!!membershipData}
          />
        </div>

        {/* ── Estimate document (shared with the on-site close flow) ── */}
        <EstimateDocument
          estimate={est as any}
          canApprove={canApprove}
          onApprove={() => setApproveOpen(true)}
        >
          {/* Footer CTA */}
          {canApprove && (
            <div className="px-8 py-6 border-t border-gray-100 bg-gray-50 print:hidden">
              {/* Deposit callout */}
              {depositCents > 0 && (
                <div className="mb-5 flex items-start gap-3 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <span className="text-amber-500 text-lg">💳</span>
                  <div>
                    <p className="text-sm font-semibold text-amber-800">Deposit required to schedule</p>
                    <p className="text-xs text-amber-700 mt-0.5">
                      A <strong>{fmtMoney(depositCents)}</strong> deposit ({depositPct}% of total) is due after approval.
                      You'll be taken directly to the payment page.
                    </p>
                  </div>
                </div>
              )}
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div>
                  <p className="text-sm font-semibold text-gray-700">Ready to move forward?</p>
                  <p className="text-xs text-gray-400 mt-0.5">Approve below to lock in your project date.</p>
                </div>
                <Button
                  className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white font-semibold px-8 py-2.5 text-sm"
                  onClick={() => setApproveOpen(true)}
                >
                  Approve & Pay Deposit
                </Button>
              </div>
              <div className="flex gap-3 justify-center mt-4 pt-4 border-t border-gray-200">
                <p className="text-xs text-gray-400">Not quite right?</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-gray-400 h-auto p-0 hover:text-gray-600"
                  onClick={() => declineMutation.mutate({ id: estimateId })}
                  disabled={declineMutation.isPending}
                >
                  Decline estimate
                </Button>
                <span className="text-gray-300">·</span>
                <Button variant="ghost" size="sm" className="text-xs text-gray-400 h-auto p-0 hover:text-gray-600" asChild>
                  <a href="mailto:help@handypioneers.com">Request changes</a>
                </Button>
              </div>
            </div>
          )}
        </EstimateDocument>
      </div>

      {/* ── Approve modal ── */}
      <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#1a2e1a]">Approve Estimate</DialogTitle>
          </DialogHeader>

          {/* Option summary */}
          <div className="flex items-center gap-3 bg-[#1a2e1a]/5 border border-[#1a2e1a]/20 rounded-lg p-3 mb-3">
            <div className="w-10 h-10 bg-[#1a2e1a] rounded flex items-center justify-center shrink-0">
              <Pen className="w-4 h-4 text-green-200" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-gray-900 truncate">{est.title ?? 'Option #1'}</p>
              <p className="text-xs text-gray-500">Total: {fmtMoney(totalCents)}</p>
            </div>
          </div>
          {/* Deposit callout in modal */}
          {depositCents > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 mb-3">
              <span>💳</span>
              <span>After approval, you'll be redirected to pay the <strong>{fmtMoney(depositCents)}</strong> deposit to schedule your project.</span>
            </div>
          )}

          <SignatureCapture
            busy={approveMutation.isPending}
            submitLabel={depositCents > 0 ? "Approve & Pay Deposit" : "Approve Estimate"}
            onCancel={() => setApproveOpen(false)}
            onSign={(signerName, signatureDataUrl) =>
              approveMutation.mutate({ id: estimateId, signerName, signatureDataUrl })
            }
          />
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
