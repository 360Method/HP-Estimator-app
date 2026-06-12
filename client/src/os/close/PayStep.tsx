/**
 * PayStep — collect the deposit on the spot. Card opens Stripe Checkout in
 * a new tab (closeFlow.createDepositCheckoutSession; the existing webhook
 * marks it paid) and the page polls until the payment lands; a check is
 * recorded immediately. Skippable: the deposit invoice stays due in the
 * portal if the client prefers to pay later.
 */
import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { ArrowLeft, ArrowRight, Banknote, CheckCircle2, CreditCard, Loader2 } from "lucide-react";
import { fmtMoney } from "@/components/portal/EstimateDocument";
import type { CloseContext } from "./CloseFlowPage";

export default function PayStep({
  ctx,
  customerId,
  propertyId,
  onPaid,
  onSkip,
  onBack,
}: {
  ctx: CloseContext;
  customerId: string;
  propertyId?: string;
  onPaid: () => void;
  onSkip: () => void;
  onBack: () => void;
}) {
  const [method, setMethod] = useState<"card" | "check">("card");
  const [checkNumber, setCheckNumber] = useState("");
  const [waitingForStripe, setWaitingForStripe] = useState(false);
  const utils = trpc.useUtils();

  // While the Stripe tab is open, poll the close context until the webhook
  // marks the deposit invoice paid.
  const { data: liveCtx } = trpc.closeFlow.getContext.useQuery(
    { customerId, propertyId },
    { enabled: waitingForStripe, refetchInterval: 3000 },
  );
  useEffect(() => {
    if (!waitingForStripe) return;
    if (liveCtx?.readiness.depositInvoiceStatus === "paid") {
      setWaitingForStripe(false);
      toast.success("Deposit received. Thank you!");
      onPaid();
    }
  }, [liveCtx, waitingForStripe, onPaid]);

  const createSession = trpc.closeFlow.createDepositCheckoutSession.useMutation({
    onSuccess: ({ url }) => {
      window.open(url, "_blank", "noopener");
      setWaitingForStripe(true);
    },
    onError: (e) => toast.error(e.message),
  });

  const recordCheck = trpc.closeFlow.recordDepositCheckPayment.useMutation({
    onSuccess: () => {
      void utils.closeFlow.getContext.invalidate({ customerId, propertyId });
      toast.success("Check recorded. Deposit paid.");
      onPaid();
    },
    onError: (e) => toast.error(e.message),
  });

  const invoice = ctx.depositInvoice;

  if (!invoice) {
    return (
      <div className="pt-2">
        <p className="text-sm text-muted-foreground">
          The deposit invoice is being generated. Give it a second, then refresh.
        </p>
        <button type="button" onClick={onSkip} className="mt-4 text-sm text-muted-foreground hover:underline">
          Continue <ArrowRight className="w-3.5 h-3.5 inline" />
        </button>
      </div>
    );
  }

  if (invoice.status === "paid") {
    return (
      <div className="pt-2">
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-5 py-4 text-sm text-emerald-800">
          <CheckCircle2 className="w-4 h-4 inline mr-1.5" />
          Deposit {fmtMoney(invoice.amountPaid || invoice.amountDue)} already received.
        </div>
        <button type="button" onClick={onPaid} className="hp-button-gold mt-5">
          Continue <ArrowRight className="w-4 h-4 ml-1.5 inline" />
        </button>
      </div>
    );
  }

  return (
    <div className="pt-2">
      <div className="flex items-center gap-2 mb-1">
        <button type="button" onClick={onBack} aria-label="Back" className="p-1 rounded text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" />
        </button>
        <p className="hp-eyebrow text-xs" style={{ color: "var(--hp-gold-deep)" }}>Lock in the schedule</p>
      </div>
      <h1 className="hp-serif text-3xl leading-tight mb-1">Deposit</h1>
      <p className="text-sm text-muted-foreground mb-5">
        A {fmtMoney(invoice.amountDue)} deposit schedules the work. Invoice {invoice.invoiceNumber}.
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
          <div className="bg-white rounded-xl border px-5 py-5 space-y-2" style={{ borderColor: "var(--hp-hairline)" }}>
            {([
              { id: "card" as const, icon: CreditCard, label: "Card on this device", sub: "Secure Stripe checkout in a new tab" },
              { id: "check" as const, icon: Banknote, label: "Record a check", sub: "Mark the deposit paid by check now" },
            ]).map(({ id, icon: Icon, label, sub }) => (
              <button
                key={id}
                type="button"
                onClick={() => setMethod(id)}
                className={`w-full flex items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                  method === id ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
                }`}
              >
                <Icon className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-sm font-medium">{label}</p>
                  <p className="text-xs text-muted-foreground">{sub}</p>
                </div>
              </button>
            ))}

            {method === "check" && (
              <div className="pt-2 grid grid-cols-2 gap-2">
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
                  <div className="border rounded-lg px-3 py-2 text-sm bg-muted/40">{fmtMoney(invoice.amountDue)}</div>
                </div>
              </div>
            )}
          </div>

          <div className="mt-5 flex items-center gap-3 flex-wrap">
            {method === "card" ? (
              <button
                type="button"
                onClick={() =>
                  createSession.mutate({
                    invoiceId: invoice.id,
                    origin: window.location.origin,
                    successPath: window.location.pathname + "?step=pay",
                  })
                }
                disabled={createSession.isPending}
                className="hp-button-gold disabled:opacity-40"
              >
                {createSession.isPending && <Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" />}
                Pay {fmtMoney(invoice.amountDue)} by card
              </button>
            ) : (
              <button
                type="button"
                onClick={() =>
                  recordCheck.mutate({
                    invoiceId: invoice.id,
                    checkNumber: checkNumber.trim() || undefined,
                    amountCents: invoice.amountDue,
                  })
                }
                disabled={recordCheck.isPending}
                className="hp-button-gold disabled:opacity-40"
              >
                {recordCheck.isPending && <Loader2 className="w-4 h-4 mr-1.5 inline animate-spin" />}
                Record check for {fmtMoney(invoice.amountDue)}
              </button>
            )}
            <button type="button" onClick={onSkip} className="text-sm text-muted-foreground hover:underline">
              Collect later <ArrowRight className="w-3.5 h-3.5 inline" />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
