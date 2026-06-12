/**
 * PropertyStrip — the client's properties as selectable cards under the
 * contact header. The client is the umbrella; membership, health, and the
 * nine steps live per property. Selecting a card lifts selectedPropertyId
 * into OsClientProfile so the board and tabs scope to that property.
 *
 * Empty state: one tap promotes the customer's flat address into the
 * primary property (properties.autoMigrateFromCustomer, idempotent).
 */
import { useState } from "react";
import { Home, Pencil, Plus, Star } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { TIER_DEFINITIONS, type MemberTier } from "@shared/threeSixtyTiers";
import PropertyEditDialog from "./PropertyEditDialog";
import EnrollPropertyDialog from "@/components/EnrollPropertyDialog";

type AddressSeed = {
  street?: string | null;
  unit?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
};

const HEALTH_DOT: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
};

export default function PropertyStrip({
  customerId,
  addressSeed,
  selectedPropertyId,
  onSelect,
}: {
  customerId: string;
  /** The customer's flat address fields, for the one-tap migration. */
  addressSeed: AddressSeed;
  selectedPropertyId: string | null;
  onSelect: (propertyId: string) => void;
}) {
  const [editing, setEditing] = useState<null | { mode: "new" } | { mode: "edit"; property: any }>(null);
  const [enrolling, setEnrolling] = useState<any>(null);

  const utils = trpc.useUtils();
  const { data: props, isLoading } = trpc.properties.listByCustomer.useQuery(
    { customerId },
    { enabled: !!customerId },
  );
  const migrateM = trpc.properties.autoMigrateFromCustomer.useMutation({
    onSuccess: (created) => {
      void utils.properties.listByCustomer.invalidate({ customerId });
      onSelect(created.id);
      toast.success("Property set up");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <div className="mt-3 h-16 rounded-xl bg-white border animate-pulse" style={{ borderColor: "var(--hp-hairline)" }} />;
  }

  if (!props || props.length === 0) {
    return (
      <div className="mt-3">
        <button
          type="button"
          disabled={migrateM.isPending}
          onClick={() =>
            migrateM.mutate({
              customerId,
              street: addressSeed.street ?? "",
              unit: addressSeed.unit ?? "",
              city: addressSeed.city ?? "",
              state: addressSeed.state ?? "",
              zip: addressSeed.zip ?? "",
            })
          }
          className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold cursor-pointer border"
          style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
        >
          <Home className="w-3.5 h-3.5" />
          {migrateM.isPending ? "Setting up…" : "Set up their property"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3">
      <div className="flex gap-2 overflow-x-auto pb-1">
        {props.map((p: any) => {
          const selected = p.id === selectedPropertyId;
          const tier = p.membership?.tier as MemberTier | undefined;
          const isMember = !!p.membership && p.membership.status === "active";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => onSelect(p.id)}
              className={`relative shrink-0 min-w-44 max-w-60 text-left bg-white rounded-xl border px-3 py-2.5 transition-shadow ${selected ? "shadow-sm" : "hover:shadow-sm"}`}
              style={{ borderColor: selected ? "var(--hp-gold-deep)" : "var(--hp-hairline)" }}
            >
              <div className="flex items-center gap-1.5">
                {p.isPrimary && <Star className="w-3 h-3 shrink-0 fill-amber-400 text-amber-400" />}
                <span className="text-sm font-semibold truncate" style={{ color: "var(--hp-ink)" }}>
                  {p.label || "Home"}
                </span>
                <span
                  className={`ml-auto w-2 h-2 rounded-full shrink-0 ${HEALTH_DOT[p.healthScore?.color ?? ""] ?? "bg-gray-300"}`}
                  title={p.healthScore ? `Health ${p.healthScore.score}` : undefined}
                />
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); setEditing({ mode: "edit", property: p }); }}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEditing({ mode: "edit", property: p }); } }}
                  title="Edit property"
                  aria-label="Edit property"
                  className="p-0.5 rounded text-muted-foreground hover:text-foreground"
                >
                  <Pencil className="w-3 h-3" />
                </span>
              </div>
              <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                {[p.street, p.city].filter(Boolean).join(", ") || "No address yet"}
              </div>
              <div className="mt-1.5">
                {isMember && tier ? (
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold" style={{ background: "rgba(200,146,42,0.14)", color: "var(--hp-gold-deep)" }}>
                    {TIER_DEFINITIONS[tier]?.label ?? "360 Member"}
                  </span>
                ) : (
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); setEnrolling(p); }}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); setEnrolling(p); } }}
                    title="Enroll this property in the 360° Method"
                    className="text-[10px] px-2 py-0.5 rounded-full font-semibold border cursor-pointer"
                    style={{ borderColor: "var(--hp-gold-deep)", color: "var(--hp-gold-deep)" }}
                  >
                    Enroll
                  </span>
                )}
              </div>
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => setEditing({ mode: "new" })}
          title="Add property"
          className="shrink-0 self-stretch px-3 rounded-xl border border-dashed text-muted-foreground hover:text-foreground transition-colors flex items-center"
          style={{ borderColor: "var(--hp-hairline)" }}
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {editing && (
        <PropertyEditDialog
          customerId={customerId}
          property={editing.mode === "edit" ? editing.property : undefined}
          open
          onClose={() => setEditing(null)}
        />
      )}

      {enrolling && (
        <EnrollPropertyDialog
          property={enrolling}
          open
          onClose={() => setEnrolling(null)}
        />
      )}
    </div>
  );
}
