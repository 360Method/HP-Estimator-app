/**
 * StepExecute — Step 6: the open jobs at this property — who is in
 * charge, milestone progress, and the latest field update.
 */
import { HardHat } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { fmtStepDate, hairline } from "./types";

export default function StepExecute({
  customerId,
  propertyId,
  onOpenOpportunity,
}: {
  customerId: string;
  propertyId: string;
  onOpenOpportunity: (opportunityId: string) => void;
}) {
  const { data, isLoading } = trpc.threeSixty.journey.stepDetail.useQuery({
    customerId,
    propertyId,
    stepKey: "execute",
  });

  if (isLoading) {
    return <div className="h-24 rounded-xl bg-white border animate-pulse" style={hairline} />;
  }
  if (!data || data.kind !== "execute") return null;

  if (data.jobs.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No jobs in motion at this property right now.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {data.jobs.map((j) => {
        const pct = j.milestonesTotal > 0 ? Math.round((j.milestonesDone / j.milestonesTotal) * 100) : null;
        return (
          <button
            key={j.id}
            type="button"
            onClick={() => onOpenOpportunity(j.id)}
            className="w-full text-left bg-white rounded-xl border px-4 py-3 hover:shadow-sm transition-shadow"
            style={hairline}
          >
            <div className="flex items-center gap-3">
              <HardHat className="w-4 h-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>
                  {j.title || "Job"}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[
                    j.assignedTo ? `In charge: ${j.assignedTo}` : "Unassigned",
                    j.scheduledDate ? fmtStepDate(Date.parse(String(j.scheduledDate)) || null) : null,
                  ].filter(Boolean).join(" · ")}
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 shrink-0">
                {String(j.stage ?? "open").toLowerCase()}
              </span>
            </div>
            {pct != null && (
              <div className="mt-2 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded bg-black/[0.06]">
                  <div className="h-full rounded" style={{ width: `${pct}%`, background: "var(--hp-gold-deep)" }} />
                </div>
                <span className="text-[10px] text-muted-foreground shrink-0">
                  {j.milestonesDone}/{j.milestonesTotal} milestones
                </span>
              </div>
            )}
            {j.latestUpdate && (
              <p className="mt-2 text-xs text-muted-foreground">
                "{j.latestUpdate.message}"{j.latestUpdate.postedBy ? ` — ${j.latestUpdate.postedBy}` : ""}
              </p>
            )}
          </button>
        );
      })}
    </div>
  );
}
