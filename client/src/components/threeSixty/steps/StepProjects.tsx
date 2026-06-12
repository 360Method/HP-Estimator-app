/**
 * StepProjects — Step 8: improvement projects at this property — the
 * larger opportunities and remodel consultations, each its own card.
 */
import { Link } from "wouter";
import { FileText, Hammer } from "lucide-react";
import { fmtStepDate, hairline, type StepContentItem } from "./types";

export default function StepProjects({
  items,
  customerId,
  onOpenOpportunity,
}: {
  items: StepContentItem[];
  customerId: string;
  onOpenOpportunity: (opportunityId: string) => void;
}) {
  const sorted = [...items].sort((a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0));
  return (
    <div className="space-y-2">
      {sorted.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No improvement projects on file. A remodel conversation starts one.
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-2">
          {sorted.map((item, i) => {
            const isOpp = item.kind === "opportunity" && item.refId;
            const card = (
              <div className="bg-white rounded-xl border px-4 py-3 h-full" style={hairline}>
                <div className="flex items-center gap-2">
                  {item.kind === "document"
                    ? <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                    : <Hammer className="w-4 h-4 shrink-0 text-muted-foreground" />}
                  <span className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>
                    {item.label}
                  </span>
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  {[item.note, fmtStepDate(item.dateMs)].filter(Boolean).join(" · ")}
                </div>
              </div>
            );
            return isOpp ? (
              <button key={i} type="button" className="text-left hover:shadow-sm transition-shadow rounded-xl" onClick={() => onOpenOpportunity(item.refId!)}>
                {card}
              </button>
            ) : (
              <div key={i}>{card}</div>
            );
          })}
        </div>
      )}
      <Link href={`/os/quickquote?customerId=${encodeURIComponent(customerId)}`}>
        <span className="inline-flex items-center gap-1 text-xs px-3 py-2 rounded-lg border font-semibold cursor-pointer hover:bg-black/[0.02]" style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}>
          Remodel options
        </span>
      </Link>
    </div>
  );
}
