/**
 * ProjectCompleteNudge — surfaces after a Path A project wraps up for THIS customer.
 * Pulls observations the crew captured on this customer's opportunity (completion notes)
 * and offers a complimentary Baseline Walkthrough. Positioning, not persuasion.
 *
 * Renders null when:
 *  - the continuity feature flag is off
 *  - the customer already has a 360° membership
 *  - no crew observations exist yet (we don't fabricate demo content)
 */
import { useLocation } from "wouter";
import { ClipboardCheck, Eye, ChevronRight } from "lucide-react";
import { useContinuityEnabled } from "./useContinuityEnabled";

interface ProjectCompleteNudgeProps {
  /** Customer's first name — anchors copy to the logged-in customer. */
  customerFirstName: string;
  /** Title of this customer's completed project. */
  projectTitle: string;
  /** Completion notes captured by the crew on this specific opportunity. Newline-separated. */
  completionNotes?: string | null;
  /** If true (customer is already a 360° member), the nudge hides — they already have the continuity frame. */
  isMember?: boolean;
}

// TODO: move to CMS (nucleus)
const COPY = {
  eyebrow: "While we were at your property",
  headline: (firstName: string) => `A few things our crew noticed at your home, ${firstName}`,
  body:
    "Your project is complete. Before we close the chapter, here are the observations our crew captured on site. A complimentary Baseline Walkthrough puts them in the context of your full home — what compounds in value, what needs stewardship, and in what order.",
  cta: "Schedule a complimentary Baseline Walkthrough",
  footnote: "A Baseline is our standard of care for new properties. No obligation.",
};

function parseObservations(notes?: string | null): string[] {
  if (!notes) return [];
  return notes
    .split(/\n+/)
    .map((l) => l.replace(/^[-*•\d.\s]+/, "").trim())
    .filter((l) => l.length > 6)
    .slice(0, 3);
}

export default function ProjectCompleteNudge({
  customerFirstName,
  projectTitle,
  completionNotes,
  isMember,
}: ProjectCompleteNudgeProps) {
  const enabled = useContinuityEnabled();
  const [, navigate] = useLocation();

  if (!enabled || isMember) return null;

  const observations = parseObservations(completionNotes);
  // Don't render when the crew hasn't captured anything for this customer's project yet —
  // a nudge without real observations would be a generic upsell, not a continuity surface.
  if (observations.length === 0) return null;

  return (
    <div
      className="rounded-xl border border-[#1a2e1a]/15 overflow-hidden"
      style={{ background: "linear-gradient(180deg,#fefcf8 0%,#fdf6e7 100%)" }}
    >
      <div className="px-5 pt-5 pb-3 flex items-start gap-3">
        <div className="w-10 h-10 rounded-full bg-[#1a2e1a] flex items-center justify-center shrink-0">
          <Eye className="w-5 h-5 text-[#c8922a]" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#c8922a] font-semibold">
            {COPY.eyebrow}
          </p>
          <p className="text-base font-semibold text-[#1a2e1a] leading-snug mt-0.5">
            {COPY.headline(customerFirstName)}
          </p>
          <p className="text-xs text-gray-600 mt-1 leading-relaxed">{COPY.body}</p>
        </div>
      </div>

      <ul className="px-5 pb-4 space-y-2">
        {observations.map((obs, i) => (
          <li
            key={i}
            className="flex items-start gap-2 text-xs text-gray-700 bg-white/70 border border-[#1a2e1a]/10 rounded-lg px-3 py-2"
          >
            <span className="text-[#c8922a] mt-0.5">—</span>
            <span className="leading-relaxed">{obs}</span>
          </li>
        ))}
      </ul>

      <button
        onClick={() =>
          navigate(
            `/portal/360-membership?source=project_complete&project=${encodeURIComponent(projectTitle)}`,
          )
        }
        className="w-full flex items-center justify-center gap-2 px-5 py-3 bg-[#1a2e1a] text-white text-sm font-semibold hover:bg-[#2d4a2d] transition-colors"
      >
        <ClipboardCheck className="w-4 h-4 text-[#c8922a]" />
        {COPY.cta}
        <ChevronRight className="w-4 h-4" />
      </button>
      <p className="text-[11px] text-gray-500 text-center py-2 bg-white/40 border-t border-[#1a2e1a]/10">
        {COPY.footnote}
      </p>
    </div>
  );
}
