/**
 * MembershipStep — the 360° Method offer inside the close flow. Shared
 * TierCards plus the same three payment paths as EnrollPropertyDialog
 * (card on this device via Stripe Checkout, record a check, comp), inline
 * and presentation-styled. "Continue without enrolling" is always there;
 * this is an offer, never a gate.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Banknote, CreditCard, Gift, Loader2 } from "lucide-react";
import { cadencePerLabel } from "@/components/TierCards";
import RichTierCards from "@/components/threeSixty/RichTierCards";
import SeasonalVisitsGrid from "@/components/threeSixty/SeasonalVisitsGrid";
import {
  TIER_DEFINITIONS,
  formatDollars,
  getTierPriceForBand,
  bandForSqft,
  calcMemberDiscount,
  type MemberTier,
  type BillingCadence,
} from "@shared/threeSixtyTiers";
import type { CloseContext } from "./CloseFlowPage";

type PaymentChoice = "card" | "check" | "comp";

export default function MembershipStep({
  ctx,
  onEnrolled,
  onSkip,
  onBack,
}: {
  ctx: CloseContext;
  onEnrolled: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [tier, setTier] = useState<MemberTier>("silver");
  const [cadence, setCadence] = useState<BillingCadence>("annual");
  const [payment, setPayment] = useState<PaymentChoice>("card");
  const [checkNumber, setCheckNumber] = useState("");
  const [waitingForStripe, setWaitingForStripe] = useState(false);

  const customerId = ctx.customer.id;
  const property = ctx.property;
  const utils = trpc.useUtils();

  // ── Home size drives the price. A lead with no home on file (or no sqft)
  // can't be priced or enrolled until we capture it — that was the blocker.
  const [sqftInput, setSqftInput] = useState<string>(property?.sqft ? String(property.sqft) : "");
  const [addr, setAddr] = useState({ street: "", city: "", state: "WA", zip: "" });
  const needsHome = !property || !property.sqft;
  const band = bandForSqft(property?.sqft ?? null);

  const createProperty = trpc.properties.create.useMutation({
    onSuccess: () => {
      void utils.closeFlow.getContext.invalidate();
      void utils.properties.listByCustomer.invalidate({ customerId });
      toast.success("Home saved. Member pricing is sized to it.");
    },
    onError: (e) => toast.error(e.message),
  });
  const updateProperty = trpc.properties.update.useMutation({
    onSuccess: () => {
      void utils.closeFlow.getContext.invalidate();
      void utils.properties.listByCustomer.invalidate({ customerId });
      toast.success("Home size saved. Member pricing is sized to it.");
    },
    onError: (e) => toast.error(e.message),
  });

  function saveHome() {
    const n = parseInt(sqftInput, 10);
    if (!n || n <= 0) {
      toast.error("Enter the home's square footage to size the membership.");
      return;
    }
    if (property) {
      updateProperty.mutate({ id: property.id, sqft: n });
    } else {
      createProperty.mutate({
        customerId,
        label: "Home",
        isPrimary: true,
        sqft: n,
        street: addr.street.trim(),
        city: addr.city.trim(),
        state: addr.state.trim(),
        zip: addr.zip.trim(),
      });
    }
  }

  // Poll while a Stripe tab is open, until the webhook links the membership.
  const { data: liveProps } = trpc.properties.listByCustomer.useQuery(
    { customerId },
    { enabled: waitingForStripe, refetchInterval: 3000 },
  );
  useEffect(() => {
    if (!waitingForStripe || !property) return;
    const fresh = (liveProps ?? []).find((p: any) => p.id === property.id);
    if (fresh?.membership?.status === "active") {
      setWaitingForStripe(false);
      void utils.properties.listByCustomer.invalidate({ customerId });
      toast.success("Payment confirmed. Welcome to the 360° Method.");
      onEnrolled();
    }
  }, [liveProps, waitingForStripe, property, customerId, utils, onEnrolled]);

  const createSession = trpc.threeSixty.checkout.createSession.useMutation({
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
      setWaitingForStripe(true);
    },
    onError: (e) => toast.error(e.message),
  });

  const enrollOffline = trpc.properties.enrollMembershipOffline.useMutation({
    onSuccess: () => {
      void utils.properties.listByCustomer.invalidate({ customerId });
      toast.success(`Enrolled in ${TIER_DEFINITIONS[tier].label}.`);
      onEnrolled();
    },
    onError: (e) => toast.error(e.message),
  });

  const priceCents = getTierPriceForBand(tier, cadence, band);
  const emailPresent = ctx.readiness.customerEmailPresent;

  // On-site closer: show what membership saves on the very estimate in front
  // of them. Discount applies to the work, not the tax pass-through.
  const estTaxCents = (ctx.estimate as { taxAmount?: number } | null)?.taxAmount ?? 0;
  const estWorkCents = Math.max(0, (ctx.estimate?.totalAmount ?? 0) - estTaxCents);
  const estSavingsCents = estWorkCents > 0 ? calcMemberDiscount(tier, estWorkCents) : 0;

  const startCardCheckout = () => {
    if (!property) return;
    createSession.mutate({
      tier,
      cadence,
      sizedMembership: true,
      sqft: property.sqft ?? undefined,
      hpCustomerId: customerId,
      propertyId: property.id,
      customerName: ctx.customer.name || undefined,
      customerEmail: ctx.customer.email || undefined,
      customerPhone: ctx.customer.phone || undefined,
      serviceAddress: property.street || undefined,
      serviceCity: property.city || undefined,
      serviceState: property.state || undefined,
      serviceZip: property.zip || undefined,
      origin: window.location.origin,
      successPath: "/360/confirmation",
      cancelPath: window.location.pathname,
    });
  };

  const submitOffline = () => {
    if (!property) return;
    enrollOffline.mutate({
      propertyId: property.id,
      customerId,
      tier,
      cadence,
      paymentMethod: payment === "check" ? "check" : "comp",
      checkNumber: payment === "check" && checkNumber.trim() ? checkNumber.trim() : undefined,
      amountCents: payment === "check" ? priceCents : undefined,
    });
  };

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 mb-1">
        <button type="button" onClick={onBack} aria-label="Back" className="p-1 rounded text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="hp-eyebrow text-xs" style={{ color: "var(--hp-gold-deep)" }}>Stay ahead of your home</p>
      </div>
      <h1 className="hp-serif text-3xl leading-tight mb-1">The 360° Method membership</h1>
      <p className="text-sm text-muted-foreground mb-5">
        Proactive care for {property?.label || "your home"}: seasonal visits, the annual scan, and member pricing on every job.
      </p>

      {waitingForStripe ? (
        <div className="bg-white rounded-xl border px-5 py-10 text-center space-y-4" style={{ borderColor: "var(--hp-hairline)" }}>
          <Loader2 className="w-8 h-8 mx-auto animate-spin" style={{ color: "var(--hp-gold-deep)" }} />
          <div>
            <p className="text-sm font-semibold">Waiting for Stripe confirmation</p>
            <p className="text-xs text-muted-foreground mt-1">
              Complete the payment in the checkout tab. This updates automatically.
            </p>
          </div>
          <button type="button" onClick={onSkip} className="text-sm text-muted-foreground hover:underline">
            I'll confirm later
          </button>
        </div>
      ) : needsHome ? (
        <div className="bg-white rounded-xl border px-5 py-5 space-y-4" style={{ borderColor: "var(--hp-hairline)" }}>
          <div>
            <p className="text-sm font-semibold">First, the size of the home</p>
            <p className="text-xs text-muted-foreground mt-1">
              Membership is priced to the home. Enter the square footage to size the plan and unlock enrollment.
            </p>
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Square footage</label>
            <input
              className="w-full border rounded-lg px-3 py-2 text-sm"
              style={{ borderColor: "var(--hp-hairline)" }}
              inputMode="numeric"
              placeholder="e.g. 1850"
              value={sqftInput}
              onChange={(e) => setSqftInput(e.target.value)}
            />
            {parseInt(sqftInput, 10) > 0 && (
              <p className="text-xs text-muted-foreground mt-1">
                Full Coverage for this home: <span className="font-semibold" style={{ color: "var(--hp-ink)" }}>
                  {formatDollars(getTierPriceForBand("silver", "annual", bandForSqft(parseInt(sqftInput, 10))))}/yr
                </span>
              </p>
            )}
          </div>
          {!property && (
            <div className="grid grid-cols-2 gap-2">
              <input className="col-span-2 border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "var(--hp-hairline)" }} placeholder="Street (optional)" value={addr.street} onChange={(e) => setAddr({ ...addr, street: e.target.value })} />
              <input className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "var(--hp-hairline)" }} placeholder="City" value={addr.city} onChange={(e) => setAddr({ ...addr, city: e.target.value })} />
              <div className="grid grid-cols-2 gap-2">
                <input className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "var(--hp-hairline)" }} placeholder="State" value={addr.state} onChange={(e) => setAddr({ ...addr, state: e.target.value })} />
                <input className="border rounded-lg px-3 py-2 text-sm" style={{ borderColor: "var(--hp-hairline)" }} placeholder="ZIP" value={addr.zip} onChange={(e) => setAddr({ ...addr, zip: e.target.value })} />
              </div>
            </div>
          )}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={saveHome}
              disabled={createProperty.isPending || updateProperty.isPending}
              className="hp-button-gold disabled:opacity-40"
            >
              {(createProperty.isPending || updateProperty.isPending) && <Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" />}
              Save home and show pricing
            </button>
            <button type="button" onClick={onSkip} className="text-sm text-muted-foreground hover:underline">
              Skip membership <ArrowRight className="w-3.5 h-3.5 inline" />
            </button>
          </div>
        </div>
      ) : (
        <>
          {estSavingsCents > 0 && (
            <div className="rounded-xl border px-5 py-3 mb-3" style={{ borderColor: "rgba(200,146,42,0.4)", background: "rgba(200,146,42,0.06)" }}>
              <p className="text-sm" style={{ color: "var(--hp-ink)" }}>
                As a <span className="font-semibold">{TIER_DEFINITIONS[tier].label}</span> member, {ctx.customer.name?.split(" ")[0] || "they"} would save about{" "}
                <span className="font-semibold" style={{ color: "var(--hp-gold-deep)" }}>{formatDollars(estSavingsCents)}</span> on today's estimate — and every job after.
              </p>
            </div>
          )}

          <div className="mb-4">
            <SeasonalVisitsGrid />
          </div>

          <p className="hp-eyebrow text-xs mb-1" style={{ color: "var(--hp-gold-deep)" }}>Choose the plan</p>
          <div className="bg-white rounded-xl border px-5 py-5" style={{ borderColor: "var(--hp-hairline)" }}>
            <RichTierCards tier={tier} cadence={cadence} onTierChange={setTier} onCadenceChange={setCadence} band={band} />

            <p className="text-sm font-medium mt-5 mb-2">Payment</p>
            <div className="space-y-2">
              {([
                { id: "card" as const, icon: CreditCard, label: "Card on this device", sub: "Secure Stripe checkout, recurring billing", disabled: !emailPresent, hint: "Add an email to the contact first" },
                { id: "check" as const, icon: Banknote, label: "Record a check", sub: "Active through the paid term, manual renewal" },
                { id: "comp" as const, icon: Gift, label: "Comp (no charge)", sub: "Courtesy membership, manual renewal" },
              ]).map(({ id, icon: Icon, label, sub, disabled, hint }) => (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPayment(id)}
                  className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    disabled
                      ? "opacity-50 cursor-not-allowed border-border"
                      : payment === id
                        ? "border-primary bg-primary/5"
                        : "border-border hover:border-primary/40"
                  }`}
                >
                  <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0">
                    <p className="text-sm font-medium">{label}</p>
                    <p className="text-xs text-muted-foreground">{disabled && hint ? hint : sub}</p>
                  </div>
                </button>
              ))}
            </div>

            {payment === "check" && (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-xs mb-1">Check number</p>
                  <input
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="e.g. 1042"
                    value={checkNumber}
                    onChange={(e) => setCheckNumber(e.target.value)}
                  />
                </div>
                <div>
                  <p className="text-xs mb-1">Amount</p>
                  <div className="border rounded-lg px-3 py-2 text-sm bg-muted/40">
                    {formatDollars(priceCents)}
                    <span className="text-muted-foreground">{cadencePerLabel(cadence)}</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {payment === "card" ? (
              <button
                type="button"
                onClick={startCardCheckout}
                disabled={createSession.isPending || !property || !emailPresent}
                className="hp-button-gold disabled:opacity-40"
              >
                {createSession.isPending && <Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" />}
                Enroll with card
              </button>
            ) : (
              <button
                type="button"
                onClick={submitOffline}
                disabled={enrollOffline.isPending || !property}
                className="hp-button-gold disabled:opacity-40"
              >
                {enrollOffline.isPending && <Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" />}
                {payment === "check" ? "Record check and enroll" : "Enroll at no charge"}
              </button>
            )}
            <button type="button" onClick={onSkip} className="text-sm text-muted-foreground hover:underline">
              Continue without enrolling <ArrowRight className="w-3.5 h-3.5 inline" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
