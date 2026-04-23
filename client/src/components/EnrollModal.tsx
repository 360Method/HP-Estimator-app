/**
 * EnrollModal — In-portal 360° enrollment.
 * Pre-fills customer data from portal session, lets them confirm address,
 * pick cadence, then calls /api/360/checkout and redirects to Stripe.
 * No external funnel redirect needed.
 */
import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, Shield, Check, ChevronDown } from "lucide-react";
import { TIER_DEFINITIONS } from "@shared/threeSixtyTiers";
import type { BillingCadence } from "@shared/threeSixtyTiers";

interface EnrollModalProps {
  open: boolean;
  onClose: () => void;
  tier: string; // "bronze" | "silver" | "gold"
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    address?: string | null;
  };
}

const CADENCE_OPTIONS: { value: BillingCadence; label: string; badge?: string }[] = [
  { value: "annual", label: "Annual", badge: "Best value" },
  { value: "quarterly", label: "Quarterly" },
  { value: "monthly", label: "Monthly" },
];

const TIER_LABELS: Record<string, string> = {
  bronze: "Bronze",
  silver: "Silver",
  gold: "Gold",
};

const TIER_COLORS: Record<string, string> = {
  bronze: "text-amber-700 bg-amber-50 border-amber-200",
  silver: "text-slate-600 bg-slate-50 border-slate-200",
  gold: "text-yellow-700 bg-yellow-50 border-yellow-200",
};

function fmt(cents: number) {
  return `$${(cents / 100).toFixed(0)}`;
}

