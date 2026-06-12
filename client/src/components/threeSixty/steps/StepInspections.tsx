/**
 * StepInspections — Steps 1 and 2: baselines/scans, seasonal visits and
 * work orders, spot inspections. Status chips; spot rows link into the
 * spot inspection workspace.
 */
import { Link } from "wouter";
import { ChevronRight } from "lucide-react";
import { fmtStepDate, hairline, type StepContentItem } from "./types";

const NOTE_CHIP: Record<string, string> = {
  completed: "bg-emerald-100 text-emerald-800",
  delivered: "bg-emerald-100 text-emerald-800",
  "mini roadmap delivered": "bg-emerald-100 text-emerald-800",
  scheduled: "bg-amber-100 text-amber-800",
  open: "bg-gray-100 text-gray-600",
  draft: "bg-gray-100 text-gray-600",
  "draft awaiting review": "bg-amber-100 text-amber-800",
  "in progress": "bg-amber-100 text-amber-800",
  "spot inspection in progress": "bg-amber-100 text-amber-800",
  "generation failed": "bg-red-100 text-red-700",
};

function chipFor(note: string): string {
  return NOTE_CHIP[note.toLowerCase()] ?? "bg-gray-100 text-gray-600";
}

export default function StepInspections({
  items,
  emptyText,
  actionHref,
  actionLabel,
}: {
  items: StepContentItem[];
  emptyText: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  const sorted = [...items].sort((a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0));
  return (
    <div className="space-y-2">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">{emptyText}</p>
      ) : (
        sorted.map((item, i) => {
          const inner = (
            <div className="flex items-center gap-3 w-full">
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>
                  {item.label}
                </div>
                <div className="text-xs text-muted-foreground">{fmtStepDate(item.dateMs)}</div>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${chipFor(item.note)}`}>{item.note}</span>
              {item.kind === "spot" && item.refId && <ChevronRight className="w-4 h-4 text-muted-foreground" />}
            </div>
          );
          return item.kind === "spot" && item.refId ? (
            <Link key={i} href={`/os/spot/${item.refId}`}>
              <span className="block bg-white rounded-xl border px-4 py-3 cursor-pointer hover:shadow-sm transition-shadow" style={hairline}>
                {inner}
              </span>
            </Link>
          ) : (
            <div key={i} className="bg-white rounded-xl border px-4 py-3" style={hairline}>
              {inner}
            </div>
          );
        })
      )}
      {actionHref && actionLabel && (
        <Link href={actionHref}>
          <span
            className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border font-semibold cursor-pointer hover:bg-black/[0.02]"
            style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
          >
            {actionLabel} <ChevronRight className="w-3 h-3" />
          </span>
        </Link>
      )}
    </div>
  );
}
