/**
 * OsClientProfile — the calm client page that replaced the 8-tab
 * CustomerSection (Marcin, 2026-06-11: "take out more than we put in").
 *
 * Three sections off one canonical query (customers.getFullContext):
 *   Overview — who they are, membership, what is open for them
 *   Work     — quotes and jobs, a simple list; tap one to price it
 *   Money    — invoices and what is outstanding
 *
 * Margin rule: this is a staff surface, but anything copied to a customer
 * comes from the proposal/portal, never from here.
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useEstimator } from "@/contexts/EstimatorContext";
import {
  ArrowLeft, Phone, Mail, MapPin, FileText, CircleDollarSign, Circle, Plus, Pencil,
} from "lucide-react";
import CommunicationTab from "@/components/clients/CommunicationTab";
import EditContactDialog from "./EditContactDialog";
import PropertyStrip from "./PropertyStrip";
import CustomerMembershipPanel from "@/components/CustomerMembershipPanel";
import { MethodStepBoard } from "@/components/threeSixty/MethodStepBoard";
import { getThreeSixtyStepByKey } from "@shared/threeSixtyMethod";
import { useLocation } from "wouter";

type Tab = "overview" | "work" | "money" | "comms";

const fmtMoney = (n: number | null | undefined) =>
  n == null ? "" : `$${Number(n).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;

const fmtDate = (d: string | Date | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

/** The simple flow: every opportunity is one of four states. */
function flowState(o: { area: string | null; stage: string | null }): { label: string; cls: string } {
  const stage = (o.stage ?? "").toLowerCase();
  if (stage.includes("done") || stage.includes("complete") || stage.includes("paid")) {
    return { label: "Done", cls: "bg-emerald-100 text-emerald-800" };
  }
  if (o.area === "job" || stage.includes("won")) return { label: "Won", cls: "bg-blue-100 text-blue-800" };
  if (o.area === "estimate") return { label: "Quote sent", cls: "bg-amber-100 text-amber-800" };
  return { label: "Lead", cls: "bg-gray-100 text-gray-600" };
}

