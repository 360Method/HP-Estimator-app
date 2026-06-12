/**
 * OsEstimateWizard — the guided estimate flow (/os/estimate/new).
 *
 * Six screens a brand-new tech can follow with zero training:
 *   1 Client → 2 Kind of work → 3 Pick the work → 4 Quantities →
 *   5 Price check (internal) → 6 Review & send (customer-facing).
 *
 * It is a guided skin over the SAME estimator engine the full builder uses:
 * selections write into EstimatorContext (updateItem / addCustomItem), prices
 * come from calc.ts, margin floors from shared/marginFloor.ts, sending goes
 * through SendEstimateDialog → estimate.send. The "full calculator" link
 * drops into the classic builder with everything carried over.
 *
 * Remodel picks map to the calculator catalog (ALL_PHASES). Maintenance and
 * any price-book item NOT in the catalog become custom line items tagged
 * `pricebook:<itemKey>` so the wizard can re-sync them when picks change.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { ArrowLeft, Check, ChevronRight, Hammer, Search, Sparkles, Wrench } from "lucide-react";
import { OsShell } from "../OsShell";
import { markNavIntent } from "../navIntent";
import { useEstimator } from "@/contexts/EstimatorContext";
import { useDbSync } from "@/hooks/useDbSync";
import { ALL_PHASES } from "@/lib/phases";
import { calcCustomItem, calcPhase, calcTotals } from "@/lib/calc";
import { computeMarginAudit } from "@shared/marginFloor";
import { buildPortalPhases, buildSowBullets, type ActivePhaseData } from "@/lib/sow";
import type { UnitType } from "@/lib/types";
import SendEstimateDialog from "@/components/SendEstimateDialog";

type TierKey = "good" | "better" | "best";
type Sel = { qty: number; tier: TierKey };

type PbRow = {
  id: number;
  itemKey: string;
  kind: "remodel_stage" | "maintenance";
  phase: number | null;
  category: string;
  name: string;
  unitType: string;
  laborMode: "hr" | "flat";
  laborRate: string;
  hrsPerUnit: string;
  flatRatePerUnit: string;
  hasTiers: boolean;
  tiersJson: string | null;
  defaultQty: string;
  salesDesc: string | null;
  sortOrder: number;
};

const STEPS = ["Client", "Work type", "Pick the work", "Quantities", "Price check", "Review & send"];

/** itemKey -> { phaseId, tiers } for everything in the calculator catalog. */
const CATALOG_INDEX = new Map(
  ALL_PHASES.flatMap((p) => p.items.map((i) => [i.id, { phaseId: p.id, item: i }] as const)),
);

/** Price-book rows synthesized from ALL_PHASES — fallback when the API is unreachable. */
function fallbackRows(): PbRow[] {
  let sort = 0;
  return ALL_PHASES.flatMap((p) =>
    p.items.map((i) => ({
      id: -1,
      itemKey: i.id,
      kind: "remodel_stage" as const,
      phase: p.id,
      category: p.name,
      name: i.name,
      unitType: i.unitType,
      laborMode: i.laborMode,
      laborRate: String(i.laborRate),
      hrsPerUnit: String(i.hrsPerUnit),
      flatRatePerUnit: String(i.flatRatePerUnit),
      hasTiers: i.hasTiers,
      tiersJson: i.hasTiers ? JSON.stringify(i.tiers) : null,
      defaultQty: "0",
      salesDesc: i.salesDesc,
      sortOrder: sort++,
    })),
  );
}

