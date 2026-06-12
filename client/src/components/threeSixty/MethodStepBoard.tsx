/**
 * MethodStepBoard: the nine steps as the working surface of a client profile.
 *
 * Every customer gets the full framework, member or not. Each step opens to
 * show exactly what is in it (scans, visits, spot inspections, roadmaps,
 * jobs, consultations) or an honest empty state plus the action that fills
 * it. Status and contents come from trpc.threeSixty.journey.forCustomer.
 */
import { useState } from "react";
import { Link } from "wouter";
import { ChevronDown, ChevronRight } from "lucide-react";
import {
  THREE_SIXTY_METHOD_PHASES,
  type ThreeSixtyStepKey,
} from "@shared/threeSixtyMethod";
import type { JourneyState, JourneyStepStatus } from "@shared/threeSixtyJourney";

type StepContentItem = {
  kind: "scan" | "workorder" | "visit" | "spot" | "opportunity" | "document" | "info";
  refId: string | null;
  label: string;
  note: string;
  dateMs: number | null;
};

const STATUS_LABEL: Record<JourneyStepStatus, string> = {
  done: "Done",
  done_this_season: "Done this season",
  in_progress: "In progress",
  due_this_season: "Due",
  not_yet: "Not yet",
  waiting_year_two: "Year two",
  not_included: "With membership",
};

const STATUS_CHIP: Record<JourneyStepStatus, string> = {
  done: "bg-emerald-100 text-emerald-800 border-emerald-200",
  done_this_season: "bg-emerald-100 text-emerald-800 border-emerald-200",
  in_progress: "bg-amber-50 text-amber-800 border-amber-300",
  due_this_season: "bg-amber-100 text-amber-800 border-amber-300",
  not_yet: "bg-gray-50 text-gray-500 border-gray-200",
  waiting_year_two: "bg-gray-50 text-gray-400 border-gray-200",
  not_included: "bg-gray-50 text-gray-400 border-gray-200",
};

/**
 * The action that fills a step, when one exists. With a property in
 * context the action stays at that property (its own schedule, its own
 * jobs) instead of zooming out to the company-wide surfaces.
 */
function stepAction(key: ThreeSixtyStepKey, customerId: string, propertyId?: string | null): { label: string; href: string } | null {
  const stepHref = (k: ThreeSixtyStepKey) => `/os/property/${propertyId}/step/${k}`;
  switch (key) {
    case "inspect":
      return {
        label: "Start a spot inspection",
        href: `/os/spot/new?customerId=${encodeURIComponent(customerId)}${propertyId ? `&propertyId=${encodeURIComponent(propertyId)}` : ""}`,
      };
    case "prioritize":
      return { label: "Quote the work", href: `/os/estimate/new?customerId=${encodeURIComponent(customerId)}` };
    case "schedule":
      return propertyId
        ? { label: "This home's calendar", href: stepHref("schedule") }
        : { label: "Open the schedule", href: "/os/schedule" };
    case "execute":
      return propertyId
        ? { label: "Work at this home", href: stepHref("execute") }
        : { label: "Open the pipeline", href: "/os/pipeline" };
    case "upgrade":
      return { label: "Remodel options", href: `/os/quickquote?customerId=${encodeURIComponent(customerId)}` };
    default:
      return null;
  }
}

