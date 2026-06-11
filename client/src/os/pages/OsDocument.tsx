/**
 * OsDocument — view and edit one library document.
 *
 * Save writes a version; for a LIVE agent SOP the edit stays pending until
 * Publish (the server enforces this; the UI explains it). Publish validates
 * (cron, tools, events) and applies. SOPs also get the frontmatter panel and
 * the on/off switch. Everything here is internal; margin content never
 * leaves the staff app.
 */
import { useEffect, useState } from "react";
import { Link, useRoute } from "wouter";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  ArrowLeft, Pencil, X, History, ShieldCheck, Zap, ZapOff, Clock, Download, Paperclip,
} from "lucide-react";
import { OsShell } from "../OsShell";
import { Markdown } from "../Markdown";

const STATUS_BADGE: Record<string, string> = {
  draft: "bg-gray-100 text-gray-600",
  review: "bg-amber-100 text-amber-800",
  final: "bg-emerald-100 text-emerald-800",
  archived: "bg-gray-100 text-gray-400 line-through",
};

export default function OsDocument() {
  const [, params] = useRoute("/os/d/:docId");
  const docId = params?.docId ?? "";
  const utils = trpc.useUtils();

  const { data: doc, isLoading } = trpc.os.docs.get.useQuery({ docId }, { enabled: !!docId });
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const { data: versions } = trpc.os.docs.versions.useQuery({ docId }, { enabled: showHistory && !!docId });

  useEffect(() => {
    if (doc && !editing) setBody(doc.pendingVersion ? doc.pendingVersion.body : doc.body);
  }, [doc, editing]);

  const save = trpc.os.docs.save.useMutation({
    onSuccess: (res) => {
      utils.os.docs.get.invalidate({ docId });
      utils.os.docs.versions.invalidate({ docId });
      setEditing(false);
      toast.success(
        res.pending
          ? "Saved as a pending version. Publish to make it live."
          : "Saved.",
      );
    },
    onError: (e) => toast.error(e.message),
  });
  const publish = trpc.os.docs.publish.useMutation({
    onSuccess: () => {
      utils.os.docs.get.invalidate({ docId });
      toast.success("Published. This version is live.");
    },
    onError: (e) => toast.error(e.message, { duration: 10_000 }),
  });
  const setEnabled = trpc.os.docs.setEnabled.useMutation({
    onSuccess: (_res, vars) => {
      utils.os.docs.get.invalidate({ docId });
      toast.success(vars.enabled ? "SOP is ON." : "SOP switched off.");
    },
    onError: (e) => toast.error(e.message, { duration: 10_000 }),
  });
  const restore = trpc.os.docs.restore.useMutation({
    onSuccess: () => {
      utils.os.docs.get.invalidate({ docId });
      utils.os.docs.versions.invalidate({ docId });
      toast.success("Version restored as a new save.");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading || !doc) {
    return (
      <OsShell active="/os/library">
        <div className="h-40 rounded-xl bg-white border animate-pulse" style={{ borderColor: "var(--hp-hairline)" }} />
      </OsShell>
    );
  }

  const isSop = doc.type === "SOP";
  const isFile = doc.type === "FILE" && !!doc.fileUrl;
  const hasPending = !!doc.pendingVersion;

  if (isFile) {
    const sizeLabel =
      doc.fileSize != null
        ? doc.fileSize > 1024 * 1024
          ? `${(doc.fileSize / (1024 * 1024)).toFixed(1)} MB`
          : `${Math.max(1, Math.round(doc.fileSize / 1024))} KB`
        : "";
    const isImage = (doc.fileMime ?? "").startsWith("image/") && !(doc.fileMime ?? "").includes("heic");
    return (
      <OsShell active="/os/library">
        <Link href="/os/library">
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:underline">
            <ArrowLeft className="w-3.5 h-3.5" /> Library
          </span>
        </Link>
        <div className="mt-2">
          <div className="text-xs text-muted-foreground">{doc.docId}</div>
          <h1 className="hp-serif text-xl leading-tight break-words" style={{ color: "var(--hp-ink)" }}>
            {doc.title}
          </h1>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">FILE</span>
            {doc.fileMime && <span className="text-[10px] text-muted-foreground">{doc.fileMime}</span>}
            {sizeLabel && <span className="text-[10px] text-muted-foreground">{sizeLabel}</span>}
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold">INTERNAL</span>
          </div>
        </div>
        <div className="mt-4 bg-white rounded-xl border p-5" style={{ borderColor: "var(--hp-hairline)" }}>
          {isImage ? (
            <a href={doc.fileUrl!} target="_blank" rel="noreferrer">
              <img src={doc.fileUrl!} alt={doc.title} className="max-h-[70vh] rounded-lg mx-auto" />
            </a>
          ) : (
            <div className="text-center py-10">
              <Paperclip className="w-9 h-9 mx-auto mb-3" style={{ color: "var(--hp-gold-soft)" }} />
              <p className="text-sm text-muted-foreground mb-4">
                This document is a hosted file. It opens in a new tab.
              </p>
              <a
                href={doc.fileUrl!}
                target="_blank"
                rel="noreferrer"
                className="hp-button-gold text-sm inline-flex items-center gap-2"
                style={{ padding: "10px 22px", minHeight: 0 }}
              >
                <Download className="w-4 h-4" /> Open file
              </a>
            </div>
          )}
        </div>
      </OsShell>
    );
  }

  return (
    <OsShell active="/os/library">
      <Link href="/os/library">
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground cursor-pointer hover:underline">
          <ArrowLeft className="w-3.5 h-3.5" /> Library
        </span>
      </Link>

      {/* ── Header ──────────────────────────────────────────────── */}
      <div className="mt-2 flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{doc.docId}</div>
          <h1 className="hp-serif text-xl leading-tight" style={{ color: "var(--hp-ink)" }}>
            {doc.title}
          </h1>
          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_BADGE[doc.status]}`}>{doc.status.toUpperCase()}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">{doc.type}</span>
            {doc.layer && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">{doc.layer}</span>}
            {isSop && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700">
                {doc.kind === "agent" ? "agent SOP" : "human SOP"}
              </span>
            )}
            <span className="text-[10px] text-muted-foreground">v{doc.version}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-700 font-semibold">INTERNAL</span>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {isSop && doc.status === "final" && (
            <button
              type="button"
              onClick={() => {
                if (doc.enabled || window.confirm(`Turn on ${doc.docId}? It will start ${doc.kind === "agent" ? "running" : "creating tasks"} on its triggers.`)) {
                  setEnabled.mutate({ docId, enabled: !doc.enabled });
                }
              }}
              disabled={setEnabled.isPending}
              className={`flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg font-semibold transition-colors ${
                doc.enabled ? "bg-emerald-100 text-emerald-800 hover:bg-emerald-200" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              {doc.enabled ? <Zap className="w-3.5 h-3.5" /> : <ZapOff className="w-3.5 h-3.5" />}
              {doc.enabled ? "ON" : "Off"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowHistory((v) => !v)}
            className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border hover:bg-black/5 transition-colors"
            style={{ borderColor: "var(--hp-hairline)" }}
          >
            <History className="w-3.5 h-3.5" /> History
          </button>
          {editing ? (
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setBody(doc.pendingVersion ? doc.pendingVersion.body : doc.body);
              }}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border hover:bg-black/5"
              style={{ borderColor: "var(--hp-hairline)" }}
            >
              <X className="w-3.5 h-3.5" /> Cancel
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border hover:bg-black/5"
              style={{ borderColor: "var(--hp-hairline)" }}
            >
              <Pencil className="w-3.5 h-3.5" /> Edit
            </button>
          )}
        </div>
      </div>

      {/* ── Pending banner ──────────────────────────────────────── */}
      {hasPending && !editing && (
        <div className="mt-3 flex items-center gap-3 rounded-xl border px-4 py-3 bg-amber-50" style={{ borderColor: "#f0d9a8" }}>
          <Clock className="w-4 h-4 text-amber-700 shrink-0" />
          <div className="flex-1 text-xs text-amber-900">
            An edit is saved but not live (v{doc.pendingVersion!.version}). The running version is still v{doc.version}.
          </div>
          <button
            type="button"
            className="hp-button-gold text-xs"
            style={{ padding: "6px 14px", minHeight: 0 }}
            disabled={publish.isPending}
            onClick={() => publish.mutate({ docId })}
          >
            <ShieldCheck className="w-3.5 h-3.5 inline mr-1" />
            {publish.isPending ? "Checking..." : "Publish"}
          </button>
        </div>
      )}

      {/* ── SOP frontmatter panel ───────────────────────────────── */}
      {isSop && (
        <div className="mt-3 bg-white rounded-xl border px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-2 text-xs" style={{ borderColor: "var(--hp-hairline)" }}>
          <div>
            <div className="text-muted-foreground">Trigger events</div>
            <div className="font-medium break-words">{doc.events || "none"}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Schedule</div>
            <div className="font-medium">{doc.cron ? `${doc.cron} (${doc.timezone ?? "America/Los_Angeles"})` : "none"}</div>
          </div>
          {doc.kind === "agent" ? (
            <>
              <div>
                <div className="text-muted-foreground">Tools</div>
                <div className="font-medium break-words">{doc.tools || "none"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Approval / limits</div>
                <div className="font-medium">
                  {doc.approval} · {doc.maxTurns} turns · {doc.runLimitDaily}/day
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="text-muted-foreground">Creates task</div>
                <div className="font-medium break-words">{doc.taskTitleTemplate || "(uses the SOP title)"}</div>
              </div>
              <div>
                <div className="text-muted-foreground">Due</div>
                <div className="font-medium">
                  {doc.taskDueOffsetHours != null ? `${doc.taskDueOffsetHours}h after trigger` : "no due date"}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── History ─────────────────────────────────────────────── */}
      {showHistory && (
        <div className="mt-3 bg-white rounded-xl border px-4 py-3" style={{ borderColor: "var(--hp-hairline)" }}>
          <div className="text-xs font-semibold mb-2" style={{ color: "var(--hp-ink)" }}>
            Version history
          </div>
          <div className="space-y-1">
            {(versions ?? []).map((v) => (
              <div key={v.version} className="flex items-center gap-3 text-xs py-1">
                <span className="font-mono w-8">v{v.version}</span>
                <span className="text-muted-foreground flex-1">
                  {v.editedBy} · {new Date(v.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  {v.version === doc.version && <span className="ml-2 text-emerald-700 font-semibold">live</span>}
                  {doc.pendingVersion && v.version === doc.pendingVersion.version && (
                    <span className="ml-2 text-amber-700 font-semibold">pending</span>
                  )}
                </span>
                {v.version !== doc.version && (
                  <button
                    type="button"
                    className="underline text-muted-foreground hover:text-foreground"
                    onClick={() => restore.mutate({ docId, version: v.version })}
                  >
                    Restore
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Body ────────────────────────────────────────────────── */}
      <div className="mt-4 bg-white rounded-xl border p-5" style={{ borderColor: "var(--hp-hairline)" }}>
        {editing ? (
          <>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={Math.min(34, Math.max(12, body.split("\n").length + 2))}
              className="w-full text-sm font-mono leading-relaxed border rounded-lg p-3 bg-[#fbfaf7]"
              style={{ borderColor: "var(--hp-hairline)" }}
            />
            <div className="mt-3 flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] text-muted-foreground">
                {isSop && doc.kind === "agent" && doc.status === "final" && doc.enabled
                  ? "This SOP is live: Save keeps the edit pending; Publish makes it run."
                  : "Save applies right away."}
              </span>
              <button
                type="button"
                className="hp-button-gold text-xs"
                style={{ padding: "8px 18px", minHeight: 0 }}
                disabled={save.isPending}
                onClick={() => save.mutate({ docId, body })}
              >
                {save.isPending ? "Saving..." : "Save"}
              </button>
            </div>
          </>
        ) : (
          <Markdown source={doc.body} />
        )}
      </div>
    </OsShell>
  );
}
