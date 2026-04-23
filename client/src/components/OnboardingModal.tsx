/**
 * OnboardingModal — shown to new portal customers on first login.
 * 3-step wizard: (1) confirm profile, (2) confirm property address, (3) what to expect.
 * Calls portal.completeOnboarding on finish.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CheckCircle, Home, User, Wrench, RefreshCw, ClipboardList, Star } from "lucide-react";

interface Props {
  customer: {
    name: string;
    email: string;
    phone?: string | null;
    address?: string | null;
    onboardingCompletedAt?: Date | null;
  };
  onComplete: () => void;
}

const STEPS = [
  { id: 1, label: "Your Profile" },
  { id: 2, label: "Your Property" },
  { id: 3, label: "What to Expect" },
];

export default function OnboardingModal({ customer, onComplete }: Props) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [address, setAddress] = useState(customer.address ?? "");

  const completeMutation = trpc.portal.completeOnboarding.useMutation({
    onSuccess: () => {
      toast.success("Welcome to Handy Pioneers! 🏡");
      onComplete();
    },
    onError: (err) => toast.error(err.message),
  });

  const handleFinish = () => {
    completeMutation.mutate({ name, phone, address });
  };

  // Don't show if already completed
  if (customer.onboardingCompletedAt) return null;

  return (
    <Dialog open>
      <DialogContent className="max-w-lg p-0 overflow-hidden" onInteractOutside={(e) => e.preventDefault()}>
        {/* Header */}
        <div className="bg-gradient-to-r from-[#1a2e1a] to-[#2d4a2d] px-6 py-5 text-white">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-lg bg-[#c8922a] flex items-center justify-center">
              <Home className="w-5 h-5 text-white" />
            </div>
            <div>
              <p className="text-xs text-white/60 uppercase tracking-wide font-semibold">Welcome to</p>
              <h2 className="text-lg font-bold">Handy Pioneers Portal</h2>
            </div>
          </div>
          {/* Step indicators */}
          <div className="flex items-center gap-2 mt-4">
            {STEPS.map((s, i) => (
              <div key={s.id} className="flex items-center gap-2">
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                  step > s.id ? "bg-[#c8922a] text-white" :
                  step === s.id ? "bg-white text-[#1a2e1a]" :
                  "bg-white/20 text-white/50"
                }`}>
                  {step > s.id ? <CheckCircle className="w-4 h-4" /> : s.id}
                </div>
                <span className={`text-xs hidden sm:block ${step === s.id ? "text-white font-medium" : "text-white/50"}`}>
                  {s.label}
                </span>
                {i < STEPS.length - 1 && (
                  <div className={`w-6 h-px mx-1 ${step > s.id ? "bg-[#c8922a]" : "bg-white/20"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Step content */}
        <div className="px-6 py-5">
          {step === 1 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <User className="w-4 h-4 text-[#c8922a]" />
                <h3 className="font-semibold text-gray-900">Confirm Your Profile</h3>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Full Name</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Phone Number</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(360) 000-0000"
                  type="tel"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Email</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500 cursor-not-allowed"
                  value={customer.email}
                  disabled
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Home className="w-4 h-4 text-[#c8922a]" />
                <h3 className="font-semibold text-gray-900">Confirm Your Property Address</h3>
              </div>
              <p className="text-sm text-gray-500">
                This is the property we'll be servicing under your 360° membership. Make sure it's correct so we can schedule your baseline scan.
              </p>
              <div>
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wider block mb-1">Service Address</label>
                <input
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 Main St, Vancouver, WA 98661"
                />
              </div>
              {!address && (
                <p className="text-xs text-amber-600 flex items-center gap-1">
                  <span>⚠</span> Please enter your property address so we can schedule your baseline scan.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div className="flex items-center gap-2 mb-3">
                <Star className="w-4 h-4 text-[#c8922a]" />
                <h3 className="font-semibold text-gray-900">What to Expect</h3>
              </div>
              <div className="space-y-3">
                {[
                  {
                    icon: <ClipboardList className="w-5 h-5 text-emerald-600" />,
                    bg: "bg-emerald-50",
                    title: "Baseline Scan Within 48 Hours",
                    desc: "We'll schedule your first comprehensive property inspection within 48 hours of enrollment.",
                  },
                  {
                    icon: <Wrench className="w-5 h-5 text-amber-600" />,
                    bg: "bg-amber-50",
                    title: "Labor Bank Credits",
                    desc: "Your plan includes pre-paid labor hours. Use them for any repair or maintenance task — no extra charges.",
                  },
                  {
                    icon: <RefreshCw className="w-5 h-5 text-blue-600" />,
                    bg: "bg-blue-50",
                    title: "Ongoing 360° Reports",
                    desc: "After each visit you'll receive a detailed property health report with a score and prioritized recommendations.",
                  },
                  {
                    icon: <CheckCircle className="w-5 h-5 text-violet-600" />,
                    bg: "bg-violet-50",
                    title: "Digital Sign-Off",
                    desc: "Review and approve all work right here in your portal before we close out any job.",
                  },
                ].map((item) => (
                  <div key={item.title} className={`flex items-start gap-3 rounded-lg p-3 ${item.bg}`}>
                    <div className="shrink-0 mt-0.5">{item.icon}</div>
                    <div>
                      <p className="text-sm font-semibold text-gray-900">{item.title}</p>
                      <p className="text-xs text-gray-600 mt-0.5">{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between gap-3 border-t border-gray-100 pt-4">
          {step > 1 ? (
            <Button variant="outline" size="sm" onClick={() => setStep(step - 1)}>
              Back
            </Button>
          ) : (
            <div />
          )}
          {step < 3 ? (
            <Button
              size="sm"
              className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white"
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !name.trim()}
            >
              Continue →
            </Button>
          ) : (
            <Button
              size="sm"
              className="bg-[#c8922a] hover:bg-[#b07d24] text-white"
              onClick={handleFinish}
              disabled={completeMutation.isPending}
            >
              {completeMutation.isPending ? "Saving…" : "Get Started 🏡"}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
