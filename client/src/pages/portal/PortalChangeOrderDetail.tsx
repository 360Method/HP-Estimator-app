/**
 * PortalChangeOrderDetail — /portal/change-orders/:id
 *
 * Customer-facing change order approval page:
 *  1. Shows CO header (number, title, total)
 *  2. Shows scope of work and line items
 *  3. Approve flow: signer name + draw/adopt-to-sign canvas
 *  4. Decline flow: optional reason textarea
 *  5. On approve → portal.approveChangeOrder → redirect to invoice if created
 */
import { useRoute, useLocation } from "wouter";
import { useRef, useEffect, useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle2,
  ChevronLeft,
  PenLine,
  Type,
  XCircle,
  AlertTriangle,
} from "lucide-react";

// ─── SIGNATURE CANVAS ────────────────────────────────────────────────────────
function SignatureCanvas({ onSign }: { onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    ctx.strokeStyle = "#1a2e1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";

    const start = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      drawing.current = true;
      const pos = getPos(e, canvas);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };
    const move = (e: MouseEvent | TouchEvent) => {
      e.preventDefault();
      if (!drawing.current) return;
      const pos = getPos(e, canvas);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
    };
    const end = () => {
      drawing.current = false;
      onSign(canvas.toDataURL("image/png"));
    };

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", move);
    canvas.addEventListener("mouseup", end);
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", move);
      canvas.removeEventListener("mouseup", end);
      canvas.removeEventListener("touchstart", start);
      canvas.removeEventListener("touchmove", move);
      canvas.removeEventListener("touchend", end);
    };
  }, [onSign]);

  const clear = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.getContext("2d")!.clearRect(0, 0, canvas.width, canvas.height);
    onSign("");
  };

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={560}
        height={140}
        className="w-full border-2 border-dashed border-border rounded-lg bg-white touch-none cursor-crosshair"
        style={{ maxHeight: 140 }}
      />
      <button
        type="button"
        onClick={clear}
        className="absolute top-2 right-2 text-xs text-muted-foreground hover:text-foreground underline"
      >
        Clear
      </button>
      <p className="text-xs text-muted-foreground mt-1">Draw your signature above</p>
    </div>
  );
}

// ─── ADOPT-TO-SIGN ───────────────────────────────────────────────────────────
function AdoptSignature({ name, onSign }: { name: string; onSign: (dataUrl: string) => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !name.trim()) return;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#1a2e1a";
    ctx.font = "italic 38px 'Dancing Script', cursive";
    ctx.textBaseline = "middle";
    ctx.fillText(name, 20, canvas.height / 2);
    onSign(canvas.toDataURL("image/png"));
  }, [name, onSign]);

  if (!name.trim()) {
    return (
      <div className="w-full h-[80px] border-2 border-dashed border-border rounded-lg bg-white flex items-center justify-center">
        <p className="text-sm text-muted-foreground">Enter your name above to preview</p>
      </div>
    );
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={560}
        height={80}
        className="w-full border-2 border-dashed border-border rounded-lg bg-white"
        style={{ maxHeight: 80 }}
      />
      <p className="text-xs text-muted-foreground mt-1">Preview of your adopted signature</p>
    </div>
  );
}