export default function EnrollModal({ open, onClose, tier, customer }: EnrollModalProps) {
  const [cadence, setCadence] = useState<BillingCadence>("annual");
  const [address, setAddress] = useState(customer.address ?? "");
  const [city, setCity] = useState("");
  const [state, setState] = useState("WA");
  const [zip, setZip] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const tierDef = TIER_DEFINITIONS[tier as keyof typeof TIER_DEFINITIONS];
  const price = tierDef ? tierDef.pricing[cadence] : 0;
  const monthlyEquiv = tierDef ? tierDef.pricing.monthlyEquivalentAnnual : 0;

  // Parse address into parts if it contains commas
  const parsedAddress = (() => {
    if (!customer.address) return null;
    const parts = customer.address.split(",").map(s => s.trim());
    return parts.length >= 2 ? { street: parts[0], rest: parts.slice(1).join(", ") } : null;
  })();

  const handleEnroll = async () => {
    if (!address.trim()) { setError("Please enter your service address."); return; }
    if (!zip.trim() || zip.length < 5) { setError("Please enter a valid ZIP code."); return; }
    setLoading(true);
    setError("");

    // Split name
    const nameParts = customer.name.trim().split(" ");
    const firstName = nameParts[0] ?? "";
    const lastName = nameParts.slice(1).join(" ") || firstName;

    const customerPayload = {
      name: customer.name,
      email: customer.email,
      phone: customer.phone ?? "",
      address: address.trim(),
      city: city.trim() || "Vancouver",
      state: state.trim() || "WA",
      zip: zip.trim(),
    };

    try {
      const res = await fetch("/api/360/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "homeowner",
          tier,
          cadence,
          customer: customerPayload,
          origin: window.location.origin,
        }),
      });
      const json = await res.json();
      const url = json?.url;
      if (!url) throw new Error(json?.error ?? "Checkout failed. Please try again.");
      // Store for confirmation page
      sessionStorage.setItem("hp360_tier", tier);
      sessionStorage.setItem("hp360_cadence", cadence);
      sessionStorage.setItem("hp360_type", "homeowner");
      window.location.href = url;
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-full p-0 overflow-hidden">
        {/* Header */}
        <div className="bg-[#1a2e1a] px-6 py-5 text-white">
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-4 h-4 text-[#c8922a]" />
            <span className="text-xs font-bold uppercase tracking-wide text-[#c8922a]">360° Home Method</span>
          </div>
          <DialogTitle className="text-xl font-black text-white">
            Enroll in {TIER_LABELS[tier] ?? tier} Plan
          </DialogTitle>
          <p className="text-sm text-white/60 mt-1">You're one step away from proactive home protection.</p>
        </div>

        <div className="px-6 py-5 space-y-5">
          {/* Tier badge */}
          <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm font-semibold ${TIER_COLORS[tier] ?? "text-gray-700 bg-gray-50 border-gray-200"}`}>
            <Shield className="w-3.5 h-3.5" />
            {TIER_LABELS[tier] ?? tier} Plan
          </div>

          {/* Cadence selector */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Billing Frequency</p>
            <div className="grid grid-cols-3 gap-2">
              {CADENCE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setCadence(opt.value)}
                  className={`relative rounded-lg border-2 px-3 py-2.5 text-center transition-all ${
                    cadence === opt.value
                      ? "border-[#c8922a] bg-amber-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  {opt.badge && (
                    <span className="absolute -top-2 left-1/2 -translate-x-1/2 bg-[#c8922a] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full whitespace-nowrap">
                      {opt.badge}
                    </span>
                  )}
                  <p className="text-xs font-bold text-gray-900">{opt.label}</p>
                  <p className="text-sm font-black text-[#1a2e1a] mt-0.5">{fmt(price)}</p>
                  {cadence === opt.value && opt.value === "annual" && (
                    <p className="text-[9px] text-emerald-600 font-semibold mt-0.5">{fmt(monthlyEquiv)}/mo</p>
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Address confirmation */}
          <div>
            <p className="text-xs font-semibold text-gray-600 mb-2 uppercase tracking-wide">Service Address</p>
            {parsedAddress && !address && (
              <button
                className="w-full text-left rounded-lg border-2 border-[#c8922a] bg-amber-50 px-3 py-2.5 mb-2 text-sm"
                onClick={() => {
                  setAddress(parsedAddress.street);
                  const rest = parsedAddress.rest.split(",").map(s => s.trim());
                  if (rest.length >= 2) {
                    setCity(rest[0]);
                    const stateZip = rest[1].split(" ").filter(Boolean);
                    setState(stateZip[0] ?? "WA");
                    setZip(stateZip[1] ?? "");
                  }
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-gray-900">{parsedAddress.street}</p>
                    <p className="text-xs text-gray-500">{parsedAddress.rest}</p>
                  </div>
                  <Check className="w-4 h-4 text-[#c8922a] shrink-0" />
                </div>
                <p className="text-[10px] text-[#c8922a] font-semibold mt-1">Use this address</p>
              </button>
            )}
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a] mb-2"
              placeholder="Street address"
              value={address}
              onChange={e => setAddress(e.target.value)}
            />
            <div className="grid grid-cols-5 gap-2">
              <input
                className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
                placeholder="City"
                value={city}
                onChange={e => setCity(e.target.value)}
              />
              <input
                className="col-span-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
                placeholder="ST"
                value={state}
                onChange={e => setState(e.target.value)}
                maxLength={2}
              />
              <input
                className="col-span-2 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
                placeholder="ZIP"
                value={zip}
                onChange={e => setZip(e.target.value)}
                maxLength={5}
              />
            </div>
          </div>

          {/* Pre-filled customer info (read-only) */}
          <div className="bg-gray-50 rounded-lg px-3 py-2.5 text-xs text-gray-600 space-y-1">
            <p><span className="font-semibold">Name:</span> {customer.name}</p>
            <p><span className="font-semibold">Email:</span> {customer.email}</p>
            {customer.phone && <p><span className="font-semibold">Phone:</span> {customer.phone}</p>}
          </div>

          {error && (
            <p className="text-xs text-red-600 font-medium">{error}</p>
          )}

          {/* CTA */}
          <Button
            className="w-full bg-[#c8922a] hover:bg-[#b07d24] text-white font-bold py-3 text-base"
            onClick={handleEnroll}
            disabled={loading}
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin mr-2" />Redirecting to secure checkout…</>
            ) : (
              <>Enroll Now — {fmt(price)}/{cadence === "monthly" ? "mo" : cadence === "quarterly" ? "quarter" : "yr"}</>
            )}
          </Button>
          <p className="text-[10px] text-center text-gray-400">
            Secure checkout powered by Stripe. Cancel anytime.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