export default function OsClientProfile() {
  const [, navigate] = useLocation();
  const { state, navigateToTopLevel, setActiveOpportunity } = useEstimator();
  const customerId = state.activeCustomerId ?? "";
  const [tab, setTab] = useState<Tab>("overview");
  const [editingContact, setEditingContact] = useState(false);
  const [selectedPropertyId, setSelectedPropertyId] = useState<string | null>(null);

  const { data: ctx, isLoading } = trpc.customers.getFullContext.useQuery(
    { id: customerId },
    { enabled: !!customerId },
  );
  const { data: openTasks } = trpc.os.tasks.list.useQuery(
    { linkType: "customer", linkId: customerId },
    { enabled: !!customerId },
  );
  // Shares the react-query cache with PropertyStrip's identical query.
  const { data: propertyRows, isLoading: propertiesLoading } = trpc.properties.listByCustomer.useQuery(
    { customerId },
    { enabled: !!customerId },
  );
  const scopedPropertyId =
    (propertyRows ?? []).find((p: any) => p.id === selectedPropertyId)?.id ??
    (propertyRows ?? [])[0]?.id ??
    null;
  // Property selected → that property's view; no property rows yet → the
  // legacy whole-customer view.
  const { data: propertyJourney } = trpc.threeSixty.journey.forProperty.useQuery(
    { customerId, propertyId: scopedPropertyId ?? "" },
    { enabled: !!customerId && !!scopedPropertyId },
  );
  const { data: customerJourney } = trpc.threeSixty.journey.forCustomer.useQuery(
    { customerId },
    { enabled: !!customerId && !propertiesLoading && !scopedPropertyId },
  );
  const memberJourney = scopedPropertyId ? propertyJourney : customerJourney;

  if (!customerId) return null;
  if (isLoading || !ctx) {
    return <div className="container max-w-3xl py-8"><div className="h-40 rounded-xl bg-white border animate-pulse" style={{ borderColor: "var(--hp-hairline)" }} /></div>;
  }

  const c = ctx.customer;
  const address = ctx.addresses?.[0];
  const membership = (ctx as any).memberships?.[0] ?? null;
  const opps = [...(ctx.opportunities ?? [])].sort(
    (a: any, b: any) => new Date(b.updatedAt ?? b.createdAt ?? 0).getTime() - new Date(a.updatedAt ?? a.createdAt ?? 0).getTime(),
  );
  const invoices = ctx.invoices ?? [];
  const outstanding = invoices.reduce((s: number, i: any) => s + (Number(i.balance) || 0), 0);

  // Selection defaults to the primary property (the list comes back
  // primary-first), and survives only while it still exists.
  const activeProperty = (propertyRows ?? []).find((p: any) => p.id === scopedPropertyId) ?? null;

  return (
    <div className="container max-w-3xl py-5">
      <button
        type="button"
        onClick={() => navigateToTopLevel("customers")}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:underline"
      >
        <ArrowLeft className="w-3.5 h-3.5" /> Clients
      </button>

      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="hp-serif text-2xl leading-tight" style={{ color: "var(--hp-ink)" }}>
              {c.displayName}
            </h1>
            <button
              type="button"
              onClick={() => setEditingContact(true)}
              title="Edit contact"
              aria-label="Edit contact"
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
            {c.mobilePhone && (
              <a href={`tel:${c.mobilePhone}`} className="inline-flex items-center gap-1 hover:underline">
                <Phone className="w-3 h-3" /> {c.mobilePhone}
              </a>
            )}
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex items-center gap-1 hover:underline">
                <Mail className="w-3 h-3" /> {c.email}
              </a>
            )}
            {address && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="w-3 h-3" /> {address.street}, {address.city}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {membership && (
            <span className="text-[11px] px-2.5 py-1 rounded-full font-semibold" style={{ background: "rgba(200,146,42,0.14)", color: "var(--hp-gold-deep)" }}>
              {memberJourney
                ? (() => {
                    const step = getThreeSixtyStepByKey(memberJourney.journey.currentStepKey);
                    return step ? `360 Member · Step ${step.number} ${step.name}` : "360 Member";
                  })()
                : "360 Member"}
            </span>
          )}
          <button
            type="button"
            disabled={!activeProperty}
            title={activeProperty ? "Open the guided on-site close" : "Select a property first"}
            onClick={() => activeProperty && navigate(`/os/close/${customerId}?propertyId=${activeProperty.id}`)}
            className="text-[11px] px-3 py-1.5 rounded-full font-semibold border transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
          >
            Start close
          </button>
        </div>
      </div>

      {/* ── Properties (membership and the nine steps live here) ── */}
      <PropertyStrip
        customerId={customerId}
        addressSeed={{ street: c.street, unit: c.unit, city: c.city, state: c.state, zip: c.zip }}
        selectedPropertyId={activeProperty?.id ?? null}
        onSelect={setSelectedPropertyId}
      />

      {/* ── Tabs ───────────────────────────────────────────────── */}
      <div className="mt-4 flex gap-1 border-b" style={{ borderColor: "var(--hp-hairline)" }}>
        {(
          [
            { id: "overview", label: "Overview" },
            { id: "work", label: `Work${opps.length ? ` (${opps.length})` : ""}` },
            { id: "money", label: `Money${outstanding > 0 ? ` (${fmtMoney(outstanding)} due)` : ""}` },
            { id: "comms", label: "Comms" },
          ] as { id: Tab; label: string }[]
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`px-4 py-2.5 text-sm transition-colors border-b-2 -mb-px ${
              tab === t.id ? "font-semibold" : "text-muted-foreground border-transparent hover:text-foreground"
            }`}
            style={tab === t.id ? { color: "var(--hp-gold-deep)", borderColor: "var(--hp-gold-deep)" } : undefined}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Overview ───────────────────────────────────────────── */}
      {tab === "overview" && (
        <div className="mt-4 space-y-4">
          {(openTasks ?? []).length > 0 && (
            <div className="bg-white rounded-xl border px-4 py-3" style={{ borderColor: "var(--hp-gold-soft)" }}>
              <div className="text-xs font-semibold mb-2" style={{ color: "var(--hp-gold-deep)" }}>
                Open for this client
              </div>
              {(openTasks ?? []).map((t) => (
                <div key={t.id} className="flex items-center gap-2 text-sm py-1">
                  <Circle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <span style={{ color: "var(--hp-ink)" }}>{t.title}</span>
                </div>
              ))}
            </div>
          )}
          {/* The umbrella order Marcin set: who they are (header above),
              whether they are a member (with enroll + labor bank), and then
              the nine steps for every customer, clickable into contents. */}
          <CustomerMembershipPanel customerId={customerId} />

          {memberJourney && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <h2 className="hp-eyebrow text-xs" style={{ color: "var(--hp-gold-deep)" }}>
                  {(propertyRows ?? []).length > 1 && activeProperty
                    ? `The nine steps at ${activeProperty.label}`
                    : `The nine steps for ${c.displayName.split(" ")[0]}`}
                </h2>
                <Link href="/os/method">
                  <span className="text-[11px] text-muted-foreground hover:underline cursor-pointer">How the method works</span>
                </Link>
              </div>
              <MethodStepBoard
                journey={memberJourney.journey}
                stepContents={memberJourney.stepContents}
                customerId={customerId}
                propertyId={activeProperty?.id ?? null}
                onOpenOpportunity={(id) => setActiveOpportunity(id)}
                onOpenSpot={(id) => navigate(`/os/spot/${id}`)}
              />
            </div>
          )}
          {!membership && (ctx as any).portal == null && (
            <p className="text-xs text-muted-foreground">
              No membership and no portal account yet. The portal invite goes out with their first estimate.
            </p>
          )}
        </div>
      )}

      {/* ── Work ───────────────────────────────────────────────── */}
      {tab === "work" && (
        <div className="mt-4 space-y-2">
          <div className="flex items-center gap-2">
            <Link href="/os/estimate/new">
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold text-white cursor-pointer" style={{ background: "var(--hp-ink)" }}>
                <Plus className="w-3.5 h-3.5" /> New estimate
              </span>
            </Link>
            <Link href={`/os/spot/new?customerId=${encodeURIComponent(customerId)}${activeProperty ? `&propertyId=${encodeURIComponent(activeProperty.id)}` : ""}`}>
              <span className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold cursor-pointer border" style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}>
                Spot inspection
              </span>
            </Link>
          </div>
          {opps.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              Nothing in flight. Tap New estimate to start a quote.
            </p>
          ) : (
            opps.map((o: any) => {
              const flow = flowState(o);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => setActiveOpportunity(o.id)}
                  className="w-full text-left bg-white rounded-xl border px-4 py-3 flex items-center gap-3 hover:shadow-sm transition-shadow"
                  style={{ borderColor: "var(--hp-hairline)" }}
                >
                  <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate" style={{ color: "var(--hp-ink)" }}>
                      {o.title || "Untitled"}
                    </div>
                    <div className="text-xs text-muted-foreground">{fmtDate(o.updatedAt ?? o.createdAt)}</div>
                  </div>
                  {o.value != null && Number(o.value) > 0 && (
                    <span className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
                      {fmtMoney(Number(o.value))}
                    </span>
                  )}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${flow.cls}`}>{flow.label}</span>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* ── Money ──────────────────────────────────────────────── */}
      {tab === "money" && (
        <div className="mt-4 space-y-2">
          {invoices.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No invoices yet.</p>
          ) : (
            invoices.map((inv: any) => (
              <div
                key={inv.id}
                className="bg-white rounded-xl border px-4 py-3 flex items-center gap-3"
                style={{ borderColor: "var(--hp-hairline)" }}
              >
                <CircleDollarSign className="w-4 h-4 shrink-0 text-muted-foreground" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium" style={{ color: "var(--hp-ink)" }}>
                    {inv.invoiceNumber ?? `Invoice #${inv.id}`}
                  </div>
                  <div className="text-xs text-muted-foreground">{fmtDate(inv.createdAt)}</div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
                    {fmtMoney(Number(inv.total))}
                  </div>
                  {Number(inv.balance) > 0 && (
                    <div className="text-[11px] text-red-600">{fmtMoney(Number(inv.balance))} due</div>
                  )}
                </div>
                <span
                  className={`text-[10px] px-2 py-0.5 rounded-full ${
                    inv.status === "paid"
                      ? "bg-emerald-100 text-emerald-800"
                      : inv.status === "void"
                        ? "bg-gray-100 text-gray-500"
                        : "bg-amber-100 text-amber-800"
                  }`}
                >
                  {inv.status}
                </span>
              </div>
            ))
          )}
        </div>
      )}

      {editingContact && (
        <EditContactDialog
          key={`${c.id}-${c.updatedAt ?? ""}`}
          customer={c as any}
          open={editingContact}
          onClose={() => setEditingContact(false)}
        />
      )}

      {/* ── Comms ──────────────────────────────────────────────── */}
      {tab === "comms" && (
        <div className="mt-4">
          <CommunicationTab
            customerId={customerId}
            customerPhone={c.mobilePhone ?? undefined}
            customerEmail={c.email ?? undefined}
            customerName={c.displayName ?? undefined}
          />
        </div>
      )}
    </div>
  );
}
