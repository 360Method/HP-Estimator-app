/**
 * StepScoreboard — Step 9: the equity scoreboard. Market value and
 * mortgage are manual staff-entered numbers; equity is simple arithmetic
 * on them. The disclaimer below is mandatory wherever these numbers
 * render. Math lives in server/lib/scoreboard.ts.
 */
import { useState } from "react";
import { Pencil, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { fmtMoney, fmtStepDate, hairline } from "./types";

export default function StepScoreboard({ customerId, propertyId }: { customerId: string; propertyId: string }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ marketValue: "", mortgage: "", notes: "" });
  const utils = trpc.useUtils();

  const { data, isLoading } = trpc.threeSixty.journey.stepDetail.useQuery({
    customerId,
    propertyId,
    stepKey: "scale",
  });
  const saveM = trpc.properties.updateValueInputs.useMutation({
    onSuccess: () => {
      void utils.threeSixty.journey.stepDetail.invalidate({ customerId, propertyId, stepKey: "scale" });
      toast.success("Scoreboard inputs saved");
      setEditing(false);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="h-32 rounded-xl bg-white border animate-pulse" style={hairline} />;
  }
  if (!data || data.kind !== "scale") return null;

  const openEdit = () => {
    setForm({
      marketValue: data.inputs.marketValueEstimate != null ? String(data.inputs.marketValueEstimate) : "",
      mortgage: data.inputs.mortgageBalance != null ? String(data.inputs.mortgageBalance) : "",
      notes: data.inputs.valueNotes ?? "",
    });
    setEditing(true);
  };

  const save = () => {
    saveM.mutate({
      propertyId,
      marketValueEstimate: form.marketValue.trim() === "" ? null : Math.round(Number(form.marketValue)),
      mortgageBalance: form.mortgage.trim() === "" ? null : Math.round(Number(form.mortgage)),
      valueNotes: form.notes,
    });
  };

  const trend = data.homeScoreTrend;
  const latestScore = trend.length ? trend[trend.length - 1].score : null;
  const firstScore = trend.length > 1 ? trend[0].score : null;

  const Stat = ({ label, value, sub }: { label: string; value: string; sub?: string }) => (
    <div className="bg-white rounded-xl border px-4 py-3" style={hairline}>
      <div className="text-[11px] text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold mt-0.5" style={{ color: "var(--hp-ink)" }}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {data.inputs.valuesUpdatedAt
            ? `Inputs last updated ${fmtStepDate(new Date(data.inputs.valuesUpdatedAt as unknown as string | Date).getTime())}`
            : "No value inputs yet. Add the market value and mortgage to start the scoreboard."}
        </p>
        <button
          type="button"
          onClick={openEdit}
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border font-semibold hover:bg-black/[0.02]"
          style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
        >
          <Pencil className="w-3.5 h-3.5" /> Update inputs
        </button>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <Stat
          label="Equity position"
          value={data.equityPosition != null ? fmtMoney(data.equityPosition) : "—"}
          sub={data.equityPosition == null ? "needs both inputs" : `${fmtMoney(data.inputs.marketValueEstimate)} − ${fmtMoney(data.inputs.mortgageBalance)}`}
        />
        <Stat label="Maintenance invested" value={fmtMoney(data.maintenanceInvested)} sub="completed work here" />
        <Stat label="Findings resolved" value={String(data.findingsResolved)} sub="from roadmaps" />
        <Stat
          label="Home Score"
          value={latestScore != null ? String(latestScore) : "—"}
          sub={firstScore != null && latestScore != null ? `${latestScore >= firstScore ? "+" : ""}${latestScore - firstScore} since first scan` : "from the 360 scan"}
        />
      </div>

      {trend.length > 1 && (
        <div className="bg-white rounded-xl border px-4 py-3" style={hairline}>
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mb-2">
            <TrendingUp className="w-3.5 h-3.5" /> Home Score over time
          </div>
          <div className="flex items-end gap-2 h-20">
            {trend.map((t, i) => (
              <div key={i} className="flex flex-col items-center gap-1 flex-1 min-w-0">
                <div
                  className="w-full max-w-8 rounded-t"
                  style={{ height: `${Math.max(t.score, 4)}%`, background: "var(--hp-gold-deep)", opacity: 0.85 }}
                  title={`${t.score} · ${fmtStepDate(t.dateMs)}`}
                />
                <span className="text-[9px] text-muted-foreground truncate">{t.score}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {data.inputs.valueNotes && (
        <p className="text-xs text-muted-foreground">{data.inputs.valueNotes}</p>
      )}

      {/* Mandatory disclaimer — do not remove or soften. */}
      <blockquote className="border-l-2 pl-3 py-1 text-[11px] text-muted-foreground" style={{ borderColor: "var(--hp-gold-deep)" }}>
        <span className="font-semibold">About these numbers.</span> This scoreboard is a planning tool, not financial,
        legal, tax, or investment advice. The market value and mortgage figures are the numbers you provided, and the
        equity estimate is simple arithmetic on those inputs. The maintenance and project totals reflect work Handy
        Pioneers has documented at this property. We compile this information so you can review it with your financial
        advisor, lender, or tax professional before making any decisions based on it.
      </blockquote>

      {editing && (
        <Dialog open onOpenChange={(v) => { if (!v) setEditing(false); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Scoreboard inputs</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Market value estimate ($)</label>
                <Input type="number" value={form.marketValue} onChange={(e) => setForm({ ...form, marketValue: e.target.value })} placeholder="e.g. 650000" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Mortgage balance ($)</label>
                <Input type="number" value={form.mortgage} onChange={(e) => setForm({ ...form, mortgage: e.target.value })} placeholder="e.g. 380000" />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Notes (where the numbers came from)</label>
                <Input value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Zestimate Jun 2026, statement May 2026…" />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(false)} disabled={saveM.isPending}>Cancel</Button>
              <Button onClick={save} disabled={saveM.isPending}>{saveM.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
