/**
 * StepSystems — Step 7: the major-systems log. All ten 360 systems as a
 * table: brand/model, age, condition, expected replacement year
 * (installYear + estimatedLifespanYears), replacement cost estimate,
 * photos. Inline add/edit over threeSixty.propertySystems. Membership
 * required in v1 (systems rows hang off membershipId NOT NULL).
 */
import { useState } from "react";
import { Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { trpc } from "@/lib/trpc";
import { fmtMoney, hairline } from "./types";

type SystemType =
  | "hvac" | "roof" | "plumbing" | "electrical" | "foundation"
  | "exterior_siding" | "landscaping_drainage" | "interior" | "appliances" | "safety_security";

const SYSTEM_LABELS: Record<SystemType, string> = {
  hvac: "HVAC",
  roof: "Roof",
  plumbing: "Plumbing",
  electrical: "Electrical",
  foundation: "Foundation",
  exterior_siding: "Exterior & siding",
  landscaping_drainage: "Landscaping & drainage",
  interior: "Interior",
  appliances: "Appliances",
  safety_security: "Safety & security",
};
const SYSTEM_ORDER = Object.keys(SYSTEM_LABELS) as SystemType[];

const CONDITION_CHIP: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800",
  fair: "bg-amber-100 text-amber-800",
  poor: "bg-orange-100 text-orange-800",
  critical: "bg-red-100 text-red-700",
};

type EditState = {
  id?: number;
  systemType: SystemType;
  brandModel: string;
  installYear: string;
  condition: "good" | "fair" | "poor" | "critical";
  estimatedLifespanYears: string;
  replacementCostEstimate: string;
};

