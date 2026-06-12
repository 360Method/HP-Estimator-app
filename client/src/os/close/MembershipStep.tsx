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
import TierCards, { cadencePerLabel } from "@/components/TierCards";
import {
  TIER_DEFINITIONS,
  formatDollars,
  getTierPrice,
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

  const priceCents = getTierPrice(tier, cadence);
  const emailPresent = ctx.readiness.customerEmailPresent;

  const startCardCheckout = () => {
    if (!property) return;
    createSession.mutate({
      tier,
      cadence,
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
      ) : (
        <>
          <div className="bg-white rounded-xl border px-5 py-5" style={{ borderColor: "var(--hp-hairline)" }}>
            <TierCards tier={tier} cadence={cadence} onTierChange={setTier} onCadenceChange={setCadence} />

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
