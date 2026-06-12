/**
 * MethodJourneyStrip: the compact 9-step 360 Method journey for one member.
 *
 * Shows all nine steps grouped by phase, the derived current step
 * highlighted, what each step's state is right now, and one line of value
 * delivered so far. Data comes from trpc.threeSixty.journey.* (the shared
 * deriveJourney engine); this component only renders.
 *
 * Staff surface, but every string is safe for a customer glancing at the
 * screen: no costs, no margins, no internal tier codes.
 */
import { Link } from "wouter";
import { Compass } from "lucide-react";
import {
  THREE_SIXTY_METHOD_STEPS,
  THREE_SIXTY_METHOD_PHASES,
  getThreeSixtyStepByKey,
} from "@shared/threeSixtyMethod";
import type { JourneyState, JourneyStepStatus } from "@shared/threeSixtyJourney";
import { formatDollars } from "@shared/threeSixtyTiers";

const STATUS_STYLE: Record<JourneyStepStatus, { chip: string; label: string }> = {
  done: { chip: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Done" },
  done_this_season: { chip: "bg-emerald-100 text-emerald-800 border-emerald-200", label: "Done this season" },
  in_progress: { chip: "bg-amber-50 text-amber-800 border-amber-300", label: "In progress" },
  due_this_season: { chip: "bg-amber-100 text-amber-800 border-amber-300", label: "Due this season" },
  not_yet: { chip: "bg-gray-50 text-gray-500 border-gray-200", label: "Not yet" },
  waiting_year_two: { chip: "bg-gray-50 text-gray-400 border-gray-200", label: "Year two" },
  not_included: { chip: "bg-gray-50 text-gray-400 border-gray-200", label: "Not in plan" },
};

export function MethodJourneyStrip({
  journey,
  tierLabel,
}: {
  journey: JourneyState;
  tierLabel?: string;
}) {
  const currentStep = getThreeSixtyStepByKey(journey.currentStepKey)!;
  const currentState = journey.steps.find((s) => s.key === journey.currentStepKey);
  const v = journey.valueDelivered;

  const valueParts: string[] = [];
  if (v.visitsCompleted > 0) valueParts.push(`${v.visitsCompleted} visit${v.visitsCompleted === 1 ? "" : "s"} completed`);
  if (v.findingsLogged > 0) valueParts.push(`${v.findingsLogged} findings on record`);
  if (v.jobsCompleted > 0) valueParts.push(`${v.jobsCompleted} job${v.jobsCompleted === 1 ? "" : "s"} done`);
  if (v.healthScore != null) valueParts.push(`Home Score ${v.healthScore}`);
  if (v.laborBankBalanceCents > 0) valueParts.push(`${formatDollars(v.laborBankBalanceCents)} labor bank`);

  return (
    <div className="bg-white rounded-xl border px-4 py-3" style={{ borderColor: "var(--hp-hairline)" }}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--hp-gold-deep)" }}>
          <Compass className="w-3.5 h-3.5" />
          360 Method
          {tierLabel && <span className="font-normal text-muted-foreground">· {tierLabel}</span>}
          {journey.membershipYear > 1 && (
            <span className="font-normal text-muted-foreground">· Year {journey.membershipYear}</span>
          )}
        </div>
        <Link href="/os/method">
          <span className="text-[11px] text-muted-foreground hover:underline cursor-pointer">How the method works</span>
        </Link>
      </div>

      {/* The nine steps, grouped by phase */}
      <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-2">
        {THREE_SIXTY_METHOD_PHASES.map((phase) => (
          <div key={phase.id} className="flex items-center gap-1">
            <span className="text-[9px] uppercase tracking-wide text-muted-foreground mr-0.5">{phase.name}</span>
            {phase.steps.map((step) => {
              const state = journey.steps.find((s) => s.key === step.key);
              const status = state?.status ?? "not_yet";
              const isCurrent = step.key === journey.currentStepKey;
              const style = STATUS_STYLE[status];
              return (
                <span
                  key={step.key}
                  title={`${step.number}. ${step.name}: ${state?.detail ?? ""}`}
                  className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-semibold ${style.chip}`}
                  style={isCurrent ? { boxShadow: "0 0 0 2px var(--hp-gold-deep)" } : undefined}
                >
                  {step.number}
                </span>
              );
            })}
          </div>
        ))}
      </div>

      {/* Where we are and what it means */}
      <div className="mt-2.5 text-sm" style={{ color: "var(--hp-ink)" }}>
        <span className="font-semibold">
          Now: Step {currentStep.number}, {currentStep.name}.
        </span>{" "}
        <span className="text-muted-foreground">{currentState?.detail}</span>
      </div>
      {valueParts.length > 0 && (
        <div className="mt-1 text-xs text-muted-foreground">Value so far: {valueParts.join(" · ")}.</div>
      )}
    </div>
  );
}

/** Tiny inline chip for roster rows: "Step 2 · Inspect". */
export function MethodStepChip({ journey }: { journey: JourneyState }) {
  const step = THREE_SIXTY_METHOD_STEPS.find((s) => s.key === journey.currentStepKey)!;
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full font-semibold border"
      style={{ background: "rgba(200,146,42,0.10)", color: "var(--hp-gold-deep)", borderColor: "rgba(200,146,42,0.3)" }}
      title={journey.steps.find((s) => s.key === step.key)?.detail}
    >
      Step {step.number} · {step.name}
    </span>
  );
}
