/**
 * OsQuickQuotePresetsPanel: the remodel quick-quote presets shelf inside
 * /os/pricebook. Unlike the catalog tabs, every number here is a RETAIL
 * customer price range with margin already inside. These presets power the
 * Step 8 on-site consultation at /os/quickquote.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Plus, X } from "lucide-react";
import type { QuoteTierKey } from "@shared/remodelQuickQuote";
import { QUOTE_TIER_ORDER } from "@shared/remodelQuickQuote";

type PresetRow = {
  id: number;
  presetKey: string;
  label: string;
  description: string | null;
  unitType: string;
  tiersJson: string;
  lfAddonsJson: string | null;
  baseFeeLow: string;
  baseFeeHigh: string;
  minSqft: string;
  active: boolean;
  sortOrder: number;
  source: "seed" | "human";
};

type TierForm = { rateLow: string; rateHigh: string; name: string; desc: string };
type AddonForm = { key: string; label: string; rateLow: string; rateHigh: string };

type PresetEditor = {
  id: number | null;
  label: string;
  description: string;
  tiers: Record<QuoteTierKey, TierForm>;
  lfAddons: AddonForm[];
  baseFeeLow: string;
  baseFeeHigh: string;
  minSqft: string;
  active: boolean;
};

const EMPTY_TIER: TierForm = { rateLow: "0", rateHigh: "0", name: "", desc: "" };

function money(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function rowToEditor(r: PresetRow): PresetEditor {
  let tiers: Record<QuoteTierKey, TierForm> = { good: { ...EMPTY_TIER }, better: { ...EMPTY_TIER }, best: { ...EMPTY_TIER } };
  try {
    const t = JSON.parse(r.tiersJson);
    for (const key of QUOTE_TIER_ORDER) {
      tiers[key] = {
        rateLow: String(t[key]?.rateLow ?? 0),
        rateHigh: String(t[key]?.rateHigh ?? 0),
        name: t[key]?.name ?? "",
        desc: t[key]?.desc ?? "",
      };
    }
  } catch { /* keep empty */ }
  let lfAddons: AddonForm[] = [];
  try {
    const a = r.lfAddonsJson ? JSON.parse(r.lfAddonsJson) : [];
    if (Array.isArray(a)) {
      lfAddons = a.map((x) => ({
        key: x.key ?? "",
        label: x.label ?? "",
        rateLow: String(x.rateLow ?? 0),
        rateHigh: String(x.rateHigh ?? 0),
      }));
    }
  } catch { /* keep empty */ }
  return {
    id: r.id,
    label: r.label,
    description: r.description ?? "",
    tiers,
    lfAddons,
    baseFeeLow: r.baseFeeLow,
    baseFeeHigh: r.baseFeeHigh,
    minSqft: r.minSqft,
    active: r.active,
  };
}

function newEditor(): PresetEditor {
  return {
    id: null,
    label: "",
    description: "",
    tiers: {
      good: { ...EMPTY_TIER, name: "Good" },
      better: { ...EMPTY_TIER, name: "Better" },
      best: { ...EMPTY_TIER, name: "Best" },
    },
    lfAddons: [],
    baseFeeLow: "0",
    baseFeeHigh: "0",
    minSqft: "0",
    active: true,
  };
}

