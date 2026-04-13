/**
 * PortalEstimateDetail — full estimate review page matching the pro-side PDF exactly.
 * - Renders phase sections with name, description, SOW bullets, qty, unit price, amount
 * - Approve button opens modal: name input + signature (type/draw) + checkbox
 * - Print / PDF button triggers window.print()
 */
import { useParams, useLocation } from "wouter";
import { useRef, useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, ArrowLeft, Pen, Type, Printer } from "lucide-react";
import { toast } from "sonner";
import SignaturePad from "signature_pad";

const HP_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";
const HP_ADDRESS = "808 SE Chkalov Dr, 3-433\nVancouver, WA 98683";
const HP_PHONE = "(360) 544-9858";
const HP_EMAIL = "help@handypioneers.com";

// ─── Types ────────────────────────────────────────────────────
type PortalLineItem = {
  name: string;
  scopeOfWork: string;
  qty: number;
  unitType: string;
  unitPrice: number;
  amount: number;
};
type PortalPhase = {
  phaseName: string;
  phaseDescription: string;
  items: PortalLineItem[];
  phaseTotal: number;
};

// ─── Helpers ──────────────────────────────────────────────────
function fmtMoney(cents: number) {
  return `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtMoneyFlat(dollars: number) {
  return `$${dollars.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
function fmtDate(ts: number | Date | null | undefined) {
  if (!ts) return "—";
  return new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Parse lineItemsJson — handles both the new structured format (array of phases)
 * and the legacy format (array of {description, qty, unitPrice, amount}).
 */
function parseLineItems(json: string | null | undefined): { phases: PortalPhase[] | null; legacy: { description: string; qty: number; unitPrice: number; amount: number }[] | null } {
  if (!json) return { phases: null, legacy: null };
  try {
    const parsed = JSON.parse(json as string);
    if (!Array.isArray(parsed) || parsed.length === 0) return { phases: null, legacy: null };
    // New format: first element has phaseName + items
    if (parsed[0] && typeof parsed[0].phaseName === "string" && Array.isArray(parsed[0].items)) {
      return { phases: parsed as PortalPhase[], legacy: null };
    }
    // Legacy format: array of {description, qty, unitPrice, amount}
    return { phases: null, legacy: parsed };
  } catch {
    return { phases: null, legacy: null };
  }
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
  const [signerName, setSignerName] = useState("");
  const [sigMode, setSigMode] = useState<"type" | "draw">("type");
  const [agreed, setAgreed] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sigPadRef = useRef<SignaturePad | null>(null);

  useEffect(() => {
    if (approveOpen && sigMode === "draw" && canvasRef.current) {
      sigPadRef.current = new SignaturePad(canvasRef.current, { backgroundColor: "rgb(255,255,255)" });
    }
    return () => { sigPadRef.current?.off(); sigPadRef.current = null; };
  }, [approveOpen, sigMode]);

  const handleApprove = () => {
    if (!signerName.trim()) { toast.error("Please enter your name"); return; }
    if (!agreed) { toast.error("Please agree to conduct business electronically"); return; }
    let signatureData: string;
    if (sigMode === "draw") {
      if (!sigPadRef.current || sigPadRef.current.isEmpty()) { toast.error("Please draw your signature"); return; }
      signatureData = sigPadRef.current.toDataURL();
    } else {
      signatureData = `typed:${signerName}`;
    }
    approveMutation.mutate({ id: estimateId, signerName, signatureDataUrl: signatureData });
  };

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

  const { phases, legacy } = parseLineItems(est.lineItemsJson as string | null);
  const canApprove = est.status === "sent" || est.status === "viewed";
  const isApproved = est.status === "approved";
  const isDeclined = est.status === "declined";

  // Totals — resolve tax from stored snapshot
  const taxEnabled = (est as any).taxEnabled === 1 || (est as any).taxEnabled === true;
  const taxAmountCents = taxEnabled ? ((est as any).taxAmount ?? 0) : 0;
  const taxRateCode = (est as any).taxRateCode ?? '0603';
  const customTaxBp = (est as any).customTaxPct ?? 890; // basis points
  // totalAmount already includes tax (grand total) when taxEnabled
  const totalCents = est.totalAmount;
  // Subtotal = totalAmount - taxAmount when tax is enabled
  const subtotalCents = taxEnabled ? totalCents - taxAmountCents : totalCents;
  // Resolve tax label
  const CLARK_TAX_LABELS: Record<string, string> = {
    '0603': 'Vancouver (8.9%)', '0601': 'Battle Ground (8.9%)', '0602': 'Camas (8.8%)',
    '0611': 'La Center (8.8%)', '0604': 'Ridgefield (8.8%)', '0605': 'Washougal (8.6%)',
    '0607': 'Woodland (7.9%)', '0606': 'Yacolt (8.5%)', '0666': 'Clark County Unincorp. PTBA (8.7%)',
    '0600': 'Clark County Unincorp. (8.0%)', 'none': 'No Tax (0%)',
  };
  const taxLabel = taxRateCode === 'custom'
    ? `Custom (${(customTaxBp / 100).toFixed(2)}%)`
    : (CLARK_TAX_LABELS[taxRateCode] ?? taxRateCode);
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
        )}
        {isDeclined && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6 text-red-700 text-sm font-medium">
            This estimate was declined.
          </div>
        )}

        {/* ── Estimate document ── */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden" id="estimate-document">

          {/* HP header bar */}
          <div className="bg-[#1a2e1a] px-8 py-5 flex items-center justify-between">
            <div>
              <p className="text-white font-bold text-lg tracking-wide">Handy Pioneers</p>
              <p className="text-green-200 text-xs mt-0.5">{HP_ADDRESS.replace("\n", " · ")}</p>
              <p className="text-green-200 text-xs">{HP_PHONE} · {HP_EMAIL}</p>
            </div>
            <img
              src={HP_LOGO}
              alt="Handy Pioneers"
              className="h-14 w-auto object-contain rounded"
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          </div>

          {/* Estimate meta */}
          <div className="px-8 py-6 border-b border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              {/* Left: customer */}
              <div>
                <p className="text-xs text-gray-400 uppercase tracking-wider mb-1">Estimate for</p>
                <p className="font-semibold text-gray-900 text-lg">{est.customerName}</p>
                {est.customerAddress && <p className="text-sm text-gray-500 mt-0.5">{est.customerAddress}</p>}
              </div>
              {/* Right: meta grid */}
              <div className="sm:text-right">
                <p className="text-xs text-gray-400 mb-1">Estimate #{est.estimateNumber ?? est.id}</p>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-gray-600">
                  <span className="text-gray-400">Created:</span>
                  <span>{fmtDate(est.sentAt)}</span>
                  <span className="text-gray-400">Expires:</span>
                  <span>{fmtDate(est.expiresAt)}</span>
                </div>
              </div>
            </div>
            {est.scopeOfWork && (
              <div className="mt-4 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 border border-gray-100">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-1">Project Overview</p>
                <p>{est.scopeOfWork}</p>
              </div>
            )}
          </div>

          {/* ── Option block ── */}
          <div className="px-8 py-4 border-b border-gray-100 flex items-center justify-between bg-gray-50">
            <div>
              <p className="font-semibold text-gray-900">Option #1</p>
              <p className="text-sm text-gray-500">{fmtMoney(totalCents)}</p>
            </div>
            {canApprove && (
              <Button
                className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white font-semibold px-6"
                onClick={() => setApproveOpen(true)}
              >
                Approve Estimate
              </Button>
            )}
          </div>

          {/* ── Phase sections (new structured format) ── */}
          {phases && phases.map((phase, pi) => (
            <div key={pi} className="border-b border-gray-100 last:border-0">
              {/* Phase header */}
              <div className="px-8 pt-5 pb-2">
                <p className="font-bold text-gray-900 text-base">{phase.phaseName}</p>
                {phase.phaseDescription && (
                  <p className="text-xs text-gray-500 mt-0.5">{phase.phaseDescription}</p>
                )}
              </div>
              {/* Line items table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 border-y border-gray-100 text-xs text-gray-500">
                      <th className="text-left px-8 py-2 font-semibold">Services</th>
                      <th className="text-right px-4 py-2 font-semibold w-16">Qty</th>
                      <th className="text-right px-4 py-2 font-semibold w-28">Unit Price</th>
                      <th className="text-right px-8 py-2 font-semibold w-28">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {phase.items.map((item, ii) => (
                      <tr key={ii} className="border-b border-gray-50 last:border-0">
                        <td className="px-8 py-3 align-top">
                          <p className="font-semibold text-gray-900">{item.name}</p>
                          {item.scopeOfWork && (
                            <>
                              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mt-1 mb-0.5">Scope of Work</p>
                              <p className="text-xs text-gray-600">— {item.scopeOfWork}</p>
                            </>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600 align-top">{item.qty}</td>
                        <td className="px-4 py-3 text-right text-gray-600 align-top">{fmtMoneyFlat(item.unitPrice)}</td>
                        <td className="px-8 py-3 text-right font-semibold text-gray-900 align-top">{fmtMoneyFlat(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {/* Phase subtotal */}
              <div className="px-8 py-2 text-right text-xs text-gray-500 border-t border-gray-100">
                Services subtotal: <span className="font-semibold text-gray-700">{fmtMoneyFlat(phase.phaseTotal)}</span>
              </div>
            </div>
          ))}

          {/* ── Legacy flat line items (fallback) ── */}
          {!phases && legacy && legacy.length > 0 && (
            <div className="border-b border-gray-100">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-y border-gray-100 text-xs text-gray-500">
                    <th className="text-left px-8 py-2 font-semibold">Services</th>
                    <th className="text-right px-4 py-2 font-semibold w-16">Qty</th>
                    <th className="text-right px-4 py-2 font-semibold w-28">Unit Price</th>
                    <th className="text-right px-8 py-2 font-semibold w-28">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {legacy.map((item, i) => (
                    <tr key={i} className="border-b border-gray-50 last:border-0">
                      <td className="px-8 py-3 text-gray-700 whitespace-pre-wrap">{item.description}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{item.qty > 0 ? item.qty.toFixed(0) : "—"}</td>
                      <td className="px-4 py-3 text-right text-gray-500">{item.unitPrice > 0 ? fmtMoney(item.unitPrice) : "—"}</td>
                      <td className="px-8 py-3 text-right font-semibold">{fmtMoney(item.amount)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Totals ── */}
          <div className="px-8 py-5 space-y-2 text-sm">
            {taxEnabled ? (
              <>
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>{fmtMoney(subtotalCents)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Tax ({taxLabel})</span>
                  <span>{fmtMoney(taxAmountCents)}</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-3 mt-1">
                  <span>Total</span>
                  <span>{fmtMoney(totalCents)}</span>
                </div>
              </>
            ) : (
              <>
                <div className="flex justify-between text-gray-500">
                  <span>Subtotal</span>
                  <span>{fmtMoney(totalCents)}</span>
                </div>
                <div className="flex justify-between text-gray-500">
                  <span>Tax (WA — client to verify)</span>
                  <span className="italic text-gray-400">Not included</span>
                </div>
                <div className="flex justify-between font-bold text-base border-t border-gray-200 pt-3 mt-1">
                  <span>Total</span>
                  <span>{fmtMoney(totalCents)}</span>
                </div>
              </>
            )}
            {depositCents > 0 && (
              <div className="flex justify-between text-gray-600 text-sm">
                <span>Deposit ({depositPct}%) required to schedule</span>
                <span>{fmtMoney(depositCents)}</span>
              </div>
            )}
          </div>

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
        </div>
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

          {/* Name */}
          <Input
            placeholder="Your full name *"
            value={signerName}
            onChange={(e) => setSignerName(e.target.value)}
            className="mb-4"
          />

          {/* Signature */}
          <p className="text-sm text-gray-600 mb-2">Confirm with your signature</p>
          <div className="flex gap-2 mb-3">
            <Button size="sm" variant={sigMode === "type" ? "default" : "outline"}
              className={sigMode === "type" ? "bg-[#1a2e1a] text-white" : ""}
              onClick={() => setSigMode("type")}
            >
              <Type className="w-3.5 h-3.5 mr-1" /> Type
            </Button>
            <Button size="sm" variant={sigMode === "draw" ? "default" : "outline"}
              className={sigMode === "draw" ? "bg-[#1a2e1a] text-white" : ""}
              onClick={() => setSigMode("draw")}
            >
              <Pen className="w-3.5 h-3.5 mr-1" /> Draw
            </Button>
          </div>

          {sigMode === "type" ? (
            <div className="border border-gray-200 rounded-lg p-4 mb-4 bg-white min-h-16 flex items-end">
              <span className="text-2xl text-gray-700" style={{ fontFamily: "Dancing Script, cursive", borderBottom: "1px solid #ccc", width: "100%" }}>
                {signerName || "Your name"}
              </span>
            </div>
          ) : (
            <div className="border border-gray-200 rounded-lg mb-4 bg-white overflow-hidden">
              <canvas ref={canvasRef} width={380} height={100} className="w-full" style={{ touchAction: "none" }} />
              <button className="text-xs text-gray-400 px-3 py-1 hover:text-gray-600" onClick={() => sigPadRef.current?.clear()}>
                Clear
              </button>
            </div>
          )}

          <p className="text-xs text-gray-500 mb-3">
            By signing, you accept this estimate, its associated costs, and the{" "}
            <a href="https://handypioneers.com/terms" className="text-blue-500 underline">Terms and Conditions</a>.
            Typing or drawing your signature here has the same legal force as a written signature.
          </p>

          <label className="flex items-start gap-2 text-xs text-gray-600 mb-4 cursor-pointer">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5" />
            I agree to conduct business electronically with Handy Pioneers
          </label>

          <div className="flex gap-3 justify-end">
            <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
            <Button
              className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white font-semibold"
              disabled={approveMutation.isPending || !signerName || !agreed}
              onClick={handleApprove}
            >
              {approveMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Approving…</>
                : depositCents > 0 ? "Approve & Pay Deposit" : "Approve Estimate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PortalLayout>
  );
}
