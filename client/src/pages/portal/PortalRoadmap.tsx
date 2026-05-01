/**
 * PortalRoadmap — the customer's "Your 360° Roadmap" surface.
 *
 * Shows the homeowner's most recent Roadmap (Priority Translation) deliverable,
 * inline PDF preview, share link, plus the contextual "Ready to take action"
 * CTA that opens an in-portal appointment funnel — never a redirect.
 *
 * Mobile-first; affluent stewardship voice; no upsell stacking.
 */
import { useEffect, useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import {
  bucketRoadmapItems,
  formatInvestmentRange,
  normalizePriorityTranslationFindings,
} from "@/lib/roadmap";
import { toast } from "sonner";
import {
  Loader2,
  FileText,
  Download,
  Share2,
  Check,
  ArrowRight,
  ArrowLeft,
  X,
  Calendar,
  Clock,
  ShieldCheck,
  Compass,
  Briefcase,
  RefreshCw,
} from "lucide-react";

// Brand tokens — keep in sync with the rest of the portal.
const FOREST = "#1a2e1a";
const GOLD = "#c8922a";
const PARCHMENT = "#faf7f0";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmtDate(d: Date | string | number | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

function statusLabel(status: string) {
  if (status === "completed") return { text: "Delivered", tone: "ok" } as const;
  if (status === "submitted" || status === "processing")
    return { text: "Drafting", tone: "info" } as const;
  if (status === "failed") return { text: "Held — we'll reach out", tone: "warn" } as const;
  return { text: status, tone: "info" } as const;
}

// ─── Status pill ──────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const s = statusLabel(status);
  const palette = {
    ok: "bg-emerald-50 text-emerald-700 border-emerald-200",
    info: "bg-amber-50 text-amber-700 border-amber-200",
    warn: "bg-orange-50 text-orange-700 border-orange-200",
  } as const;
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border ${palette[s.tone]}`}
    >
      <span
        className={`inline-block w-1.5 h-1.5 rounded-full ${
          s.tone === "ok" ? "bg-emerald-500" : s.tone === "warn" ? "bg-orange-500" : "bg-amber-500"
        }`}
      />
      {s.text}
    </span>
  );
}

function RoadmapBuckets({ findings }: { findings?: any[] }) {
  const items = normalizePriorityTranslationFindings(findings);
  const buckets = bucketRoadmapItems(items);
  if (items.length === 0) return null;

  return (
    <div className="px-5 sm:px-6 py-5 border-t" style={{ borderColor: "#e5e0d3" }}>
      <p
        className="text-[11px] tracking-wider font-semibold uppercase mb-3"
        style={{ color: FOREST }}
      >
        Step 4: Priority Roadmap
      </p>
      <div className="grid gap-3 sm:grid-cols-3">
        {buckets.map((bucket) => (
          <div key={bucket.urgency} className="rounded-2xl border bg-white p-3" style={{ borderColor: "#e5e0d3" }}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-bold" style={{ color: FOREST }}>{bucket.label}</p>
                <p className="text-[11px] text-gray-500">{bucket.horizon}</p>
              </div>
              <span className="rounded-full bg-[#faf7f0] px-2 py-0.5 text-[10px] font-bold" style={{ color: GOLD }}>
                {bucket.items.length}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-gray-600">{bucket.customerMeaning}</p>
            <p className="mt-2 text-xs font-semibold" style={{ color: FOREST }}>
              {formatInvestmentRange(bucket.totalLow, bucket.totalHigh)}
            </p>
            <div className="mt-3 space-y-2">
              {bucket.items.slice(0, 3).map(item => (
                <div key={item.id} className="rounded-lg bg-[#faf7f0] px-3 py-2">
                  <p className="text-xs font-semibold text-gray-900">{item.title}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-gray-600">{item.finding}</p>
                </div>
              ))}
              {bucket.items.length === 0 && (
                <p className="rounded-lg border border-dashed px-3 py-3 text-center text-[11px] text-gray-500" style={{ borderColor: "#e5e0d3" }}>
                  No items here.
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── PDF preview ──────────────────────────────────────────────────────────────
/**
 * Inline preview using <iframe>. Browsers render PDF natively; on iOS Safari
 * the rendering quality is excellent and gestures work correctly. We avoid
 * pulling in pdf.js — keeps the bundle small.
 */
function PdfPreview({ pdfUrl }: { pdfUrl: string | null }) {
  if (!pdfUrl) {
    return (
      <div
        className="rounded-2xl border border-dashed flex flex-col items-center justify-center p-10 text-center"
        style={{ borderColor: "#e5e0d3", background: PARCHMENT }}
      >
        <FileText className="w-10 h-10 mb-3" style={{ color: GOLD }} />
        <p className="font-serif text-lg" style={{ color: FOREST }}>
          Your Roadmap is being prepared
        </p>
        <p className="text-sm text-gray-600 mt-1 max-w-xs">
          A steward is reviewing your home's report. We'll email you the moment it's ready.
        </p>
      </div>
    );
  }
  return (
    <div
      className="rounded-2xl overflow-hidden border shadow-sm bg-white"
      style={{ borderColor: "#e5e0d3" }}
    >
      <iframe
        src={pdfUrl}
        title="360° Roadmap"
        className="w-full"
        style={{ height: "min(78vh, 720px)", border: "none" }}
      />
    </div>
  );
}

// ─── Funnel: Step indicator ───────────────────────────────────────────────────
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-1.5">
      {Array.from({ length: total }).map((_, i) => (
        <span
          key={i}
          className="rounded-full transition-all duration-300"
          style={{
            width: i === step ? 22 : 7,
            height: 7,
            background: i <= step ? GOLD : "#e5e0d3",
          }}
        />
      ))}
    </div>
  );
}

// ─── Funnel: Modal ────────────────────────────────────────────────────────────
type Slot = {
  id: string;
  slotId?: number;
  startIso: string;
  endIso: string;
  label: string;
};

function BaselineFunnel({
  open,
  onClose,
  prefill,
  onBooked,
}: {
  open: boolean;
  onClose: () => void;
  prefill: { name: string; email: string; phone: string; address: string };
  onBooked: (b: { whenLabel: string; ics: string }) => void;
}) {
  const [step, setStep] = useState(0);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [name, setName] = useState(prefill.name);
  const [email, setEmail] = useState(prefill.email);
  const [phone, setPhone] = useState(prefill.phone);
  const [address, setAddress] = useState(prefill.address);
  const [concern, setConcern] = useState("");
  const [bookedSummary, setBookedSummary] = useState<{
    whenLabel: string;
    ics: string;
  } | null>(null);

  useEffect(() => {
    if (open) {
      setStep(0);
      setSelectedSlot(null);
      setName(prefill.name);
      setEmail(prefill.email);
      setPhone(prefill.phone);
      setAddress(prefill.address);
      setConcern("");
      setBookedSummary(null);
    }
  }, [open, prefill]);

  const slotsQuery = trpc.portalRoadmap.listAvailableWindows.useQuery(undefined, {
    enabled: open,
  });

  const bookMutation = trpc.portalRoadmap.bookBaselineWalkthrough.useMutation({
    onSuccess: (res) => {
      setBookedSummary({ whenLabel: res.whenLabel, ics: res.ics });
      setStep(3);
      onBooked({ whenLabel: res.whenLabel, ics: res.ics });
    },
    onError: (err) => toast.error(err.message),
  });

  const downloadIcs = () => {
    if (!bookedSummary) return;
    const blob = new Blob([bookedSummary.ics], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "baseline-walkthrough.ics";
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!open) return null;

  const canAdvance =
    (step === 0 && selectedSlot) ||
    (step === 1 && name.trim() && email.trim() && phone.trim() && address.trim()) ||
    step === 2;

  const next = () => {
    if (step === 2 && selectedSlot) {
      bookMutation.mutate({
        slotId: selectedSlot.slotId,
        startIso: selectedSlot.startIso,
        endIso: selectedSlot.endIso,
        contactName: name.trim(),
        contactEmail: email.trim(),
        contactPhone: phone.trim(),
        address: address.trim(),
        priorityConcern: concern.trim() || undefined,
      });
      return;
    }
    setStep((s) => Math.min(3, s + 1));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="bg-white w-full sm:max-w-xl sm:rounded-2xl rounded-t-2xl shadow-2xl flex flex-col max-h-[92vh] sm:max-h-[88vh] overflow-hidden"
        style={{ borderTop: `4px solid ${GOLD}` }}
      >
        {/* Header */}
        <div className="px-5 pt-5 pb-3 flex items-start justify-between">
          <div>
            <p
              className="text-[11px] tracking-[0.18em] uppercase font-semibold mb-1"
              style={{ color: GOLD }}
            >
              360° Home Method
            </p>
            <h3
              className="text-xl font-serif"
              style={{ color: FOREST, fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              {step < 3 ? "Schedule your Baseline Walkthrough" : "All set."}
            </h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-11 h-11 rounded-full hover:bg-gray-100 flex items-center justify-center -mr-2 -mt-2"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Step dots */}
        {step < 3 && (
          <div className="px-5 pb-3">
            <StepDots step={step} total={3} />
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 pb-5 sm:pb-6">
          {/* STEP 0 — pick window */}
          {step === 0 && (
            <div>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                We've held four windows for you over the next two weeks. Choose what fits — your steward
                will arrive within a 30-minute window of the time you select.
              </p>
              {slotsQuery.isLoading ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="w-5 h-5 animate-spin" style={{ color: GOLD }} />
                </div>
              ) : (
                <div className="space-y-2.5">
                  {(slotsQuery.data ?? []).map((slot) => {
                    const selected = selectedSlot?.id === slot.id;
                    return (
                      <button
                        key={slot.id}
                        onClick={() => setSelectedSlot(slot)}
                        className={`w-full text-left rounded-xl border-2 px-4 py-4 transition-all min-h-[60px] flex items-center justify-between ${
                          selected
                            ? "shadow-sm"
                            : "hover:border-gray-300 active:scale-[0.99]"
                        }`}
                        style={{
                          borderColor: selected ? GOLD : "#e5e0d3",
                          background: selected ? PARCHMENT : "white",
                        }}
                      >
                        <div className="flex items-center gap-3">
                          <Calendar className="w-4 h-4 shrink-0" style={{ color: GOLD }} />
                          <span
                            className="font-medium text-sm"
                            style={{ color: FOREST }}
                          >
                            {slot.label}
                          </span>
                        </div>
                        {selected && (
                          <span
                            className="w-7 h-7 rounded-full flex items-center justify-center"
                            style={{ background: GOLD }}
                          >
                            <Check className="w-4 h-4 text-white" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-4 leading-relaxed">
                None of these work? Continue to the next step and add a note — your steward will reach out
                with alternatives.
              </p>
            </div>
          )}

          {/* STEP 1 — confirm contact */}
          {step === 1 && (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 leading-relaxed">
                Please confirm how we reach you. We text only on the morning of the visit and only with
                arrival timing.
              </p>
              <FormField label="Name" value={name} onChange={setName} />
              <FormField
                label="Email"
                type="email"
                value={email}
                onChange={setEmail}
              />
              <FormField label="Phone" type="tel" value={phone} onChange={setPhone} />
              <FormField
                label="Property address"
                value={address}
                onChange={setAddress}
                multiline
              />
            </div>
          )}

          {/* STEP 2 — concern */}
          {step === 2 && (
            <div>
              <p className="text-sm text-gray-600 mb-4 leading-relaxed">
                Optional — sharing what weighs heaviest helps your steward prepare. Skip if nothing
                particular comes to mind.
              </p>
              <label
                className="block text-[11px] tracking-wider font-semibold uppercase mb-2"
                style={{ color: FOREST }}
              >
                What weighs heaviest on your mind?
              </label>
              <textarea
                value={concern}
                onChange={(e) => setConcern(e.target.value)}
                rows={5}
                placeholder="e.g. The roof has been quietly worrying me since last winter…"
                className="w-full px-4 py-3 rounded-xl border text-sm leading-relaxed resize-none focus:outline-none focus:ring-2 transition-shadow min-h-[120px]"
                style={
                  {
                    borderColor: "#e5e0d3",
                    background: PARCHMENT,
                    "--tw-ring-color": GOLD,
                  } as React.CSSProperties
                }
              />
            </div>
          )}

          {/* STEP 3 — confirmation */}
          {step === 3 && bookedSummary && (
            <div className="text-center py-2">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: GOLD }}
              >
                <Check className="w-7 h-7 text-white" strokeWidth={3} />
              </div>
              <p
                className="font-serif text-xl mb-2"
                style={{
                  color: FOREST,
                  fontFamily: "Georgia, 'Times New Roman', serif",
                }}
              >
                Your Baseline Walkthrough is set for
              </p>
              <p
                className="font-serif text-xl mb-5"
                style={{
                  color: GOLD,
                  fontFamily: "Georgia, 'Times New Roman', serif",
                }}
              >
                {bookedSummary.whenLabel}
              </p>
              <div
                className="rounded-xl p-5 text-left"
                style={{ background: PARCHMENT, border: "1px solid #e5e0d3" }}
              >
                <p className="text-sm text-gray-700 leading-relaxed mb-3">
                  Our Concierge will text you the morning of the visit with arrival timing and the name of
                  the steward walking your property.
                </p>
                <p className="text-sm text-gray-700 leading-relaxed">
                  There is nothing to prepare. We'll meet you at the front door.
                </p>
              </div>
              <Button
                onClick={downloadIcs}
                variant="outline"
                className="mt-5 gap-2 min-h-[44px]"
                style={{ borderColor: GOLD, color: FOREST }}
              >
                <Calendar className="w-4 h-4" />
                Add to calendar
              </Button>
            </div>
          )}
        </div>

        {/* Footer */}
        {step < 3 && (
          <div
            className="border-t px-5 py-4 flex items-center justify-between gap-3"
            style={{ borderColor: "#e5e0d3" }}
          >
            <button
              onClick={step === 0 ? onClose : back}
              className="text-sm font-medium text-gray-500 hover:text-gray-800 transition-colors flex items-center gap-1.5 min-h-[44px] px-2"
            >
              {step === 0 ? (
                "Cancel"
              ) : (
                <>
                  <ArrowLeft className="w-4 h-4" /> Back
                </>
              )}
            </button>
            <Button
              onClick={next}
              disabled={!canAdvance || bookMutation.isPending}
              className="min-h-[48px] px-6 gap-2 font-semibold"
              style={{ background: FOREST, color: "white" }}
            >
              {bookMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : step === 2 ? (
                <>
                  Confirm Walkthrough <Check className="w-4 h-4" />
                </>
              ) : (
                <>
                  Continue <ArrowRight className="w-4 h-4" />
                </>
              )}
            </Button>
          </div>
        )}
        {step === 3 && (
          <div
            className="border-t px-5 py-4 flex items-center justify-end"
            style={{ borderColor: "#e5e0d3" }}
          >
            <Button
              onClick={onClose}
              className="min-h-[48px] px-6 font-semibold"
              style={{ background: FOREST, color: "white" }}
            >
              Close
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

function FormField({
  label,
  value,
  onChange,
  type = "text",
  multiline = false,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  type?: string;
  multiline?: boolean;
}) {
  return (
    <div>
      <label
        className="block text-[11px] tracking-wider font-semibold uppercase mb-2"
        style={{ color: FOREST }}
      >
        {label}
      </label>
      {multiline ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={2}
          className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-shadow min-h-[44px] resize-none"
          style={
            {
              borderColor: "#e5e0d3",
              background: PARCHMENT,
              "--tw-ring-color": GOLD,
            } as React.CSSProperties
          }
        />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-4 py-3 rounded-xl border text-sm focus:outline-none focus:ring-2 transition-shadow min-h-[44px]"
          style={
            {
              borderColor: "#e5e0d3",
              background: PARCHMENT,
              "--tw-ring-color": GOLD,
            } as React.CSSProperties
          }
        />
      )}
    </div>
  );
}

// ─── CTA card ────────────────────────────────────────────────────────────────
function TakeActionCta({
  label,
  sublabel,
  variant,
  onClick,
}: {
  label: string;
  sublabel: string;
  variant:
    | "baseline_walkthrough"
    | "approve_estimate"
    | "schedule_member_visit"
    | "track_project";
  onClick: () => void;
}) {
  const Icon =
    variant === "approve_estimate"
      ? FileText
      : variant === "track_project"
        ? Briefcase
        : variant === "schedule_member_visit"
          ? RefreshCw
          : Compass;

  return (
    <div
      className="rounded-2xl p-6 sm:p-8"
      style={{
        background: `linear-gradient(135deg, ${FOREST} 0%, #2d4a2d 100%)`,
      }}
    >
      <div className="flex items-start gap-4 mb-5">
        <div
          className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
          style={{ background: GOLD }}
        >
          <Icon className="w-6 h-6 text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-[11px] tracking-[0.18em] uppercase font-semibold mb-1"
            style={{ color: GOLD }}
          >
            Your next step
          </p>
          <h3
            className="font-serif text-xl sm:text-2xl text-white leading-snug"
            style={{ fontFamily: "Georgia, 'Times New Roman', serif" }}
          >
            {label}
          </h3>
          <p className="text-sm text-white/70 mt-2 leading-relaxed">{sublabel}</p>
        </div>
      </div>
      <Button
        onClick={onClick}
        className="w-full sm:w-auto min-h-[52px] px-7 text-base font-semibold gap-2"
        style={{ background: GOLD, color: "white" }}
      >
        {variant === "approve_estimate"
          ? "Review now"
          : variant === "track_project"
            ? "Open project"
            : variant === "schedule_member_visit"
              ? "Request a visit"
              : "Schedule walkthrough"}
        <ArrowRight className="w-4 h-4" />
      </Button>
    </div>
  );
}

