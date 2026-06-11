/**
 * OsSettings — the OS about itself: business identity, links to the agent
 * controls, and the Fresh Start card (wipe the work, keep the people).
 */
import { useState } from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Bot, Eraser, ExternalLink } from "lucide-react";
import { OsShell } from "../OsShell";

export default function OsSettings() {
  const utils = trpc.useUtils();
  const { data: business } = trpc.os.business.get.useQuery();
  const [confirmText, setConfirmText] = useState("");

  const freshStart = trpc.os.maintenance.freshStart.useMutation({
    onSuccess: (res) => {
      utils.invalidate();
      setConfirmText("");
      const wiped = Object.entries(res.counts)
        .filter(([, n]) => n > 0)
        .map(([k, n]) => `${k}: ${n}`)
        .join(", ");
      toast.success(wiped ? `Clean slate. Removed ${wiped}.` : "Clean slate. Nothing was left to remove.");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <OsShell active="/os/settings">
      <h1 className="hp-serif text-2xl" style={{ color: "var(--hp-ink)" }}>
        Settings
      </h1>
      <p className="text-sm text-muted-foreground mt-1">The OS about itself.</p>

      <div className="mt-5 bg-white rounded-xl border px-4 py-3" style={{ borderColor: "var(--hp-hairline)" }}>
        <div className="text-xs text-muted-foreground">Business</div>
        <div className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
          {business?.name ?? "..."} <span className="text-xs font-normal text-muted-foreground">({business?.slug})</span>
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{business?.timezone}</div>
      </div>

      <Link href="/admin/agents">
        <div
          className="mt-3 bg-white rounded-xl border px-4 py-3 flex items-center gap-3 cursor-pointer hover:shadow-sm transition-shadow"
          style={{ borderColor: "var(--hp-hairline)" }}
        >
          <Bot className="w-4 h-4" style={{ color: "var(--hp-gold-deep)" }} />
          <div className="flex-1">
            <div className="text-sm font-medium" style={{ color: "var(--hp-ink)" }}>
              Agents
            </div>
            <div className="text-xs text-muted-foreground">Kill switch, runs, approvals, SOP library health.</div>
          </div>
          <ExternalLink className="w-4 h-4 text-muted-foreground" />
        </div>
      </Link>

      {/* ── Fresh start ─────────────────────────────────────────── */}
      <div className="mt-6 bg-white rounded-xl border p-4" style={{ borderColor: "#f3c7c7" }}>
        <div className="flex items-center gap-2">
          <Eraser className="w-4 h-4 text-red-600" />
          <h2 className="text-sm font-semibold" style={{ color: "var(--hp-ink)" }}>
            Fresh start
          </h2>
        </div>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
          Wipes the work, keeps the people. Deletes every lead, opportunity, estimate, job,
          open task, notification, scheduled item, and pending draft. Customers, memberships,
          billing, invoices, the portal, and message history stay exactly as they are.
          There is no undo.
        </p>
        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <input
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
            placeholder={'Type "fresh start" to arm'}
            className="text-sm px-3 py-2 rounded-lg border flex-1 min-w-48"
            style={{ borderColor: "var(--hp-hairline)" }}
          />
          <button
            type="button"
            disabled={confirmText !== "fresh start" || freshStart.isPending}
            onClick={() => freshStart.mutate({ confirm: "fresh start" })}
            className="text-xs px-4 py-2.5 rounded-lg font-semibold text-white bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {freshStart.isPending ? "Wiping..." : "Wipe the work"}
          </button>
        </div>
      </div>
    </OsShell>
  );
}
