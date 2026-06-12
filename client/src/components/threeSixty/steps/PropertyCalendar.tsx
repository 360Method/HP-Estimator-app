/**
 * PropertyCalendar — the property's own month calendar (the micro level).
 * Shows only this home's items; anything added here is pinned to the
 * property AND written to the same scheduleEvents store the main company
 * calendar reads, so the micro view rolls up to the macro view for free.
 */
import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { useEstimator } from "@/contexts/EstimatorContext";
import { hairline } from "./types";

export type CalendarItem = {
  id: string;
  kind: "work" | "visit" | "event";
  title: string;
  startMs: number;
  endMs?: number | null;
};

const KIND_CHIP: Record<CalendarItem["kind"], string> = {
  work: "bg-blue-100 text-blue-800",
  visit: "bg-emerald-100 text-emerald-800",
  event: "bg-amber-100 text-amber-800",
};

const DAY = 86_400_000;
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function monthLabel(d: Date) {
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function PropertyCalendar({
  customerId,
  propertyId,
  items,
  onChanged,
}: {
  customerId: string;
  propertyId: string;
  items: CalendarItem[];
  /** Invalidate the parent's data after an add. */
  onChanged: () => void;
}) {
  const today = new Date();
  const [monthAnchor, setMonthAnchor] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [adding, setAdding] = useState<null | { dateIso: string; title: string; time: string }>(null);

  const { addScheduleEvent } = useEstimator();
  const createM = trpc.schedule.create.useMutation({
    onSuccess: () => {
      toast.success("Added to this home's calendar (and the main one)");
      setAdding(null);
      onChanged();
    },
    onError: (e) => toast.error(e.message),
  });

  // Items spanning days get a chip on each day they cover.
  const byDay = new Map<string, CalendarItem[]>();
  for (const item of items) {
    const end = item.endMs && item.endMs > item.startMs ? item.endMs : item.startMs;
    for (let t = item.startMs; t <= end; t += DAY) {
      const key = new Date(t).toDateString();
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
      if (t === item.startMs && end - item.startMs > 62 * DAY) break; // runaway ranges get one chip
    }
  }

  const firstDow = monthAnchor.getDay();
  const daysInMonth = new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstDow }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(monthAnchor.getFullYear(), monthAnchor.getMonth(), i + 1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const startAdd = (date: Date) => {
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    setAdding({ dateIso: iso, title: "", time: "" });
  };

  const saveAdd = () => {
    if (!adding || !adding.title.trim()) {
      toast.error("Give it a title");
      return;
    }
    const allDay = !adding.time;
    const start = allDay ? `${adding.dateIso}T00:00:00` : `${adding.dateIso}T${adding.time}:00`;
    const end = allDay
      ? `${adding.dateIso}T23:59:59`
      : new Date(new Date(start).getTime() + 60 * 60_000).toISOString();
    const id = Math.random().toString(36).slice(2, 10);
    const payload = {
      id,
      type: "task",
      title: adding.title.trim(),
      start,
      end,
      allDay,
      customerId,
      propertyId,
      completed: false,
    };
    // Same dual-write the main calendar does: local context + DB.
    addScheduleEvent({ ...payload, assignedTo: [], notes: "" } as any);
    createM.mutate(payload);
  };

  return (
    <div className="bg-white rounded-xl border" style={hairline}>
      {/* ── Month header ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-3 py-2 border-b" style={hairline}>
        <button
          type="button"
          aria-label="Previous month"
          onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() - 1, 1))}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
          {monthLabel(monthAnchor)}
        </span>
        <button
          type="button"
          aria-label="Next month"
          onClick={() => setMonthAnchor(new Date(monthAnchor.getFullYear(), monthAnchor.getMonth() + 1, 1))}
          className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* ── Grid ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-7 text-center text-[10px] text-muted-foreground border-b" style={hairline}>
        {WEEKDAYS.map((d) => <div key={d} className="py-1">{d}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((date, i) => {
          if (!date) return <div key={i} className="min-h-16 border-b border-r last:border-r-0" style={hairline} />;
          const dayItems = byDay.get(date.toDateString()) ?? [];
          const isToday = date.toDateString() === today.toDateString();
          return (
            <div
              key={i}
              className="min-h-16 border-b border-r p-1 text-left align-top group relative"
              style={hairline}
            >
              <div className="flex items-center justify-between">
                <span
                  className={`text-[10px] ${isToday ? "font-bold px-1 rounded-full text-white" : "text-muted-foreground"}`}
                  style={isToday ? { background: "var(--hp-gold-deep)" } : undefined}
                >
                  {date.getDate()}
                </span>
                <button
                  type="button"
                  onClick={() => startAdd(date)}
                  title="Add to this home's calendar"
                  aria-label={`Add item on ${date.toDateString()}`}
                  className="opacity-0 group-hover:opacity-100 p-0.5 rounded text-muted-foreground hover:text-foreground"
                >
                  <Plus className="w-3 h-3" />
                </button>
              </div>
              <div className="mt-0.5 space-y-0.5">
                {dayItems.slice(0, 3).map((item, k) => (
                  <div
                    key={`${item.id}-${k}`}
                    className={`text-[9px] leading-tight px-1 py-0.5 rounded truncate ${KIND_CHIP[item.kind]}`}
                    title={item.title}
                  >
                    {item.title}
                  </div>
                ))}
                {dayItems.length > 3 && (
                  <div className="text-[9px] text-muted-foreground px-1">+{dayItems.length - 3} more</div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Quick add ────────────────────────────────────────────── */}
      {adding && (
        <Dialog open onOpenChange={(v) => { if (!v) setAdding(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Add to this home's calendar</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">What</label>
                <Input
                  autoFocus
                  value={adding.title}
                  onChange={(e) => setAdding({ ...adding, title: e.target.value })}
                  placeholder="Gutter check, material drop-off…"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Date</label>
                  <Input type="date" value={adding.dateIso} onChange={(e) => setAdding({ ...adding, dateIso: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Time (blank = all day)</label>
                  <Input type="time" value={adding.time} onChange={(e) => setAdding({ ...adding, time: e.target.value })} />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Pinned to this property; shows on the main company calendar too.
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAdding(null)} disabled={createM.isPending}>Cancel</Button>
              <Button onClick={saveAdd} disabled={createM.isPending}>{createM.isPending ? "Adding…" : "Add"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
