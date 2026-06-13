/**
 * CloseFlowPage — the guided on-site close at /os/close/:customerId.
 * Full-screen presentation surface (no OsShell): the consultant preps on
 * the pre-flight screen, then walks the client through roadmap →
 * membership offer → estimate → signature → payment → what happens next.
 *
 * Customer-visible from the estimate step on: customer-facing tier names
 * and retail prices only, never costs or margins. Refresh-safe: the
 * current step mirrors to ?step= and re-derives against the context on
 * load (closeSteps.ts owns the skip rules).
 */
import { useEffect, useMemo, useState } from "react";
import { useParams, useLocation } from "wouter";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../../server/routers";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, CalendarCheck, Check, CheckCircle2, Eye, FileText,
  Loader2, Mail, PenLine, X,
} from "lucide-react";
import SignatureCapture from "@/components/SignatureCapture";
import EstimateDocument, { fmtMoney, fmtDate } from "@/components/portal/EstimateDocument";
import { deriveCloseSteps, normalizeStep, nextStep, prevStep, type CloseStepKey } from "./closeSteps";
import MembershipStep from "./MembershipStep";
import PayStep from "./PayStep";

export type CloseContext = inferRouterOutputs<AppRouter>["closeFlow"]["getContext"];

const STEP_LABELS: Record<CloseStepKey, string> = {
  preflight: "Pre-flight",
  roadmap: "Roadmap",
  membership: "Membership",
  estimate: "Estimate",
  sign: "Sign",
  pay: "Deposit",
  done: "Next steps",
};

function mirrorStepToUrl(step: CloseStepKey) {
  const url = new URL(window.location.href);
  url.searchParams.set("step", step);
  window.history.replaceState(null, "", url.pathname + url.search);
}

