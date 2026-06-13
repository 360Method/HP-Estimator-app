/**
 * DraftReviewEditor: the human gate's editing surface, shared by the spot
 * inspection page and the funnel roadmap review page. Shows the AI draft
 * read-only with Edit / Approve actions; in edit mode the summary, each
 * finding, urgency, and ranges are all correctable before anything reaches
 * the customer.
 */
import { useState } from "react";
import { toast } from "sonner";
import { Send, Trash2 } from "lucide-react";

export type Urgency = "NOW" | "SOON" | "WAIT";

export const URGENCY_STYLE: Record<Urgency, string> = {
  NOW: "bg-red-100 text-red-800 border-red-200",
  SOON: "bg-amber-100 text-amber-800 border-amber-300",
  WAIT: "bg-emerald-100 text-emerald-800 border-emerald-200",
};

export type DraftFinding = {
  category: string;
  finding: string;
  interpretation?: string;
  recommended_approach?: string;
  urgency: Urgency;
  investment_range_low_usd: number;
  investment_range_high_usd: number;
  reasoning: string;
};

export type ReviewDraft = {
  summary_1_paragraph: string;
  findings: DraftFinding[];
};

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const inputCls = "w-full text-sm px-3 py-2 rounded-lg border";
const inputStyle = { borderColor: "var(--hp-hairline)" } as const;