export default function OsEstimateWizard() {
  const [, navigate] = useLocation();
  const {
    state, addOpportunity, addCustomer, setActiveCustomer, setActiveOpportunity,
    updateItem, addCustomItem, removeCustomItem, setJobInfo, setSection,
    setEstimateProposal, updateOpportunity,
  } = useEstimator();
  useDbSync(true);

  const [step, setStep] = useState(0);
  const [oppId, setOppId] = useState<string | null>(null);

  // Step 1 — client
  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);

  // Step 2 — work type
  const [workType, setWorkType] = useState<"remodel" | "maintenance" | "both" | null>(null);
  const [jobTitle, setJobTitle] = useState("");

  // Step 3/4 — selections
  const [selection, setSelection] = useState<Record<string, Sel>>({});
  const [itemQuery, setItemQuery] = useState("");
  const appliedRemodel = useRef<Set<string>>(new Set());

  // Step 6 — review
  const [bulletOverrides, setBulletOverrides] = useState<Record<string, string[]>>({});
  const [showSendDialog, setShowSendDialog] = useState(false);
  /** Consultant credited with the sale (null = house / Marcin). */
  const [soldByConsultantId, setSoldByConsultantId] = useState<number | null>(null);

  const createOpp = trpc.opportunities.create.useMutation({
    onError: (err) => console.warn("[wizard] DB opportunity create failed (local state preserved):", err.message),
  });
  const updateOpp = trpc.opportunities.update.useMutation({
    onError: (err) => console.warn("[wizard] DB opportunity update failed (local state preserved):", err.message),
  });
  const createCust = trpc.customers.create.useMutation({
    onError: (err) => console.warn("[wizard] DB customer create failed:", err.message),
  });
  const pbQuery = trpc.priceBook.list.useQuery(undefined, { staleTime: 60_000 });
  const consultantsQuery = trpc.commissions.listConsultants.useQuery(undefined, { staleTime: 60_000 });
  const setSoldBy = trpc.commissions.setSoldBy.useMutation({
    onError: (err) => console.warn("[wizard] sold-by attribution failed:", err.message),
  });
  const brainHealth = trpc.aiBrain.health.useQuery(undefined, { staleTime: 5 * 60_000, refetchOnWindowFocus: false });
  const rewritePhase = trpc.estimate.rewritePhase.useMutation();

  const pbRows: PbRow[] = useMemo(() => {
    const rows = (pbQuery.data as PbRow[] | undefined) ?? [];
    return rows.length > 0 ? rows : fallbackRows();
  }, [pbQuery.data]);
  const pbByKey = useMemo(() => new Map(pbRows.map((r) => [r.itemKey, r])), [pbRows]);

  // ── Prefill from query params (quick quote / spot inspection hand-off) ──
  // ?customerId=&oppId=&title= preselects the client and adopts an existing
  // opportunity instead of minting a new one, so the consultation that
  // created the opportunity and the estimate that firms it up stay one row.
  const prefillApplied = useRef(false);
  useEffect(() => {
    if (prefillApplied.current) return;
    const params = new URLSearchParams(window.location.search);
    const qCustomerId = params.get("customerId");
    if (!qCustomerId) {
      prefillApplied.current = true;
      return;
    }
    // Wait until the synced customer list contains the row.
    if (!state.customers.some((c) => c.id === qCustomerId)) return;
    prefillApplied.current = true;
    const qOppId = params.get("oppId");
    const qTitle = params.get("title");
    setClientId(qCustomerId);
    setActiveCustomer(qCustomerId);
    if (qOppId) {
      setOppId(qOppId);
      setActiveOpportunity(qOppId);
    }
    if (qTitle) setJobTitle(qTitle);
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.customers]);

  // ── Customer step ───────────────────────────────────────────
  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return state.customers.slice(0, 8);
    return state.customers.filter((c) => c.displayName.toLowerCase().includes(q)).slice(0, 8);
  }, [clientQuery, state.customers]);
  const chosenCustomer = state.customers.find((c) => c.id === clientId) ?? null;

  function confirmClient() {
    let cid = clientId;
    let displayName = chosenCustomer?.displayName ?? clientQuery.trim();
    if (!cid) {
      if (!displayName) {
        toast.error("Pick a client or type a name to create one.");
        return;
      }
      cid = nanoid(8);
      addCustomer({
        id: cid, displayName, firstName: "", lastName: "", company: "", mobilePhone: "", homePhone: "",
        workPhone: "", email: "", role: "", customerType: "homeowner", doNotService: false, street: "",
        unit: "", city: "", state: "WA", zip: "", addressNotes: "", customerNotes: "", billsTo: "",
        tags: [], leadSource: "", referredBy: "", sendNotifications: true, sendMarketingOptIn: false,
        createdAt: new Date().toISOString(), lifetimeValue: 0, outstandingBalance: 0,
      });
      createCust.mutate({ displayName, firstName: "", lastName: "", email: "", mobilePhone: "", customerType: "homeowner", tags: [] });
      setClientId(cid);
    }
    setActiveCustomer(cid);
    if (!jobTitle) setJobTitle(`Estimate — ${displayName}`);
    setStep(1);
  }

  // ── Create the opportunity when work type is locked in ───────
  function confirmWorkType() {
    if (!workType) {
      toast.error("Pick what kind of work this is.");
      return;
    }
    const customer = state.customers.find((c) => c.id === clientId);
    const title = jobTitle.trim() || `Estimate — ${customer?.displayName ?? "Client"}`;
    let id = oppId;
    if (!id) {
      id = nanoid(8);
      const clientSnap = {
        client: customer?.displayName ?? "", companyName: "", phone: customer?.mobilePhone ?? "",
        email: customer?.email ?? "", address: customer?.street ?? "", city: customer?.city ?? "",
        state: customer?.state ?? "WA", zip: customer?.zip ?? "", jobType: "", scope: title,
      };
      addOpportunity({ id, area: "estimate", stage: "Draft", title, value: 0, notes: "", archived: false, clientSnapshot: clientSnap });
      // Same id locally and in the DB, so the portal estimate's hpOpportunityId
      // resolves to a real row (portal approval marks it Won, commissions join it).
      createOpp.mutate({
        id, customerId: clientId ?? "", area: "estimate", stage: "Draft", title, value: 0, notes: "",
        archived: false, clientSnapshot: JSON.stringify(clientSnap),
      });
      setOppId(id);
      setActiveOpportunity(id);
    }
    setJobInfo({ scope: title });
    setStep(2);
  }

  // ── Selection helpers ─────────────────────────────────────────
  function toggleItem(row: PbRow) {
    setSelection((s) => {
      if (s[row.itemKey]) {
        const next = { ...s };
        delete next[row.itemKey];
        return next;
      }
      const dq = parseFloat(row.defaultQty) || 1;
      return { ...s, [row.itemKey]: { qty: dq, tier: "good" } };
    });
  }

  /** Push the wizard's picks into the estimator engine (idempotent re-sync). */
  function applyToContext() {
    const nextApplied = new Set<string>();
    for (const [key, sel] of Object.entries(selection)) {
      const loc = CATALOG_INDEX.get(key);
      if (!loc) continue;
      updateItem(loc.phaseId, key, { enabled: sel.qty > 0, qty: sel.qty, tier: sel.tier });
      nextApplied.add(key);
    }
    for (const key of appliedRemodel.current) {
      if (nextApplied.has(key)) continue;
      const loc = CATALOG_INDEX.get(key);
      if (loc) updateItem(loc.phaseId, key, { enabled: false, qty: 0 });
    }
    appliedRemodel.current = nextApplied;

    // Custom items (maintenance + non-catalog rows): clear ours, re-add picks.
    for (const ci of state.customItems) {
      if (ci.notes?.startsWith("pricebook:")) removeCustomItem(ci.id);
    }
    for (const [key, sel] of Object.entries(selection)) {
      if (CATALOG_INDEX.has(key) || sel.qty <= 0) continue;
      const row = pbByKey.get(key);
      if (!row) continue;
      let matCost = 0;
      if (row.hasTiers && row.tiersJson) {
        try { matCost = Number(JSON.parse(row.tiersJson)?.[sel.tier]?.rate ?? 0); } catch { /* none */ }
      }
      addCustomItem({
        phaseId: 0,
        description: row.name,
        unitType: row.unitType as UnitType,
        qty: sel.qty,
        matCostPerUnit: matCost,
        laborHrsPerUnit: row.laborMode === "hr" ? parseFloat(row.hrsPerUnit) || 0 : 1,
        laborRate: row.laborMode === "hr" ? parseFloat(row.laborRate) || 0 : parseFloat(row.flatRatePerUnit) || 0,
        notes: `pricebook:${key}`,
        markupPct: null,
      });
    }
  }

  // ── Live pricing off the real engine ─────────────────────────
  const { phaseResults, customResults, totals } = useMemo(() => {
    const phaseResults = state.phases.map((p) => calcPhase(p, state.global));
    const customResults = state.customItems.map((ci) => calcCustomItem(ci, state.global));
    return { phaseResults, customResults, totals: calcTotals(phaseResults, customResults) };
  }, [state.phases, state.customItems, state.global]);
  const margin = computeMarginAudit(totals.totalHard, totals.totalPrice);

  const activePhaseData: ActivePhaseData[] = useMemo(() => {
    return state.phases
      .map((phase, idx) => {
        const activeItems = phase.items.filter((i) => i.enabled && i.qty > 0);
        if (activeItems.length === 0) return null;
        const bullets = bulletOverrides[String(phase.id)] ?? buildSowBullets(phase, activeItems);
        return { phase, result: phaseResults[idx], activeItems, bullets };
      })
      .filter((d): d is ActivePhaseData => d !== null);
  }, [state.phases, phaseResults, bulletOverrides]);

  const portalPhases = useMemo(
    () => buildPortalPhases(activePhaseData, state.customItems, customResults),
    [activePhaseData, state.customItems, customResults],
  );

  const selectedCount = Object.keys(selection).length;
  const customer = state.customers.find((c) => c.id === clientId);
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  function openFullCalculator() {
    applyToContext();
    setSection("calculator");
    markNavIntent();
    navigate("/os/pipeline");
  }

  function goToStep(n: number) {
    if (n >= 4) applyToContext();
    setStep(n);
  }

  async function polishPhase(d: ActivePhaseData) {
    try {
      const res = await rewritePhase.mutateAsync({
        phaseName: d.phase.name,
        phaseDescription: (d.phase as { description?: string }).description ?? "",
        bullets: d.bullets,
        jobTitle: jobTitle || "Project estimate",
        customerName: customer?.displayName ?? "Customer",
      });
      setBulletOverrides((s) => ({ ...s, [String(d.phase.id)]: res.bullets }));
      toast.success(`${d.phase.name} wording improved.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI rewrite failed");
    }
  }

  function openSend() {
    // The review screen IS the approval gate for the wizard flow.
    setEstimateProposal({ status: "ready_for_customer", approvedAt: new Date().toISOString() });
    if (oppId) {
      updateOpportunity(oppId, { value: Math.round(totals.totalPrice) });
      // Persist value + snapshot to the DB row so the server records the
      // authoritative margin audit (Rec 1) and commissions can read GP at sale.
      updateOpp.mutate({
        id: oppId,
        value: Math.round(totals.totalPrice),
        estimateSnapshot: JSON.stringify({
          jobInfo: state.jobInfo,
          global: state.global,
          phases: state.phases,
          customItems: state.customItems,
          totals,
        }),
      });
    }
    setShowSendDialog(true);
  }

  // ── UI bits ──────────────────────────────────────────────────
  const inputCls = "w-full text-sm px-3 py-2 rounded-lg border bg-white";
  const inputStyle = { borderColor: "var(--hp-hairline)" } as const;
  const primaryBtn = "text-sm px-5 py-2.5 rounded-lg font-semibold text-white disabled:opacity-40";

  const visibleRows = useMemo(() => {
    const q = itemQuery.trim().toLowerCase();
    return pbRows.filter((r) => {
      const isRemodel = r.kind === "remodel_stage" && CATALOG_INDEX.has(r.itemKey);
      if (workType === "remodel" && !isRemodel) return false;
      if (workType === "maintenance" && isRemodel) return false;
      if (q && !r.name.toLowerCase().includes(q) && !r.category.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [pbRows, workType, itemQuery]);

  const groupedRows = useMemo(() => {
    const map = new Map<string, PbRow[]>();
    for (const r of visibleRows) {
      const list = map.get(r.category) ?? [];
      list.push(r);
      map.set(r.category, list);
    }
    return [...map.entries()];
  }, [visibleRows]);

  return (
    <OsShell active="/os/pipeline">
      {/* Progress */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className="p-1 -ml-1" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </button>
        )}
        <span className="font-semibold" style={{ color: "var(--hp-ink)" }}>
          New estimate
        </span>
        <span>· step {step + 1} of {STEPS.length}: {STEPS[step]}</span>
        <Link href="/os/d/HP-SOP-204" className="ml-auto underline">
          How this works
        </Link>
      </div>
      <div className="flex gap-1 mt-2 mb-5">
        {STEPS.map((_, i) => (
          <div key={i} className="h-1 flex-1 rounded-full" style={{ background: i <= step ? "var(--hp-gold-deep)" : "var(--hp-hairline)" }} />
        ))}
      </div>

      {/* ── Step 1: client ─────────────────────────────────────── */}
      {step === 0 && (
        <div className="space-y-3 max-w-lg">
          <h1 className="hp-serif text-xl" style={{ color: "var(--hp-ink)" }}>Who is this estimate for?</h1>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <input
              className={inputCls + " pl-9"} style={inputStyle} autoFocus
              placeholder="Search clients or type a new name…"
              value={clientQuery}
              onChange={(e) => { setClientQuery(e.target.value); setClientId(null); }}
            />
          </div>
          <div className="bg-white rounded-xl border divide-y" style={inputStyle}>
            {matches.map((c) => (
              <button
                key={c.id} type="button"
                onClick={() => { setClientId(c.id); setClientQuery(c.displayName); }}
                className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-black/[0.03]"
              >
                <span className="text-sm" style={{ color: "var(--hp-ink)" }}>{c.displayName}</span>
                {clientId === c.id && <Check className="w-4 h-4" style={{ color: "var(--hp-gold-deep)" }} />}
              </button>
            ))}
            {matches.length === 0 && clientQuery.trim() && (
              <div className="px-4 py-3 text-sm text-muted-foreground">
                No match — continuing will create “{clientQuery.trim()}” as a new client.
              </div>
            )}
          </div>
          <button type="button" onClick={confirmClient} className={primaryBtn} style={{ background: "var(--hp-ink)" }}>
            Continue <ChevronRight className="w-4 h-4 inline -mt-0.5" />
          </button>
        </div>
      )}

      {/* ── Step 2: work type ──────────────────────────────────── */}
      {step === 1 && (
        <div className="space-y-3 max-w-lg">
          <h1 className="hp-serif text-xl" style={{ color: "var(--hp-ink)" }}>What kind of work is it?</h1>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {([
              { key: "remodel", label: "Remodel project", desc: "Stages: demo, drywall, flooring, trim…", icon: Hammer },
              { key: "maintenance", label: "Maintenance & repairs", desc: "Standing services from the price book.", icon: Wrench },
              { key: "both", label: "Both", desc: "A project plus service items.", icon: Check },
            ] as const).map((opt) => {
              const Icon = opt.icon;
              const on = workType === opt.key;
              return (
                <button
                  key={opt.key} type="button" onClick={() => setWorkType(opt.key)}
                  className={"text-left bg-white rounded-xl border p-4 transition-shadow " + (on ? "shadow-md" : "hover:shadow-sm")}
                  style={{ borderColor: on ? "var(--hp-gold-deep)" : "var(--hp-hairline)" }}
                >
                  <Icon className="w-5 h-5 mb-2" style={{ color: "var(--hp-gold-deep)" }} />
                  <div className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>{opt.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{opt.desc}</div>
                </button>
              );
            })}
          </div>
          <div>
            <label className="text-xs text-muted-foreground">Job title (what the customer sees)</label>
            <input className={inputCls} style={inputStyle} value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
          </div>
          <button type="button" onClick={confirmWorkType} className={primaryBtn} style={{ background: "var(--hp-ink)" }}>
            Continue <ChevronRight className="w-4 h-4 inline -mt-0.5" />
          </button>
          <Link href="/os/quickquote">
            <span className="block text-xs text-muted-foreground underline cursor-pointer mt-1">
              Whole-room remodel? Start with a quick quote instead.
            </span>
          </Link>
        </div>
      )}

      {/* ── Step 3: pick the work ──────────────────────────────── */}
      {step === 2 && (
        <div className="space-y-3">
          <h1 className="hp-serif text-xl" style={{ color: "var(--hp-ink)" }}>Pick everything the job includes</h1>
          <div className="relative max-w-lg">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-muted-foreground" />
            <input className={inputCls + " pl-9"} style={inputStyle} placeholder="Search the menu…" value={itemQuery} onChange={(e) => setItemQuery(e.target.value)} />
          </div>
          <div className="space-y-2">
            {groupedRows.map(([cat, items]) => (
              <details key={cat} open={!!itemQuery || items.some((r) => selection[r.itemKey])} className="bg-white rounded-xl border overflow-hidden" style={inputStyle}>
                <summary className="px-4 py-3 text-sm font-semibold cursor-pointer select-none flex items-center justify-between" style={{ color: "var(--hp-ink)" }}>
                  {cat}
                  <span className="text-xs font-normal text-muted-foreground">
                    {items.filter((r) => selection[r.itemKey]).length > 0 ? `${items.filter((r) => selection[r.itemKey]).length} picked · ` : ""}{items.length}
                  </span>
                </summary>
                <ul className="border-t" style={inputStyle}>
                  {items.map((r) => {
                    const on = !!selection[r.itemKey];
                    return (
                      <li key={r.itemKey} className="border-b last:border-b-0" style={inputStyle}>
                        <button type="button" onClick={() => toggleItem(r)} className="w-full px-4 py-2.5 flex items-center gap-3 text-left hover:bg-black/[0.02]">
                          <span
                            className="w-5 h-5 rounded border flex items-center justify-center shrink-0"
                            style={{ borderColor: on ? "var(--hp-gold-deep)" : "var(--hp-hairline)", background: on ? "var(--hp-gold-deep)" : "white" }}
                          >
                            {on && <Check className="w-3.5 h-3.5 text-white" />}
                          </span>
                          <span className="flex-1">
                            <span className="text-sm block" style={{ color: "var(--hp-ink)" }}>{r.name}</span>
                            <span className="text-xs text-muted-foreground">per {r.unitType}</span>
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </details>
            ))}
          </div>
          <div className="sticky bottom-20 md:bottom-4 flex justify-end">
            <button type="button" disabled={selectedCount === 0} onClick={() => setStep(3)} className={primaryBtn + " shadow-lg"} style={{ background: "var(--hp-ink)" }}>
              {selectedCount > 0 ? `Quantities (${selectedCount} item${selectedCount === 1 ? "" : "s"})` : "Pick at least one item"}
            </button>
          </div>
        </div>
      )}

      {/* ── Step 4: quantities & tiers ─────────────────────────── */}
      {step === 3 && (
        <div className="space-y-3 max-w-lg">
          <h1 className="hp-serif text-xl" style={{ color: "var(--hp-ink)" }}>How much of each?</h1>
          <div className="bg-white rounded-xl border divide-y" style={inputStyle}>
            {Object.entries(selection).map(([key, sel]) => {
              const row = pbByKey.get(key);
              if (!row) return null;
              let tierNames: Record<TierKey, string> | null = null;
              if (row.hasTiers && row.tiersJson) {
                try {
                  const t = JSON.parse(row.tiersJson);
                  tierNames = { good: t.good?.name || "Good", better: t.better?.name || "Better", best: t.best?.name || "Best" };
                } catch { /* none */ }
              }
              return (
                <div key={key} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm" style={{ color: "var(--hp-ink)" }}>{row.name}</span>
                    <span className="flex items-center gap-1">
                      <input
                        className="w-20 text-sm px-2 py-1.5 rounded-lg border text-right" style={inputStyle}
                        inputMode="decimal" value={sel.qty}
                        onChange={(e) => setSelection((s) => ({ ...s, [key]: { ...sel, qty: parseFloat(e.target.value) || 0 } }))}
                      />
                      <span className="text-xs text-muted-foreground w-10">{row.unitType}</span>
                    </span>
                  </div>
                  {tierNames && (
                    <div className="flex gap-1.5 mt-2">
                      {(["good", "better", "best"] as TierKey[]).map((t) => (
                        <button
                          key={t} type="button"
                          onClick={() => setSelection((s) => ({ ...s, [key]: { ...sel, tier: t } }))}
                          className={"text-xs px-2.5 py-1.5 rounded-lg border " + (sel.tier === t ? "font-semibold text-white" : "bg-white text-muted-foreground")}
                          style={sel.tier === t ? { background: "var(--hp-gold-deep)", borderColor: "var(--hp-gold-deep)" } : inputStyle}
                        >
                          {tierNames[t]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <button type="button" onClick={() => goToStep(4)} className={primaryBtn} style={{ background: "var(--hp-ink)" }}>
            Check the price <ChevronRight className="w-4 h-4 inline -mt-0.5" />
          </button>
        </div>
      )}

      {/* ── Step 5: price check (internal only) ─────────────────── */}
      {step === 4 && (
        <div className="space-y-3 max-w-lg">
          <h1 className="hp-serif text-xl" style={{ color: "var(--hp-ink)" }}>Price check</h1>
          <p className="text-xs text-muted-foreground -mt-1">Internal view. The customer never sees costs or margin.</p>
          <div className="bg-white rounded-xl border divide-y" style={inputStyle}>
            {portalPhases.map((p) => (
              <div key={p.phaseName} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--hp-ink)" }}>{p.phaseName}</span>
                <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>{fmt(p.phaseTotal)}</span>
              </div>
            ))}
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>Customer total</span>
              <span className="text-base font-bold" style={{ color: "var(--hp-ink)" }}>{fmt(totals.totalPrice)}</span>
            </div>
          </div>

          {/* Margin meter */}
          <div
            className="rounded-xl border p-4"
            style={{
              borderColor: margin.status === "below_floor" ? "#fca5a5" : margin.status === "warn" ? "#fcd34d" : "var(--hp-hairline)",
              background: margin.status === "below_floor" ? "#fef2f2" : margin.status === "warn" ? "#fffbeb" : "white",
            }}
          >
            <div className="flex items-center justify-between text-sm">
              <span className="font-semibold" style={{ color: "var(--hp-ink)" }}>Margin</span>
              <span className="font-bold" style={{ color: margin.status === "below_floor" ? "#b91c1c" : margin.status === "warn" ? "#b45309" : "#15803d" }}>
                {(margin.gm * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-2 rounded-full bg-gray-100 mt-2 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(4, margin.gm * 100))}%`,
                  background: margin.status === "below_floor" ? "#dc2626" : margin.status === "warn" ? "#f59e0b" : "#16a34a",
                }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              {margin.status === "below_floor"
                ? `Below the ${(margin.minGM * 100).toFixed(0)}% floor for this job size. Raise the price or trim cost — sending will be blocked.`
                : margin.status === "warn"
                  ? "Above the floor but thin. Worth a second look."
                  : `Healthy. Floor for this job size is ${(margin.minGM * 100).toFixed(0)}%.`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStep(5)} className={primaryBtn} style={{ background: "var(--hp-ink)" }}>
              Looks right — review wording <ChevronRight className="w-4 h-4 inline -mt-0.5" />
            </button>
            <button type="button" onClick={openFullCalculator} className="text-xs px-3 py-2 rounded-lg border font-semibold" style={{ ...inputStyle, color: "var(--hp-ink)" }}>
              Open full calculator
            </button>
          </div>
        </div>
      )}

      {/* ── Step 6: review & send (customer-facing) ─────────────── */}
      {step === 5 && (
        <div className="space-y-3 max-w-lg">
          <h1 className="hp-serif text-xl" style={{ color: "var(--hp-ink)" }}>What the customer will see</h1>
          {portalPhases.map((p) => {
            const phaseData = activePhaseData.find((d) => d.phase.name === p.phaseName);
            return (
              <div key={p.phaseName} className="bg-white rounded-xl border p-4" style={inputStyle}>
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>{p.phaseName}</h2>
                  <span className="text-sm font-semibold shrink-0" style={{ color: "var(--hp-ink)" }}>{fmt(p.phaseTotal)}</span>
                </div>
                <ul className="mt-2 space-y-1.5">
                  {p.items.map((it, i) => (
                    <li key={i} className="text-xs text-muted-foreground leading-relaxed">• {it.scopeOfWork || it.name}</li>
                  ))}
                </ul>
                {phaseData && brainHealth.data?.ok && (
                  <button
                    type="button"
                    disabled={rewritePhase.isPending}
                    onClick={() => polishPhase(phaseData)}
                    className="mt-3 flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border font-semibold disabled:opacity-40"
                    style={{ ...inputStyle, color: "var(--hp-gold-deep)" }}
                  >
                    <Sparkles className="w-3.5 h-3.5" /> {rewritePhase.isPending ? "Improving…" : "Improve wording"}
                  </button>
                )}
              </div>
            );
          })}
          <div className="bg-white rounded-xl border px-4 py-3 flex items-center justify-between" style={inputStyle}>
            <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>Total investment</span>
            <span className="text-base font-bold" style={{ color: "var(--hp-ink)" }}>{fmt(totals.totalPrice)}</span>
          </div>
          {/* Sold-by attribution (internal); hidden until consultants exist */}
          {(consultantsQuery.data?.length ?? 0) > 0 && (
            <div className="bg-white rounded-xl border px-4 py-3 flex items-center justify-between gap-3" style={inputStyle}>
              <span className="text-sm" style={{ color: "var(--hp-ink)" }}>Sold by</span>
              <select
                className="text-sm px-2 py-1.5 rounded-lg border bg-white"
                style={inputStyle}
                value={soldByConsultantId ?? ""}
                onChange={(e) => setSoldByConsultantId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">House / Marcin</option>
                {consultantsQuery.data!.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          )}
          <button type="button" onClick={openSend} className={primaryBtn + " w-full"} style={{ background: "var(--hp-gold-deep)" }}>
            Send to {customer?.displayName ?? "customer"}
          </button>
        </div>
      )}

      {showSendDialog && (
        <SendEstimateDialog
          estimateNumber={state.jobInfo.jobNumber || `HP-${Date.now().toString().slice(-6)}`}
          customerName={customer?.displayName ?? "Customer"}
          jobTitle={jobTitle || "Project Estimate"}
          totalPrice={totals.totalPrice}
          depositLabel={`50% deposit (${fmt(totals.totalPrice / 2)})`}
          depositAmount={totals.totalPrice / 2}
          scopeSummary={jobTitle}
          lineItemsText={portalPhases.map((p) => `${p.phaseName}\n${p.items.map((i) => `  • ${i.scopeOfWork || i.name}`).join("\n")}\n  Investment: ${fmt(p.phaseTotal)}`).join("\n\n")}
          lineItemsJson={JSON.stringify(portalPhases)}
          hpCustomerId={customer?.id}
          hpOpportunityId={oppId ?? undefined}
          isCustomerReady
          approvalStatusLabel="ready for customer"
          defaultEmail={customer?.email || ""}
          defaultPhone={customer?.mobilePhone || ""}
          onClose={() => setShowSendDialog(false)}
          onSent={() => {
            if (oppId) updateOpportunity(oppId, { sentAt: new Date().toISOString() });
            if (oppId && soldByConsultantId != null) {
              setSoldBy.mutate({ opportunityId: oppId, consultantId: soldByConsultantId });
            }
            toast.success("Estimate sent.");
            navigate("/os/pipeline");
          }}
        />
      )}
    </OsShell>
  );
}
