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
import { Link, useLocation, useRoute } from "wouter";
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
import { resolveTax } from "@/lib/tax";
import { getTaxRateForZip } from "@/lib/taxRates";
import { computeMarginAudit } from "@shared/marginFloor";
import { buildEstimateSnapshotForDb } from "@/lib/estimateSnapshot";
import { isUnpricedSpotItem, seedCustomsFromSpotFindings } from "@/lib/spotPrefill";
import { CustomItemRow } from "@/components/sections/CustomItemRow";
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
    setEstimateProposal, setEstimateAudit, updateOpportunity, setGlobal,
  } = useEstimator();
  useDbSync(true);

  // /os/estimate/:oppId resumes an existing estimate in the wizard
  // (/os/estimate/new keeps minting fresh ones).
  const [resumeMatch, resumeParams] = useRoute("/os/estimate/:oppId");
  const resumeOppId = resumeMatch && resumeParams.oppId !== "new" ? resumeParams.oppId : null;

  const [step, setStep] = useState(0);
  const [oppId, setOppId] = useState<string | null>(null);
  /** Reference notes from the loaded opportunity (e.g. spot-inspection findings). */
  const [loadedNotes, setLoadedNotes] = useState("");

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

  // Step 5 — margin floor: a typed-reason override is the only way past
  // a below-floor price (the server backstop still requires the flag).
  const [floorOverrideReason, setFloorOverrideReason] = useState("");
  const [floorOverridden, setFloorOverridden] = useState(false);

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
  const sendEstimate = trpc.estimate.send.useMutation();

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

  // ── Resume an existing estimate (/os/estimate/:oppId) ────────
  // Phase A: once the DB row + synced customer are available, activate the
  // customer and opportunity — the reducer restores the estimate snapshot
  // into working state. Phase B: rebuild the wizard's picks from that state.
  const resumeQuery = trpc.opportunities.get.useQuery(
    { id: resumeOppId ?? "" },
    { enabled: !!resumeOppId, retry: false },
  );
  const resumePhase = useRef<"activate" | "reconstruct" | "done">("activate");
  useEffect(() => {
    if (!resumeOppId || resumePhase.current !== "activate") return;
    const dbOpp = resumeQuery.data;
    if (!dbOpp) return;
    const customerId = (dbOpp as { customerId?: string }).customerId ?? "";
    // Wait for the once-per-session DB sync to land the customer (and its
    // opportunities, snapshots included) in local state.
    if (!state.customers.some((c) => c.id === customerId)) return;
    resumePhase.current = "reconstruct";
    setClientId(customerId);
    setOppId(resumeOppId);
    setJobTitle(dbOpp.title || "");
    setLoadedNotes(dbOpp.notes ?? "");
    setActiveCustomer(customerId);
    setActiveOpportunity(resumeOppId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeOppId, resumeQuery.data, state.customers]);

  useEffect(() => {
    if (!resumeOppId || resumePhase.current !== "reconstruct") return;
    if (state.activeOpportunityId !== resumeOppId) return;
    resumePhase.current = "done";
    // Rebuild the wizard selection from the hydrated estimator state.
    const sel: Record<string, Sel> = {};
    let hasCatalog = false;
    let hasPricebook = false;
    for (const p of state.phases) {
      for (const i of p.items) {
        if (!i.enabled || i.qty <= 0) continue;
        sel[i.id] = { qty: i.qty, tier: (i.tier as TierKey) ?? "good" };
        appliedRemodel.current.add(i.id);
        hasCatalog = true;
      }
    }
    for (const ci of state.customItems) {
      if (!ci.notes?.startsWith("pricebook:")) continue;
      const key = ci.notes.slice("pricebook:".length);
      // Best-effort tier recovery: match the saved material cost to a tier rate.
      let tier: TierKey = "good";
      const row = pbByKey.get(key);
      if (row?.hasTiers && row.tiersJson) {
        try {
          const tiers = JSON.parse(row.tiersJson);
          for (const t of ["good", "better", "best"] as TierKey[]) {
            if (Number(tiers?.[t]?.rate ?? NaN) === ci.matCostPerUnit) { tier = t; break; }
          }
        } catch { /* keep good */ }
      }
      sel[key] = { qty: ci.qty, tier };
      hasPricebook = true;
    }
    setSelection(sel);
    setWorkType(hasCatalog && hasPricebook ? "both" : hasPricebook ? "maintenance" : "remodel");
    // Priced estimates land on the price check; blank (spot-born) drafts
    // start at the work-type step with the findings shown for reference.
    setStep(Object.keys(sel).length > 0 ? 4 : 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resumeOppId, state.activeOpportunityId, state.phases, state.customItems]);

  // ── Spot-inspection seed: preload the wizard from the findings ──
  // The adopted opportunity may carry spotFindings (structured transfer
  // from createOpportunityFromFindings). Findings that confidently match a
  // price-book row become selections; the rest become zero-cost custom
  // lines flagged "needs pricing", priced on the price-check step.
  const spotSeedApplied = useRef(false);
  useEffect(() => {
    if (spotSeedApplied.current || !oppId || state.activeOpportunityId !== oppId) return;
    if (pbQuery.isLoading) return;
    const opp = state.opportunities.find((o) => o.id === oppId);
    const seed = opp?.spotFindings;
    if (!seed?.findings?.length) {
      spotSeedApplied.current = true;
      return;
    }
    // Only seed a blank estimate: existing picks or spot customs mean the
    // consultant (or an earlier visit to this page) already started.
    const hasPicks =
      Object.keys(selection).length > 0 ||
      state.phases.some((p) => p.items.some((i) => i.enabled && i.qty > 0)) ||
      state.customItems.some((ci) => ci.notes?.startsWith("spot:") || ci.notes?.startsWith("pricebook:"));
    spotSeedApplied.current = true;
    if (hasPicks) return;
    // One editable line per finding, each priced from its inspection range
    // at the global margin, so they land ready rather than "needs pricing".
    const customs = seedCustomsFromSpotFindings(seed.findings, seed.spotInspectionId, state.global.markupPct);
    for (const custom of customs) {
      addCustomItem({
        phaseId: 0,
        description: custom.description,
        unitType: custom.unitType as UnitType,
        qty: custom.qty,
        matCostPerUnit: custom.matCostPerUnit,
        laborHrsPerUnit: custom.laborHrsPerUnit,
        laborRate: custom.laborRate,
        notes: custom.notes,
        markupPct: null,
      });
    }
    if (!workType) setWorkType("maintenance");
    // Reference panel: what the visit found, shown above the price check.
    setLoadedNotes(seed.findings.map((f) => `• ${f.category}: ${f.finding}`).join("\n"));
    // Land on the price check so every carried line is visible at once.
    setStep(4);
    const n = customs.length;
    const unpriced = customs.filter((c) => c.notes.includes("needs-pricing")).length;
    toast.success(
      unpriced > 0
        ? `${n} item${n === 1 ? "" : "s"} carried from the inspection. Price the ${unpriced} flagged line${unpriced === 1 ? "" : "s"}.`
        : `${n} item${n === 1 ? "" : "s"} carried from the inspection. Review and send.`,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [oppId, state.activeOpportunityId, state.opportunities, pbQuery.isLoading, pbRows]);

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

  const belowFloor = margin.status === "below_floor";
  function confirmFloorOverride() {
    const reason = floorOverrideReason.trim();
    if (reason.length < 5) {
      toast.error("Type the reason for sending below the floor.");
      return;
    }
    setFloorOverridden(true);
    setEstimateAudit({
      history: [
        {
          id: nanoid(8),
          type: "margin_override",
          title: "Margin floor overridden",
          summary: reason,
          createdAt: new Date().toISOString(),
          actor: state.userProfile.firstName || state.userProfile.email || "Consultant",
        },
        ...state.estimateAudit.history,
      ],
    });
  }

  // Sales tax (customer-safe): resolved from the working globals, which the
  // context points at the customer's ZIP. Snapshots that saved tax OFF keep
  // it — the price-check chip is the explicit way to turn it back on.
  const tax = resolveTax(state.global, totals.totalPrice);
  const grandTotal = tax?.grandTotal ?? totals.totalPrice;
  function enableTax() {
    const zip = customer?.zip || state.jobInfo.zip;
    const zipInfo = zip ? getTaxRateForZip(zip) : null;
    setGlobal({ taxEnabled: true, ...(zipInfo ? { taxRateCode: zipInfo.code } : {}) });
  }

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

  // Spot-inspection lines get their own editable section on the price check,
  // so the phase-totals list there excludes them to avoid showing them twice.
  // The customer-facing review (step 6) still uses the full portalPhases.
  const priceCheckPhases = useMemo(() => {
    const items = state.customItems.filter((ci) => !ci.notes?.startsWith("spot:"));
    const ids = new Set(items.map((i) => i.id));
    const results = customResults.filter((r) => ids.has(r.id));
    return buildPortalPhases(activePhaseData, items, results);
  }, [activePhaseData, state.customItems, customResults]);
  const spotItems = useMemo(
    () => state.customItems.filter((ci) => ci.notes?.startsWith("spot:")),
    [state.customItems],
  );
  const seedFindings = useMemo(
    () => state.opportunities.find((o) => o.id === oppId)?.spotFindings?.findings ?? [],
    [state.opportunities, oppId],
  );
  // The AI planning range behind a seeded line (notes: spot:<id>:<idx>), shown
  // as a hint so the consultant can price toward the high end if warranted.
  function spotRangeFor(ci: { notes?: string }): { low: number; high: number } | null {
    const parts = (ci.notes ?? "").split(":");
    if (parts[0] !== "spot" || parts.length < 3) return null;
    const idx = parseInt(parts[2], 10);
    const f = Number.isFinite(idx) ? seedFindings[idx] : undefined;
    return f && (f.low > 0 || f.high > 0) ? { low: f.low, high: f.high } : null;
  }
  // A spot-origin estimate keeps the "From the inspection" editor available
  // even if every seeded line has been deleted, so the consultant can still
  // add lines. Normal estimates never show it.
  const isSpotEstimate = useMemo(() => {
    const opp = state.opportunities.find((o) => o.id === oppId);
    return !!opp?.spotFindings?.findings?.length || spotItems.length > 0;
  }, [state.opportunities, oppId, spotItems.length]);

  function addSpotLine() {
    addCustomItem({
      phaseId: 0,
      description: "New line item",
      unitType: "unit" as UnitType,
      qty: 1,
      matCostPerUnit: 0,
      laborHrsPerUnit: 1,
      laborRate: 0,
      notes: `spot:manual:${Date.now()} needs-pricing`,
      markupPct: null,
    });
  }

  const selectedCount = Object.keys(selection).length;
  const customer = state.customers.find((c) => c.id === clientId);
  const fmt = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

  // Deposit mirrors the full calculator (EstimateSection): the configured
  // deposit policy off the pre-tax total, not a hardcoded 50%. Both paths
  // then present and invoice the same deposit.
  const depositAmount = state.depositType === "pct"
    ? (totals.totalPrice * state.depositValue) / 100
    : state.depositValue;
  const depositLabel = state.depositType === "pct"
    ? `${state.depositValue}% deposit required to schedule work; balance due upon project completion`
    : `$${state.depositValue.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} deposit required to schedule work; balance due upon project completion`;

  // ── Open full calculator (lossless hand-off) ─────────────────
  // applyToContext dispatches into the reducer, so the picks land in
  // state.phases/customItems one render later. The pending flag waits for
  // that render, persists the snapshot to the DB row (a Room remount —
  // StrictMode double-mount, slow lazy chunk — can reset working state, and
  // the DB copy is what survives), THEN navigates.
  const [pendingCalcNav, setPendingCalcNav] = useState(false);
  function openFullCalculator() {
    applyToContext();
    setPendingCalcNav(true);
  }
  useEffect(() => {
    if (!pendingCalcNav) return;
    const reflectsSelection = Object.entries(selection).every(([key, sel]) => {
      if (sel.qty <= 0) return true;
      const loc = CATALOG_INDEX.get(key);
      if (loc) {
        const item = state.phases.find((p) => p.id === loc.phaseId)?.items.find((i) => i.id === key);
        return !!item && item.enabled && item.qty === sel.qty;
      }
      return state.customItems.some((ci) => ci.notes === `pricebook:${key}`);
    });
    if (!reflectsSelection) return;
    setPendingCalcNav(false);
    if (oppId) {
      updateOpp.mutate({
        id: oppId,
        value: Math.round(totals.totalPrice),
        estimateSnapshot: JSON.stringify({ ...buildEstimateSnapshotForDb(state), totals }),
      });
    }
    setSection("calculator");
    markNavIntent();
    navigate("/os/pipeline");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCalcNav, state.phases, state.customItems]);

  function goToStep(n: number) {
    if (n >= 4) applyToContext();
    setStep(n);
  }

  // ── Price-check adjustments ──────────────────────────────────
  // Changing qty or tier on the price check re-syncs the engine one render
  // later (applyToContext reads `selection`, so it must run after the state
  // update lands). Totals and the margin meter recompute live.
  const priceCheckDirty = useRef(false);
  function adjustSelection(key: string, patch: Partial<Sel>) {
    setSelection((s) => {
      const cur = s[key];
      if (!cur) return s;
      return { ...s, [key]: { ...cur, ...patch } };
    });
    priceCheckDirty.current = true;
  }
  useEffect(() => {
    if (!priceCheckDirty.current) return;
    priceCheckDirty.current = false;
    applyToContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selection]);

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

  // The review screen IS the approval gate for the wizard flow. Both the
  // present-on-site path and the email path stamp readiness + persist the
  // snapshot first so the server's margin backstop reads a fresh belowFloor.
  async function persistApprovalSnapshot() {
    const approvedAt = new Date().toISOString();
    const readyProposal = { ...state.estimateProposal, status: "ready_for_customer" as const, approvedAt };
    setEstimateProposal({ status: "ready_for_customer", approvedAt });
    if (oppId) {
      updateOpportunity(oppId, { value: Math.round(totals.totalPrice) });
      try {
        await updateOpp.mutateAsync({
          id: oppId,
          value: Math.round(totals.totalPrice),
          estimateSnapshot: JSON.stringify({
            jobInfo: state.jobInfo,
            global: state.global,
            phases: state.phases,
            customItems: state.customItems,
            depositType: state.depositType,
            depositValue: state.depositValue,
            proposal: readyProposal,
            totals,
          }),
        });
      } catch {
        // onError already warned; local state is intact and the server
        // backstop falls back to the last persisted audit.
      }
    }
  }

  async function openSend() {
    await persistApprovalSnapshot();
    setShowSendDialog(true);
  }

  /**
   * Present on the iPad now without emailing the customer. Creates the
   * portal estimate record silently (so the close flow can present it and
   * take a deposit on site) and drops straight into the close flow. Nothing
   * reaches the customer's inbox until you choose to email it later.
   */
  async function presentNow() {
    if (!customer?.email) {
      toast.error("Add an email to this client first — the on-site presentation runs through their portal record.");
      return;
    }
    if (state.customItems.some(isUnpricedSpotItem)) {
      toast.error("Price every line before presenting.");
      return;
    }
    await persistApprovalSnapshot();
    try {
      await sendEstimate.mutateAsync({
        sendEmail: false,
        sendSms: false,
        toEmail: customer.email,
        estimateNumber: state.jobInfo.jobNumber || `HP-${Date.now().toString().slice(-6)}`,
        customerName: customer.displayName ?? "Customer",
        jobTitle: jobTitle || "Project Estimate",
        totalPrice: totals.totalPrice,
        depositLabel,
        depositAmount,
        scopeSummary: jobTitle,
        lineItemsText: portalPhases.map((p) => `${p.phaseName}\n${p.items.map((i) => `  • ${i.scopeOfWork || i.name}`).join("\n")}\n  Investment: ${fmt(p.phaseTotal)}`).join("\n\n"),
        lineItemsJson: JSON.stringify(portalPhases),
        taxEnabled: state.global.taxEnabled,
        taxRateCode: state.global.taxRateCode,
        customTaxPct: state.global.customTaxPct,
        taxAmount: tax?.taxAmount,
        hpCustomerId: customer.id,
        hpOpportunityId: oppId ?? undefined,
        overrideMarginFloor: floorOverridden || undefined,
      });
    } catch (e) {
      toast.error((e as Error).message || "Could not prepare the estimate for presentation");
      return;
    }
    if (oppId) updateOpportunity(oppId, { stage: "Sent", sentAt: new Date().toISOString() });
    if (oppId && soldByConsultantId != null) {
      setSoldBy.mutate({ opportunityId: oppId, consultantId: soldByConsultantId });
    }
    const propertyId = state.opportunities.find((o) => o.id === oppId)?.propertyId;
    navigate(`/os/close/${customer.id}${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`);
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

      {/* Reference notes from the source opportunity (spot-inspection findings, scope) */}
      {loadedNotes.trim() !== "" && step >= 1 && step <= 4 && (
        <details open={step <= 2} className="bg-white rounded-xl border mb-4 max-w-lg overflow-hidden" style={inputStyle}>
          <summary className="px-4 py-2.5 text-xs font-semibold cursor-pointer select-none" style={{ color: "var(--hp-gold-deep)" }}>
            What we found on site
          </summary>
          <p className="px-4 pb-3 text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">{loadedNotes}</p>
        </details>
      )}

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

          {/* Adjustable lines: qty and tier move the total and margin live. */}
          {Object.keys(selection).length > 0 && (
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
                <div key={key} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm flex-1 min-w-0 truncate" style={{ color: "var(--hp-ink)" }}>{row.name}</span>
                    <span className="flex items-center gap-1 shrink-0">
                      <button
                        type="button" aria-label="Less"
                        onClick={() => adjustSelection(key, { qty: Math.max(0, sel.qty - 1) })}
                        className="w-7 h-7 rounded-lg border text-sm font-semibold"
                        style={{ ...inputStyle, color: "var(--hp-ink)" }}
                      >
                        −
                      </button>
                      <input
                        className="w-16 text-sm px-2 py-1 rounded-lg border text-right" style={inputStyle}
                        inputMode="decimal" value={sel.qty}
                        onChange={(e) => adjustSelection(key, { qty: parseFloat(e.target.value) || 0 })}
                      />
                      <button
                        type="button" aria-label="More"
                        onClick={() => adjustSelection(key, { qty: sel.qty + 1 })}
                        className="w-7 h-7 rounded-lg border text-sm font-semibold"
                        style={{ ...inputStyle, color: "var(--hp-ink)" }}
                      >
                        +
                      </button>
                      <span className="text-xs text-muted-foreground w-9">{row.unitType}</span>
                    </span>
                  </div>
                  {tierNames && (
                    <div className="flex gap-1.5 mt-1.5">
                      {(["good", "better", "best"] as TierKey[]).map((t) => (
                        <button
                          key={t} type="button"
                          onClick={() => adjustSelection(key, { tier: t })}
                          className={"text-xs px-2.5 py-1 rounded-lg border " + (sel.tier === t ? "font-semibold text-white" : "bg-white text-muted-foreground")}
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
          )}

          {/* From the inspection: one line per finding, priced with the same
              engine the full calculator uses (material + labor + gross-margin
              → customer price). Edit wording, costs, margin; delete; add more.
              A line with no cost yet is flagged and opens expanded. */}
          {isSpotEstimate && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h2 className="hp-eyebrow text-xs" style={{ color: "var(--hp-gold-deep)" }}>
                  From the inspection
                </h2>
                <button type="button" onClick={addSpotLine} className="text-xs font-semibold underline" style={{ color: "var(--hp-ink)" }}>
                  + Add a line
                </button>
              </div>
              {spotItems.map((ci) => {
                const range = spotRangeFor(ci);
                return (
                  <div key={ci.id}>
                    <CustomItemRow ci={ci} lockNotes defaultExpanded={isUnpricedSpotItem(ci)} />
                    {range && (
                      <p className="text-[11px] -mt-2 mb-1 ml-1 text-muted-foreground">
                        Inspection range: {fmt(range.low)} to {fmt(range.high)}. Starts at the midpoint; adjust to fit the scope.
                      </p>
                    )}
                    {isUnpricedSpotItem(ci) && (
                      <p className="text-[11px] font-semibold mb-3 ml-1" style={{ color: "#b91c1c" }}>
                        Needs a price: open this line and set material and labor, or a cost per unit.
                      </p>
                    )}
                  </div>
                );
              })}
              {spotItems.length === 0 && (
                <div className="bg-white rounded-xl border px-4 py-3 text-xs text-muted-foreground" style={inputStyle}>
                  No line items yet. Add one, or go back and pick the work.
                </div>
              )}
            </div>
          )}

          <div className="bg-white rounded-xl border divide-y" style={inputStyle}>
            {priceCheckPhases.map((p) => (
              <div key={p.phaseName} className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm" style={{ color: "var(--hp-ink)" }}>{p.phaseName}</span>
                <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>{fmt(p.phaseTotal)}</span>
              </div>
            ))}
            {tax && (
              <div className="px-4 py-3 flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sales tax ({tax.label})</span>
                <span className="text-sm" style={{ color: "var(--hp-ink)" }}>{fmt(tax.taxAmount)}</span>
              </div>
            )}
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>Customer total</span>
              <span className="text-base font-bold" style={{ color: "var(--hp-ink)" }}>{fmt(grandTotal)}</span>
            </div>
          </div>

          {!tax && (
            <button
              type="button"
              onClick={enableTax}
              className="w-full text-left rounded-xl border px-4 py-3 flex items-center justify-between"
              style={{ borderColor: "#fca5a5", background: "#fef2f2" }}
            >
              <span className="text-sm font-semibold" style={{ color: "#b91c1c" }}>Tax is OFF</span>
              <span className="text-xs font-semibold" style={{ color: "#b91c1c" }}>Tap to add sales tax</span>
            </button>
          )}

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
                ? `Below the ${(margin.minGM * 100).toFixed(0)}% floor for this job size. Raise the price or trim cost — continuing is blocked.`
                : margin.status === "warn"
                  ? "Above the floor but thin. Worth a second look."
                  : `Healthy. Floor for this job size is ${(margin.minGM * 100).toFixed(0)}%.`}
            </p>

            {/* Hard block: a typed reason is the only way past the floor. */}
            {belowFloor && !floorOverridden && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: "#fca5a5" }}>
                <label className="text-xs font-semibold" style={{ color: "#b91c1c" }}>
                  Override (logged): why is this price right anyway?
                </label>
                <textarea
                  className="w-full text-sm px-3 py-2 rounded-lg border bg-white mt-1"
                  style={{ borderColor: "#fca5a5" }}
                  rows={2}
                  placeholder="e.g. Strategic first job for a founding member; materials already on hand."
                  value={floorOverrideReason}
                  onChange={(e) => setFloorOverrideReason(e.target.value)}
                />
                <button
                  type="button"
                  onClick={confirmFloorOverride}
                  disabled={floorOverrideReason.trim().length < 5}
                  className="mt-1.5 text-xs px-3 py-2 rounded-lg font-semibold text-white disabled:opacity-40"
                  style={{ background: "#b91c1c" }}
                >
                  Override the floor with this reason
                </button>
              </div>
            )}
            {belowFloor && floorOverridden && (
              <p className="text-xs font-semibold mt-2" style={{ color: "#b91c1c" }}>
                Floor overridden — the reason is logged on this estimate.
              </p>
            )}
          </div>

          {state.customItems.some(isUnpricedSpotItem) && (
            <p className="text-xs font-semibold" style={{ color: "#b91c1c" }}>
              Price the flagged spot-inspection lines before continuing.
            </p>
          )}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setStep(5)}
              disabled={(belowFloor && !floorOverridden) || state.customItems.some(isUnpricedSpotItem)}
              className={primaryBtn}
              style={{ background: "var(--hp-ink)" }}
            >
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
          <div className="bg-white rounded-xl border divide-y" style={inputStyle}>
            {tax && (
              <>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Subtotal</span>
                  <span className="text-sm" style={{ color: "var(--hp-ink)" }}>{fmt(totals.totalPrice)}</span>
                </div>
                <div className="px-4 py-2.5 flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Sales tax ({tax.label})</span>
                  <span className="text-sm" style={{ color: "var(--hp-ink)" }}>{fmt(tax.taxAmount)}</span>
                </div>
              </>
            )}
            <div className="px-4 py-3 flex items-center justify-between">
              <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>Total investment</span>
              <span className="text-base font-bold" style={{ color: "var(--hp-ink)" }}>{fmt(grandTotal)}</span>
            </div>
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
          <button
            type="button"
            onClick={presentNow}
            disabled={sendEstimate.isPending}
            className={primaryBtn + " w-full"}
            style={{ background: "var(--hp-gold-deep)" }}
          >
            {sendEstimate.isPending ? "Preparing…" : "Present on iPad now"}
          </button>
          <p className="text-[11px] text-center text-muted-foreground -mt-1">
            Opens the on-site close. Nothing is emailed to {customer?.displayName ?? "the customer"} until you choose to.
          </p>
          <button
            type="button"
            onClick={openSend}
            className="w-full text-sm px-5 py-2.5 rounded-lg border font-semibold"
            style={{ ...inputStyle, color: "var(--hp-ink)" }}
          >
            Email it to {customer?.displayName ?? "the customer"} instead
          </button>
        </div>
      )}

      {showSendDialog && (
        <SendEstimateDialog
          estimateNumber={state.jobInfo.jobNumber || `HP-${Date.now().toString().slice(-6)}`}
          customerName={customer?.displayName ?? "Customer"}
          jobTitle={jobTitle || "Project Estimate"}
          totalPrice={totals.totalPrice}
          depositLabel={depositLabel}
          depositAmount={depositAmount}
          taxEnabled={state.global.taxEnabled}
          taxRateCode={state.global.taxRateCode}
          customTaxPct={state.global.customTaxPct}
          taxAmount={tax?.taxAmount}
          scopeSummary={jobTitle}
          lineItemsText={portalPhases.map((p) => `${p.phaseName}\n${p.items.map((i) => `  • ${i.scopeOfWork || i.name}`).join("\n")}\n  Investment: ${fmt(p.phaseTotal)}`).join("\n\n")}
          lineItemsJson={JSON.stringify(portalPhases)}
          hpCustomerId={customer?.id}
          hpOpportunityId={oppId ?? undefined}
          overrideMarginFloor={floorOverridden || undefined}
          isCustomerReady
          approvalStatusLabel="ready for customer"
          defaultEmail={customer?.email || ""}
          defaultPhone={customer?.mobilePhone || ""}
          onClose={() => setShowSendDialog(false)}
          onSent={() => {
            // Mirror the server: estimate.send moves the DB row to Sent.
            if (oppId) updateOpportunity(oppId, { stage: "Sent", sentAt: new Date().toISOString() });
            if (oppId && soldByConsultantId != null) {
              setSoldBy.mutate({ opportunityId: oppId, consultantId: soldByConsultantId });
            }
            const cid = customer?.id;
            if (cid) {
              const propertyId = state.opportunities.find((o) => o.id === oppId)?.propertyId;
              const closeHref = `/os/close/${cid}${propertyId ? `?propertyId=${encodeURIComponent(propertyId)}` : ""}`;
              // One tap from "synced" to standing in front of the client:
              // the close flow picks up the portal estimate for sign + pay.
              toast.success("Estimate sent.", {
                duration: 10000,
                action: { label: "Present now", onClick: () => navigate(closeHref) },
              });
            } else {
              toast.success("Estimate sent.");
            }
            navigate("/os/pipeline");
          }}
        />
      )}
    </OsShell>
  );
}
