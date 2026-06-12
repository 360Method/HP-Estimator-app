/**
 * StepRoadmaps — Step 4: every roadmap this property has received, in
 * order. Scan roadmaps link to their report PDF, spot inspections to
 * their mini roadmap PDF and workspace.
 */
import { Link } from "wouter";
import { ExternalLink, FileText } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { fmtStepDate, hairline } from "./types";

export default function StepRoadmaps({ customerId, propertyId }: { customerId: string; propertyId: string }) {
  const { data, isLoading } = trpc.threeSixty.journey.stepDetail.useQuery({
    customerId,
    propertyId,
    stepKey: "prioritize",
  });

  if (isLoading) {
    return <div className="h-24 rounded-xl bg-white border animate-pulse" style={hairline} />;
  }
  if (!data || data.kind !== "prioritize") return null;

  const rows = [
    ...data.scans.map((s) => ({
      id: `scan-${s.id}`,
      title: "360 scan roadmap",
      note: s.sentToPortalAt ? "delivered" : s.status,
      dateMs: s.scanDate as number | null,
      pdfUrl: s.reportUrl as string | null,
      spotId: null as string | null,
    })),
    ...data.spots.map((s) => ({
      id: `spot-${s.id}`,
      title: "Spot inspection mini roadmap",
      note: s.status === "completed" ? "delivered" : s.status.replace("_", " "),
      dateMs: s.createdAt ? new Date(s.createdAt as unknown as string | Date).getTime() : null,
      pdfUrl: (s.outputPdfPath as string | null) ?? null,
      spotId: s.id as string,
    })),
  ].sort((a, b) => (b.dateMs ?? 0) - (a.dateMs ?? 0));

  if (rows.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No roadmaps yet. A 360 scan or a spot inspection produces the first one.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {rows.map((r) => (
        <div key={r.id} className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3" style={hairline}>
          <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>
              {r.spotId ? (
                <Link href={`/os/spot/${r.spotId}`}>
                  <span className="cursor-pointer hover:underline">{r.title}</span>
                </Link>
              ) : (
                r.title
              )}
            </div>
            <div className="text-xs text-muted-foreground">
              {fmtStepDate(r.dateMs)} · {r.note}
            </div>
          </div>
          {r.pdfUrl && (
            <a
              href={r.pdfUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs font-semibold hover:underline shrink-0"
              style={{ color: "var(--hp-gold-deep)" }}
            >
              PDF <ExternalLink className="w-3 h-3" />
            </a>
          )}
        </div>
      ))}
    </div>
  );
}