export default function StepSystems({
  customerId,
  propertyId,
  membershipId,
}: {
  customerId: string;
  propertyId: string;
  membershipId: number | null;
}) {
  const [edit, setEdit] = useState<EditState | null>(null);
  const utils = trpc.useUtils();

  const { data: rows, isLoading } = trpc.threeSixty.propertySystems.list.useQuery(
    { membershipId: membershipId ?? 0 },
    { enabled: membershipId != null },
  );
  const upsertM = trpc.threeSixty.propertySystems.upsert.useMutation({
    onSuccess: () => {
      void utils.threeSixty.propertySystems.list.invalidate({ membershipId: membershipId ?? 0 });
      toast.success("System saved");
      setEdit(null);
    },
    onError: (e) => toast.error(e.message),
  });

  if (membershipId == null) {
    return (
      <div className="bg-white rounded-xl border px-4 py-6 text-center" style={hairline}>
        <p className="text-sm" style={{ color: "var(--hp-ink)" }}>
          The major-systems log comes with a 360 membership.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          Enroll this property from the client page and the ten systems unlock here.
        </p>
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-32 rounded-xl bg-white border animate-pulse" style={hairline} />;
  }

  const byType = new Map((rows ?? []).map((r: any) => [r.systemType, r]));
  const thisYear = new Date().getFullYear();

  const openEdit = (systemType: SystemType) => {
    const r: any = byType.get(systemType);
    setEdit({
      id: r?.id,
      systemType,
      brandModel: r?.brandModel ?? "",
      installYear: r?.installYear ? String(r.installYear) : "",
      condition: r?.condition ?? "good",
      estimatedLifespanYears: r?.estimatedLifespanYears ? String(r.estimatedLifespanYears) : "",
      replacementCostEstimate: r?.replacementCostEstimate ? String(r.replacementCostEstimate) : "",
    });
  };

  const save = () => {
    if (!edit) return;
    upsertM.mutate({
      id: edit.id,
      membershipId,
      customerId,
      propertyId,
      systemType: edit.systemType,
      brandModel: edit.brandModel.trim() || undefined,
      installYear: edit.installYear ? Number(edit.installYear) : undefined,
      condition: edit.condition,
      estimatedLifespanYears: edit.estimatedLifespanYears ? Number(edit.estimatedLifespanYears) : undefined,
      replacementCostEstimate: edit.replacementCostEstimate ? String(Number(edit.replacementCostEstimate)) : undefined,
    });
  };

  return (
    <div className="bg-white rounded-xl border overflow-x-auto" style={hairline}>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] text-muted-foreground border-b" style={hairline}>
            <th className="px-3 py-2 font-semibold">System</th>
            <th className="px-3 py-2 font-semibold">Brand / model</th>
            <th className="px-3 py-2 font-semibold">Age</th>
            <th className="px-3 py-2 font-semibold">Condition</th>
            <th className="px-3 py-2 font-semibold">Replace by</th>
            <th className="px-3 py-2 font-semibold">Replacement est.</th>
            <th className="px-3 py-2 font-semibold">Photos</th>
            <th className="px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y" style={hairline}>
          {SYSTEM_ORDER.map((type) => {
            const r: any = byType.get(type);
            const age = r?.installYear ? thisYear - r.installYear : null;
            const replaceBy = r?.installYear && r?.estimatedLifespanYears
              ? r.installYear + r.estimatedLifespanYears
              : null;
            let photos: string[] = [];
            try { photos = JSON.parse(r?.photoUrls ?? "[]"); } catch { photos = []; }
            return (
              <tr key={type} className="align-middle">
                <td className="px-3 py-2.5 font-medium whitespace-nowrap" style={{ color: "var(--hp-ink)" }}>
                  {SYSTEM_LABELS[type]}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground">{r?.brandModel || "—"}</td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {age != null ? `${age} yr (${r.installYear})` : "—"}
                </td>
                <td className="px-3 py-2.5">
                  {r ? (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${CONDITION_CHIP[r.condition] ?? "bg-gray-100 text-gray-600"}`}>
                      {r.condition}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2.5 text-xs whitespace-nowrap" style={replaceBy != null && replaceBy <= thisYear + 2 ? { color: "#b45309", fontWeight: 600 } : { color: "var(--hp-ink)" }}>
                  {replaceBy ?? "—"}
                </td>
                <td className="px-3 py-2.5 text-xs text-muted-foreground whitespace-nowrap">
                  {r?.replacementCostEstimate ? fmtMoney(Number(r.replacementCostEstimate)) : "—"}
                </td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-1">
                    {photos.slice(0, 3).map((url, i) => (
                      <a key={i} href={url} target="_blank" rel="noreferrer">
                        <img src={url} alt="" className="w-7 h-7 rounded object-cover border" style={hairline} />
                      </a>
                    ))}
                  </div>
                </td>
                <td className="px-3 py-2.5 text-right">
                  <button
                    type="button"
                    onClick={() => openEdit(type)}
                    title={r ? "Edit" : "Add details"}
                    aria-label={`Edit ${SYSTEM_LABELS[type]}`}
                    className="p-1.5 rounded text-muted-foreground hover:text-foreground hover:bg-muted"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {edit && (
        <Dialog open onOpenChange={(v) => { if (!v) setEdit(null); }}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>{SYSTEM_LABELS[edit.systemType]}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-xs text-muted-foreground">Brand / model</label>
                <Input value={edit.brandModel} onChange={(e) => setEdit({ ...edit, brandModel: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Install year</label>
                  <Input type="number" value={edit.installYear} onChange={(e) => setEdit({ ...edit, installYear: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Expected lifespan (yrs)</label>
                  <Input type="number" value={edit.estimatedLifespanYears} onChange={(e) => setEdit({ ...edit, estimatedLifespanYears: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Condition</label>
                  <select
                    className="w-full text-sm px-3 py-2 rounded-lg border bg-white"
                    style={hairline}
                    value={edit.condition}
                    onChange={(e) => setEdit({ ...edit, condition: e.target.value as EditState["condition"] })}
                  >
                    <option value="good">Good</option>
                    <option value="fair">Fair</option>
                    <option value="poor">Poor</option>
                    <option value="critical">Critical</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Replacement cost ($)</label>
                  <Input type="number" value={edit.replacementCostEstimate} onChange={(e) => setEdit({ ...edit, replacementCostEstimate: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEdit(null)} disabled={upsertM.isPending}>Cancel</Button>
              <Button onClick={save} disabled={upsertM.isPending}>{upsertM.isPending ? "Saving…" : "Save"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