const fmtDate = (ms: number | null) =>
  ms == null ? "" : new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export function MethodStepBoard({
  journey,
  stepContents,
  customerId,
  propertyId,
  onOpenOpportunity,
  onOpenSpot,
}: {
  journey: JourneyState;
  stepContents: Record<ThreeSixtyStepKey, StepContentItem[]>;
  customerId: string;
  /** When set, each step row links to its full page at this property. */
  propertyId?: string | null;
  onOpenOpportunity?: (opportunityId: string) => void;
  onOpenSpot?: (spotId: string) => void;
}) {
  const [open, setOpen] = useState<Record<string, boolean>>({ [journey.currentStepKey]: true });
  const hairline = { borderColor: "var(--hp-hairline)" } as const;

  return (
    <div className="space-y-3">
      {THREE_SIXTY_METHOD_PHASES.map((phase, idx) => (
        <div key={phase.id} className="bg-white rounded-xl border overflow-hidden" style={hairline}>
          <div className="px-4 py-2 border-b flex items-center gap-2" style={hairline}>
            <span className="text-xs font-semibold" style={{ color: "var(--hp-ink)" }}>
              Phase {idx + 1}: {phase.name}
            </span>
            <span className="text-[11px] text-muted-foreground">{phase.subtitle}</span>
          </div>
          <div className="divide-y" style={hairline}>
            {phase.steps.map((step) => {
              const state = journey.steps.find((s) => s.key === step.key)!;
              const items = stepContents[step.key] ?? [];
              const isCurrent = step.key === journey.currentStepKey;
              const isOpen = !!open[step.key];
              const action = stepAction(step.key, customerId, propertyId);
              return (
                <div key={step.key}>
                  <div className="flex items-center hover:bg-black/[0.02]">
                  <button
                    type="button"
                    onClick={() => setOpen((o) => ({ ...o, [step.key]: !o[step.key] }))}
                    className="flex-1 min-w-0 px-4 py-2.5 flex items-center gap-3 text-left"
                  >
                    <span
                      className={`inline-flex items-center justify-center w-6 h-6 rounded-full border text-[11px] font-semibold shrink-0 ${STATUS_CHIP[state.status]}`}
                      style={isCurrent ? { boxShadow: "0 0 0 2px var(--hp-gold-deep)" } : undefined}
                    >
                      {step.number}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="text-sm font-medium" style={{ color: "var(--hp-ink)" }}>
                        {step.name}
                        {isCurrent && (
                          <span className="text-[10px] font-semibold ml-2" style={{ color: "var(--hp-gold-deep)" }}>
                            NOW
                          </span>
                        )}
                        {items.length > 0 && (
                          <span className="text-[11px] font-normal text-muted-foreground ml-2">
                            {items.length} item{items.length === 1 ? "" : "s"}
                          </span>
                        )}
                      </span>
                      <span className="block text-[11px] text-muted-foreground truncate">{state.detail}</span>
                    </span>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold shrink-0 ${STATUS_CHIP[state.status]}`}>
                      {STATUS_LABEL[state.status]}
                    </span>
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    )}
                  </button>
                  {propertyId && (
                    <Link href={`/os/property/${propertyId}/step/${step.key}`}>
                      <span
                        className="text-[10px] px-2 py-0.5 mr-4 rounded-full border font-semibold shrink-0 cursor-pointer hover:bg-black/[0.03]"
                        style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
                      >
                        Open
                      </span>
                    </Link>
                  )}
                  </div>

                  {isOpen && (
                    <div className="px-4 pb-3 pl-[52px]">
                      {items.length === 0 ? (
                        <p className="text-xs text-muted-foreground">
                          Nothing here yet. {step.delivers}
                        </p>
                      ) : (
                        <ul className="space-y-1">
                          {items.map((item, i) => {
                            const clickable =
                              (item.kind === "spot" && onOpenSpot) ||
                              (item.kind === "opportunity" && onOpenOpportunity);
                            const row = (
                              <span className="flex items-center justify-between gap-2 w-full">
                                <span className="text-xs min-w-0 truncate" style={{ color: "var(--hp-ink)" }}>
                                  {item.label}
                                  <span className="text-muted-foreground"> · {item.note}</span>
                                </span>
                                <span className="text-[10px] text-muted-foreground shrink-0">{fmtDate(item.dateMs)}</span>
                              </span>
                            );
                            return clickable ? (
                              <li key={i}>
                                <button
                                  type="button"
                                  className="w-full text-left rounded-md px-2 py-1.5 border hover:shadow-sm transition-shadow"
                                  style={hairline}
                                  onClick={() => {
                                    if (item.kind === "spot" && item.refId) onOpenSpot?.(item.refId);
                                    if (item.kind === "opportunity" && item.refId) onOpenOpportunity?.(item.refId);
                                  }}
                                >
                                  {row}
                                </button>
                              </li>
                            ) : (
                              <li key={i} className="rounded-md px-2 py-1.5 border" style={hairline}>
                                {row}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {action && state.status !== "not_included" && (
                        <Link href={action.href}>
                          <span
                            className="inline-flex items-center gap-1 text-[11px] px-2.5 py-1.5 rounded-lg border font-semibold cursor-pointer mt-2 hover:bg-black/[0.02]"
                            style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
                          >
                            {action.label} <ChevronRight className="w-3 h-3" />
                          </span>
                        </Link>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
