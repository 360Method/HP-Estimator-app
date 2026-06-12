/**
 * MethodContextBanner: one small banner that tells whoever is working a
 * screen exactly which 360 Method step this work is, why it matters, and
 * what comes next. Mounted on the visit, scan, and work order surfaces.
 *
 * All copy comes from the shared canon so it is written once. Safe for a
 * customer glancing at a tech's phone: no costs, margins, or tier codes.
 */
import { Link } from "wouter";
import { Compass, BookOpen } from "lucide-react";
import {
  getThreeSixtyStepByKey,
  getThreeSixtyStepByNumber,
  THREE_SIXTY_METHOD_PHASES,
  type ThreeSixtyStepKey,
} from "@shared/threeSixtyMethod";

export function MethodContextBanner({
  stepKey,
  note,
}: {
  stepKey: ThreeSixtyStepKey;
  /** Optional extra line of screen-specific context. */
  note?: string;
}) {
  const step = getThreeSixtyStepByKey(stepKey);
  if (!step) return null;
  const phase = THREE_SIXTY_METHOD_PHASES.find((p) => p.id === step.phase)!;
  const next = getThreeSixtyStepByNumber(step.number + 1);

  return (
    <div
      className="rounded-xl border px-4 py-3"
      style={{ borderColor: "rgba(200,146,42,0.35)", background: "rgba(200,146,42,0.06)" }}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: "var(--hp-gold-deep)" }}>
            <Compass className="w-3.5 h-3.5 shrink-0" />
            360 Method · Step {step.number} of 9: {step.name}
            <span className="font-normal text-muted-foreground">
              ({phase.name}: {phase.subtitle})
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {step.valueFraming}
            {next && <> Next: Step {next.number}, {next.name}.</>}
          </p>
          {note && <p className="mt-1 text-xs text-muted-foreground">{note}</p>}
        </div>
        <Link href={`/os/d/${step.sopDocId}`}>
          <span
            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border cursor-pointer hover:bg-white shrink-0"
            style={{ borderColor: "rgba(200,146,42,0.35)", color: "var(--hp-gold-deep)" }}
          >
            <BookOpen className="w-3 h-3" /> How to run this step
          </span>
        </Link>
      </div>
    </div>
  );
}