export default function CloseFlowPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const initialParams = useMemo(() => new URLSearchParams(window.location.search), []);
  const propertyId = initialParams.get("propertyId") || undefined;

  const utils = trpc.useUtils();
  const { data: ctx, isLoading } = trpc.closeFlow.getContext.useQuery(
    { customerId: customerId ?? "", propertyId },
    { enabled: !!customerId },
  );

  const steps = useMemo<CloseStepKey[]>(
    () =>
      ctx
        ? deriveCloseSteps({
            hasRoadmap: ctx.readiness.hasRoadmap,
            alreadyMember: ctx.readiness.alreadyMember,
            estimateStatus: ctx.estimate?.status ?? null,
            depositAmountCents: ctx.estimate?.depositAmount ?? 0,
            depositInvoiceStatus: ctx.readiness.depositInvoiceStatus,
          })
        : ["preflight"],
    [ctx],
  );

  const [rawStep, setRawStep] = useState<string | null>(initialParams.get("step"));
  const step = normalizeStep(steps, rawStep);

  useEffect(() => {
    mirrorStepToUrl(step);
  }, [step]);

  const go = (s: CloseStepKey | null) => {
    if (s) setRawStep(s);
  };
  const refresh = () => utils.closeFlow.getContext.invalidate({ customerId: customerId ?? "", propertyId });
  const exit = () => window.history.back();

  if (!customerId) return null;
  if (isLoading || !ctx) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--hp-cream)" }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "var(--hp-gold-deep)" }} />
      </div>
    );
  }

  const presenting = step !== "preflight";

  return (
    <div className="min-h-screen" style={{ background: "var(--hp-cream)", color: "var(--hp-ink)" }}>
      {/* Top strip: step dots + discreet exit. Slim on purpose during the presentation. */}
      <div className="flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-1.5">
          {steps.filter((s) => s !== "preflight").map((s) => (
            <span
              key={s}
              title={STEP_LABELS[s]}
              className="w-2 h-2 rounded-full"
              style={{
                background: s === step ? "var(--hp-gold-deep)" : steps.indexOf(s) < steps.indexOf(step) ? "var(--hp-ink-soft)" : "rgba(26,46,26,0.18)",
              }}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={exit}
          title="Exit presentation"
          aria-label="Exit presentation"
          className="p-1.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className={`mx-auto px-5 pb-16 ${presenting ? "max-w-3xl" : "max-w-2xl"}`}>
        {step === "preflight" && <PreflightStep ctx={ctx} onBegin={() => go(nextStep(steps, "preflight"))} onExit={exit} />}
        {step === "roadmap" && (
          <RoadmapStep ctx={ctx} onBack={() => go(prevStep(steps, step))} onNext={() => go(nextStep(steps, step))} />
        )}
        {step === "membership" && (
          <MembershipStep
            ctx={ctx}
            onEnrolled={() => { void refresh(); go(nextStep(steps, step)); }}
            onSkip={() => go(nextStep(steps, step))}
            onBack={() => go(prevStep(steps, step))}
          />
        )}
        {step === "estimate" && (
          <EstimateStep ctx={ctx} onBack={() => go(prevStep(steps, step))} onNext={() => go(nextStep(steps, step))} />
        )}
        {step === "sign" && (
          <SignStep
            ctx={ctx}
            onSigned={() => { void refresh(); go(nextStep(steps, step)); }}
            onNext={() => go(nextStep(steps, step))}
            onBack={() => go(prevStep(steps, step))}
          />
        )}
        {step === "pay" && (
          <PayStep
            ctx={ctx}
            customerId={customerId}
            propertyId={propertyId}
            onPaid={() => { void refresh(); go("done"); }}
            onSkip={() => go("done")}
            onBack={() => go(prevStep(steps, step))}
          />
        )}
        {step === "done" && <DoneStep ctx={ctx} customerId={customerId} onExit={exit} />}
      </div>
    </div>
  );
}

// ─── Pre-flight (staff-facing) ────────────────────────────────────────────────

function ReadinessRow({ ok, label, fix }: { ok: boolean; label: string; fix?: string }) {
  return (
    <div className="flex items-start gap-2.5 py-2">
      {ok ? (
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
      ) : (
        <span className="w-4 h-4 mt-0.5 shrink-0 rounded-full border-2 border-amber-500" />
      )}
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        {!ok && fix && <div className="text-xs text-muted-foreground">{fix}</div>}
      </div>
    </div>
  );
}

function PreflightStep({ ctx, onBegin, onExit }: { ctx: CloseContext; onBegin: () => void; onExit: () => void }) {
  const r = ctx.readiness;
  const [, navigate] = useLocation();

  // Resume the estimate in the guided wizard so the consultant can price it
  // and sync it quietly (Send → Sync to Portal), then come back to Start close.
  const openInBuilder = (opportunityId: string) => {
    navigate(`/os/estimate/${opportunityId}`);
  };

  const fmtDollars = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

  return (
    <div className="pt-6">
      <p className="hp-eyebrow text-xs mb-1" style={{ color: "var(--hp-gold-deep)" }}>On-site close</p>
      <h1 className="hp-serif text-3xl leading-tight">{ctx.customer.name}</h1>
      {ctx.property && (
        <p className="text-sm text-muted-foreground mt-1">
          {[ctx.property.label, ctx.property.street, ctx.property.city].filter(Boolean).join(" · ")}
        </p>
      )}

      <div className="mt-6 bg-white rounded-xl border px-5 py-4" style={{ borderColor: "var(--hp-hairline)" }}>
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">Ready to present?</p>
        <ReadinessRow
          ok={r.hasRoadmap}
          label="Roadmap delivered"
          fix="No roadmap PDF yet. Run a spot inspection or 360 scan first; the roadmap step will be skipped."
        />
        <ReadinessRow
          ok={r.estimateSynced}
          label="Estimate ready for signing"
          fix="Nothing is synced for signing yet. You can still present the roadmap and membership now; to sign today, open the estimate below and use Send, then Sync to Portal (no message goes out)."
        />
        <ReadinessRow
          ok={r.customerEmailPresent}
          label="Customer email on file"
          fix="Add an email on the client profile to enable card payments and confirmations."
        />
        {r.alreadyMember && ctx.property?.membershipTierLabel && (
          <div className="flex items-center gap-2 mt-2 text-xs">
            <Check className="w-3.5 h-3.5 text-emerald-600" />
            <span>
              Already a <strong>{ctx.property.membershipTierLabel}</strong> member. The membership offer will be skipped.
            </span>
          </div>
        )}
      </div>

      {ctx.estimate ? (
        <div className="mt-4 bg-white rounded-xl border px-5 py-4 flex items-center gap-3" style={{ borderColor: "var(--hp-hairline)" }}>
          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{ctx.estimate.title || `Estimate ${ctx.estimate.estimateNumber}`}</div>
            <div className="text-xs text-muted-foreground">
              {fmtMoney(ctx.estimate.totalAmount)} total
              {ctx.estimate.depositAmount > 0 ? ` · ${fmtMoney(ctx.estimate.depositAmount)} deposit` : ""}
              {` · ${ctx.estimate.status}`}
            </div>
          </div>
        </div>
      ) : ctx.internalEstimates.length > 0 ? (
        <div className="mt-4 bg-white rounded-xl border px-5 py-4" style={{ borderColor: "var(--hp-hairline)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            Estimates in the pipeline, not yet synced for signing
          </p>
          <div className="space-y-2">
            {ctx.internalEstimates.map((e) => (
              <div key={e.id} className="flex items-center gap-3">
                <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{e.title || "Untitled estimate"}</div>
                  <div className="text-xs text-muted-foreground">
                    {e.valueDollars > 0 ? `${fmtDollars(e.valueDollars)} · ` : ""}{e.stage}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => openInBuilder(e.id)}
                  className="text-xs px-3 py-1.5 rounded-lg font-semibold border shrink-0"
                  style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
                >
                  Open in builder
                </button>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-3">
            In the builder: review the price, then Send, leave both message channels off, and tap Sync to Portal. Come back here and the estimate is ready to sign.
          </p>
        </div>
      ) : null}

      <div className="mt-6 flex items-center gap-3">
        <button type="button" onClick={onBegin} className="hp-button-gold">
          Begin presentation
          <ArrowRight className="w-4 h-4 ml-1.5 inline" />
        </button>
        <button type="button" onClick={onExit} className="text-sm text-muted-foreground hover:underline">
          Back to profile
        </button>
      </div>
      {!r.estimateSynced && (
        <p className="text-xs text-muted-foreground mt-2">
          Without a synced estimate, the presentation covers the roadmap and membership; the signing and deposit steps are skipped.
        </p>
      )}
    </div>
  );
}

// ─── Roadmap ──────────────────────────────────────────────────────────────────

function StepShell({
  eyebrow, title, children, onBack, footer,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  footer?: React.ReactNode;
}) {
  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 mb-1">
        {onBack && (
          <button type="button" onClick={onBack} aria-label="Back" className="p-1 rounded text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <p className="hp-eyebrow text-xs" style={{ color: "var(--hp-gold-deep)" }}>{eyebrow}</p>
      </div>
      <h1 className="hp-serif text-3xl leading-tight mb-4">{title}</h1>
      {children}
      {footer && <div className="mt-6">{footer}</div>}
    </div>
  );
}

/**
 * Renders the roadmap PDF from server-fetched bytes (blob URL). Loading the
 * document host directly in an iframe fails in the field — CSP, Cloudinary's
 * PDF-delivery block — and failures show as a blank or "content blocked"
 * frame. This way the server does the fetch and any error is readable.
 */
function RoadmapPdfViewer({ customerId, roadmapId, originalUrl }: { customerId: string; roadmapId: string; originalUrl: string }) {
  const pdfQuery = trpc.closeFlow.getRoadmapPdf.useQuery(
    { customerId, roadmapId },
    { staleTime: 10 * 60_000, retry: 1, refetchOnWindowFocus: false },
  );
  const blobUrl = useMemo(() => {
    if (!pdfQuery.data) return null;
    const bytes = Uint8Array.from(atob(pdfQuery.data.base64), (c) => c.charCodeAt(0));
    return URL.createObjectURL(new Blob([bytes], { type: pdfQuery.data.mimeType }));
  }, [pdfQuery.data]);
  useEffect(() => () => { if (blobUrl) URL.revokeObjectURL(blobUrl); }, [blobUrl]);

  if (pdfQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground" style={{ height: "40vh" }}>
        <Loader2 className="w-4 h-4 animate-spin" /> Loading the roadmap…
      </div>
    );
  }
  if (!blobUrl) {
    return (
      <div className="px-4 py-8 text-sm text-muted-foreground space-y-2">
        <p>The roadmap PDF would not load{pdfQuery.error ? `: ${pdfQuery.error.message}` : "."}</p>
        <a href={originalUrl} target="_blank" rel="noopener noreferrer" className="underline font-medium">
          Try opening it in a new tab
        </a>
      </div>
    );
  }
  return <iframe src={blobUrl} title="Roadmap PDF" className="w-full" style={{ height: "70vh", border: 0 }} />;
}

function RoadmapStep({ ctx, onBack, onNext }: { ctx: CloseContext; onBack: () => void; onNext: () => void }) {
  const latest = ctx.roadmaps[0];
  return (
    <StepShell
      eyebrow="Step 1 · Where your home stands"
      title="Your home's roadmap"
      onBack={onBack}
      footer={
        <button type="button" onClick={onNext} className="hp-button-gold">
          Continue <ArrowRight className="w-4 h-4 ml-1.5 inline" />
        </button>
      }
    >
      {latest ? (
        <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: "var(--hp-hairline)" }}>
          <div className="px-4 py-2.5 flex items-center justify-between border-b" style={{ borderColor: "var(--hp-hairline)" }}>
            <span className="text-sm font-medium">{latest.title}</span>
            <span className="text-xs text-muted-foreground">Delivered {fmtDate(latest.dateMs)}</span>
          </div>
          <RoadmapPdfViewer customerId={ctx.customer.id} roadmapId={latest.id} originalUrl={latest.pdfUrl} />
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No roadmap on file.</p>
      )}
    </StepShell>
  );
}

// ─── Estimate review ──────────────────────────────────────────────────────────

function EstimateStep({ ctx, onBack, onNext }: { ctx: CloseContext; onBack: () => void; onNext: () => void }) {
  // The consultant owns the price reveal: the document opens scope-only so
  // the value walk happens first, and dollars appear only on their tap.
  // Re-entering after approval shows pricing immediately.
  const [priceRevealed, setPriceRevealed] = useState(ctx.estimate?.status === "approved");
  if (!ctx.estimate) return null;
  return (
    <StepShell
      eyebrow="The work, in writing"
      title="Your estimate"
      onBack={onBack}
      footer={
        priceRevealed ? (
          <button type="button" onClick={onNext} className="hp-button-gold">
            {ctx.estimate.status === "approved" ? "Continue" : "Looks right, let's sign"}
            <ArrowRight className="w-4 h-4 ml-1.5 inline" />
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setPriceRevealed(true)}
            className="inline-flex items-center text-sm px-4 py-2.5 rounded-lg font-semibold border"
            style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
          >
            <Eye className="w-4 h-4 mr-1.5" /> Reveal pricing
          </button>
        )
      }
    >
      <EstimateDocument
        showPricing={priceRevealed}
        estimate={{
          ...ctx.estimate,
          customerName: ctx.customer.name,
          customerAddress: ctx.property
            ? [ctx.property.street, ctx.property.city, ctx.property.state].filter(Boolean).join(", ")
            : null,
        }}
      />
    </StepShell>
  );
}

// ─── Sign ────────────────────────────────────────────────────────────────────

function SignStep({
  ctx, onSigned, onNext, onBack,
}: {
  ctx: CloseContext;
  onSigned: () => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const approve = trpc.closeFlow.approveEstimateInPerson.useMutation({
    onSuccess: () => {
      toast.success("Estimate signed and approved.");
      onSigned();
    },
    onError: (e) => toast.error(e.message),
  });

  if (!ctx.estimate) return null;
  const est = ctx.estimate;

  if (est.status === "approved") {
    return (
      <StepShell
        eyebrow="Approval"
        title="Already signed"
        onBack={onBack}
        footer={
          <button type="button" onClick={onNext} className="hp-button-gold">
            Continue <ArrowRight className="w-4 h-4 ml-1.5 inline" />
          </button>
        }
      >
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
          Approved on {fmtDate(est.approvedAt)} by {est.signerName ?? ctx.customer.name}.
          {est.depositAmount > 0 && ctx.readiness.depositInvoiceStatus !== "paid" && (
            <span> A {fmtMoney(est.depositAmount)} deposit is due to schedule.</span>
          )}
        </div>
      </StepShell>
    );
  }

  return (
    <StepShell eyebrow="Make it official" title="Sign the estimate" onBack={onBack}>
      <div className="bg-white rounded-xl border px-5 py-5" style={{ borderColor: "var(--hp-hairline)" }}>
        <div className="flex items-center gap-3 bg-[#1a2e1a]/5 border border-[#1a2e1a]/20 rounded-lg p-3 mb-4">
          <div className="w-10 h-10 bg-[#1a2e1a] rounded flex items-center justify-center shrink-0">
            <PenLine className="w-4 h-4 text-green-200" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate">{est.title ?? `Estimate ${est.estimateNumber}`}</p>
            <p className="text-xs text-muted-foreground">
              Total {fmtMoney(est.totalAmount)}
              {est.depositAmount > 0 ? ` · ${fmtMoney(est.depositAmount)} deposit due after signing` : ""}
            </p>
          </div>
        </div>

        <SignatureCapture
          busy={approve.isPending}
          submitLabel={est.depositAmount > 0 ? "Approve & continue to deposit" : "Approve estimate"}
          onSign={(signerName, signatureDataUrl) =>
            approve.mutate({
              portalEstimateId: est.id,
              signerName,
              signatureDataUrl,
              deviceInfo: navigator.userAgent.slice(0, 280),
            })
          }
        />

        <p className="text-[11px] text-muted-foreground mt-3">
          Signed in person on this device, witnessed by Handy Pioneers staff. A copy lands in your customer portal.
        </p>
      </div>
    </StepShell>
  );
}

// ─── Done ────────────────────────────────────────────────────────────────────

function DoneStep({ ctx, customerId, onExit }: { ctx: CloseContext; customerId: string; onExit: () => void }) {
  // The deposit webhook creates the job server-side moments after payment;
  // poll the close context briefly so the job and its dates land while the
  // customer is still looking at this screen. Every line below states only
  // what has actually happened.
  const { data: fresh } = trpc.closeFlow.getContext.useQuery(
    { customerId },
    { refetchInterval: 4000 },
  );
  const live = fresh ?? ctx;
  const job = (live as { jobOpportunity?: { id: string; stage: string; scheduledDate: string | null } | null }).jobOpportunity ?? null;
  const depositPaid = live.readiness.depositInvoiceStatus === "paid";
  const scheduled = job?.scheduledDate ? fmtDate(job.scheduledDate) : null;

  return (
    <StepShell eyebrow="All set" title="What happens next">
      <div className="bg-white rounded-xl border px-5 py-5 space-y-4" style={{ borderColor: "var(--hp-hairline)" }}>
        {ctx.estimate?.status === "approved" ? (
          <>
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-emerald-600" />
              <div>
                <p className="text-sm font-semibold">
                  {depositPaid ? "Deposit received" : "Your project is locked in"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {depositPaid
                    ? "A receipt is in your inbox."
                    : `${ctx.estimate?.title ?? "The approved work"} is signed and saved in your portal.`}
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <CalendarCheck className="w-5 h-5 mt-0.5 shrink-0" style={{ color: "var(--hp-gold-deep)" }} />
              <div>
                <p className="text-sm font-semibold">Scheduling</p>
                <p className="text-xs text-muted-foreground">
                  {scheduled
                    ? `Work is on the calendar for ${scheduled}.`
                    : "We will call you to schedule the work."}
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex items-start gap-3">
            <CheckCircle2 className="w-5 h-5 mt-0.5 shrink-0 text-emerald-600" />
            <div>
              <p className="text-sm font-semibold">Thanks for walking through it together</p>
              <p className="text-xs text-muted-foreground">
                {ctx.readiness.alreadyMember || ctx.property?.membershipTierLabel
                  ? "Your home is on the proactive plan; seasonal visits and the annual scan come to you."
                  : "Everything we covered today is saved; we follow up with the next step."}
              </p>
            </div>
          </div>
        )}
        <div className="flex items-start gap-3">
          <Mail className="w-5 h-5 mt-0.5 shrink-0 text-muted-foreground" />
          <div>
            <p className="text-sm font-semibold">In your inbox</p>
            <p className="text-xs text-muted-foreground">
              A confirmation with your signed estimate and portal access is on its way
              {ctx.customer.email ? ` to ${ctx.customer.email}` : ""}.
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6">
        <button type="button" onClick={onExit} className="hp-button-gold">
          Finish
        </button>
      </div>
    </StepShell>
  );
}