export default function OsQuickQuotePresetsPanel() {
  const utils = trpc.useUtils();
  const [editor, setEditor] = useState<PresetEditor | null>(null);

  const listQ = trpc.priceBook.listPresets.useQuery({ includeInactive: true });

  const onDone = {
    onSuccess: () => {
      utils.priceBook.listPresets.invalidate();
      setEditor(null);
      toast.success("Saved.");
    },
    onError: (e: { message: string }) => toast.error(e.message),
  };
  const createM = trpc.priceBook.createPreset.useMutation(onDone);
  const updateM = trpc.priceBook.updatePreset.useMutation(onDone);
  const setActiveM = trpc.priceBook.setPresetActive.useMutation({
    onSuccess: () => {
      utils.priceBook.listPresets.invalidate();
      toast.success("Updated.");
    },
    onError: (e) => toast.error(e.message),
  });

  const rows = (listQ.data ?? []) as PresetRow[];

  function save() {
    if (!editor) return;
    if (!editor.label.trim()) {
      toast.error("A name is required.");
      return;
    }
    const num = (s: string) => parseFloat(s) || 0;
    for (const key of QUOTE_TIER_ORDER) {
      const t = editor.tiers[key];
      if (num(t.rateLow) > num(t.rateHigh)) {
        toast.error(`${t.name || key}: the low rate is above the high rate.`);
        return;
      }
    }
    const payload = {
      label: editor.label.trim(),
      description: editor.description.trim(),
      unitType: "sqft",
      tiers: {
        good: { rateLow: num(editor.tiers.good.rateLow), rateHigh: num(editor.tiers.good.rateHigh), name: editor.tiers.good.name, desc: editor.tiers.good.desc },
        better: { rateLow: num(editor.tiers.better.rateLow), rateHigh: num(editor.tiers.better.rateHigh), name: editor.tiers.better.name, desc: editor.tiers.better.desc },
        best: { rateLow: num(editor.tiers.best.rateLow), rateHigh: num(editor.tiers.best.rateHigh), name: editor.tiers.best.name, desc: editor.tiers.best.desc },
      },
      lfAddons: editor.lfAddons
        .filter((a) => a.label.trim())
        .map((a, i) => ({
          key: a.key.trim() || `addon-${i + 1}`,
          label: a.label.trim(),
          rateLow: num(a.rateLow),
          rateHigh: num(a.rateHigh),
        })),
      baseFeeLow: num(editor.baseFeeLow),
      baseFeeHigh: num(editor.baseFeeHigh),
      minSqft: num(editor.minSqft),
      sortOrder: 99,
    };
    if (editor.id === null) createM.mutate(payload);
    else updateM.mutate({ ...payload, id: editor.id });
  }

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg border";
  const inputStyle = { borderColor: "var(--hp-hairline)" } as const;

  return (
    <div className="mt-4">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <p className="text-xs text-muted-foreground max-w-xl">
          Customer-facing retail ranges, margins included. These power the on-site remodel
          consultation at Quick quote. Edit a preset and your numbers stick; seeded defaults
          refresh on deploy until you touch them.
        </p>
        <button
          type="button"
          onClick={() => setEditor(newEditor())}
          className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold text-white"
          style={{ background: "var(--hp-ink)" }}
        >
          <Plus className="w-3.5 h-3.5" /> Add preset
        </button>
      </div>

      <div className="mt-3 space-y-2">
        {listQ.isLoading ? (
          <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">No presets yet.</p>
        ) : (
          rows.map((r) => {
            let tierLine = "";
            try {
              const t = JSON.parse(r.tiersJson);
              tierLine = QUOTE_TIER_ORDER
                .map((k) => `${t[k]?.name ?? k} ${money(t[k]?.rateLow ?? 0)}-${money(t[k]?.rateHigh ?? 0)}/${r.unitType}`)
                .join(" · ");
            } catch { /* ignore */ }
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => setEditor(rowToEditor(r))}
                className="w-full text-left bg-white rounded-xl border px-4 py-3 hover:shadow-sm transition-shadow"
                style={inputStyle}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={"text-sm font-semibold " + (r.active ? "" : "line-through opacity-50")} style={{ color: "var(--hp-ink)" }}>
                    {r.label}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">
                    {r.source === "human" ? "yours" : "seeded"}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">{tierLine}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  Minimum {money(parseFloat(r.baseFeeLow))} to {money(parseFloat(r.baseFeeHigh))}
                  {parseFloat(r.minSqft) > 0 && ` · calibrated for ${parseFloat(r.minSqft)}+ sqft`}
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* ── Editor sheet ───────────────────────────────────────── */}
      {editor && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40" onClick={() => setEditor(null)}>
          <div
            className="bg-white rounded-t-2xl sm:rounded-2xl w-full sm:max-w-lg max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="hp-serif text-lg" style={{ color: "var(--hp-ink)" }}>
                {editor.id === null ? "New quick-quote preset" : "Edit preset"}
              </h3>
              <button type="button" onClick={() => setEditor(null)} aria-label="Close">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium block mb-1">Name</label>
                <input className={inputCls} style={inputStyle} value={editor.label} onChange={(e) => setEditor({ ...editor, label: e.target.value })} placeholder="e.g. Full bathroom remodel" />
              </div>
              <div>
                <label className="text-xs font-medium block mb-1">Description</label>
                <input className={inputCls} style={inputStyle} value={editor.description} onChange={(e) => setEditor({ ...editor, description: e.target.value })} />
              </div>

              {QUOTE_TIER_ORDER.map((key) => (
                <div key={key} className="rounded-lg border p-3" style={inputStyle}>
                  <div className="flex gap-2 mb-2">
                    <input
                      className={inputCls + " font-semibold"}
                      style={inputStyle}
                      value={editor.tiers[key].name}
                      onChange={(e) => setEditor({ ...editor, tiers: { ...editor.tiers, [key]: { ...editor.tiers[key], name: e.target.value } } })}
                      placeholder={key}
                    />
                    <input
                      className={inputCls + " w-24"}
                      style={inputStyle}
                      inputMode="decimal"
                      value={editor.tiers[key].rateLow}
                      onChange={(e) => setEditor({ ...editor, tiers: { ...editor.tiers, [key]: { ...editor.tiers[key], rateLow: e.target.value } } })}
                      placeholder="low"
                    />
                    <input
                      className={inputCls + " w-24"}
                      style={inputStyle}
                      inputMode="decimal"
                      value={editor.tiers[key].rateHigh}
                      onChange={(e) => setEditor({ ...editor, tiers: { ...editor.tiers, [key]: { ...editor.tiers[key], rateHigh: e.target.value } } })}
                      placeholder="high"
                    />
                  </div>
                  <textarea
                    className={inputCls}
                    style={inputStyle}
                    rows={2}
                    value={editor.tiers[key].desc}
                    onChange={(e) => setEditor({ ...editor, tiers: { ...editor.tiers, [key]: { ...editor.tiers[key], desc: e.target.value } } })}
                    placeholder="What this tier means in materials and finish"
                  />
                  <p className="text-[10px] text-muted-foreground mt-1">Retail dollars per sqft, low and high.</p>
                </div>
              ))}

              <div>
                <label className="text-xs font-medium block mb-1">Lineal-foot add-ons</label>
                {editor.lfAddons.map((a, i) => (
                  <div key={i} className="flex gap-2 mb-2">
                    <input className={inputCls} style={inputStyle} value={a.label} placeholder="e.g. Cabinet run"
                      onChange={(e) => setEditor({ ...editor, lfAddons: editor.lfAddons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                    <input className={inputCls + " w-20"} style={inputStyle} inputMode="decimal" value={a.rateLow} placeholder="low"
                      onChange={(e) => setEditor({ ...editor, lfAddons: editor.lfAddons.map((x, j) => (j === i ? { ...x, rateLow: e.target.value } : x)) })} />
                    <input className={inputCls + " w-20"} style={inputStyle} inputMode="decimal" value={a.rateHigh} placeholder="high"
                      onChange={(e) => setEditor({ ...editor, lfAddons: editor.lfAddons.map((x, j) => (j === i ? { ...x, rateHigh: e.target.value } : x)) })} />
                    <button type="button" onClick={() => setEditor({ ...editor, lfAddons: editor.lfAddons.filter((_, j) => j !== i) })} aria-label="Remove add-on">
                      <X className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs underline text-muted-foreground"
                  onClick={() => setEditor({ ...editor, lfAddons: [...editor.lfAddons, { key: "", label: "", rateLow: "0", rateHigh: "0" }] })}
                >
                  Add a per-foot line (cabinets, counters, trim)
                </button>
              </div>

              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1">Minimum price (low)</label>
                  <input className={inputCls} style={inputStyle} inputMode="decimal" value={editor.baseFeeLow} onChange={(e) => setEditor({ ...editor, baseFeeLow: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1">Minimum price (high)</label>
                  <input className={inputCls} style={inputStyle} inputMode="decimal" value={editor.baseFeeHigh} onChange={(e) => setEditor({ ...editor, baseFeeHigh: e.target.value })} />
                </div>
                <div className="flex-1">
                  <label className="text-xs font-medium block mb-1">Calibrated from (sqft)</label>
                  <input className={inputCls} style={inputStyle} inputMode="decimal" value={editor.minSqft} onChange={(e) => setEditor({ ...editor, minSqft: e.target.value })} />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                {editor.id !== null ? (
                  <button
                    type="button"
                    className="text-xs underline text-muted-foreground"
                    onClick={() => setActiveM.mutate({ id: editor.id!, active: !editor.active })}
                  >
                    {editor.active ? "Retire this preset" : "Restore this preset"}
                  </button>
                ) : <span />}
                <div className="flex gap-2">
                  <button type="button" className="text-xs px-3 py-2 rounded-lg border" style={inputStyle} onClick={() => setEditor(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="text-xs px-4 py-2 rounded-lg font-semibold text-white"
                    style={{ background: "var(--hp-ink)" }}
                    onClick={save}
                    disabled={createM.isPending || updateM.isPending}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
