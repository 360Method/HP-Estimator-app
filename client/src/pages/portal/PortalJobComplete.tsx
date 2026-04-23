/**
 * PortalJobComplete — customer-facing job completion sign-off page.
 * Route: /portal/job/:hpOpportunityId/complete
 *
 * Flow:
 *  1. Load job progress (milestones) + sign-off status
 *  2. Show work summary (completed milestones) + final invoice balance
 *  3. Signature canvas (draw) or adopt-to-sign (cursive text)
 *  4. On submit → portal.submitJobSignOff → redirect to final invoice
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
  RotateCcw,
  ClipboardCheck,
} from "lucide-react";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtCents(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function fmtDate(ts: string | Date | null | undefined) {
  if (!ts) return null;
  return new Date(ts).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

// ── Signature Canvas ──────────────────────────────────────────────────────────

interface SignatureCanvasProps {
  onChange: (dataUrl: string | null) => void;
}

function SignatureCanvas({ onChange }: SignatureCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const lastPos = useRef<{ x: number; y: number } | null>(null);
  const hasStrokes = useRef(false);

  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    if ("touches" in e) {
      const t = e.touches[0];
      return {
        x: (t.clientX - rect.left) * scaleX,
        y: (t.clientY - rect.top) * scaleY,
      };
    }
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function startDraw(e: React.MouseEvent | React.TouchEvent) {
    e.preventDefault();
    drawing.current = true;
    lastPos.current = getPos(e);
  }

  function draw(e: React.MouseEvent | React.TouchEvent) {
    if (!drawing.current) return;
    e.preventDefault();
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(lastPos.current!.x, lastPos.current!.y);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = "#1a2e1a";
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
    lastPos.current = pos;
    hasStrokes.current = true;
    onChange(canvas.toDataURL("image/png"));
  }

  function stopDraw() {
    drawing.current = false;
    lastPos.current = null;
  }

  function clear() {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    hasStrokes.current = false;
    onChange(null);
  }

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={600}
        height={160}
        className="w-full border border-gray-300 rounded-lg bg-white cursor-crosshair touch-none"
        style={{ height: "160px" }}
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={stopDraw}
        onMouseLeave={stopDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={stopDraw}
      />
      <button
        type="button"
        onClick={clear}
        className="absolute top-2 right-2 text-xs text-gray-400 hover:text-gray-600 flex items-center gap-1 transition-colors"
      >
        <RotateCcw className="w-3 h-3" /> Clear
      </button>
      <p className="text-[11px] text-gray-400 mt-1 text-center">
        Draw your signature above
      </p>
    </div>
  );
}

// ── Adopt-to-Sign ─────────────────────────────────────────────────────────────

function generateAdoptedSignature(name: string): string {
  const canvas = document.createElement("canvas");
  canvas.width = 600;
  canvas.height = 160;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, 600, 160);
  ctx.font = "italic 52px 'Dancing Script', cursive";
  ctx.fillStyle = "#1a2e1a";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(name, 300, 80);
  return canvas.toDataURL("image/png");
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PortalJobComplete() {
  const [, params] = useRoute("/portal/job/:hpOpportunityId/complete");
  const [, navigate] = useLocation();
  const hpOpportunityId = params?.hpOpportunityId ?? "";

  // Load job progress + sign-off status in parallel
  const { data: progressData, isLoading: progressLoading } =
    trpc.portal.getCustomerJobProgress.useQuery(
      { hpOpportunityId },
      { enabled: !!hpOpportunityId, staleTime: 30_000 }
    );

  const { data: existingSignOff, isLoading: signOffLoading } =
    trpc.portal.getJobSignOff.useQuery(
      { hpOpportunityId },
      { enabled: !!hpOpportunityId, staleTime: 30_000 }
    );

  const submitMutation = trpc.portal.submitJobSignOff.useMutation();

  // Form state
  const [signerName, setSignerName] = useState("");
  const [workSummary, setWorkSummary] = useState("");
  const [signMode, setSignMode] = useState<"draw" | "adopt">("draw");
  const [drawnSig, setDrawnSig] = useState<string | null>(null);
  const [adoptedSig, setAdoptedSig] = useState<string | null>(null);

  const milestones = progressData?.milestones ?? [];
  const completedMilestones = milestones.filter((m) => m.status === "complete");
  const allComplete =
    milestones.length > 0 &&
    milestones.every((m) => m.status === "complete");

  // Generate adopted signature whenever name changes
  useEffect(() => {
    if (signMode === "adopt" && signerName.trim()) {
      // Defer to next frame so the Dancing Script font has loaded
      const id = requestAnimationFrame(() => {
        setAdoptedSig(generateAdoptedSignature(signerName.trim()));
      });
      return () => cancelAnimationFrame(id);
    } else {
      setAdoptedSig(null);
    }
  }, [signerName, signMode]);

  const activeSignature = signMode === "draw" ? drawnSig : adoptedSig;

  const canSubmit =
    signerName.trim().length > 0 &&
    activeSignature !== null &&
    !submitMutation.isPending;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit || !activeSignature) return;
    try {
      const result = await submitMutation.mutateAsync({
        hpOpportunityId,
        signerName: signerName.trim(),
        signatureDataUrl: activeSignature,
        workSummary: workSummary.trim() || undefined,
      });
      toast.success("Sign-off complete! Your signature has been saved.");
      // Redirect to final invoice if one exists
      if (result.finalInvoiceId) {
        navigate(`/portal/invoices/${result.finalInvoiceId}`);
      } else {
        navigate("/portal/home");
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Sign-off failed. Please try again.");
    }
  }, [canSubmit, activeSignature, hpOpportunityId, signerName, workSummary, submitMutation, toast, navigate]);

  const isLoading = progressLoading || signOffLoading;

  return (
    <PortalLayout>
      {/* Load Dancing Script for adopt-to-sign */}
      <link
        rel="stylesheet"
        href="https://fonts.googleapis.com/css2?family=Dancing+Script:wght@600&display=swap"
      />

      <div className="p-6 max-w-2xl mx-auto">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate(`/portal/job/${hpOpportunityId}`)}
          className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-4 transition-colors"
        >
          <ChevronLeft className="w-3 h-3" /> Back to Job Progress
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="w-9 h-9 rounded-full bg-emerald-600 flex items-center justify-center">
            <ClipboardCheck className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-light text-gray-900">
              Sign Off on Completed Work
            </h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Review the work completed and provide your e-signature to confirm
              satisfaction.
            </p>
          </div>
        </div>

        {isLoading && (
          <div className="flex justify-center py-20">
            <Loader2 className="w-6 h-6 animate-spin text-[#2d4a2d]" />
          </div>
        )}

        {/* Already signed */}
        {!isLoading && existingSignOff && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-3" />
            <h2 className="text-lg font-semibold text-emerald-800 mb-1">
              Already Signed Off
            </h2>
            <p className="text-sm text-emerald-700">
              You signed off on{" "}
              <strong>{fmtDate(existingSignOff.signedAt)}</strong> as{" "}
              <strong>{existingSignOff.signerName}</strong>.
            </p>
            {existingSignOff.finalInvoiceId && (
              <Button
                className="mt-4 bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white"
                onClick={() =>
                  navigate(`/portal/invoices/${existingSignOff.finalInvoiceId}`)
                }
              >
                View Final Invoice
              </Button>
            )}
          </div>
        )}

        {/* Sign-off form */}
        {!isLoading && !existingSignOff && (
          <div className="space-y-5">
            {/* Work summary — completed milestones */}
            {completedMilestones.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                <div className="px-5 py-3 border-b border-gray-100 flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                    Work Completed
                  </p>
                  <span className="text-xs text-emerald-600 font-medium">
                    {completedMilestones.length} of {milestones.length} milestones
                  </span>
                </div>
                <div className="divide-y divide-gray-50">
                  {completedMilestones.map((m) => (
                    <div key={m.id} className="flex items-start gap-3 px-5 py-3">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-gray-800">
                          {m.title}
                        </p>
                        {m.description && (
                          <p className="text-xs text-gray-400 mt-0.5">
                            {m.description}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {!allComplete && milestones.length > 0 && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700">
                Not all milestones are marked complete yet. You can still sign
                off if you are satisfied with the work performed.
              </div>
            )}

            {/* Customer notes */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-400 mb-2">
                Notes (optional)
              </label>
              <Textarea
                placeholder="Any comments about the work completed..."
                value={workSummary}
                onChange={(e) => setWorkSummary(e.target.value)}
                rows={3}
                className="resize-none text-sm"
              />
            </div>

            {/* Signature block */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm space-y-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                Your Signature
              </p>

              {/* Name */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  Full name (as it will appear on the signature)
                </label>
                <Input
                  placeholder="e.g. Jane Smith"
                  value={signerName}
                  onChange={(e) => setSignerName(e.target.value)}
                  className="text-sm"
                />
              </div>

              {/* Mode toggle */}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setSignMode("draw")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    signMode === "draw"
                      ? "bg-[#1a2e1a] text-white border-[#1a2e1a]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <PenLine className="w-3 h-3" /> Draw
                </button>
                <button
                  type="button"
                  onClick={() => setSignMode("adopt")}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                    signMode === "adopt"
                      ? "bg-[#1a2e1a] text-white border-[#1a2e1a]"
                      : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"
                  }`}
                >
                  <Type className="w-3 h-3" /> Adopt
                </button>
              </div>

              {/* Draw canvas */}
              {signMode === "draw" && (
                <SignatureCanvas onChange={setDrawnSig} />
              )}

              {/* Adopt preview */}
              {signMode === "adopt" && (
                <div className="border border-gray-300 rounded-lg bg-white p-4 min-h-[100px] flex items-center justify-center">
                  {signerName.trim() ? (
                    <span
                      style={{
                        fontFamily: "'Dancing Script', cursive",
                        fontSize: "3rem",
                        color: "#1a2e1a",
                        lineHeight: 1.2,
                      }}
                    >
                      {signerName.trim()}
                    </span>
                  ) : (
                    <p className="text-xs text-gray-400">
                      Enter your name above to preview your adopted signature
                    </p>
                  )}
                </div>
              )}

              {/* Legal notice */}
              <p className="text-[11px] text-gray-400 leading-relaxed">
                By clicking "Confirm Sign-Off" you acknowledge that the work
                described above has been completed to your satisfaction and
                agree to the terms of your project agreement with Handy
                Pioneers. This constitutes a legally binding electronic
                signature.
              </p>
            </div>

            {/* Submit */}
            <Button
              className="w-full bg-emerald-600 hover:bg-emerald-700 text-white h-12 text-base font-medium"
              disabled={!canSubmit}
              onClick={handleSubmit}
            >
              {submitMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Confirm Sign-Off
            </Button>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