// ─── Main ────────────────────────────────────────────────────────────────────
export default function PortalRoadmap() {
  const [, navigate] = useLocation();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [funnelOpen, setFunnelOpen] = useState(false);

  const meQuery = trpc.portal.me.useQuery();
  const roadmapsQuery = trpc.portalRoadmap.listRoadmaps.useQuery();
  const ctaQuery = trpc.portalRoadmap.getCtaContext.useQuery();
  const shareMutation = trpc.portalRoadmap.shareRoadmap.useMutation({
    onSuccess: (res) => {
      navigator.clipboard
        .writeText(res.url)
        .then(() => toast.success("Share link copied — valid for 7 days"))
        .catch(() => toast.success("Share link generated"));
    },
    onError: (err) => toast.error(err.message),
  });

  const customer = meQuery.data?.customer;
  const roadmaps = roadmapsQuery.data ?? [];
  const selected =
    roadmaps.find((r) => r.id === selectedId) ?? roadmaps[0] ?? null;
  const cta = ctaQuery.data;

  const prefill = useMemo(
    () => ({
      name: customer?.name ?? "",
      email: customer?.email ?? "",
      phone: customer?.phone ?? "",
      address: customer?.address ?? "",
    }),
    [customer],
  );

  if (roadmapsQuery.isLoading) {
    return (
      <PortalLayout>
        <div className="flex justify-center items-center py-24">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: GOLD }} />
        </div>
      </PortalLayout>
    );
  }

  const handleCtaClick = () => {
    if (!cta) return;
    if (cta.variant === "track_project" && cta.href) {
      navigate(cta.href);
      return;
    }
    if (cta.variant === "approve_estimate" && cta.href) {
      navigate(cta.href);
      return;
    }
    // baseline_walkthrough + schedule_member_visit both open the funnel
    setFunnelOpen(true);
  };

  return (
    <PortalLayout>
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-10 space-y-6">
        {/* Hero */}
        <div className="space-y-2">
          <p
            className="text-[11px] tracking-[0.18em] uppercase font-semibold"
            style={{ color: GOLD }}
          >
            360° Home Method
          </p>
          <h1
            className="font-serif text-3xl sm:text-4xl leading-tight"
            style={{
              color: FOREST,
              fontFamily: "Georgia, 'Times New Roman', serif",
            }}
          >
            Your 360° Roadmap
          </h1>
          <p className="text-sm sm:text-base text-gray-600 leading-relaxed max-w-xl">
            A clear, prioritized view of what your home is asking for —
            written by stewards who walk homes like yours every week.
          </p>
        </div>

        {roadmaps.length === 0 ? (
          <div
            className="rounded-2xl p-8 text-center"
            style={{ background: PARCHMENT, border: "1px solid #e5e0d3" }}
          >
            <ShieldCheck className="w-10 h-10 mx-auto mb-3" style={{ color: GOLD }} />
            <p
              className="font-serif text-lg mb-2"
              style={{ color: FOREST, fontFamily: "Georgia, 'Times New Roman', serif" }}
            >
              Your Roadmap will live here.
            </p>
            <p className="text-sm text-gray-600 mb-5 max-w-md mx-auto leading-relaxed">
              When you'd like one, schedule a Baseline Walkthrough — a steward will spend an
              unhurried morning with your home and prepare your written Roadmap within a week.
            </p>
            <Button
              onClick={() => setFunnelOpen(true)}
              className="min-h-[48px] px-6 font-semibold"
              style={{ background: FOREST, color: "white" }}
            >
              Schedule a Baseline Walkthrough
            </Button>
          </div>
        ) : (
          <>
            {/* Roadmap selector — only render if more than one */}
            {roadmaps.length > 1 && (
              <div className="space-y-2">
                <p
                  className="text-[11px] tracking-wider font-semibold uppercase"
                  style={{ color: FOREST }}
                >
                  Your Roadmaps
                </p>
                <div className="flex gap-2 overflow-x-auto -mx-4 sm:mx-0 px-4 sm:px-0 pb-2">
                  {roadmaps.map((r) => {
                    const active = (selected?.id ?? null) === r.id;
                    return (
                      <button
                        key={r.id}
                        onClick={() => setSelectedId(r.id)}
                        className="rounded-xl border-2 px-4 py-3 shrink-0 min-w-[170px] text-left transition-all min-h-[60px]"
                        style={{
                          borderColor: active ? GOLD : "#e5e0d3",
                          background: active ? PARCHMENT : "white",
                        }}
                      >
                        <p
                          className="text-xs font-semibold"
                          style={{ color: active ? FOREST : "#5a6b5a" }}
                        >
                          {fmtDate(r.deliveredAt ?? r.createdAt)}
                        </p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          {r.findingCount} priorities
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Selected Roadmap card */}
            {selected && (
              <div
                className="rounded-2xl border bg-white shadow-sm overflow-hidden"
                style={{ borderColor: "#e5e0d3" }}
              >
                <div
                  className="px-5 sm:px-6 py-4 flex items-center justify-between gap-3 border-b"
                  style={{ borderColor: "#e5e0d3", background: PARCHMENT }}
                >
                  <div className="min-w-0">
                    <p
                      className="text-[10px] tracking-[0.18em] uppercase font-semibold"
                      style={{ color: GOLD }}
                    >
                      Your Roadmap
                    </p>
                    <p
                      className="font-serif text-base sm:text-lg truncate"
                      style={{
                        color: FOREST,
                        fontFamily: "Georgia, 'Times New Roman', serif",
                      }}
                    >
                      {fmtDate(selected.deliveredAt ?? selected.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={selected.status} />
                </div>

                {/* PDF preview */}
                <div className="p-3 sm:p-4">
                  <PdfPreview pdfUrl={selected.pdfUrl} />
                </div>

                {/* Actions */}
                <div
                  className="px-5 sm:px-6 py-4 border-t flex flex-wrap gap-3"
                  style={{ borderColor: "#e5e0d3" }}
                >
                  {selected.pdfUrl && (
                    <a
                      href={selected.pdfUrl}
                      download
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium hover:bg-gray-50 transition-colors min-h-[44px]"
                      style={{ borderColor: "#e5e0d3", color: FOREST }}
                    >
                      <Download className="w-4 h-4" />
                      Download PDF
                    </a>
                  )}
                  <button
                    onClick={() =>
                      shareMutation.mutate({ roadmapId: selected.id })
                    }
                    disabled={shareMutation.isPending}
                    className="inline-flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium hover:bg-gray-50 transition-colors min-h-[44px]"
                    style={{ borderColor: "#e5e0d3", color: FOREST }}
                  >
                    {shareMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Share2 className="w-4 h-4" />
                    )}
                    Share with spouse / advisor
                  </button>
                </div>

                {/* Summary */}
                {selected.summary && (
                  <div className="px-5 sm:px-6 py-5 border-t" style={{ borderColor: "#e5e0d3" }}>
                    <p
                      className="text-[11px] tracking-wider font-semibold uppercase mb-2"
                      style={{ color: FOREST }}
                    >
                      Summary
                    </p>
                    <p className="text-sm text-gray-700 leading-relaxed">
                      {selected.summary}
                    </p>
                  </div>
                )}

                <RoadmapBuckets findings={(selected as any).findings} />
              </div>
            )}
          </>
        )}

        {/* Take Action CTA — single, contextual, no upsell stack below */}
        {cta && (
          <TakeActionCta
            label={cta.label}
            sublabel={cta.sublabel}
            variant={cta.variant}
            onClick={handleCtaClick}
          />
        )}

        {/* Reassurance footer — not a CTA, just stewardship */}
        <div className="text-center pt-4 pb-6">
          <p className="text-[11px] tracking-wider uppercase text-gray-400 mb-1">
            <Clock className="w-3 h-3 inline-block mr-1 -mt-0.5" />
            Unhurried. Honest. Yours.
          </p>
        </div>
      </div>

      <BaselineFunnel
        open={funnelOpen}
        onClose={() => setFunnelOpen(false)}
        prefill={prefill}
        onBooked={() => {
          // Refresh CTA — once booked, the stage advances and CTA may swap.
          ctaQuery.refetch();
        }}
      />
    </PortalLayout>
  );
}
