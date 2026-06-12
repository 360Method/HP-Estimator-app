/**
 * OsQuickQuote: the Step 8 on-site remodel consultation (/os/quickquote).
 *
 * The consultant measures the room, picks the room type, and turns the
 * screen toward the customer: three quality tiers with honest retail ranges,
 * computed live from the editable presets in the price book. Built to close
 * on-site; "Firm up this scope" hands off to the estimate wizard where the
 * margin audit and the portal sign-and-approve flow finish the job.
 *
 * Everything on this screen is customer-safe: retail ranges only, no costs,
 * no markup, no internal tier codes.
 */
import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { nanoid } from "nanoid";
import { Ruler, Sparkles, ChevronRight } from "lucide-react";
import { OsShell } from "../OsShell";
import { useAuth } from "@/_core/hooks/useAuth";
import { useEstimator } from "@/contexts/EstimatorContext";
import { useDbSync } from "@/hooks/useDbSync";
import { MethodContextBanner } from "@/components/threeSixty/MethodContextBanner";
import {
  computeQuickQuote,
  presetFromRow,
  type QuotePreset,
  type QuoteTierKey,
} from "@shared/remodelQuickQuote";
import { TIER_DEFINITIONS, type MemberTier } from "@shared/threeSixtyTiers";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function OsQuickQuote() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { state, addOpportunity, setActiveCustomer, setActiveOpportunity } = useEstimator();
  useDbSync(true);

  const [clientQuery, setClientQuery] = useState("");
  const [clientId, setClientId] = useState<string | null>(null);
  const [presetKey, setPresetKey] = useState<string | null>(null);
  const [sqft, setSqft] = useState("");
  const [lfByAddon, setLfByAddon] = useState<Record<string, string>>({});
  const [chosenTier, setChosenTier] = useState<QuoteTierKey | null>(null);

  const presetsQ = trpc.priceBook.listPresets.useQuery(undefined, { enabled: !!user, staleTime: 60_000 });
  const membershipsQ = trpc.threeSixty.memberships.getByCustomer.useQuery(
    { customerId: clientId ?? "" },
    { enabled: !!user && !!clientId },
  );

  const createOpp = trpc.opportunities.create.useMutation({
    onError: (err) => console.warn("[quickquote] DB opportunity create failed (local state preserved):", err.message),
  });

  const presets: QuotePreset[] = useMemo(
    () =>
      ((presetsQ.data ?? []) as Parameters<typeof presetFromRow>[0][])
        .map(presetFromRow)
        .filter((p): p is QuotePreset => p !== null),
    [presetsQ.data],
  );
  const preset = presets.find((p) => p.presetKey === presetKey) ?? null;

  const matches = useMemo(() => {
    const q = clientQuery.trim().toLowerCase();
    if (!q) return state.customers.slice(0, 6);
    return state.customers.filter((c) => c.displayName.toLowerCase().includes(q)).slice(0, 6);
  }, [clientQuery, state.customers]);
  const customer = state.customers.find((c) => c.id === clientId) ?? null;

  const activeMembership = (membershipsQ.data ?? []).find((m: { status: string }) => m.status === "active") ?? null;
  const memberTier = (activeMembership?.tier ?? null) as MemberTier | null;
  const memberLabel = memberTier ? TIER_DEFINITIONS[memberTier]?.label : null;

  const sqftNum = parseFloat(sqft) || 0;
  const quote = useMemo(() => {
    if (!preset || sqftNum <= 0) return null;
    const lf: Record<string, number> = {};
    for (const [k, v] of Object.entries(lfByAddon)) lf[k] = parseFloat(v) || 0;
    return computeQuickQuote(preset, { sqft: sqftNum, lfByAddon: lf }, memberTier);
  }, [preset, sqftNum, lfByAddon, memberTier]);

  function firmUp() {
    if (!clientId || !customer || !preset || !quote) return;
    const tier = chosenTier ?? "better";
    const tierResult = quote.tiers.find((t) => t.tier === tier)!;
    const id = nanoid(8);
    const title = `${preset.label} for ${customer.displayName}`;
    const lfLines = preset.lfAddons
      .filter((a) => (parseFloat(lfByAddon[a.key] ?? "") || 0) > 0)
      .map((a) => `${a.label}: ${lfByAddon[a.key]} lf`);
    const notes = [
      `Quick quote (Step 8 consultation), ${new Date().toLocaleDateString("en-US")}.`,
      `Room: ${preset.label}, ${sqftNum} sqft.`,
      ...lfLines,
      `Direction chosen: ${tierResult.name}. Quoted range ${money(tierResult.low)} to ${money(tierResult.high)}.`,
      memberLabel ? `Member: ${memberLabel}.` : "Not a member yet.",
    ].join("\n");
    const clientSnap = {
      client: customer.displayName, companyName: "", phone: customer.mobilePhone ?? "",
      email: customer.email ?? "", address: customer.street ?? "", city: customer.city ?? "",
      state: customer.state ?? "WA", zip: customer.zip ?? "", jobType: "remodel", scope: title,
    };
    addOpportunity({ id, area: "estimate", stage: "Draft", title, value: 0, notes, archived: false, clientSnapshot: clientSnap });
    createOpp.mutate({
      id, customerId: clientId, area: "estimate", stage: "Draft", title, value: 0, notes,
      archived: false, clientSnapshot: JSON.stringify(clientSnap),
    });
    setActiveCustomer(clientId);
    setActiveOpportunity(id);
    navigate(`/os/estimate/new?customerId=${encodeURIComponent(clientId)}&oppId=${encodeURIComponent(id)}&title=${encodeURIComponent(title)}`);
  }

  const inputCls = "w-full text-sm px-3 py-2 rounded-lg border";
  const inputStyle = { borderColor: "var(--hp-hairline)" } as const;

  return (
    <OsShell active="/os/quickquote">
      <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
        Remodel quick quote
      </h1>
      <p className="text-sm text-muted-foreground mt-1">
        Measure, pick the room, and show the ranges. Real numbers come in the estimate step.
      </p>

      <div className="mt-4">
        <MethodContextBanner
          stepKey="upgrade"
          note="A whole-room remodel is a Step 8 conversation: three honest quality levels, priced by the room, decided together on-site."
        />
      </div>

      {/* ── 1. Client ──────────────────────────────────────────── */}
      <section className="mt-5">
        <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>Who is this for</h2>
        {customer ? (
          <div className="bg-white rounded-xl border px-4 py-3 flex items-center justify-between gap-2" style={inputStyle}>
            <div>
              <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>{customer.displayName}</span>
              {memberLabel && (
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold ml-2" style={{ background: "rgba(200,146,42,0.14)", color: "var(--hp-gold-deep)" }}>
                  {memberLabel} member
                </span>
              )}
            </div>
            <button type="button" className="text-xs underline text-muted-foreground" onClick={() => { setClientId(null); setClientQuery(""); }}>
              Change
            </button>
          </div>
        ) : (
          <div className="bg-white rounded-xl border p-3" style={inputStyle}>
            <input
              className={inputCls}
              style={inputStyle}
              value={clientQuery}
              onChange={(e) => setClientQuery(e.target.value)}
              placeholder="Search clients…"
            />
            <div className="mt-2 space-y-1">
              {matches.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setClientId(c.id)}
                  className="w-full text-left text-sm px-3 py-2 rounded-lg hover:bg-black/[0.03]"
                  style={{ color: "var(--hp-ink)" }}
                >
                  {c.displayName}
                </button>
              ))}
              {matches.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">
                  No matches. Add the client from the Clients room first.
                </p>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── 2. Room type ───────────────────────────────────────── */}
      <section className="mt-5">
        <h2 className="hp-eyebrow text-xs mb-2" style={{ color: "var(--hp-gold-deep)" }}>What are we remodeling</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {presets.map((p) => (
            <button
              key={p.presetKey}
              type="button"
              onClick={() => { setPresetKey(p.presetKey); setLfByAddon({}); setChosenTier(null); }}
              className={"text-left bg-white rounded-xl border px-4 py-3 transition-shadow hover:shadow-sm"}
              style={presetKey === p.presetKey ? { borderColor: "var(--hp-gold-deep)", boxShadow: "0 0 0 1px var(--hp-gold-deep)" } : inputStyle}
            >
              <div className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>{p.label}</div>
              <div className="text-[11px] text-muted-foreground mt-0.5">{p.description}</div>
            </button>
          ))}
          {presetsQ.isLoading && <p className="text-sm text-muted-foreground py-4 col-span-full text-center">Loading…</p>}
        </div>
      </section>

      {/* ── 3. Measurements ────────────────────────────────────── */}
      {preset && (
        <section className="mt-5">
          <h2 className="hp-eyebrow text-xs mb-2 flex items-center gap-1.5" style={{ color: "var(--hp-gold-deep)" }}>
            <Ruler className="w-3.5 h-3.5" /> Measurements
          </h2>
          <div className="bg-white rounded-xl border p-4 grid grid-cols-2 sm:grid-cols-3 gap-3" style={inputStyle}>
            <div>
              <label className="text-xs font-medium block mb-1">Floor area (sqft)</label>
              <input className={inputCls + " text-lg"} style={inputStyle} inputMode="decimal" value={sqft} onChange={(e) => setSqft(e.target.value)} placeholder="0" />
            </div>
            {preset.lfAddons.map((a) => (
              <div key={a.key}>
                <label className="text-xs font-medium block mb-1">{a.label} (lf)</label>
                <input
                  className={inputCls + " text-lg"}
                  style={inputStyle}
                  inputMode="decimal"
                  value={lfByAddon[a.key] ?? ""}
                  onChange={(e) => setLfByAddon({ ...lfByAddon, [a.key]: e.target.value })}
                  placeholder="0"
                />
              </div>
            ))}
          </div>
          {quote?.belowMinSqft && (
            <p className="text-xs text-muted-foreground mt-2">
              Small room: the minimum project price carries this one.
            </p>
          )}
        </section>
      )}

      {/* ── 4. The three ways to do it ─────────────────────────── */}
      {quote && (
        <section className="mt-5 mb-8">
          <h2 className="hp-eyebrow text-xs mb-2 flex items-center gap-1.5" style={{ color: "var(--hp-gold-deep)" }}>
            <Sparkles className="w-3.5 h-3.5" /> Three ways to do it
          </h2>
          <div className="grid sm:grid-cols-3 gap-3">
            {quote.tiers.map((t) => (
              <button
                key={t.tier}
                type="button"
                onClick={() => setChosenTier(t.tier)}
                className="text-left bg-white rounded-2xl border p-5 transition-shadow hover:shadow-md"
                style={chosenTier === t.tier ? { borderColor: "var(--hp-gold-deep)", boxShadow: "0 0 0 2px var(--hp-gold-deep)" } : inputStyle}
              >
                <div className="hp-serif text-lg" style={{ color: "var(--hp-ink)" }}>{t.name}</div>
                <div className="text-xl font-bold mt-2" style={{ color: "var(--hp-ink)" }}>
                  {money(t.low)} <span className="text-sm font-normal text-muted-foreground">to</span> {money(t.high)}
                </div>
                <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{t.desc}</p>
                {t.memberSavingsLow != null && t.memberSavingsLow > 0 && (
                  <p className="text-xs font-semibold mt-2" style={{ color: "var(--hp-gold-deep)" }}>
                    Your membership saves about {money(t.memberSavingsLow)} to {money(t.memberSavingsHigh ?? t.memberSavingsLow)}.
                  </p>
                )}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground mt-2">
            Honest planning ranges for this room at each quality level. The exact price comes with
            the written scope.
          </p>

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              onClick={firmUp}
              disabled={!clientId}
              className="flex items-center gap-1.5 text-sm px-5 py-3 rounded-xl font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--hp-ink)" }}
            >
              Firm up this scope <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          {!clientId && (
            <p className="text-xs text-muted-foreground text-right mt-1">Pick the client above to continue.</p>
          )}
        </section>
      )}
    </OsShell>
  );
}
