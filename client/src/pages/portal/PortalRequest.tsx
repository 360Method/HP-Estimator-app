/**
 * PortalRequest — Customer-facing "Book online / Request service" form.
 * Submits a service request to HP team, who then creates a lead.
 * Mobile-first, HP brand colors.
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  Loader2,
  CheckCircle,
  ChevronLeft,
  Calendar,
  Clock,
  Zap,
  CalendarDays,
} from "lucide-react";

type Timeline = "asap" | "within_week" | "flexible";

const TIMELINE_OPTIONS: { value: Timeline; label: string; desc: string; icon: React.ReactNode }[] = [
  { value: "asap", label: "As Soon As Possible", desc: "Urgent — I need this done quickly", icon: <Zap className="w-5 h-5" /> },
  { value: "within_week", label: "Within the Week", desc: "Flexible but within 7 days", icon: <Clock className="w-5 h-5" /> },
  { value: "flexible", label: "I'm Flexible", desc: "No rush — schedule at your convenience", icon: <CalendarDays className="w-5 h-5" /> },
];

export default function PortalRequest() {
  const [, navigate] = useLocation();
  const [description, setDescription] = useState("");
  const [timeline, setTimeline] = useState<Timeline>("flexible");
  const [address, setAddress] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const meQuery = trpc.portal.me.useQuery();
  const customer = meQuery.data?.customer;

  const submitMutation = trpc.portal.submitServiceRequest.useMutation({
    onSuccess: () => {
      setSubmitted(true);
    },
    onError: (err) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 10) {
      toast.error("Please describe the work needed (at least 10 characters).");
      return;
    }
    submitMutation.mutate({ description: description.trim(), timeline, address: address.trim() || undefined });
  };

  if (submitted) {
    return (
      <PortalLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-4 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Request Submitted!</h2>
          <p className="text-gray-500 mb-6 max-w-sm">
            We've received your request and will be in touch within 24 hours to schedule your appointment.
          </p>
          <div className="flex gap-3">
            <Button
              onClick={() => navigate("/portal/home")}
              className="bg-[#c8922a] hover:bg-[#b07d24] text-white"
            >
              Back to Home
            </Button>
            <Button
              variant="outline"
              onClick={() => navigate("/portal/messages")}
            >
              Message Us
            </Button>
          </div>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="p-4 sm:p-6 max-w-2xl mx-auto">
        {/* Breadcrumb */}
        <button
          onClick={() => navigate("/portal/home")}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-800 mb-4 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Home
        </button>

        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Request Service</h1>
          <p className="text-sm text-gray-500 mt-1">
            Tell us what you need and we'll reach out to schedule an appointment.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Description */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              What work do you need done? <span className="text-red-500">*</span>
            </label>
            <textarea
              className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a] resize-none"
              rows={5}
              placeholder="Describe the work you need. For example: 'Bathroom remodel — replace vanity, re-tile shower, and update lighting. About 80 sq ft.'"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
            <p className="text-xs text-gray-400 mt-1 text-right">{description.length}/2000</p>
          </div>

          {/* Timeline */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              <Calendar className="w-4 h-4 inline mr-1.5 text-gray-500" />
              When do you need this done?
            </label>
            <div className="space-y-2">
              {TIMELINE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setTimeline(opt.value)}
                  className={`w-full flex items-center gap-3 p-3 rounded-lg border-2 text-left transition-all ${
                    timeline === opt.value
                      ? "border-[#c8922a] bg-amber-50"
                      : "border-gray-200 hover:border-gray-300"
                  }`}
                >
                  <div
                    className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${
                      timeline === opt.value ? "bg-[#c8922a] text-white" : "bg-gray-100 text-gray-500"
                    }`}
                  >
                    {opt.icon}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{opt.label}</p>
                    <p className="text-xs text-gray-500">{opt.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Address */}
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <label className="block text-sm font-semibold text-gray-900 mb-2">
              Service Address
              {customer?.address && (
                <span className="ml-2 text-xs font-normal text-gray-400">(leave blank to use your profile address)</span>
              )}
            </label>
            <input
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8922a]"
              placeholder={customer?.address ?? "123 Main St, Vancouver, WA 98683"}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
            {customer?.address && !address && (
              <p className="text-xs text-gray-400 mt-1">
                Will use: <span className="text-gray-600">{customer.address}</span>
              </p>
            )}
          </div>

          {/* Submit */}
          <Button
            type="submit"
            disabled={submitMutation.isPending || description.trim().length < 10}
            className="w-full bg-[#c8922a] hover:bg-[#b07d24] text-white font-semibold py-3 text-base"
          >
            {submitMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Submitting...
              </>
            ) : (
              "Submit Request"
            )}
          </Button>

          <p className="text-xs text-center text-gray-400">
            We'll contact you within 1 business day to confirm your appointment.
          </p>
        </form>
      </div>
    </PortalLayout>
  );
}