// ─── LINE ITEMS TABLE ─────────────────────────────────────────────────────────
function LineItemsTable({ json }: { json: string | null }) {
  if (!json) return null;
  let items: Array<{ description: string; qty?: number; unitPrice?: number; amount?: number }> = [];
  try { items = JSON.parse(json); } catch { return null; }
  if (!items.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-2 pr-4 font-medium text-muted-foreground">Description</th>
            <th className="text-right py-2 pr-4 font-medium text-muted-foreground">Qty</th>
            <th className="text-right py-2 font-medium text-muted-foreground">Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i} className="border-b border-border/50">
              <td className="py-2 pr-4">{item.description}</td>
              <td className="py-2 pr-4 text-right text-muted-foreground">{item.qty ?? "—"}</td>
              <td className="py-2 text-right">
                {item.amount != null ? `$${(item.amount / 100).toFixed(2)}` : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── MAIN PAGE ────────────────────────────────────────────────────────────────
export default function PortalChangeOrderDetail() {
  const [, params] = useRoute("/portal/change-orders/:id");
  const [, navigate] = useLocation();
  const coId = Number(params?.id ?? 0);

  const [signMode, setSignMode] = useState<"draw" | "adopt">("adopt");
  const [signerName, setSignerName] = useState("");
  const [activeSignature, setActiveSignature] = useState("");
  const [showDecline, setShowDecline] = useState(false);
  const [declineReason, setDeclineReason] = useState("");

  const { data: co, isLoading, error } = trpc.portal.getChangeOrder.useQuery(
    { id: coId },
    { enabled: coId > 0, retry: false }
  );

  const approveMutation = trpc.portal.approveChangeOrder.useMutation();
  const declineMutation = trpc.portal.declineChangeOrder.useMutation();

  const canApprove = signerName.trim().length > 0 && activeSignature.length > 0;

  const handleApprove = useCallback(async () => {
    if (!canApprove || !co) return;
    try {
      const result = await approveMutation.mutateAsync({
        id: co.id,
        signerName: signerName.trim(),
        signatureDataUrl: activeSignature,
      });
      toast.success("Change order approved!");
      if (result.invoiceId) {
        navigate(`/portal/invoices/${result.invoiceId}`);
      } else {
        navigate("/portal");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Approval failed. Please try again.";
      toast.error(msg);
    }
  }, [canApprove, co, approveMutation, signerName, activeSignature, navigate]);

  const handleDecline = useCallback(async () => {
    if (!co) return;
    try {
      await declineMutation.mutateAsync({ id: co.id, declineReason: declineReason || undefined });
      toast.success("Change order declined. HP team has been notified.");
      navigate("/portal");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to decline. Please try again.";
      toast.error(msg);
    }
  }, [co, declineMutation, declineReason, navigate]);

  if (isLoading) {
    return (
      <PortalLayout>
        <div className="flex items-center justify-center min-h-[40vh]">
          <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
        </div>
      </PortalLayout>
    );
  }

  if (error || !co) {
    return (
      <PortalLayout>
        <div className="max-w-2xl mx-auto px-4 py-12 text-center">
          <AlertTriangle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
          <h2 className="text-xl font-semibold mb-2">Change Order Not Found</h2>
          <p className="text-muted-foreground mb-6">This change order may have expired or doesn't belong to your account.</p>
          <Button variant="outline" onClick={() => navigate("/portal")}>Back to Portal</Button>
        </div>
      </PortalLayout>
    );
  }

  const totalFmt = `$${(co.totalAmount / 100).toFixed(2)}`;
  const isApproved = co.status === "approved";
  const isDeclined = co.status === "declined";
  const isResolved = isApproved || isDeclined;

  return (
    <PortalLayout>
      {/* Dancing Script for adopt-to-sign */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap" rel="stylesheet" />

      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Back */}
        <button
          onClick={() => navigate("/portal")}
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
        >
          <ChevronLeft className="w-4 h-4" /> Back to Portal
        </button>

        {/* Header */}
        <div className="bg-card border border-border rounded-xl p-6 mb-6">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <p className="text-xs font-mono text-muted-foreground mb-1">{co.coNumber}</p>
              <h1 className="text-2xl font-bold">{co.title}</h1>
            </div>
            <div className="text-right shrink-0">
              <p className="text-3xl font-bold text-foreground">{totalFmt}</p>
              <p className="text-xs text-muted-foreground">Change order total</p>
            </div>
          </div>

          {/* Status badge */}
          {isApproved && (
            <div className="flex items-center gap-2 mt-4 p-3 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-sm font-medium text-emerald-700 dark:text-emerald-400">
                Approved by {co.signerName} on {new Date(co.approvedAt!).toLocaleDateString()}
              </p>
            </div>
          )}
          {isDeclined && (
            <div className="flex items-center gap-2 mt-4 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg">
              <XCircle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm font-medium text-red-700 dark:text-red-400">
                Declined on {new Date(co.declinedAt!).toLocaleDateString()}
                {co.declineReason ? ` — ${co.declineReason}` : ""}
              </p>
            </div>
          )}
        </div>

        {/* Scope of work */}
        {co.scopeOfWork && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="font-semibold mb-3">Scope of Work</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-wrap">{co.scopeOfWork}</p>
          </div>
        )}

        {/* Line items */}
        {co.lineItemsJson && (
          <div className="bg-card border border-border rounded-xl p-6 mb-6">
            <h2 className="font-semibold mb-3">Line Items</h2>
            <LineItemsTable json={co.lineItemsJson} />
            <div className="flex justify-end mt-4 pt-4 border-t border-border">
              <p className="font-bold text-lg">{totalFmt}</p>
            </div>
          </div>
        )}

        {/* Approve / Decline — only show if not yet resolved */}
        {!isResolved && (
          <>
            {!showDecline ? (
              <div className="bg-card border border-border rounded-xl p-6 mb-6">
                <h2 className="font-semibold mb-1">Approve Change Order</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  By signing below you authorize Handy Pioneers to proceed with the additional scope and agree to pay the amount above.
                </p>

                {/* Signer name */}
                <div className="mb-4">
                  <label className="block text-sm font-medium mb-1">Full Name</label>
                  <Input
                    placeholder="Type your full name"
                    value={signerName}
                    onChange={(e) => setSignerName(e.target.value)}
                  />
                </div>

                {/* Sign mode toggle */}
                <div className="flex gap-2 mb-4">
                  <button
                    type="button"
                    onClick={() => setSignMode("adopt")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      signMode === "adopt"
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Type className="w-3.5 h-3.5" /> Adopt Signature
                  </button>
                  <button
                    type="button"
                    onClick={() => setSignMode("draw")}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm border transition-colors ${
                      signMode === "draw"
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <PenLine className="w-3.5 h-3.5" /> Draw Signature
                  </button>
                </div>

                {/* Signature area */}
                {signMode === "adopt" ? (
                  <AdoptSignature name={signerName} onSign={setActiveSignature} />
                ) : (
                  <SignatureCanvas onSign={setActiveSignature} />
                )}

                {/* Legal notice */}
                <p className="text-xs text-muted-foreground mt-4 mb-6">
                  By clicking "Approve &amp; Sign", you agree that this electronic signature is the legal equivalent of your manual signature and authorizes the additional work described above.
                </p>

                <div className="flex gap-3">
                  <Button
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                    disabled={!canApprove || approveMutation.isPending}
                    onClick={handleApprove}
                  >
                    {approveMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</>
                    ) : (
                      <><CheckCircle2 className="w-4 h-4 mr-2" /> Approve &amp; Sign</>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => setShowDecline(true)}
                  >
                    Decline
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-card border border-red-200 rounded-xl p-6 mb-6">
                <h2 className="font-semibold text-red-700 mb-1">Decline Change Order</h2>
                <p className="text-sm text-muted-foreground mb-4">
                  The Handy Pioneers team will be notified. You can optionally provide a reason.
                </p>
                <Textarea
                  placeholder="Optional: reason for declining…"
                  value={declineReason}
                  onChange={(e) => setDeclineReason(e.target.value)}
                  className="mb-4"
                  rows={3}
                />
                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    onClick={() => setShowDecline(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    className="bg-red-600 hover:bg-red-700 text-white"
                    disabled={declineMutation.isPending}
                    onClick={handleDecline}
                  >
                    {declineMutation.isPending ? (
                      <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Declining…</>
                    ) : (
                      <><XCircle className="w-4 h-4 mr-2" /> Confirm Decline</>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}

        {/* Already resolved — show invoice link if exists */}
        {isApproved && co.invoiceId && (
          <div className="text-center">
            <Button onClick={() => navigate(`/portal/invoices/${co.invoiceId}`)}>
              View Invoice
            </Button>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
