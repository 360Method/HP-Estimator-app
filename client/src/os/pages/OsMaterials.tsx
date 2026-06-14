/**
 * OsMaterials — the material catalog (/os/materials).
 *
 * Where the field estimate's good / better / best / premium picker gets its
 * options. Every price is an internal COST per unit (what HP pays CFM, Home
 * Depot, or another supplier); the estimate engine applies margin, so these
 * numbers never reach the customer. Staff populate it here; reps pick a tier
 * on a line in the field.
 */
import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Boxes, ChevronDown, ChevronRight, Plus, Search, X } from "lucide-react";
import { OsShell } from "../OsShell";

type Supplier = "cfm" | "home_depot" | "other";
const SUPPLIER_LABEL: Record<Supplier, string> = {
  cfm: "CFM",
  home_depot: "Home Depot",
  other: "Other",
};

type Row = {
  id: number;
  category: string;
  name: string;
  unitType: string;
  supplier: string;
  goodPrice: string; goodLabel: string;
  betterPrice: string; betterLabel: string;
  bestPrice: string; bestLabel: string;
  premiumPrice: string; premiumLabel: string;
  notes: string | null;
  active: boolean;
  sortOrder: number;
  source: "seed" | "human";
};

type EditorState = {
  id: number | null;
  category: string;
  name: string;
  unitType: string;
  supplier: Supplier;
  goodPrice: string; goodLabel: string;
  betterPrice: string; betterLabel: string;
  bestPrice: string; bestLabel: string;
  premiumPrice: string; premiumLabel: string;
  notes: string;
};

const EMPTY: EditorState = {
  id: null, category: "", name: "", unitType: "sqft", supplier: "cfm",
  goodPrice: "", goodLabel: "", betterPrice: "", betterLabel: "",
  bestPrice: "", bestLabel: "", premiumPrice: "", premiumLabel: "", notes: "",
};

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
}

function rowToEditor(r: Row): EditorState {
  return {
    id: r.id, category: r.category, name: r.name, unitType: r.unitType,
    supplier: (["cfm", "home_depot", "other"].includes(r.supplier) ? r.supplier : "other") as Supplier,
    goodPrice: String(parseFloat(r.goodPrice) || ""), goodLabel: r.goodLabel,
    betterPrice: String(parseFloat(r.betterPrice) || ""), betterLabel: r.betterLabel,
    bestPrice: String(parseFloat(r.bestPrice) || ""), bestLabel: r.bestLabel,
    premiumPrice: String(parseFloat(r.premiumPrice) || ""), premiumLabel: r.premiumLabel,
    notes: r.notes ?? "",
  };
}

const inputCls = "w-full text-sm px-3 py-2 rounded-lg border bg-white";
const inputStyle = { borderColor: "var(--hp-hairline)" } as const;

