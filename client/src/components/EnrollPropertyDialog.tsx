/**
 * EnrollPropertyDialog — staff-side 360° enrollment for one property,
 * built for the on-site close: the consultant picks tier + cadence with the
 * client, then takes payment right there. Three payment paths:
 *   Card on this device  → Stripe Checkout in a new tab (the same machinery
 *                          as the public website), then poll until the
 *                          webhook lands the membership.
 *   Record a check       → properties.enrollMembershipOffline; active through
 *                          the paid term with a manual-renew task queued.
 *   Comp (no charge)     → same offline path, no payment reference.
 *
 * Customer-safe surface: customer-facing tier names only, no cost math.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, CreditCard, Banknote, Gift } from "lucide-react";
import { toast } from "sonner";
import TierCards, { cadencePerLabel } from "@/components/TierCards";
import {
  TIER_DEFINITIONS,
  formatDollars,
  getTierPrice,
  type MemberTier,
  type BillingCadence,
} from "@shared/threeSixtyTiers";

type PaymentChoice = "card" | "check" | "comp";

export interface EnrollableProperty {
  id: string;
  customerId: string;
  label?: string | null;
  street?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  membership?: { status?: string | null } | null;
}

export default function EnrollPropertyDialog({
  property,
  open,
  onClose,
}: {
  property: EnrollableProperty;
  open: boolean;
  onClose: () => void;
}) {
  const [tier, setTier] = useState<MemberTier>("silver");
  const [cadence, setCadence] = useState<BillingCadence>("annual");
  const [payment, setPayment] = useState<PaymentChoice>("card");
  const [checkNumber, setCheckNumber] = useState("");
  const [waitingForStripe, setWaitingForStripe] = useState(false);

  const customerId = property.customerId;
  const utils = trpc.useUtils();

  const { data: customer } = trpc.customers.get.useQuery(
    { id: customerId },
    { enabled: !!customerId && open },
  );

  // While a Stripe tab is open, poll until the webhook links the membership.
  const { data: liveProps } = trpc.properties.listByCustomer.useQuery(
    { customerId },
    { enabled: open && waitingForStripe, refetchInterval: 3000 },
  );

  const alreadyActive =
    property.membership?.status === "active" ||
    (liveProps ?? []).some(
      (p: any) => p.id === property.id && p.membership?.status === "active",
    );

  useEffect(() => {
    if (!waitingForStripe) return;
    const fresh = (liveProps ?? []).find((p: any) => p.id === property.id);
    if (fresh?.membership?.status === "active") {
      setWaitingForStripe(false);
      void utils.properties.listByCustomer.invalidate({ customerId });
      void utils.threeSixty.memberships.getByCustomer.invalidate({ customerId });
      toast.success("Payment confirmed. Membership is active.");
      onClose();
    }
  }, [liveProps, waitingForStripe, property.id, customerId, utils, onClose]);

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
      void utils.threeSixty.memberships.getByCustomer.invalidate({ customerId });
      toast.success(`Enrolled in ${TIER_DEFINITIONS[tier].label}.`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const customerEmail = (customer?.email ?? "").trim();
  const priceCents = getTierPrice(tier, cadence);
  const addressLine = [property.street, property.city].filter(Boolean).join(", ");

  const startCardCheckout = () => {
    createSession.mutate({
      tier,
      cadence,
      hpCustomerId: customerId,
      propertyId: property.id,
      customerName: customer?.displayName || undefined,
      customerEmail: customerEmail || undefined,
      customerPhone: customer?.mobilePhone || undefined,
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

  const paymentOptions: {
    id: PaymentChoice;
    icon: React.ElementType;
    label: string;
    sub: string;
    disabled?: boolean;
    hint?: string;
  }[] = [
    {
      id: "card",
      icon: CreditCard,
      label: "Card on this device",
      sub: "Secure Stripe checkout, recurring billing",
      disabled: alreadyActive || !customerEmail,
      hint: !customerEmail ? "Add an email to the contact first" : undefined,
    },
    {
      id: "check",
      icon: Banknote,
      label: "Record a check",
      sub: "Active through the paid term, manual renewal",
    },
    {
      id: "comp",
      icon: Gift,
      label: "Comp (no charge)",
      sub: "Courtesy membership, manual renewal",
    },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Enroll in the 360° Method
          </DialogTitle>
          <DialogDescription>
            {property.label || "Home"}
            {addressLine ? ` · ${addressLine}` : ""}
          </DialogDescription>
        </DialogHeader>

        {waitingForStripe ? (
          <div className="py-10 text-center space-y-4">
            <Loader2 className="w-8 h-8 mx-auto animate-spin text-primary" />
            <div>
              <p className="text-sm font-semibold">Waiting for Stripe confirmation</p>
              <p className="text-xs text-muted-foreground mt-1">
                Complete the payment in the checkout tab. This updates automatically.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onClose}>
              I'll confirm later
            </Button>
          </div>
        ) : (
          <>
            <div className="space-y-6 py-2">
              <TierCards
                tier={tier}
                cadence={cadence}
                onTierChange={setTier}
                onCadenceChange={setCadence}
              />

              {/* Payment choice */}
              <div>
                <Label className="text-sm font-medium mb-2 block">Payment</Label>
                <div className="space-y-2">
                  {paymentOptions.map(({ id, icon: Icon, label, sub, disabled, hint }) => (
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
                        <p className="text-xs text-muted-foreground">{hint ?? sub}</p>
                      </div>
                    </button>
                  ))}
                </div>
                {payment === "check" && (
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs mb-1 block">Check number</Label>
                      <input
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="e.g. 1042"
                        value={checkNumber}
                        onChange={(e) => setCheckNumber(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs mb-1 block">Amount</Label>
                      <div className="border rounded-lg px-3 py-2 text-sm bg-muted/40">
                        {formatDollars(priceCents)}
                        <span className="text-muted-foreground">{cadencePerLabel(cadence)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary */}
              <div className="rounded-lg bg-muted/40 p-3 text-sm flex justify-between items-center">
                <span className="text-muted-foreground">
                  {TIER_DEFINITIONS[tier].label} · {cadence}
                </span>
                <span className="font-semibold">
                  {payment === "comp" ? "No charge" : `${formatDollars(priceCents)}${cadencePerLabel(cadence)}`}
                </span>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={onClose}
                disabled={createSession.isPending || enrollOffline.isPending}
              >
                Cancel
              </Button>
              {payment === "card" ? (
                <Button onClick={startCardCheckout} disabled={createSession.isPending || alreadyActive || !customerEmail}>
                  {createSession.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Open Stripe Checkout
                </Button>
              ) : (
                <Button onClick={submitOffline} disabled={enrollOffline.isPending || alreadyActive}>
                  {enrollOffline.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  {payment === "check" ? "Record check and enroll" : "Enroll at no charge"}
                </Button>
              )}
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
