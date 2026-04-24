/**
 * ScheduleBaselineAddon — offered on an upcoming appointment card.
 * Customer opts in to have the same crew perform a complimentary Baseline
 * Walkthrough on the same visit. Sends a portal message so the team absorbs
 * the request into scheduling; no extra charge, no separate trip.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, Check, Loader2 } from "lucide-react";
import { useContinuityEnabled } from "./useContinuityEnabled";

interface ScheduleBaselineAddonProps {
  appointmentTitle: string;
  /** JS Date or ISO string of the scheduled visit */
  scheduledAt: string | Date;
  /** Suppress when the customer is already a 360° member (they have baselines in rotation). */
  isMember?: boolean;
}

// TODO: move to CMS (nucleus)
const COPY = {
  label: "Complimentary Baseline Walkthrough",
  body: "While our crew is on site, we can complete a full Baseline Walkthrough of your property — the same standard of care we extend to every new member. No extra trip, no extra charge.",
  cta: "Add to this visit",
  added: "Baseline added — we'll confirm before your visit",
};

export default function ScheduleBaselineAddon({
  appointmentTitle,
  scheduledAt,
  isMember,
}: ScheduleBaselineAddonProps) {
  const enabled = useContinuityEnabled();
  const [added, setAdded] = useState(false);

  const sendMessage = trpc.portal.sendMessage.useMutation({
    onSuccess: () => {
      setAdded(true);
      toast.success("Baseline request received — the crew will confirm.");
    },
    onError: (err) => toast.error(err.message),
  });

  if (!enabled || isMember) return null;

  const apptDate = new Date(scheduledAt).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });

  const handleAdd = () => {
    sendMessage.mutate({
      body: `I'd like to add a complimentary Baseline Walkthrough to my upcoming visit on ${apptDate} (${appointmentTitle}). Same crew, same day is perfect if that works on your end.`,
    });
  };

  if (added) {
    return (
      <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-emerald-900">{COPY.added}</p>
          <p className="text-[11px] text-emerald-700 mt-0.5">
            We'll include it alongside {appointmentTitle} on {apptDate}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg border border-[#1a2e1a]/20 p-4"
      style={{ background: "linear-gradient(180deg,#fefcf8 0%,#fbf5e6 100%)" }}
    >
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-full bg-[#1a2e1a] flex items-center justify-center shrink-0">
          <Plus className="w-4 h-4 text-[#c8922a]" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#c8922a] font-semibold">
            Proactive · Optional
          </p>
          <p className="text-sm font-semibold text-[#1a2e1a] mt-0.5">{COPY.label}</p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{COPY.body}</p>
        </div>
      </div>
      <button
        onClick={handleAdd}
        disabled={sendMessage.isPending}
        className="mt-3 w-full flex items-center justify-center gap-2 py-2 rounded-md bg-[#1a2e1a] hover:bg-[#2d4a2d] text-white text-xs font-semibold transition-colors disabled:opacity-60"
      >
        {sendMessage.isPending ? (
          <>
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Sending…
          </>
        ) : (
          <>
            <Plus className="w-3.5 h-3.5" /> {COPY.cta}
          </>
        )}
      </button>
    </div>
  );
}