export default function OsMaterials() {
  const utils = trpc.useUtils();
  const { data: rows, isLoading } = trpc.materials.list.useQuery({ includeInactive: true });
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [openCats, setOpenCats] = useState<Record<string, boolean>>({});

  const create = trpc.materials.create.useMutation({
    onSuccess: () => { utils.materials.list.invalidate(); toast.success("Material added."); setEditor(null); },
    onError: (e) => toast.error(e.message),
  });
  const update = trpc.materials.update.useMutation({
    onSuccess: () => { utils.materials.list.invalidate(); toast.success("Material saved."); setEditor(null); },
    onError: (e) => toast.error(e.message),
  });
  const setActive = trpc.materials.setActive.useMutation({
    onSuccess: () => { utils.materials.list.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const filtered = useMemo(() => {
    const list = (rows ?? []) as Row[];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((r) => `${r.category} ${r.name} ${SUPPLIER_LABEL[r.supplier as Supplier] ?? r.supplier}`.toLowerCase().includes(q));
  }, [rows, query]);

  const byCategory = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of filtered) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [filtered]);

  function save() {
    if (!editor) return;
    if (!editor.category.trim() || !editor.name.trim()) {
      toast.error("A category and a name are required.");
      return;
    }
    const payload = {
      category: editor.category, name: editor.name, unitType: editor.unitType, supplier: editor.supplier,
      goodPrice: parseFloat(editor.goodPrice) || 0, goodLabel: editor.goodLabel,
      betterPrice: parseFloat(editor.betterPrice) || 0, betterLabel: editor.betterLabel,
      bestPrice: parseFloat(editor.bestPrice) || 0, bestLabel: editor.bestLabel,
      premiumPrice: parseFloat(editor.premiumPrice) || 0, premiumLabel: editor.premiumLabel,
      notes: editor.notes,
    };
    if (editor.id == null) create.mutate(payload);
    else update.mutate({ id: editor.id, ...payload });
  }

  const TIERS = [
    { key: "good", priceField: "goodPrice", labelField: "goodLabel" },
    { key: "better", priceField: "betterPrice", labelField: "betterLabel" },
    { key: "best", priceField: "bestPrice", labelField: "bestLabel" },
    { key: "premium", priceField: "premiumPrice", labelField: "premiumLabel" },
  ] as const;

  return (
    <OsShell active="/os/materials">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="hp-serif text-2xl flex items-center gap-2" style={{ color: "var(--hp-ink)" }}>
            <Boxes className="w-6 h-6" style={{ color: "var(--hp-gold-deep)" }} /> Material catalog
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-xl">
            The good / better / best / premium options the field estimate pulls from. Every price is an internal
            cost per unit. The estimate adds margin, so the customer never sees these numbers.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setEditor({ ...EMPTY })}
          className="flex items-center gap-1.5 text-sm px-4 py-2.5 rounded-xl font-semibold text-white"
          style={{ background: "var(--hp-ink)" }}
        >
          <Plus className="w-4 h-4" /> Add material
        </button>
      </div>

      <div className="relative max-w-md mt-5">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
        <input className={inputCls + " pl-9"} style={inputStyle} placeholder="Search materials…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground mt-6">Loading…</p>
      ) : byCategory.length === 0 ? (
        <div className="mt-8 bg-white rounded-xl border p-6 text-center" style={inputStyle}>
          <p className="text-sm text-muted-foreground">
            No materials yet. Add the common ones your crews install (flooring, roofing, windows, paint, fixtures)
            with the price points from CFM or Home Depot at each quality level.
          </p>
        </div>
      ) : (
        <div className="mt-5 space-y-2">
          {byCategory.map(([cat, items]) => {
            const open = openCats[cat] ?? true;
            return (
              <div key={cat} className="bg-white rounded-xl border overflow-hidden" style={inputStyle}>
                <button
                  type="button"
                  onClick={() => setOpenCats((s) => ({ ...s, [cat]: !open }))}
                  className="w-full px-4 py-3 flex items-center justify-between text-sm font-semibold"
                  style={{ color: "var(--hp-ink)" }}
                >
                  <span>{cat} <span className="text-xs font-normal text-muted-foreground">({items.length})</span></span>
                  {open ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </button>
                {open && (
                  <ul className="border-t divide-y" style={inputStyle}>
                    {items.map((r) => (
                      <li key={r.id} className={"px-4 py-3 " + (r.active ? "" : "opacity-50")}>
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium" style={{ color: "var(--hp-ink)" }}>
                              {r.name}
                              <span className="ml-2 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500">
                                {SUPPLIER_LABEL[r.supplier as Supplier] ?? r.supplier}
                              </span>
                              {!r.active && <span className="ml-2 text-[10px] text-muted-foreground">retired</span>}
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {(["good", "better", "best", "premium"] as const).map((t, i) => {
                                const price = parseFloat((r as any)[`${t}Price`]) || 0;
                                if (price <= 0) return null;
                                const label = (r as any)[`${t}Label`] as string;
                                return (
                                  <span key={t}>
                                    {i > 0 ? " · " : ""}
                                    <span className="capitalize font-medium">{t}</span> {money(price)}/{r.unitType}
                                    {label ? ` (${label})` : ""}
                                  </span>
                                );
                              })}
                            </p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setEditor(rowToEditor(r))}>
                              Edit
                            </button>
                            <button
                              type="button"
                              className="text-xs underline text-muted-foreground"
                              onClick={() => setActive.mutate({ id: r.id, active: !r.active })}
                            >
                              {r.active ? "Retire" : "Restore"}
                            </button>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Editor */}
      {editor && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setEditor(null)}>
          <div
            className="bg-white w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b sticky top-0 bg-white" style={inputStyle}>
              <h2 className="text-base font-semibold" style={{ color: "var(--hp-ink)" }}>
                {editor.id == null ? "Add material" : "Edit material"}
              </h2>
              <button type="button" onClick={() => setEditor(null)} aria-label="Close"><X className="w-5 h-5 text-muted-foreground" /></button>
            </div>
            <div className="p-5 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground">Category</label>
                  <input className={inputCls} style={inputStyle} value={editor.category} placeholder="Flooring"
                    onChange={(e) => setEditor({ ...editor, category: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground">Unit</label>
                  <input className={inputCls} style={inputStyle} value={editor.unitType} placeholder="sqft"
                    onChange={(e) => setEditor({ ...editor, unitType: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Material name</label>
                <input className={inputCls} style={inputStyle} value={editor.name} placeholder="Luxury vinyl plank"
                  onChange={(e) => setEditor({ ...editor, name: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-muted-foreground">Supplier</label>
                <select className={inputCls} style={inputStyle} value={editor.supplier}
                  onChange={(e) => setEditor({ ...editor, supplier: e.target.value as Supplier })}>
                  <option value="cfm">CFM</option>
                  <option value="home_depot">Home Depot</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <p className="text-xs font-semibold pt-1" style={{ color: "var(--hp-gold-deep)" }}>
                Cost per {editor.unitType || "unit"} at each level
              </p>
              {TIERS.map((t) => (
                <div key={t.key} className="grid grid-cols-[5rem_1fr] gap-2 items-center">
                  <input
                    className={inputCls + " text-right"} style={inputStyle} inputMode="decimal"
                    placeholder="0.00"
                    value={editor[t.priceField]}
                    onChange={(e) => setEditor({ ...editor, [t.priceField]: e.target.value })}
                  />
                  <input
                    className={inputCls} style={inputStyle}
                    placeholder={`${t.key[0].toUpperCase()}${t.key.slice(1)} product (e.g. brand / grade)`}
                    value={editor[t.labelField]}
                    onChange={(e) => setEditor({ ...editor, [t.labelField]: e.target.value })}
                  />
                </div>
              ))}

              <div>
                <label className="text-xs text-muted-foreground">Notes (internal)</label>
                <input className={inputCls} style={inputStyle} value={editor.notes}
                  onChange={(e) => setEditor({ ...editor, notes: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t sticky bottom-0 bg-white" style={inputStyle}>
              <button type="button" className="text-sm px-4 py-2 rounded-lg border" style={inputStyle} onClick={() => setEditor(null)}>Cancel</button>
              <button
                type="button"
                className="text-sm px-5 py-2 rounded-lg font-semibold text-white disabled:opacity-50"
                style={{ background: "var(--hp-ink)" }}
                disabled={create.isPending || update.isPending}
                onClick={save}
              >
                {editor.id == null ? "Add" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </OsShell>
  );
}
