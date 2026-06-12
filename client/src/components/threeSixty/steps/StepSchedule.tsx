/**
 * StepSchedule — Step 5: what is on the calendar for this property —
 * seasonal visits still open, scheduled work, calendar events — plus a
 * simple timeline of the dated jobs (the remodel view).
 */
import { Link } from "wouter";
import { CalendarDays } from "lucide-react";
import { SEASON_LABELS } from "@shared/threeSixtyMethod";
import { trpc } from "@/lib/trpc";
import PhaseTimeline from "./PhaseTimeline";
import { fmtStepDate, hairline } from "./types";

const parseMs = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

export default function StepSchedule({ customerId, propertyId }: { customerId: string; propertyId: string }) {
  const { data, isLoading } = trpc.threeSixty.journey.stepDetail.useQuery({
    customerId,
    propertyId,
    stepKey: "schedule",
  });

  if (isLoading) {
    return <div className="h-24 rounded-xl bg-white border animate-pulse" style={hairline} />;
  }
  if (!data || data.kind !== "schedule") return null;

  const rows = [
    ...data.workOrders.map((w) => ({
      id: `wo-${w.id}`,
      title: `${SEASON_LABELS[w.type as keyof typeof SEASON_LABELS] ?? w.type} visit ${w.visitYear}`,
      note: w.status.replace("_", " "),
      dateMs: w.scheduledDate as number | null,
    })),
    ...data.opportunities.map((o) => ({
      id: `opp-${o.id}`,
      title: o.title || "Scheduled work",
      note: String(o.stage ?? "").toLowerCase() || "scheduled",
      dateMs: parseMs(o.scheduledDate),
    })),
    ...data.events.map((e) => ({
      id: `ev-${e.id}`,
      title: e.title,
      note: e.type,
      dateMs: parseMs(e.start),
    })),
  ].sort((a, b) => (a.dateMs ?? Number.MAX_SAFE_INTEGER) - (b.dateMs ?? Number.MAX_SAFE_INTEGER));

  const timelineItems = data.opportunities
    .map((o) => ({
      id: o.id,
      label: o.title || "Job",
      startMs: parseMs(o.scheduledDate) ?? NaN,
      endMs: parseMs(o.scheduledEndDate),
    }))
    .filter((i) => Number.isFinite(i.startMs));

  return (
    <div className="space-y-4">
      {timelineItems.length > 0 && (
        <div>
          <h3 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>Work timeline</h3>
          <PhaseTimeline items={timelineItems} />
        </div>
      )}

      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          Nothing on the calendar for this property yet.
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((r) => (
            <div key={r.id} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3" style={hairline}>
              <CalendarDays className="w-4 h-4 shrink-0 text-muted-foreground" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>{r.title}</div>
                <div className="text-xs text-muted-foreground">{r.note}</div>
              </div>
              <span className="text-xs text-muted-foreground shrink-0">{fmtStepDate(r.dateMs)}</span>
            </div>
          ))}
        </div>
      )}

      <Link href="/os/schedule">
        <span className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border font-semibold cursor-pointer hover:bg-black/[0.02]" style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}>
          Open the schedule
        </span>
      </Link>
    </div>
  );
}
