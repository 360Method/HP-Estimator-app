/**
 * PortalSchedule — customer-facing scheduling widget.
 * Shows available slots in a simple grouped-by-day list. One click books.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2, Calendar, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { usePortal } from "@/contexts/PortalContext";

type VisitType = "consultation" | "baseline" | "seasonal" | "project";

const VISIT_TYPES: { value: VisitType; label: string; description: string }[] = [
  { value: "consultation", label: "Complimentary Consultation", description: "First conversation about your property and priorities." },
  { value: "baseline", label: "Baseline Walkthrough", description: "Full standard-of-care home review." },
  { value: "seasonal", label: "Seasonal Tune-Up", description: "Quarterly proactive visit for 360° members." },
  { value: "project", label: "Project Visit", description: "Hands-on stewardship for an active scope." },
];

function fmtDay(d: Date) {
  return d.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
}
function fmtTime(d: Date) {
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function PortalSchedule() {
  const { customer, loading: portalLoading } = usePortal();
  const [visitType, setVisitType] = useState<VisitType>("consultation");
  const [confirmed, setConfirmed] = useState<{ slotStart: string; code?: string | null } | null>(null);

  const slotsQuery = trpc.scheduling.listSlots.useQuery({ limit: 200 });
  const utils = trpc.useUtils();
  const createBooking = trpc.scheduling.createBooking.useMutation({
    onSuccess: (b) => {
      utils.scheduling.listSlots.invalidate();
      setConfirmed({ slotStart: new Date().toISOString(), code: b.confirmationCode ?? null });
      toast.success("Visit scheduled. We'll be in touch with the steward leading your visit.");
    },
    onError: (err) => toast.error(err.message),
  });

  if (portalLoading) {
    return (
      <PortalLayout>
        <div className="p-12 text-center text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
      </PortalLayout>
    );
  }

  if (!customer?.hpCustomerId) {
    return (
      <PortalLayout>
        <div className="p-6 max-w-3xl mx-auto">
          <h1 className="text-2xl font-light text-gray-900 mb-3">Schedule a Visit</h1>
          <p className="text-sm text-gray-600">Your customer profile isn't linked yet — message us and we'll set up your visit directly.</p>
        </div>
      </PortalLayout>
    );
  }

  const slots = slotsQuery.data ?? [];

  // Group by Pacific calendar day
  const grouped = new Map<string, typeof slots>();
  for (const s of slots) {
    const day = new Date(s.startAt).toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
    const arr = grouped.get(day) ?? [];
    arr.push(s);
    grouped.set(day, arr);
  }

  return (
    <PortalLayout>
      <div className="p-6 max-w-3xl mx-auto">
        <p className="text-xs text-gray-400 mb-1">Customer Portal &rsaquo; Schedule</p>
        <h1 className="text-3xl font-light text-gray-900 mb-2">Schedule a Visit</h1>
        <p className="text-sm text-gray-500 mb-6">Pick a window that fits your schedule. We'll confirm the steward leading your visit by email.</p>

        {confirmed ? (
          <Card className="p-6 border-green-200 bg-green-50">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-700 mt-0.5" />
              <div>
                <p className="font-medium text-green-900">Visit confirmed.</p>
                <p className="text-sm text-green-800 mt-1">
                  Confirmation: {confirmed.code ?? "—"}. We'll email you the steward and address details shortly.
                </p>
                <Button variant="outline" className="mt-4" onClick={() => setConfirmed(null)}>
                  Schedule another visit
                </Button>
              </div>
            </div>
          </Card>
        ) : (
          <>
            <div className="mb-6">
              <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">Visit type</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {VISIT_TYPES.map((v) => (
                  <button
                    key={v.value}
                    onClick={() => setVisitType(v.value)}
                    className={`text-left rounded-md border p-3 transition ${
                      visitType === v.value
                        ? "border-amber-500 bg-amber-50"
                        : "border-gray-200 hover:border-gray-400"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-900">{v.label}</p>
                    <p className="text-xs text-gray-500 mt-1">{v.description}</p>
                  </button>
                ))}
              </div>
            </div>

            {slotsQuery.isLoading ? (
              <div className="text-center py-12 text-gray-400"><Loader2 className="w-6 h-6 animate-spin inline" /></div>
            ) : slots.length === 0 ? (
              <Card className="p-6 text-center text-sm text-gray-500">
                No open windows in the next 30 days. Message us and we'll open one for you.
              </Card>
            ) : (
              <div className="space-y-4">
                {Array.from(grouped.entries()).map(([day, daySlots]) => (
                  <div key={day}>
                    <p className="text-xs uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-2">
                      <Calendar className="w-3.5 h-3.5" />
                      {fmtDay(new Date(daySlots[0].startAt))}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {daySlots.map((s) => (
                        <Button
                          key={s.id}
                          variant="outline"
                          disabled={createBooking.isPending}
                          onClick={() =>
                            createBooking.mutate({
                              customerId: customer.hpCustomerId!,
                              slotId: s.id,
                              visitType,
                              bookedBy: "customer",
                            })
                          }
                          className="justify-center text-sm"
                        >
                          {fmtTime(new Date(s.startAt))}
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </PortalLayout>
  );
}
