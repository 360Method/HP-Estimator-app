/**
 * StepSchedule — Step 5: this home's own calendar (the micro level).
 * Seasonal visits, scheduled work, and property-pinned events on a month
 * grid plus a work timeline. Everything lives in the same stores the main
 * company calendar reads, so the micro view rolls up automatically.
 */
import { Link } from "wouter";
import { SEASON_LABELS } from "@shared/threeSixtyMethod";
import { trpc } from "@/lib/trpc";
import PhaseTimeline from "./PhaseTimeline";
import PropertyCalendar, { type CalendarItem } from "./PropertyCalendar";
import { fmtStepDate, hairline } from "./types";

const parseMs = (v: string | number | null | undefined): number | null => {
  if (v == null) return null;
  if (typeof v === "number") return v;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? ms : null;
};

export default function StepSchedule({ customerId, propertyId }: { customerId: string; propertyId: string }) {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.threeSixty.journey.stepDetail.useQuery({
    customerId,
    propertyId,
    stepKey: "schedule",
  });

  if (isLoading) {
    return <div className="h-24 rounded-xl bg-white border animate-pulse" style={hairline} />;
  }
  if (!data || data.kind !== "schedule") return null;

  const items: CalendarItem[] = [
    ...data.workOrders
      .filter((w) => w.scheduledDate != null)
      .map((w) => ({
        id: `wo-${w.id}`,
        kind: "visit" as const,
        title: `${SEASON_LABELS[w.type as keyof typeof SEASON_LABELS] ?? w.type} visit ${w.visitYear}`,
        startMs: w.scheduledDate as number,
        endMs: null,
      })),
    ...data.opportunities
      .map((o) => ({
        id: `opp-${o.id}`,
        kind: "work" as const,
        title: o.title || "Scheduled work",
        startMs: parseMs(o.scheduledDate) ?? NaN,
        endMs: parseMs(o.scheduledEndDate),
      }))
      .filter((i) => Number.isFinite(i.startMs)),
    ...data.events
      .filter((e: any) => !e.completed)
      .map((e) => ({
        id: `ev-${e.id}`,
        kind: "event" as const,
        title: e.title,
        startMs: parseMs(e.start) ?? NaN,
        endMs: parseMs(e.end),
      }))
      .filter((i) => Number.isFinite(i.startMs)),
  ];

  const upcoming = [...items]
    .filter((i) => (i.endMs ?? i.startMs) >= Date.now() - 86_400_000)
    .sort((a, b) => a.startMs - b.startMs)
    .slice(0, 8);

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
      <PropertyCalendar
        customerId={customerId}
        propertyId={propertyId}
        items={items}
        onChanged={() =>
          void utils.threeSixty.journey.stepDetail.invalidate({ customerId, propertyId, stepKey: "schedule" })
        }
      />

      {timelineItems.length > 0 && (
        <div>
          <h3 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>Work timeline</h3>
          <PhaseTimeline items={timelineItems} />
        </div>
      )}

      {upcoming.length > 0 && (
        <div>
          <h3 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>Coming up here</h3>
          <div className="bg-white rounded-xl border divide-y" style={hairline}>
            {upcoming.map((i) => (
              <div key={i.id} className="px-4 py-2.5 flex items-center gap-3" style={hairline}>
                <span className="flex-1 min-w-0 text-sm truncate" style={{ color: "var(--hp-ink)" }}>{i.title}</span>
                <span className="text-xs text-muted-foreground shrink-0">{fmtStepDate(i.startMs)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-muted-foreground">
        Everything here rolls up to the{" "}
        <Link href="/os/schedule">
          <span className="underline cursor-pointer">main company calendar</span>
        </Link>
        .
      </p>
    </div>
  );
}
