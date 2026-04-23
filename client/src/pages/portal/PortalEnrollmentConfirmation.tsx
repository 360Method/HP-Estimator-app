/**
 * PortalEnrollmentConfirmation — shown after a successful 360° enrollment
 * from within the portal.
 *
 * Route: /portal/360-confirmation?session_id=cs_xxx
 *
 * Flow:
 *  1. Reads session_id from URL query param
 *  2. Shows animated success state with tier/cadence details
 *  3. Links to portal dashboard and 360 membership page
 */
import { useLocation } from "wouter";
import { useEffect, useState } from "react";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { CheckCircle2, Home, Star, ArrowRight, Loader2 } from "lucide-react";
import { TIER_DEFINITIONS } from "@shared/threeSixtyTiers";
import { trpc } from "@/lib/trpc";

export default function PortalEnrollmentConfirmation() {
  const [, navigate] = useLocation();
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get("session_id");
  const cancelled = params.get("cancelled");

  // Fetch membership to confirm it was created
  const { data: membershipData, isLoading } = trpc.portal.getMembership360.useQuery(undefined, {
    retry: 3,
    retryDelay: 2000,
  });

  const [showContent, setShowContent] = useState(false);

  useEffect(() => {
    // Small delay for animation
    const t = setTimeout(() => setShowContent(true), 300);
    return () => clearTimeout(t);
  }, []);

  if (cancelled) {
    return (
      <PortalLayout>
        <div className="min-h-[60vh] flex flex-col items-center justify-center px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-amber-100 flex items-center justify-center mb-4">
            <span className="text-3xl">↩</span>
          </div>
          <h1 className="text-2xl font-bold text-foreground mb-2">Enrollment Cancelled</h1>
          <p className="text-muted-foreground mb-6 max-w-sm">
            No worries — your card was not charged. You can enroll anytime from your membership page.
          </p>
          <Button onClick={() => navigate("/portal/360-membership")} className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white">
            View 360° Plans
          </Button>
        </div>
      </PortalLayout>
    );
  }

  const membership = membershipData?.membership;
  const tierKey = (membership?.tier ?? "bronze") as keyof typeof TIER_DEFINITIONS;
  const tierDef = TIER_DEFINITIONS[tierKey] ?? TIER_DEFINITIONS.bronze;
  const cadence = (membership as any)?.cadence ?? "monthly";

  const cadenceLabel: Record<string, string> = {
    monthly: "Monthly",
    quarterly: "Quarterly",
    annual: "Annual",
  };

  const tierColor: Record<string, string> = {
    bronze: "text-amber-700",
    silver: "text-slate-500",
    gold: "text-yellow-600",
  };

  return (
    <PortalLayout>
      <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 py-12">
        {/* Animated success icon */}
        <div
          className={`transition-all duration-700 ${showContent ? "opacity-100 scale-100" : "opacity-0 scale-75"}`}
        >
          <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-6 mx-auto">
            <CheckCircle2 className="w-12 h-12 text-green-600" />
          </div>
        </div>

        <div
          className={`text-center transition-all duration-700 delay-200 ${showContent ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}
        >
          <p className="text-sm font-semibold uppercase tracking-widest text-[#c8922a] mb-2">
            Welcome to the 360° Method
          </p>
          <h1 className="text-3xl font-bold text-foreground mb-3">
            You're officially enrolled!
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto mb-8">
            Your home is now on a proactive maintenance plan. We'll reach out within 24 hours to schedule your first 360° Home Scan.
          </p>

          {/* Membership summary card */}
          {isLoading ? (
            <div className="flex items-center justify-center gap-2 text-muted-foreground mb-8">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading your membership details…</span>
            </div>
          ) : membership ? (
            <div className="bg-card border border-border rounded-xl p-6 max-w-sm mx-auto mb-8 text-left">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-[#1a2e1a] flex items-center justify-center">
                  <Star className="w-5 h-5 text-[#c8922a]" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Your Plan</p>
                  <p className={`font-bold text-lg ${tierColor[tierKey] ?? "text-foreground"}`}>
                    {tierDef.label} — {cadenceLabel[cadence] ?? cadence}
                  </p>
                </div>
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Seasonal visits</span>
                  <span className="font-medium">{tierDef.seasonalVisits}× per year</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Labor bank credit</span>
                  <span className="font-medium text-green-700">
                    ${(tierDef.laborBankCreditCents / 100).toFixed(0)}/yr
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Member discount</span>
                  <span className="font-medium text-green-700">{(tierDef.discountBrackets[0]?.rate ?? 0) * 100}% off all work</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 max-w-sm mx-auto mb-8 text-sm text-amber-800">
              Your membership is being set up — it will appear in your portal within a few minutes.
              {sessionId && (
                <p className="mt-1 text-xs text-amber-600 font-mono">Ref: {sessionId.slice(-8)}</p>
              )}
            </div>
          )}

          {/* What happens next */}
          <div className="bg-muted/40 rounded-xl p-5 max-w-sm mx-auto mb-8 text-left space-y-3">
            <p className="text-sm font-semibold text-foreground">What happens next</p>
            <div className="flex gap-3 text-sm">
              <span className="w-6 h-6 rounded-full bg-[#1a2e1a] text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
              <p className="text-muted-foreground">Check your email — a welcome message with your membership details is on its way from <strong>help@handypioneers.com</strong>.</p>
            </div>
            <div className="flex gap-3 text-sm">
              <span className="w-6 h-6 rounded-full bg-[#1a2e1a] text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
              <p className="text-muted-foreground">We'll contact you within 24 hours to confirm your address and schedule your Annual 360° Home Scan.</p>
            </div>
            <div className="flex gap-3 text-sm">
              <span className="w-6 h-6 rounded-full bg-[#1a2e1a] text-white text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
              <p className="text-muted-foreground">Your first seasonal visit will be queued within 48 hours based on today's date.</p>
            </div>
          </div>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button
              onClick={() => navigate("/portal/home")}
              className="bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white gap-2"
            >
              <Home className="w-4 h-4" />
              Go to My Dashboard
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/portal/360-membership")}
              className="gap-2"
            >
              View My Membership
              <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
