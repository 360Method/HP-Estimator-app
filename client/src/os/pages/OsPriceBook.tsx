/**
 * OsPriceBook — the editable estimate catalog (/os/pricebook).
 *
 * Two shelves: remodel stages (seeded from the calculator catalog) and
 * maintenance services (the standing price list). Internal-only surface —
 * every number here is a COST figure; margin is applied by the calculator
 * and clients never see this screen.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { BookOpenCheck, ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
import { OsShell } from "../OsShell";

type Kind = "remodel_stage" | "maintenance";

type Row = {
  id: number;
  itemKey: string;
  kind: Kind;
  phase: number | null;
  category: string;
  name: string;
  shortName: string;
  unitType: string;
  laborMode: "hr" | "flat";
  laborRate: string;
  hrsPerUnit: string;
  flatRatePerUnit: string;
  hasTiers: boolean;
  tiersJson: string | null;
  wastePct: string;
  hasPaintPrep: boolean;
  defaultQty: string;
  salesDesc: string | null;
  sowTemplate: string | null;
  active: boolean;
  sortOrder: number;
  source: "seed" | "human";
};

type TierForm = { rate: string; name: string; desc: string };

type EditorState = {
  id: number | null; // null = creating
  kind: Kind;
  category: string;
  name: string;
  shortName: string;
  unitType: string;
  laborMode: "hr" | "flat";
  laborRate: string;
  hrsPerUnit: string;
  flatRatePerUnit: string;
  hasTiers: boolean;
  tiers: { good: TierForm; better: TierForm; best: TierForm };
  defaultQty: string;
  salesDesc: string;
  sowTemplate: string;
  active: boolean;
  wastePct: string;
  hasPaintPrep: boolean;
};

const EMPTY_TIERS = {
  good: { rate: "0", name: "", desc: "" },
  better: { rate: "0", name: "", desc: "" },
  best: { rate: "0", name: "", desc: "" },
};

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function costLine(r: Row): string {
  if (r.laborMode === "flat") return `${money(parseFloat(r.flatRatePerUnit))} / ${r.unitType} cost`;
  const hrs = parseFloat(r.hrsPerUnit);
  const rate = parseFloat(r.laborRate);
  return `${hrs} hr × ${money(rate)} = ${money(hrs * rate)} / ${r.unitType} labor cost`;
}

function rowToEditor(r: Row): EditorState {
  let tiers = EMPTY_TIERS;
  if (r.hasTiers && r.tiersJson) {
    try {
      const t = JSON.parse(r.tiersJson);
      tiers = {
        good: { rate: String(t.good?.rate ?? 0), name: t.good?.name ?? "", desc: t.good?.desc ?? "" },
        better: { rate: String(t.better?.rate ?? 0), name: t.better?.name ?? "", desc: t.better?.desc ?? "" },
        best: { rate: String(t.best?.rate ?? 0), name: t.best?.name ?? "", desc: t.best?.desc ?? "" },
      };
    } catch { /* keep empty */ }
  }
  return {
    id: r.id,
    kind: r.kind,
    category: r.category,
    name: r.name,
    shortName: r.shortName,
    unitType: r.unitType,
    laborMode: r.laborMode,
    laborRate: r.laborRate,
    hrsPerUnit: r.hrsPerUnit,
    flatRatePerUnit: r.flatRatePerUnit,
    hasTiers: r.hasTiers,
    tiers,
    defaultQty: r.defaultQty,
    salesDesc: r.salesDesc ?? "",
    sowTemplate: r.sowTemplate ?? "",
    active: r.active,
    wastePct: r.wastePct,
    hasPaintPrep: r.hasPaintPrep,
  };
}

function newItemEditor(kind: Kind, category: string): EditorState {
  return {
    id: null,
    kind,
    category,
    name: "",
    shortName: "",
    unitType: "unit",
    laborMode: "hr",
    laborRate: "100",
    hrsPerUnit: "1",
    flatRatePerUnit: "0",
    hasTiers: false,
    tiers: EMPTY_TIERS,
    defaultQty: "1",
    salesDesc: "",
    sowTemplate: "",
    active: true,
    wastePct: "0",
    hasPaintPrep: false,
  };
}

