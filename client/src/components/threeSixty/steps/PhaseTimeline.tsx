/**
 * PhaseTimeline — pure CSS horizontal bars for dated work at a property.
 * Not a gantt library: one row per dated item, positioned proportionally
 * across the min/max date span. Used by Step 5 for the remodel timeline.
 */
import { fmtStepDate, hairline } from "./types";

export type TimelineItem = {
  id: string;
  label: string;
  startMs: number;
  /** Defaults to one day after start when missing. */
  endMs?: number | null;
};

const DAY = 86_400_000;

export default function PhaseTimeline({ items }: { items: TimelineItem[] }) {
  const dated = items
    .filter((i) => Number.isFinite(i.startMs))
    .map((i) => ({ ...i, endMs: i.endMs && i.endMs > i.startMs ? i.endMs : i.startMs + DAY }))
    .sort((a, b) => a.startMs - b.startMs);
  if (dated.length === 0) return null;

  const min = Math.min(...dated.map((i) => i.startMs));
  const max = Math.max(...dated.map((i) => i.endMs));
  const span = Math.max(max - min, DAY);

  return (
    <div className="bg-white rounded-xl border p-4" style={hairline}>
      <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-2">
        <span>{fmtStepDate(min)}</span>
        <span>{fmtStepDate(max)}</span>
      </div>
      <div className="space-y-1.5">
        {dated.map((i) => {
          const left = ((i.startMs - min) / span) * 100;
          const width = Math.max(((i.endMs - i.startMs) / span) * 100, 2);
          return (
            <div key={i.id} className="flex items-center gap-2">
              <span className="w-32 shrink-0 text-[11px] truncate" style={{ color: "var(--hp-ink)" }} title={i.label}>
                {i.label}
              </span>
              <div className="flex-1 h-4 rounded bg-black/[0.04] relative">
                <div
                  className="absolute top-0.5 bottom-0.5 rounded"
                  style={{ left: `${left}%`, width: `${width}%`, background: "var(--hp-gold-deep)", opacity: 0.8 }}
                  title={`${fmtStepDate(i.startMs)} to ${fmtStepDate(i.endMs)}`}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
