import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Gift, Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export default function PortalReferral() {
  const { data, isLoading } = trpc.portal.getReferrals.useQuery();
  const [copied, setCopied] = useState(false);

  const referralCode = data?.referralCode ?? "";
  const referralLink = referralCode ? `${window.location.origin}/portal/login?ref=${referralCode}` : "";
  const referrals = data?.referrals ?? [];
  const creditsEarned = referrals.filter((r) => r.status === "converted").length * 5000;

  const copyLink = () => {
    navigator.clipboard.writeText(referralLink).then(() => {
      setCopied(true);
      toast.success("Referral link copied!");
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <PortalLayout>
      <div className="p-6 max-w-2xl mx-auto">
        <p className="text-xs text-gray-400 mb-1">Customer Portal &rsaquo; Referral program</p>
        <h1 className="text-3xl font-light text-gray-900 mb-6">Referral Program</h1>

        {isLoading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Hero card */}
            <div className="bg-blue-600 text-white rounded-xl p-6">
              <div className="flex items-center gap-3 mb-3">
                <Gift className="w-8 h-8" />
                <div>
                  <h2 className="text-lg font-semibold">Refer a friend, earn rewards</h2>
                  <p className="text-blue-100 text-sm">Share your link and earn credits when they book a job.</p>
                </div>
              </div>
              <div className="bg-white/10 rounded-lg p-3 mt-4">
                <p className="text-xs text-blue-100 mb-1">Your referral link</p>
                <div className="flex gap-2">
                  <Input
                    readOnly
                    value={referralLink}
                    className="bg-white/20 border-white/30 text-white placeholder:text-white/50 text-xs"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    className="bg-white text-blue-600 hover:bg-blue-50 border-white shrink-0"
                    onClick={copyLink}
                  >
                    {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  </Button>
                </div>
              </div>
            </div>

            {/* Credits */}
            <div className="bg-white border border-gray-200 rounded-lg p-5">
              <p className="text-sm text-gray-500 mb-1">Total credits earned</p>
              <p className="text-3xl font-bold text-gray-900">${(creditsEarned / 100).toFixed(2)}</p>
            </div>

            {/* Referral history */}
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Referral history</h3>
              {referrals.length === 0 ? (
                <div className="text-center py-8 text-gray-400 border border-dashed border-gray-200 rounded-lg">
                  <p className="text-sm">No referrals yet — share your link to get started!</p>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-md overflow-hidden">
                  <div className="grid grid-cols-3 bg-gray-50 border-b border-gray-200 text-xs font-semibold text-gray-600 px-4 py-2">
                    <span>Name</span>
                    <span>Date</span>
                    <span>Status</span>
                  </div>
                  {referrals.map((r) => (
                    <div key={r.id} className="grid grid-cols-3 px-4 py-3 border-b border-gray-100 last:border-0 text-sm text-gray-700">
                      <span>{r.referredEmail ?? "—"}</span>
                      <span>{r.createdAt ? new Date(r.createdAt).toLocaleDateString() : "—"}</span>
                      <span className={`capitalize ${r.status === "converted" ? "text-green-600" : "text-gray-500"}`}>
                        {r.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PortalLayout>
  );
}