export default function OsPriceBook() {
  const utils = trpc.useUtils();
  const [kind, setKind] = useState<Kind>("maintenance");
  const [query, setQuery] = useState("");
  const [showRetired, setShowRetired] = useState(false);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});
  const [editor, setEditor] = useState<EditorState | null>(null);

  const listQ = trpc.priceBook.list.useQuery({ kind, includeInactive: true });

  const onDone = {
    onSuccess: () => {
      utils.priceBook.list.invalidate();
      setEditor(null);
      toast.success("Saved.");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const createM = trpc.priceBook.create.useMutation(onDone);
  const updateM = trpc.priceBook.update.useMutation(onDone);
  const setActiveM = trpc.priceBook.setActive.useMutation({
    onSuccess: () => {
      utils.priceBook.list.invalidate();
      setEditor(null);
      toast.success("Updated.");
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (listQ.data ?? []) as Row[];
  const q = query.trim().toLowerCase();
  const visible = rows.filter(
    (r) => (showRetired || r.active) && (!q || r.name.toLowerCase().includes(q) || r.category.toLowerCase().includes(q)),
  );

  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of visible) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return [...map.entries()];
  }, [visible]);

  function save() {
    if (!editor) return;
    if (!editor.name.trim() || !editor.category.trim()) {
      toast.error("Name and category are required.");
      return;
    }
    const payload = {
      kind: editor.kind,
      phase: null,
      category: editor.category.trim(),
      name: editor.name.trim(),
      shortName: editor.shortName.trim() || editor.name.trim().slice(0, 80),
      unitType: editor.unitType.trim() || "unit",
      laborMode: editor.laborMode,
      laborRate: parseFloat(editor.laborRate) || 0,
      hrsPerUnit: parseFloat(editor.hrsPerUnit) || 0,
      flatRatePerUnit: parseFloat(editor.flatRatePerUnit) || 0,
      hasTiers: editor.hasTiers,
      tiers: editor.hasTiers
        ? {
            good: { rate: parseFloat(editor.tiers.good.rate) || 0, name: editor.tiers.good.name, desc: editor.tiers.good.desc },
            better: { rate: parseFloat(editor.tiers.better.rate) || 0, name: editor.tiers.better.name, desc: editor.tiers.better.desc },
            best: { rate: parseFloat(editor.tiers.best.rate) || 0, name: editor.tiers.best.name, desc: editor.tiers.best.desc },
          }
        : null,
      wastePct: parseFloat(editor.wastePct) || 0,
      hasPaintPrep: editor.hasPaintPrep,
      defaultQty: parseFloat(editor.defaultQty) || 0,
      salesDesc: editor.salesDesc,
      sowTemplate: editor.sowTemplate,
    };
    if (editor.id === null) createM.mutate(payload);
    else updateM.mutate({ ...payload, id: editor.id });
  }

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg border";
  const inputStyle = { borderColor: "var(--hp-hairline)" } as const;

  return (
    <OsShell active="/os/pricebook">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
            Price book
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            The services and rates estimates are built from. Costs only — clients never see this.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor(newItemEditor(kind, ""))}
          className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold text-white"
          style={{ background: "var(--hp-ink)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Add item
        </button>
      </div>

      {/* Kind toggle + search */}
      <div className="mt-4 flex flex-col sm:flex-row gap-2">
        <div className="flex rounded-lg border overflow-hidden w-fit" style={inputStyle}>
          {(["maintenance", "remodel_stage"] as Kind[]).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setKind(k)}
              className={"text-xs px-4 py-2 font-semibold transition-colors " + (kind === k ? "text-white" : "bg-white text-muted-foreground")}
              style={kind === k ? { background: "var(--hp-gold-deep)" } : undefined}
            >
              {k === "maintenance" ? "Maintenance" : "Remodel stages"}
            </button>
          ))}
        </div>
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search items…"
            className={inputCls + " pl-9 bg-white"}
            style={inputStyle}
          />
        </div>
        <label className="flex items-center gap-1.5 text-xs text-muted-foreground whitespace-nowrap px-1">
          <input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} />
          Show retired
        </label>
      </div>

      {/* Groups */}
      <div className="mt-4 space-y-2">
        {listQ.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="text-center py-12">
            <BookOpenCheck className="w-8 h-8 mx-auto mb-2 text-muted-foreground opacity-50" />
            <p className="text-sm text-muted-foreground">Nothing here{q ? " for that search" : " yet"}.</p>
          </div>
        ) : (
          groups.map(([cat, items]) => {
            const open = openCats[cat] ?? !!q;
            return (
              <div key={cat} className="bg-white rounded-xl border overflow-hidden" style={inputStyle}>
                <button
                  type="button"
                  onClick={() => setOpenCats((s) => ({ ...s, [cat]: !open }))}
                  className="w-full flex items-center justify-between px-4 py-3 text-left"
                >
                  <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
                    {cat}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-muted-foreground">
                    {items.length}
                    {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </span>
                </button>
                {open && (
                  <ul className="border-t" style={inputStyle}>
                    {items.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => setEditor(rowToEditor(r))}
                          className="w-full px-4 py-3 text-left hover:bg-black/[0.03] transition-colors border-b last:border-b-0"
                          style={inputStyle}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className={"text-sm " + (r.active ? "" : "line-through opacity-50")} style={{ color: "var(--hp-ink)" }}>
                              {r.name}
                            </span>
                            {!r.active && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500 shrink-0">retired</span>
                            )}
                          </div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {costLine(r)}
                            {r.hasTiers ? " · tiered materials" : ""}
                          </div>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Bottom-sheet editor */}
      {editor && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end md:items-center md:justify-center">
          <div className="flex-1 md:flex-none md:absolute md:inset-0 bg-black/40" onClick={() => setEditor(null)} />
          <div className="relative bg-white rounded-t-2xl md:rounded-2xl p-4 max-h-[85vh] md:max-h-[80vh] md:w-[560px] overflow-y-auto">
            <div className="flex items-center justify-between mb-3">
              <span className="hp-serif font-semibold" style={{ color: "var(--hp-ink)" }}>
                {editor.id === null ? "New item" : "Edit item"}
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
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Category / group</label>
                  <input className={inputCls} style={inputStyle} value={editor.category}
                    placeholder={editor.kind === "maintenance" ? "e.g. Exterior Upkeep" : "e.g. Trim & Finish Carpentry"}
                    onChange={(e) => setEditor({ ...editor, category: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Unit</label>
                  <input className={inputCls} style={inputStyle} value={editor.unitType}
                    placeholder="unit, hr, sqft, lf…"
                    onChange={(e) => setEditor({ ...editor, unitType: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Labor pricing (internal cost)</label>
                <div className="flex gap-2 mt-1">
                  <select
                    className="text-sm px-2 py-2 rounded-lg border bg-white"
                    style={inputStyle}
                    value={editor.laborMode}
                    onChange={(e) => setEditor({ ...editor, laborMode: e.target.value as "hr" | "flat" })}
                  >
                    <option value="hr">Hours × rate</option>
                    <option value="flat">Flat per unit</option>
                  </select>
                  {editor.laborMode === "hr" ? (
                    <>
                      <input className={inputCls} style={inputStyle} inputMode="decimal" value={editor.hrsPerUnit}
                        placeholder="hrs / unit"
                        onChange={(e) => setEditor({ ...editor, hrsPerUnit: e.target.value })} />
                      <input className={inputCls} style={inputStyle} inputMode="decimal" value={editor.laborRate}
                        placeholder="cost $/hr"
                        onChange={(e) => setEditor({ ...editor, laborRate: e.target.value })} />
                    </>
                  ) : (
                    <input className={inputCls} style={inputStyle} inputMode="decimal" value={editor.flatRatePerUnit}
                      placeholder="cost $ / unit"
                      onChange={(e) => setEditor({ ...editor, flatRatePerUnit: e.target.value })} />
                  )}
                </div>
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={editor.hasTiers}
                  onChange={(e) => setEditor({ ...editor, hasTiers: e.target.checked })}
                />
                Material tiers (good / better / best)
              </label>
              {editor.hasTiers && (
                <div className="space-y-2 pl-1">
                  {(["good", "better", "best"] as const).map((t) => (
                    <div key={t} className="grid grid-cols-[64px_1fr_96px] gap-2 items-center">
                      <span className="text-xs capitalize text-muted-foreground">{t}</span>
                      <input className={inputCls} style={inputStyle} value={editor.tiers[t].name} placeholder="Material name"
                        onChange={(e) => setEditor({ ...editor, tiers: { ...editor.tiers, [t]: { ...editor.tiers[t], name: e.target.value } } })} />
                      <input className={inputCls} style={inputStyle} inputMode="decimal" value={editor.tiers[t].rate} placeholder="cost $"
                        onChange={(e) => setEditor({ ...editor, tiers: { ...editor.tiers, [t]: { ...editor.tiers[t], rate: e.target.value } } })} />
                    </div>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground">Default quantity</label>
                  <input className={inputCls} style={inputStyle} inputMode="decimal" value={editor.defaultQty}
                    onChange={(e) => setEditor({ ...editor, defaultQty: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Short name</label>
                  <input className={inputCls} style={inputStyle} value={editor.shortName}
                    onChange={(e) => setEditor({ ...editor, shortName: e.target.value })} />
                </div>
              </div>

              <div>
                <label className="text-xs text-muted-foreground">Customer-facing description</label>
                <textarea className={inputCls} style={inputStyle} rows={2} value={editor.salesDesc}
                  onChange={(e) => setEditor({ ...editor, salesDesc: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Scope-of-work template ({"{qty}"} fills in)</label>
                <textarea className={inputCls} style={inputStyle} rows={2} value={editor.sowTemplate}
                  onChange={(e) => setEditor({ ...editor, sowTemplate: e.target.value })} />
              </div>

              <div className="flex items-center justify-between pt-2">
                {editor.id !== null ? (
                  <button
                    type="button"
                    onClick={() => setActiveM.mutate({ id: editor.id!, active: !editor.active })}
                    className="text-xs px-3 py-2 rounded-lg border font-semibold"
                    style={{ borderColor: "var(--hp-hairline)", color: editor.active ? "#b91c1c" : "var(--hp-ink)" }}
                  >
                    {editor.active ? "Retire item" : "Reactivate"}
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
