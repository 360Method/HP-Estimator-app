/**
 * OsCommissions: the Consultant seat's commission ledger (/os/commissions).
 *
 * Internal-only surface (HP-SOP-205): consultant registry with personal rates,
 * per-consultant job rows bucketed by the shared commission rule (40% GP gate
 * at sale, payable when collected), a manual mark-paid-out action, and a list
 * of recent Won jobs with nobody credited so they can be attributed here.
 * Customers never see anything on this screen.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { HandCoins, Plus, X } from "lucide-react";
import { OsShell } from "../OsShell";
import type { CommissionStatus } from "@shared/commission";

type EditorState = {
  id: number | null; // null = creating
  name: string;
  email: string;
  ratePct: string; // entered as percent, stored as bps
  active: boolean;
};

const fmtCents = (c: number) =>
  (c / 100).toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtPct = (bps: number) => `${(bps / 100).toFixed(bps % 100 === 0 ? 0 : 1)}%`;
const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

const STATUS_CHIP: Record<CommissionStatus, { label: string; cls: string }> = {
  ineligible: { label: "Below 40%: no commission", cls: "bg-red-50 text-red-700 border-red-200" },
  awaiting_payment: { label: "Awaiting payment", cls: "bg-amber-50 text-amber-700 border-amber-200" },
  payable: { label: "Payable", cls: "bg-green-50 text-green-700 border-green-200" },
  paid_out: { label: "Paid out", cls: "bg-gray-100 text-gray-500 border-gray-200" },
};

export default function OsCommissions() {
  const utils = trpc.useUtils();
  const [editor, setEditor] = useState<EditorState | null>(null);

  const reportQ = trpc.commissions.report.useQuery();
  const consultantsQ = trpc.commissions.listConsultants.useQuery({ includeInactive: true });

  const invalidate = () => {
    utils.commissions.report.invalidate();
    utils.commissions.listConsultants.invalidate();
  };
  const onDone = {
    onSuccess: () => {
      invalidate();
      setEditor(null);
      toast.success("Saved.");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const createM = trpc.commissions.createConsultant.useMutation(onDone);
  const updateM = trpc.commissions.updateConsultant.useMutation(onDone);
  const setSoldByM = trpc.commissions.setSoldBy.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Attributed.");
    },
    onError: (e) => toast.error(e.message),
  });
  const markPaidM = trpc.commissions.markPaidOut.useMutation({
    onSuccess: () => {
      invalidate();
      toast.success("Marked paid out.");
    },
    onError: (e) => toast.error(e.message),
  });

  const consultants = consultantsQ.data ?? [];
  const report = reportQ.data?.report ?? [];
  const unattributed = reportQ.data?.unattributedWon ?? [];
  const activeConsultants = consultants.filter((c) => c.active);

  function rateBpsFromEditor(): number | null {
    const pct = parseFloat(editor?.ratePct ?? "");
    if (!isFinite(pct) || pct < 0) return null;
    const bps = Math.round(pct * 100);
    if (bps >= 1000) return null; // the SOP caps every personal rate below 10%
    return bps;
  }

  function save() {
    if (!editor) return;
    if (!editor.name.trim()) {
      toast.error("Name is required.");
      return;
    }
    const rateBps = rateBpsFromEditor();
    if (rateBps === null) {
      toast.error("Rate must be a number under 10%.");
      return;
    }
    const payload = { name: editor.name.trim(), email: editor.email.trim(), rateBps };
    if (editor.id === null) createM.mutate(payload);
    else updateM.mutate({ ...payload, id: editor.id, active: editor.active });
  }

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg border";
  const inputStyle = { borderColor: "var(--hp-hairline)" } as const;

  return (
    <OsShell active="/os/commissions">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
            Commissions
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The Consultant seat's ledger. 40%+ gross profit at sale to qualify, paid when collected.
            Internal only. Clients never see this.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ id: null, name: "", email: "", ratePct: "", active: true })}
          className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold text-white"
          style={{ background: "var(--hp-ink)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Add consultant
        </button>
      </div>

      {/* ── Consultants + their jobs ───────────────────────────── */}
      <div className="mt-5 space-y-3">
        {reportQ.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : report.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border" style={inputStyle}>
            <HandCoins className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">No consultants yet. Add the first one to start tracking.</p>
          </div>
        ) : (
          report.map((r) => (
            <div key={r.consultant.id} className="bg-white rounded-xl border overflow-hidden" style={inputStyle}>
              <button
                type="button"
                onClick={() => {
                  const c = consultants.find((x) => x.id === r.consultant.id);
                  setEditor({
                    id: r.consultant.id,
                    name: r.consultant.name,
                    email: c?.email ?? r.consultant.email ?? "",
                    ratePct: String(r.consultant.commissionRateBps / 100),
                    active: r.consultant.active,
                  });
                }}
                className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-black/[0.02]"
              >
                <span>
                  <span className={"text-sm font-semibold " + (r.consultant.active ? "" : "line-through opacity-50")} style={{ color: "var(--hp-ink)" }}>
                    {r.consultant.name}
                  </span>
                  <span className="text-xs text-muted-foreground ml-2">{fmtPct(r.consultant.commissionRateBps)} of job price</span>
                  {!r.consultant.active && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 ml-2">inactive</span>
                  )}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">
                  {r.totalsCents.payable > 0 && (
                    <span className="font-semibold text-green-700">{fmtCents(r.totalsCents.payable)} payable</span>
                  )}
                  {r.totalsCents.payable > 0 && r.totalsCents.awaiting_payment > 0 && " · "}
                  {r.totalsCents.awaiting_payment > 0 && <span>{fmtCents(r.totalsCents.awaiting_payment)} pending</span>}
                  {r.totalsCents.paid_out > 0 && (
                    <span> · {fmtCents(r.totalsCents.paid_out)} paid out</span>
                  )}
                </span>
              </button>
              {r.jobs.length > 0 && (
                <ul className="border-t" style={inputStyle}>
                  {r.jobs.map((j) => {
                    const chip = STATUS_CHIP[j.status];
                    return (
                      <li key={j.opportunityId} className="px-4 py-3 border-b last:border-b-0" style={inputStyle}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm min-w-0 truncate" style={{ color: "var(--hp-ink)" }}>
                            {j.title || "Untitled job"}
                            {j.customer && <span className="text-xs text-muted-foreground"> · {j.customer}</span>}
                          </span>
                          <span className="text-sm font-semibold shrink-0" style={{ color: "var(--hp-ink)" }}>
                            {fmtCents(j.priceCents)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1.5 flex-wrap">
                          <span className="flex items-center gap-2 text-xs text-muted-foreground">
                            {j.grossMarginBps != null ? `GP ${(j.grossMarginBps / 100).toFixed(1)}%` : "GP not audited"}
                            <span className={"px-1.5 py-0.5 rounded border text-[11px] " + chip.cls}>
                              {chip.label}
                              {(j.status === "payable" || j.status === "paid_out") && j.commissionCents > 0 && ` · ${fmtCents(j.commissionCents)}`}
                              {j.status === "awaiting_payment" && j.commissionCents > 0 && ` · ${fmtCents(j.commissionCents)}`}
                            </span>
                          </span>
                          {j.status === "payable" && (
                            <button
                              type="button"
                              disabled={markPaidM.isPending}
                              onClick={() => {
                                if (confirm(`Mark ${fmtCents(j.commissionCents)} paid out to ${r.consultant.name}?`)) {
                                  markPaidM.mutate({ opportunityId: j.opportunityId });
                                }
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg font-semibold text-white disabled:opacity-40"
                              style={{ background: "var(--hp-gold-deep)" }}
                            >
                              Mark paid out
                            </button>
                          )}
                          {j.status === "paid_out" && j.commissionPaidAt && (
                            <span className="text-[11px] text-muted-foreground">paid {fmtDate(j.commissionPaidAt)}</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ))
        )}
      </div>

      {/* ── Unattributed won jobs ──────────────────────────────── */}
      {unattributed.length > 0 && activeConsultants.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
            Won jobs with nobody credited
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Attribute a consultant and the job joins their ledger. House jobs can stay as they are.
          </p>
          <ul className="mt-2 bg-white rounded-xl border divide-y" style={inputStyle}>
            {unattributed.map((j) => (
              <li key={j.opportunityId} className="px-4 py-3 flex items-center justify-between gap-3">
                <span className="min-w-0">
                  <span className="text-sm block truncate" style={{ color: "var(--hp-ink)" }}>
                    {j.title || "Untitled job"}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {j.customer}
                    {j.customer && " · "}
                    {fmtCents(j.priceCents)}
                    {j.wonAt ? ` · won ${fmtDate(j.wonAt)}` : ""}
                  </span>
                </span>
                <select
                  className="text-xs px-2 py-2 rounded-lg border bg-white shrink-0"
                  style={inputStyle}
                  value=""
                  disabled={setSoldByM.isPending}
                  onChange={(e) => {
                    const id = Number(e.target.value);
                    if (id) setSoldByM.mutate({ opportunityId: j.opportunityId, consultantId: id });
                  }}
                >
                  <option value="">Sold by…</option>
                  {activeConsultants.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Bottom-sheet editor ────────────────────────────────── */}
      {editor && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center">
          <div className="flex-1 md:flex-none md:absolute md:inset-0 bg-black/40" onClick={() => setEditor(null)} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl p-4 max-h-[85vh] md:max-h-[80vh] md:w-[480px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="hp-serif font-semibold" style={{ color: "var(--hp-ink)" }}>
                {editor.id === null ? "New consultant" : "Edit consultant"}
              </span>
              <button type="button" onClick={() => setEditor(null)} className="p-2" aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Name</label>
                <input className={inputCls} style={inputStyle} value={editor.name}
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Email (optional)</label>
                <input className={inputCls} style={inputStyle} type="email" value={editor.email}
                  onChange={(e) => setEditor({ ...editor, email: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Commission rate (% of job price, under 10)</label>
                <input className={inputCls} style={inputStyle} inputMode="decimal" placeholder="e.g. 8"
                  value={editor.ratePct}
                  onChange={(e) => setEditor({ ...editor, ratePct: e.target.value })} />
                {editor.ratePct !== "" && rateBpsFromEditor() === null && (
                  <p className="text-xs text-red-600 mt-1">Every personal rate stays under 10% of job price.</p>
                )}
              </div>

              <div className="flex items-center justify-between pt-2">
                {editor.id !== null ? (
                  <button
                    type="button"
                    onClick={() => setEditor({ ...editor, active: !editor.active })}
                    className="text-xs px-3 py-2 rounded-lg border font-semibold"
                    style={{ borderColor: "var(--hp-hairline)", color: editor.active ? "#b91c1c" : "var(--hp-ink)" }}
                  >
                    {editor.active ? "Deactivate on save" : "Reactivate on save"}
                  </button>
                ) : <span />}
                <button
                  type="button"
                  disabled={createM.isPending || updateM.isPending}
                  onClick={save}
                  className="text-xs px-5 py-2.5 rounded-lg font-semibold text-white disabled:opacity-40"
                  style={{ background: "var(--hp-ink)" }}
                >
                  {createM.isPending || updateM.isPending ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </OsShell>
  );
}