export function DraftReviewEditor({
  draft,
  onSave,
  onApprove,
  approving,
  approveConfirmText,
}: {
  draft: ReviewDraft;
  onSave: (edited: { summary: string; findings: DraftFinding[] }) => void;
  onApprove: () => void;
  approving?: boolean;
  approveConfirmText?: string;
}) {
  const [editing, setEditing] = useState<{ summary: string; findings: DraftFinding[] } | null>(null);

  function startEdit() {
    setEditing({
      summary: draft.summary_1_paragraph ?? "",
      findings: (draft.findings ?? []).map((f) => ({
        category: f.category,
        finding: f.finding,
        interpretation: f.interpretation,
        recommended_approach: f.recommended_approach,
        urgency: f.urgency as Urgency,
        investment_range_low_usd: f.investment_range_low_usd,
        investment_range_high_usd: f.investment_range_high_usd,
        reasoning: f.reasoning ?? "",
      })),
    });
  }

  function save() {
    if (!editing) return;
    for (const f of editing.findings) {
      if (f.investment_range_low_usd > f.investment_range_high_usd) {
        toast.error(`${f.category}: the low end of the range is above the high end.`);
        return;
      }
    }
    onSave(editing);
    setEditing(null);
  }

  if (editing) {
    return (
      <div className="bg-white rounded-xl border p-4 space-y-3" style={inputStyle}>
        <textarea className={inputCls} style={inputStyle} rows={3} value={editing.summary}
          onChange={(e) => setEditing({ ...editing, summary: e.target.value })} />
        {editing.findings.map((f, i) => (
          <div key={i} className="rounded-lg border p-3 space-y-2" style={inputStyle}>
            <div className="flex gap-2">
              <input className={inputCls + " font-semibold"} style={inputStyle} value={f.category}
                onChange={(e) => setEditing({ ...editing, findings: editing.findings.map((x, j) => (j === i ? { ...x, category: e.target.value } : x)) })} />
              <div className="flex gap-1">
                {(["NOW", "SOON", "WAIT"] as Urgency[]).map((u) => (
                  <button key={u} type="button"
                    onClick={() => setEditing({ ...editing, findings: editing.findings.map((x, j) => (j === i ? { ...x, urgency: u } : x)) })}
                    className={`text-[10px] px-2 py-1 rounded-full border font-semibold ${f.urgency === u ? URGENCY_STYLE[u] : "bg-white text-muted-foreground"}`}>
                    {u}
                  </button>
                ))}
              </div>
              <button type="button" aria-label="Remove finding"
                onClick={() => setEditing({ ...editing, findings: editing.findings.filter((_, j) => j !== i) })}>
                <Trash2 className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>
            <textarea className={inputCls} style={inputStyle} rows={2} value={f.finding} placeholder="What we observed"
              onChange={(e) => setEditing({ ...editing, findings: editing.findings.map((x, j) => (j === i ? { ...x, finding: e.target.value } : x)) })} />
            <textarea className={inputCls} style={inputStyle} rows={2} value={f.interpretation ?? ""} placeholder="What it means for the home"
              onChange={(e) => setEditing({ ...editing, findings: editing.findings.map((x, j) => (j === i ? { ...x, interpretation: e.target.value } : x)) })} />
            <textarea className={inputCls} style={inputStyle} rows={2} value={f.recommended_approach ?? ""} placeholder="How we would approach it"
              onChange={(e) => setEditing({ ...editing, findings: editing.findings.map((x, j) => (j === i ? { ...x, recommended_approach: e.target.value } : x)) })} />
            <div className="flex gap-2 items-center">
              <span className="text-xs text-muted-foreground">Range</span>
              <input className={inputCls + " w-28"} style={inputStyle} inputMode="numeric" value={f.investment_range_low_usd}
                onChange={(e) => setEditing({ ...editing, findings: editing.findings.map((x, j) => (j === i ? { ...x, investment_range_low_usd: parseFloat(e.target.value) || 0 } : x)) })} />
              <span className="text-xs text-muted-foreground">to</span>
              <input className={inputCls + " w-28"} style={inputStyle} inputMode="numeric" value={f.investment_range_high_usd}
                onChange={(e) => setEditing({ ...editing, findings: editing.findings.map((x, j) => (j === i ? { ...x, investment_range_high_usd: parseFloat(e.target.value) || 0 } : x)) })} />
            </div>
          </div>
        ))}
        <div className="flex justify-end gap-2">
          <button type="button" className="text-xs px-3 py-2 rounded-lg border" style={inputStyle} onClick={() => setEditing(null)}>Cancel</button>
          <button type="button" className="text-xs px-4 py-2 rounded-lg font-semibold text-white" style={{ background: "var(--hp-ink)" }} onClick={save}>
            Save draft
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border p-4" style={inputStyle}>
      <p className="text-sm leading-relaxed" style={{ color: "var(--hp-ink)" }}>{draft.summary_1_paragraph}</p>
      <div className="mt-3 space-y-2">
        {(draft.findings ?? []).map((f, i) => (
          <div key={i} className="rounded-lg border px-3 py-2" style={inputStyle}>
            <div className="flex items-center justify-between gap-2">
              <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>{f.category}</span>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border font-semibold ${URGENCY_STYLE[f.urgency as Urgency]}`}>{f.urgency}</span>
            </div>
            <p className="text-xs mt-1" style={{ color: "var(--hp-ink)" }}>{f.finding}</p>
            {f.interpretation && (
              <p className="text-xs text-muted-foreground mt-1.5">
                <span className="font-medium" style={{ color: "var(--hp-ink)" }}>What it means: </span>
                {f.interpretation}
              </p>
            )}
            {f.recommended_approach && (
              <p className="text-xs text-muted-foreground mt-1">
                <span className="font-medium" style={{ color: "var(--hp-ink)" }}>How we would approach it: </span>
                {f.recommended_approach}
              </p>
            )}
            <p className="text-xs font-medium mt-1.5" style={{ color: "var(--hp-ink)" }}>
              {money(f.investment_range_low_usd)} to {money(f.investment_range_high_usd)}
            </p>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between gap-2 flex-wrap">
        <button type="button" className="text-xs underline text-muted-foreground" onClick={startEdit}>
          Edit the draft
        </button>
        <button
          type="button"
          onClick={() => {
            const msg = approveConfirmText ?? "Send this roadmap? The customer sees it in their portal and gets the email right away.";
            if (window.confirm(msg)) onApprove();
          }}
          disabled={approving}
          className="flex items-center gap-1.5 text-sm px-5 py-2.5 rounded-xl font-semibold text-white"
          style={{ background: "var(--hp-gold-deep)" }}
        >
          <Send className="w-4 h-4" /> {approving ? "Delivering…" : "Approve and send"}
        </button>
      </div>
    </div>
  );
}
