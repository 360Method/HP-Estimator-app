import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useState } from "react";
import { loadStripe } from "@stripe/stripe-js";
import { Elements, CardElement, useStripe, useElements } from "@stripe/react-stripe-js";

const stripeKey = import.meta.env.VITE_STRIPE_PUBLISHABLE_KEY;
const stripePromise = stripeKey ? loadStripe(stripeKey) : null;

function AddCardForm({ onSuccess }: { onSuccess: () => void }) {
  const stripe = useStripe();
  const elements = useElements();
  const [saving, setSaving] = useState(false);

  const createSetupIntent = trpc.portal.createSetupIntent.useMutation();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSaving(true);
    try {
      const { clientSecret } = await createSetupIntent.mutateAsync();
      if (!clientSecret) throw new Error("No client secret");
      const result = await stripe.confirmCardSetup(clientSecret, {
        payment_method: { card: elements.getElement(CardElement)! },
      });
      if (result.error) throw new Error(result.error.message);
      toast.success("Card saved!");
      onSuccess();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save card");
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white border border-gray-200 rounded-lg p-4 space-y-3">
      <p className="text-sm font-medium text-gray-700">Add a payment method</p>
      <div className="border border-gray-300 rounded-md p-3">
        <CardElement options={{ style: { base: { fontSize: "14px" } } }} />
      </div>
      <Button type="submit" disabled={saving || !stripe} className="bg-blue-600 hover:bg-blue-700 text-white w-full">
        {saving ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving…</> : "Save card"}
      </Button>
    </form>
  );
}

export default function PortalWallet() {
  const { data, isLoading, refetch } = trpc.portal.getSavedCards.useQuery();
  const cards = data?.cards ?? [];
  const [showAdd, setShowAdd] = useState(false);

  const removeCardMutation = trpc.portal.removeCard.useMutation({
    onSuccess: () => { toast.success("Card removed"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  return (
    <PortalLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-xs text-gray-400 mb-1">Customer Portal &rsaquo; Wallet</p>
        <h1 className="text-3xl font-light text-gray-900 mb-6">Wallet</h1>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-600">
              Save a payment method to speed up future payments on invoices and deposits.
            </p>

            {cards.length > 0 && (
              <div className="space-y-3">
                {cards.map((card) => (
                  <div
                    key={card.id}
                    className="flex items-center gap-4 bg-white border border-gray-200 rounded-lg p-4"
                  >
                    <CreditCard className="w-8 h-8 text-gray-400" />
                    <div className="flex-1">
                      <p className="text-sm font-medium capitalize">{card.brand} •••• {card.last4}</p>
                      <p className="text-xs text-gray-400">Expires {card.expMonth}/{card.expYear}</p>
                    </div>
                    <button
                      className="text-red-400 hover:text-red-600 p-1"
                      onClick={() => removeCardMutation.mutate({ paymentMethodId: card.id })}
                      disabled={removeCardMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {cards.length === 0 && !showAdd && (
              <div className="flex flex-col items-center justify-center py-12 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                <CreditCard className="w-12 h-12 mb-3 text-gray-300" />
                <p className="text-sm">No saved payment methods</p>
              </div>
            )}

            {showAdd ? (
              <Elements stripe={stripePromise}>
                <AddCardForm onSuccess={() => { setShowAdd(false); refetch(); }} />
              </Elements>
            ) : (
              <Button
                className="bg-blue-600 hover:bg-blue-700 text-white"
                onClick={() => setShowAdd(true)}
              >
                <Plus className="w-4 h-4 mr-2" /> Add payment method
              </Button>
            )}
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
