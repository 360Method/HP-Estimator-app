/**
 * OsDecisions — the append-only decisions log inside the OS. What was
 * decided, why, what else was considered. No edit, no delete: the record
 * is the point. The chat can append here too (decisions.append tool).
 */
import { FormEvent, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, ScrollText, X } from "lucide-react";
import { OsShell } from "../OsShell";

const AREAS = ["OPS", "SUBS", "FIN", "MKT", "TECH", "CLI", "LEGAL", "COMPASS"];

export default function OsDecisions() {
  const utils = trpc.useUtils();
  const [adding, setAdding] = useState(false);
  const [decision, setDecision] = useState("");
  const [why, setWhy] = useState("");
  const [alternatives, setAlternatives] = useState("");
  const [areaCode, setAreaCode] = useState("");

  const { data: decisions, isLoading } = trpc.os.decisions.list.useQuery();
  const append = trpc.os.decisions.append.useMutation({
    onSuccess: () => {
      utils.os.decisions.list.invalidate();
      setDecision("");
      setWhy("");
      setAlternatives("");
      setAreaCode("");
      setAdding(false);
      toast.success("Logged. Future-you says thanks.");
    },
    onError: (e) => toast.error(e.message),
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!decision.trim()) return;
    append.mutate({
      decision: decision.trim(),
      why: why.trim() || undefined,
      alternatives: alternatives.trim() || undefined,
      areaCode: areaCode || undefined,
    });
  }

  return (
    <OsShell active="/os/decisions">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
            Decisions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Append-only. The why matters more than the what.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAdding((v) => !v)}
          className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg border hover:bg-black/5 transition-colors shrink-0"
          style={{ borderColor: "var(--hp-hairline)" }}
        >
          {adding ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
          {adding ? "Cancel" : "Log a decision"}
        </button>
      </div>

      {adding && (
        <form onSubmit={submit} className="mt-4 bg-white rounded-xl border p-4 space-y-3" style={{ borderColor: "var(--hp-hairline)" }}>
          <div>
            <label className="text-xs font-semibold block mb-1">Decision</label>
            <textarea
              autoFocus
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              rows={2}
              placeholder="What was decided?"
              className="w-full text-sm px-3 py-2 rounded-lg border"
              style={{ borderColor: "var(--hp-hairline)" }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Why</label>
            <textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              rows={2}
              placeholder="The reasoning, and what would change your mind."
              className="w-full text-sm px-3 py-2 rounded-lg border"
              style={{ borderColor: "var(--hp-hairline)" }}
            />
          </div>
          <div>
            <label className="text-xs font-semibold block mb-1">Alternatives considered</label>
            <textarea
              value={alternatives}
              onChange={(e) => setAlternatives(e.target.value)}
              rows={2}
              placeholder="What else was on the table?"
              className="w-full text-sm px-3 py-2 rounded-lg border"
              style={{ borderColor: "var(--hp-hairline)" }}
            />
          </div>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <select
              value={areaCode}
              onChange={(e) => setAreaCode(e.target.value)}
              className="text-xs px-2 py-2 rounded-lg border bg-white"
              style={{ borderColor: "var(--hp-hairline)" }}
            >
              <option value="">Area (optional)</option>
              {AREAS.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button type="submit" className="hp-button-gold text-xs" style={{ padding: "8px 18px", minHeight: 0 }} disabled={append.isPending}>
              {append.isPending ? "Logging..." : "Log it"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-4 space-y-2">
        {isLoading ? (
          <div className="h-20 rounded-xl bg-white border animate-pulse" style={{ borderColor: "var(--hp-hairline)" }} />
        ) : (decisions ?? []).length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border" style={{ borderColor: "var(--hp-hairline)" }}>
            <ScrollText className="w-8 h-8 mx-auto mb-2" style={{ color: "var(--hp-gold-soft)" }} />
            <p className="hp-serif" style={{ color: "var(--hp-ink)" }}>
              Nothing logged yet.
            </p>
          </div>
        ) : (
          (decisions ?? []).map((d) => (
            <div key={d.id} className="bg-white rounded-xl border px-4 py-3" style={{ borderColor: "var(--hp-hairline)" }}>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>
                  {new Date(d.createdAt).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" })}
                </span>
                {d.areaCode && <span className="px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 text-[10px]">{d.areaCode}</span>}
                <span>· {d.owner}</span>
              </div>
              <p className="text-sm font-medium mt-1" style={{ color: "var(--hp-ink)" }}>
                {d.decision}
              </p>
              {d.why && (
                <p className="text-xs text-muted-foreground mt-1">
                  <span className="font-semibold">Why:</span> {d.why}
                </p>
              )}
              {d.alternatives && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  <span className="font-semibold">Alternatives:</span> {d.alternatives}
                </p>
              )}
            </div>
          ))
        )}
      </div>
    </OsShell>
  );
}
