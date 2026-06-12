/**
 * StepHistory — Step 3: the complete property record, every step's items
 * merged into one chronological history grouped by year. Print gives a
 * clean page (OS shell chrome is no-print); the branded PDF comes later.
 */
import { Printer } from "lucide-react";
import type { ThreeSixtyStepKey } from "@shared/threeSixtyMethod";
import { getThreeSixtyStepByKey } from "@shared/threeSixtyMethod";
import { fmtStepDate, hairline, type StepContentItem } from "./types";

export default function StepHistory({
  stepContents,
  propertyLabel,
  customerName,
}: {
  stepContents: Record<ThreeSixtyStepKey, StepContentItem[]>;
  propertyLabel: string;
  customerName: string;
}) {
  // Merge every step's records, dedupe (the same scan or spot shows under
  // several steps), newest year first, undated last.
  const seen = new Set<string>();
  const merged: (StepContentItem & { stepKey: ThreeSixtyStepKey })[] = [];
  (Object.keys(stepContents) as ThreeSixtyStepKey[]).forEach((stepKey) => {
    for (const item of stepContents[stepKey] ?? []) {
      const key = `${item.kind}:${item.refId ?? item.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push({ ...item, stepKey });
    }
  });
  merged.sort((a, b) => (b.dateMs ?? -1) - (a.dateMs ?? -1));

  const byYear = new Map<string, typeof merged>();
  for (const item of merged) {
    const year = item.dateMs ? String(new Date(item.dateMs).getFullYear()) : "Undated";
    byYear.set(year, [...(byYear.get(year) ?? []), item]);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 no-print">
        <p className="text-xs text-muted-foreground">
          Everything on record at this property, newest first.
        </p>
        <button
          type="button"
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-semibold hover:bg-black/[0.02]"
          style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
        >
          <Printer className="w-3.5 h-3.5" /> Print
        </button>
      </div>

      {/* Print header (hidden on screen) */}
      <div className="hidden print-only mb-4">
        <h1 className="text-xl font-semibold">Property history — {propertyLabel}</h1>
        <p className="text-sm">{customerName} · Handy Pioneers · printed {fmtStepDate(Date.now())}</p>
      </div>

      {merged.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">
          No history yet. The first scan, visit, or job starts the record.
        </p>
      ) : (
        Array.from(byYear.entries()).map(([year, items]) => (
          <section key={year} className="mb-4">
            <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>{year}</h2>
            <div className="bg-white rounded-xl border divide-y" style={hairline}>
              {items.map((item, i) => (
                <div key={i} className="px-4 py-2.5 flex items-center gap-3" style={hairline}>
                  <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
                    {item.dateMs ? new Date(item.dateMs).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm" style={{ color: "var(--hp-ink)" }}>{item.label}</span>
                    <span className="text-xs text-muted-foreground"> · {item.note}</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 shrink-0">
                    Step {getThreeSixtyStepByKey(item.stepKey)?.number ?? ""}
                  </span>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}
