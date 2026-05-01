/**
 * VisionaryConsole — Marcin's operating cockpit inside HP Estimator.
 *
 * Phase 1 (this file):
 *   - Left pane: KPI rollup + cost dashboard + quick-switch chips
 *   - Center pane: Integrator streaming chat (SSE → /api/admin/integrator-stream)
 *   - Right pane: Action queue (pending team tasks, recent handoffs, agent runs)
 *
 * Layout:
 *   - Desktop ≥ lg: three-pane grid (260px | 1fr | 320px)
 *   - Tablet md: two-pane (chat + slide-over action queue)
 *   - Mobile: single column, KPI block on top, chat in the middle, action
 *     queue collapsed into a bottom drawer (44 px+ tap targets)
 *
 * The chat persists conversations using the existing
 * integratorChatConversations / integratorChatMessages tables (same store
 * as /admin/chat). Streaming is additive — the legacy /admin/chat surface
 * still uses the non-streaming tRPC mutation.
 */
import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowRight,
  Bot,
  ChevronUp,
  ChevronDown,
  Compass,
  DollarSign,
  FileText,
  Loader2,
  MessageSquare,
  Send,
  ShieldAlert,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AdminShell } from "./AdminShell";
import { DEPARTMENTS, departmentLabel, formatUsd } from "./constants";

const STORAGE_KEY = "visionary.console.activeConversationId";
const ADDRESSEE_KEY = "visionary.console.addressee";

type ChatRole = "user" | "assistant";
type ChatMsg = {
  id: number | string;
  role: ChatRole;
  content: string;
  costUsd?: string | null;
  inputTokens?: number;
  outputTokens?: number;
  toolCalls?: Array<{ key: string; input: unknown; output?: unknown; error?: string; requiresApproval?: boolean }>;
  streaming?: boolean;
  /** Set when the stream pipeline emitted an error event — render visibly in the bubble. */
  errorMessage?: string;
  /** "connecting" until the first delta or connect event arrives. */
  phase?: "connecting" | "thinking" | "streaming" | "done" | "error";
};

type Addressee = "integrator" | "sales" | "marketing" | "operations";

const ADDRESSEE_LABEL: Record<Addressee, string> = {
  integrator: "Integrator",
  sales: "Sales",
  marketing: "Marketing",
  operations: "Operations",
};

export default function VisionaryConsole() {
  const utils = trpc.useUtils();

  // ── Conversation state ────────────────────────────────────────────────────
  const [activeId, setActiveId] = useState<number | null>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
      return raw ? Number(raw) : null;
    } catch {
      return null;
    }
  });
  const [addressee, setAddressee] = useState<Addressee>(() => {
    try {
      const raw = typeof window !== "undefined" ? window.localStorage.getItem(ADDRESSEE_KEY) : null;
      return (raw as Addressee) ?? "integrator";
    } catch {
      return "integrator";
    }
  });

  const conversationsQ = trpc.integratorChat.listConversations.useQuery();
  const messagesQ = trpc.integratorChat.listMessages.useQuery(
    { conversationId: activeId ?? 0 },
    { enabled: activeId !== null }
  );
  const createConv = trpc.integratorChat.createConversation.useMutation({
    onSuccess: (res) => {
      setActiveId(res.id);
      utils.integratorChat.listConversations.invalidate();
    },
  });

  // Streaming state — held outside react-query so deltas don't refetch.
  const [streamingMsg, setStreamingMsg] = useState<ChatMsg | null>(null);
  // Locally-rendered user message until the server-side row gets refetched.
  // Without this, the user's typed message disappears the moment they hit
  // send (it's only persisted server-side once the SSE call begins).
  const [localUserMsg, setLocalUserMsg] = useState<ChatMsg | null>(null);
  const [pending, setPending] = useState(false);
  const [draft, setDraft] = useState("");
  const messagesRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Persist active id + addressee
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (activeId !== null) window.localStorage.setItem(STORAGE_KEY, String(activeId));
      window.localStorage.setItem(ADDRESSEE_KEY, addressee);
    } catch {
      /* ignore storage errors */
    }
  }, [activeId, addressee]);

  // Default to most recent conversation, or create one on first visit
  useEffect(() => {
    if (activeId !== null) return;
    const list = conversationsQ.data ?? [];
    if (list.length > 0) setActiveId(list[0].id);
  }, [conversationsQ.data, activeId]);

  // Auto-scroll on new content. Detect manual scroll-up to suspend auto-scroll.
  const [autoScroll, setAutoScroll] = useState(true);
  useEffect(() => {
    if (!autoScroll) return;
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messagesQ.data?.length, streamingMsg?.content, autoScroll]);

  function handleScroll() {
    const el = messagesRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distance < 60);
  }

  // ── Send via SSE streaming endpoint ───────────────────────────────────────
  async function sendStreaming(conversationId: number, message: string) {
    setPending(true);
    // Show the user's message AND a "connecting…" assistant bubble immediately
    // so Marcin always sees something happening even if the stream stalls.
    const userPlaceholder: ChatMsg = {
      id: `user-pending-${Date.now()}`,
      role: "user",
      content: message,
    };
    setStreamingMsg({
      id: "streaming",
      role: "assistant",
      content: "",
      streaming: true,
      phase: "connecting",
    });
    setLocalUserMsg(userPlaceholder);
    setAutoScroll(true);

    const controller = new AbortController();
    abortRef.current = controller;
    let receivedDoneEvent = false;
    let lastErrorFromServer: string | null = null;

    try {
      const prefix =
        addressee === "integrator"
          ? ""
          : `[Talk to ${ADDRESSEE_LABEL[addressee]}] Marcin wants this routed to the ${ADDRESSEE_LABEL[addressee]} team.\n\n`;
      const body = JSON.stringify({ conversationId, message: prefix + message });

      const resp = await fetch("/api/admin/integrator-stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        credentials: "same-origin",
        signal: controller.signal,
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        throw new Error(text || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";
      let runningText = "";
      const toolCalls: ChatMsg["toolCalls"] = [];

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // SSE frames are separated by \n\n
        let idx;
        while ((idx = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 2);
          if (!frame.trim()) continue;
          let event = "message";
          let data = "";
          for (const line of frame.split("\n")) {
            if (line.startsWith(":")) continue; // comment / heartbeat
            if (line.startsWith("event:")) event = line.slice(6).trim();
            else if (line.startsWith("data:")) data += line.slice(5).trim();
          }
          if (!data) continue;
          let payload: any;
          try {
            payload = JSON.parse(data);
          } catch {
            continue;
          }

          if (event === "connect") {
            setStreamingMsg((prev) => ({
              ...(prev ?? { id: "streaming", role: "assistant", content: "", streaming: true }),
              phase: "thinking",
            }));
          } else if (event === "delta" && typeof payload.text === "string") {
            runningText += payload.text;
            setStreamingMsg({
              id: "streaming",
              role: "assistant",
              content: runningText,
              streaming: true,
              toolCalls: [...toolCalls],
              phase: "streaming",
            });
          } else if (event === "text_reset") {
            // The model was about to call tools; the text it streamed in this
            // turn was an acknowledgment ("I'll pull the KPIs..."). Clear it
            // so the final synthesis turn renders fresh, uncontaminated.
            runningText = "";
            setStreamingMsg((prev) => ({
              ...(prev ?? { id: "streaming", role: "assistant", content: "", streaming: true }),
              content: "",
              toolCalls: [...toolCalls],
              phase: "thinking",
            }));
          } else if (event === "tool_use") {
            toolCalls.push({ key: payload.key, input: payload.input, requiresApproval: payload.requiresApproval });
            setStreamingMsg((prev) => ({
              ...(prev ?? { id: "streaming", role: "assistant", content: runningText, streaming: true }),
              toolCalls: [...toolCalls],
            }));
          } else if (event === "tool_result") {
            const last = [...toolCalls].reverse().find((t) => t.key === payload.key && t.output === undefined && !t.error);
            if (last) {
              if (payload.error) last.error = payload.error;
              else last.output = payload.output;
            }
            setStreamingMsg((prev) => ({
              ...(prev ?? { id: "streaming", role: "assistant", content: runningText, streaming: true }),
              toolCalls: [...toolCalls],
            }));
          } else if (event === "done") {
            receivedDoneEvent = true;
            // Streaming complete — refetch persisted history so the canonical
            // assistant row replaces the in-memory streaming bubble.
            utils.integratorChat.listMessages.invalidate({ conversationId });
            utils.integratorChat.listConversations.invalidate();
            // Also refresh the action-queue panel to show any new tasks.
            utils.agentTeams.consoleSummary.invalidate();
          } else if (event === "error") {
            lastErrorFromServer = payload.message ?? "Stream error";
            // Don't throw — keep the connection open so we can render the
            // server's error inline. The server typically sends `done` or
            // ends the stream right after.
          }
        }
      }

      // Stream ended. If we got an error event but no done event, surface it
      // as a visible error bubble so Marcin can see what failed.
      if (lastErrorFromServer && !receivedDoneEvent) {
        setStreamingMsg({
          id: `error-${Date.now()}`,
          role: "assistant",
          content: "",
          errorMessage: lastErrorFromServer,
          phase: "error",
        });
        toast.error(`Integrator: ${lastErrorFromServer}`);
        return;
      }

      // If the stream ended with no done and no error, surface a visible
      // "stream ended unexpectedly" so we don't silently fail.
      if (!receivedDoneEvent && !lastErrorFromServer) {
        setStreamingMsg({
          id: `incomplete-${Date.now()}`,
          role: "assistant",
          content: runningText,
          errorMessage:
            "The Integrator stream ended without a completion signal. The response above (if any) may be partial. Try resending — if this keeps happening, check Railway logs for `[integrator-stream]` errors.",
          phase: "error",
        });
        toast.error("Integrator stream ended early");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "AbortError" || msg.toLowerCase().includes("aborted")) {
        // User-initiated abort — clear silently.
        return;
      }
      // Render the error visibly in the bubble so Marcin can read it without
      // hunting for a toast.
      setStreamingMsg({
        id: `error-${Date.now()}`,
        role: "assistant",
        content: "",
        errorMessage: msg,
        phase: "error",
      });
      toast.error(`Integrator: ${msg}`);
    } finally {
      setPending(false);
      abortRef.current = null;
      // Keep the streaming bubble (whether content, success placeholder
      // pending invalidation, or error) for one tick so the user sees the
      // result; the listMessages refetch will replace it if persisted.
      if (receivedDoneEvent) {
        // Successful completion — the persisted message will replace this.
        setStreamingMsg(null);
        setLocalUserMsg(null);
      }
      // For errors, leave streamingMsg + localUserMsg in place so the
      // operator can see what was sent + what the failure was.
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || pending) return;
    const text = draft.trim();
    setDraft("");
    if (activeId !== null) {
      sendStreaming(activeId, text);
    } else {
      // Create a conversation, then send.
      createConv.mutate(
        {},
        {
          onSuccess: (res) => {
            setActiveId(res.id);
            sendStreaming(res.id, text);
          },
        }
      );
    }
  }

  function handleInterrupt() {
    abortRef.current?.abort();
    setPending(false);
    setStreamingMsg(null);
  }

  // ── Mobile action drawer ───────────────────────────────────────────────────
  const [drawerOpen, setDrawerOpen] = useState(false);

  // ── Compose final message list (history + streaming bubble) ───────────────
  const persisted = (messagesQ.data ?? []) as Array<{
    id: number;
    role: ChatRole | "tool";
    content: string;
    toolCalls: string | null;
    costUsd: string | null;
    inputTokens: number;
    outputTokens: number;
  }>;
  const messages: ChatMsg[] = useMemo(() => {
    const out: ChatMsg[] = persisted
      .filter((m) => m.role !== "tool")
      .map((m) => ({
        id: m.id,
        role: m.role as ChatRole,
        content: m.content,
        costUsd: m.costUsd,
        inputTokens: m.inputTokens,
        outputTokens: m.outputTokens,
        toolCalls: m.toolCalls
          ? (() => {
              try {
                const p = JSON.parse(m.toolCalls);
                return Array.isArray(p) ? p : [];
              } catch {
                return [];
              }
            })()
          : undefined,
      }));
    if (localUserMsg) out.push(localUserMsg);
    if (streamingMsg) out.push(streamingMsg);
    return out;
  }, [persisted, streamingMsg, localUserMsg]);

  return (
    <AdminShell>
      <div className="space-y-3">
        {/* Header band */}
        <div className="flex items-start sm:items-center justify-between gap-3 flex-col sm:flex-row">
          <div>
            <h1 className="text-xl sm:text-2xl font-semibold flex items-center gap-2">
              <Compass className="w-5 h-5 text-primary" />
              Visionary Console
            </h1>
            <p className="text-xs sm:text-sm text-muted-foreground mt-0.5">
              Your cockpit. Tell the Integrator what you're moving today — it routes the work.
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="outline"
              size="sm"
              onClick={() => createConv.mutate({})}
              disabled={createConv.isPending}
              className="min-h-[44px]"
            >
              + New chat
            </Button>
            <Link href="/admin/agents/teams">
              <Button variant="ghost" size="sm" className="min-h-[44px]">
                <Users className="w-4 h-4 mr-1" /> Teams
              </Button>
            </Link>
          </div>
        </div>

        {/* Three-pane grid (desktop) / stacked (mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr_320px] gap-3">
          {/* ── Left pane: KPIs + cost + chips ─────────────────────────── */}
          <div className="space-y-3 order-1 lg:order-1">
            <KpiPane />
            <CostPane />
            <AddresseePane addressee={addressee} onChange={setAddressee} />
          </div>

          {/* ── Center pane: chat ───────────────────────────────────────── */}
          <Card className="flex flex-col overflow-hidden h-[calc(100vh-12rem)] sm:h-[calc(100vh-13rem)] order-2 lg:order-2">
            <header className="px-3 sm:px-4 py-2.5 border-b flex items-center justify-between bg-card">
              <div className="flex items-center gap-2 text-xs sm:text-sm">
                <Bot className="w-4 h-4 text-primary" />
                <span className="font-semibold">{ADDRESSEE_LABEL[addressee]}</span>
                {addressee !== "integrator" && (
                  <Badge variant="outline" className="text-[10px]">
                    via Integrator
                  </Badge>
                )}
              </div>
              {pending && (
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  thinking…
                </div>
              )}
            </header>

            <div
              ref={messagesRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto px-3 sm:px-4 py-3 space-y-3 bg-muted/20"
            >
              {messages.length === 0 ? (
                <ChatEmptyState />
              ) : (
                messages.map((m) => <MessageBubble key={String(m.id)} message={m} />)
              )}
              {!autoScroll && pending && (
                <button
                  type="button"
                  onClick={() => {
                    setAutoScroll(true);
                    const el = messagesRef.current;
                    if (el) el.scrollTop = el.scrollHeight;
                  }}
                  className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-card border rounded-full px-3 py-1.5 text-xs shadow"
                >
                  Resume auto-scroll
                </button>
              )}
            </div>

            <form
              onSubmit={handleSubmit}
              className="border-t p-2 sm:p-3 flex flex-col gap-2 bg-card"
              style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
            >
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder={
                  pending
                    ? "Streaming response — type to queue your next directive…"
                    : `Tell ${ADDRESSEE_LABEL[addressee]} what to move…`
                }
                rows={2}
                className="min-h-[60px] text-base resize-none"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && (e.metaKey || e.ctrlKey || !e.shiftKey)) {
                    if (!e.shiftKey) {
                      e.preventDefault();
                      handleSubmit(e as unknown as FormEvent);
                    }
                  }
                }}
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-muted-foreground hidden sm:inline">
                  Enter to send · Shift+Enter for newline
                </span>
                <div className="flex gap-2 ml-auto">
                  {pending && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={handleInterrupt}
                      className="min-h-[44px]"
                    >
                      Stop
                    </Button>
                  )}
                  <Button
                    type="submit"
                    size="sm"
                    disabled={!draft.trim() || pending}
                    className="min-h-[44px] min-w-[88px]"
                  >
                    <Send className="w-3.5 h-3.5 mr-1" /> Send
                  </Button>
                </div>
              </div>
            </form>
          </Card>

          {/* ── Right pane: action queue (desktop) ───────────────────────── */}
          <div className="hidden lg:block order-3">
            <ActionQueuePane />
          </div>
        </div>

        {/* ── Mobile bottom drawer trigger ───────────────────────────────── */}
        <button
          type="button"
          onClick={() => setDrawerOpen(true)}
          className="lg:hidden fixed bottom-4 right-4 z-30 bg-primary text-primary-foreground rounded-full px-4 py-3 shadow-lg flex items-center gap-2 min-h-[48px]"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          <ChevronUp className="w-4 h-4" />
          <span className="text-sm font-medium">Action queue</span>
        </button>
      </div>

      {/* ── Mobile bottom drawer ───────────────────────────────────────────── */}
      {drawerOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col">
          <div className="flex-1 bg-black/50" onClick={() => setDrawerOpen(false)} />
          <div
            className="bg-background border-t-2 border-primary/30 rounded-t-2xl max-h-[80vh] overflow-y-auto"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="sticky top-0 bg-background border-b px-4 py-3 flex items-center justify-between z-10">
              <h2 className="text-sm font-semibold">Action queue</h2>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center"
                aria-label="Close drawer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3">
              <ActionQueuePane />
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Sub-components
// ────────────────────────────────────────────────────────────────────────────

function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 sm:py-16 gap-3">
      <Sparkles className="w-8 h-8 text-primary/60" />
      <h2 className="text-base font-semibold">Welcome, Marcin.</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        The Visionary Console is your operating cockpit. Tell me what you're moving today —
        I'll route work to the right team, queue drafts for your review, and surface the
        signals that matter.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-w-md w-full mt-2">
        {[
          "What's the riskiest thing in the next 7 days?",
          "Which path-A leads are stuck and need a nudge?",
          "Pull margin and lead volume since last Monday.",
          "Pause Marketing for the weekend if spend is over plan.",
        ].map((p) => (
          <div
            key={p}
            className="text-xs text-left px-3 py-2 rounded-md bg-card border text-muted-foreground"
          >
            {p}
          </div>
        ))}
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: ChatMsg }) {
  const isUser = message.role === "user";
  const tools = message.toolCalls ?? [];
  const hasError = !!message.errorMessage;

  // Phase-driven placeholder copy when nothing has streamed yet.
  let placeholder: React.ReactNode = null;
  if (!message.content && !hasError) {
    if (message.phase === "connecting") placeholder = <span className="opacity-60 italic">Opening stream…</span>;
    else if (message.phase === "thinking") placeholder = <span className="opacity-60 italic">Connected — waiting for the model to start…</span>;
    else if (message.streaming) placeholder = <span className="opacity-60 italic">Thinking…</span>;
    else placeholder = <em className="opacity-60">(no text)</em>;
  }

  return (
    <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
      <div
        className={
          "max-w-[88%] flex flex-col gap-1.5 " + (isUser ? "items-end" : "items-start")
        }
      >
        {hasError && (
          <div className="rounded-2xl px-3.5 py-2.5 text-sm bg-red-50 border border-red-200 text-red-900 max-w-full break-words">
            <div className="flex items-center gap-1.5 font-semibold text-xs uppercase tracking-wider mb-1">
              <AlertCircle className="w-3.5 h-3.5" />
              Stream failed
            </div>
            <div className="whitespace-pre-wrap text-xs">{message.errorMessage}</div>
            <p className="text-[10px] text-red-800/70 mt-1.5">
              Server logs (Railway) prefix these with <code className="font-mono">[integrator-stream]</code>.
            </p>
          </div>
        )}
        {(!hasError || message.content) && (
          <div
            className={
              "rounded-2xl px-3.5 py-2.5 text-sm whitespace-pre-wrap break-words " +
              (isUser
                ? "bg-primary text-primary-foreground"
                : "bg-card border text-foreground")
            }
          >
            {message.content || placeholder}
            {message.streaming && message.content && (
              <span className="inline-block w-1.5 h-4 ml-0.5 bg-current opacity-60 animate-pulse rounded-sm align-middle" />
            )}
          </div>
        )}
        {tools.length > 0 && (
          <details className="text-xs bg-card border rounded-md px-2.5 py-1.5 max-w-full self-stretch">
            <summary className="cursor-pointer text-muted-foreground select-none">
              {tools.length} tool call{tools.length === 1 ? "" : "s"}
              {tools.some((t) => t.requiresApproval) && (
                <Badge variant="outline" className="ml-2 text-[10px]">approval</Badge>
              )}
              {tools.some((t) => t.error) && (
                <Badge variant="destructive" className="ml-2 text-[10px]">error</Badge>
              )}
            </summary>
            <ul className="mt-2 space-y-2">
              {tools.map((t, idx) => (
                <li key={idx} className="border-t pt-1.5 first:border-0 first:pt-0">
                  <div className="font-mono text-[11px] font-semibold">{t.key}</div>
                  <pre className="text-[11px] bg-muted/40 rounded px-2 py-1 mt-1 overflow-x-auto">
                    {JSON.stringify(t.input, null, 2)}
                  </pre>
                  {t.output !== undefined && (
                    <pre className="text-[11px] bg-muted/30 rounded px-2 py-1 mt-1 overflow-x-auto max-h-32 overflow-y-auto">
                      {typeof t.output === "string" ? t.output : JSON.stringify(t.output, null, 2)}
                    </pre>
                  )}
                  {t.error && <p className="text-[11px] text-destructive mt-1">Error: {t.error}</p>}
                  {t.requiresApproval && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Parked in approval queue — review at{" "}
                      <Link href="/admin/ai-agents/tasks" className="underline">
                        /admin/ai-agents/tasks
                      </Link>
                      .
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
        {!isUser && !message.streaming && message.costUsd && (
          <div className="text-[10px] text-muted-foreground tabular-nums">
            ${Number(message.costUsd).toFixed(4)} · {message.inputTokens}↓/{message.outputTokens}↑ tok
          </div>
        )}
      </div>
    </div>
  );
}

function KpiPane() {
  const companyQ = trpc.kpis.company.useQuery();
  const metrics = companyQ.data ?? [];

  // Hero KPIs the prompt called out: path A→B %, gross margin %, monthly leads, member retention.
  // Map by metric `key` substring; show "—" if not yet reported.
  function find(prefixes: string[]): number | null {
    for (const m of metrics) {
      const k = m.key.toLowerCase();
      if (prefixes.some((p) => k.includes(p))) return Number(m.value);
    }
    return null;
  }
  const pathAtoB = find(["path_a_to_b", "patha_to_b", "membership_conversion"]);
  const grossMargin = find(["gross_margin", "margin_pct"]);
  const monthlyLeads = find(["leads_30d", "monthly_leads", "leads_monthly"]);
  const memberRetention = find(["member_retention", "retention_pct"]);

  function fmtPct(n: number | null): string {
    return n === null ? "—" : `${n.toFixed(1)}%`;
  }
  function fmtCount(n: number | null): string {
    return n === null ? "—" : Math.round(n).toLocaleString();
  }

  return (
    <Card className="p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Hero KPIs
      </div>
      <div className="grid grid-cols-2 gap-2">
        <KpiTile label="Path A→B" value={fmtPct(pathAtoB)} icon={<TrendingUp className="w-3.5 h-3.5" />} />
        <KpiTile label="Gross margin" value={fmtPct(grossMargin)} icon={<DollarSign className="w-3.5 h-3.5" />} />
        <KpiTile label="Leads (30d)" value={fmtCount(monthlyLeads)} icon={<Users className="w-3.5 h-3.5" />} />
        <KpiTile label="Member retn" value={fmtPct(memberRetention)} icon={<Sparkles className="w-3.5 h-3.5" />} />
      </div>
      <Link href="/admin/dashboard">
        <button className="text-[11px] text-muted-foreground hover:text-foreground mt-2 underline">
          Full dashboard →
        </button>
      </Link>
    </Card>
  );
}

function KpiTile({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-md bg-muted/30 border px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-base font-semibold tabular-nums mt-0.5">{value}</div>
    </div>
  );
}

function CostPane() {
  const agentsQ = trpc.aiAgents.list.useQuery();
  const agents = agentsQ.data ?? [];
  const totalToday = agents.reduce((s, a) => s + (a.costTodayUsd ?? 0), 0);

  // Aggregate by department
  const byDept = useMemo(() => {
    const m = new Map<string, number>();
    for (const a of agents) {
      m.set(a.department, (m.get(a.department) ?? 0) + (a.costTodayUsd ?? 0));
    }
    return Array.from(m.entries())
      .filter(([, v]) => v > 0)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);
  }, [agents]);

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Agent spend (24h)
        </div>
        <div className="text-base font-semibold tabular-nums">{formatUsd(totalToday)}</div>
      </div>
      {byDept.length === 0 ? (
        <p className="text-[11px] text-muted-foreground italic">
          No agent spend yet today — quiet runtime.
        </p>
      ) : (
        <ul className="space-y-1">
          {byDept.map(([dept, cost]) => (
            <li key={dept} className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground truncate">{departmentLabel(dept)}</span>
              <span className="font-medium tabular-nums">{formatUsd(cost)}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function AddresseePane({ addressee, onChange }: { addressee: Addressee; onChange: (a: Addressee) => void }) {
  const chips: Addressee[] = ["integrator", "marketing", "sales", "operations"];
  return (
    <Card className="p-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
        Talk to
      </div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={
              "text-xs px-2.5 py-1.5 rounded-full border transition min-h-[36px] " +
              (addressee === c
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card text-foreground hover:bg-muted")
            }
          >
            {ADDRESSEE_LABEL[c]}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-muted-foreground mt-2 leading-tight">
        Routes through the Integrator, who hands off to the team. Drafts come back here for your tap.
      </p>
    </Card>
  );
}

type ModalTarget =
  | { type: "task"; id: number }
  | { type: "message"; id: number }
  | { type: "violation"; id: number }
  | { type: "handoff"; id: number }
  | null;

function ActionQueuePane() {
  const summaryQ = trpc.agentTeams.consoleSummary.useQuery(undefined, { refetchInterval: 30_000 });
  const tasksQ = summaryQ.data?.activeTasks ?? [];
  const handoffsQ = summaryQ.data?.recentHandoffs ?? [];
  const messagesQ = summaryQ.data?.recentMessages ?? [];
  const violationsQ = summaryQ.data?.recentViolations ?? [];
  const blockedQ = summaryQ.data?.blockedTasks ?? [];
  const costRollup = summaryQ.data?.teamCostRollup ?? [];
  const pendingTasksQ = trpc.aiAgents.list.useQuery();
  const pendingDrafts = (pendingTasksQ.data ?? []).reduce((s, a) => s + (a.pendingDrafts ?? 0), 0);

  const [modal, setModal] = useState<ModalTarget>(null);

  // Top 5 spending teams today, sorted by spent (desc).
  const topSpendingTeams = [...costRollup]
    .filter((t) => t.spentTodayUsd > 0 || t.atCap)
    .sort((a, b) => b.spentTodayUsd - a.spentTodayUsd)
    .slice(0, 5);
  const teamsAtCap = costRollup.filter((t) => t.atCap);

  return (
    <div className="space-y-3">
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            AI drafts by opportunity
          </div>
          {pendingDrafts > 0 && (
            <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200">
              {pendingDrafts}
            </Badge>
          )}
        </div>
        {pendingDrafts === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No opportunity drafts waiting.
          </p>
        ) : (
          <Link href="/admin/ai-agents/tasks">
            <button className="w-full text-left text-xs px-2.5 py-2 rounded bg-amber-50 border border-amber-200 hover:bg-amber-100 transition">
              <span className="font-medium text-amber-900">{pendingDrafts}</span>
              <span className="text-amber-800"> opportunity draft{pendingDrafts === 1 ? "" : "s"} need a decision →</span>
            </button>
          </Link>
        )}
      </Card>

      {/* Phase 2 — blocked / cost-capped tasks need attention first */}
      {blockedQ.length > 0 && (
        <Card className="p-3 border-red-200 bg-red-50/40">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-red-800">
              Blocked / cost-capped
            </div>
            <Badge className="bg-red-100 text-red-800 border-red-200">{blockedQ.length}</Badge>
          </div>
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {blockedQ.slice(0, 6).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setModal({ type: "task", id: t.id })}
                  className="w-full text-left text-xs rounded px-1.5 py-1 hover:bg-red-100/60 transition min-h-[44px] flex flex-col justify-center"
                >
                  <div className="truncate font-medium text-red-900">{t.title}</div>
                  <div className="text-[10px] text-red-700/80">team #{t.teamId} · {t.status}</div>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Active team tasks
          </div>
          {tasksQ.length > 0 && (
            <Badge variant="outline">{tasksQ.length}</Badge>
          )}
        </div>
        {tasksQ.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            This task has no recent activity yet — your bench is composing its work.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-64 overflow-y-auto">
            {tasksQ.slice(0, 12).map((t) => (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setModal({ type: "task", id: t.id })}
                  className="w-full text-left text-xs rounded px-1.5 py-1 hover:bg-muted/60 transition min-h-[44px] flex items-start gap-2"
                >
                  <span className={`mt-2 inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${statusDot(t.status)}`} />
                  <div className="flex-1 min-w-0">
                    <div className="truncate">{t.title}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t.status} · {new Date(t.createdAt as unknown as string).toLocaleDateString()}
                    </div>
                  </div>
                  <ChevronDown className="w-3 h-3 mt-1 text-muted-foreground rotate-[-90deg] flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Phase 2 — inter-teammate DM stream */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent teammate DMs
          </div>
          {messagesQ.length > 0 && <Badge variant="outline">{messagesQ.length}</Badge>}
        </div>
        {messagesQ.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No teammate-to-teammate chatter yet.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-40 overflow-y-auto">
            {messagesQ.slice(0, 8).map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  onClick={() => setModal({ type: "message", id: m.id })}
                  className="w-full text-left text-[11px] border-l-2 border-primary/40 pl-2 pr-1 py-1 hover:bg-muted/50 rounded-r transition min-h-[44px] flex flex-col justify-center"
                >
                  <div className="text-muted-foreground">
                    seat #{m.fromSeatId} → seat #{m.toSeatId}
                  </div>
                  <div className="truncate">{m.body}</div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* Phase 2 — territory violations (if any) */}
      {violationsQ.length > 0 && (
        <Card className="p-3 border-amber-200 bg-amber-50/40">
          <div className="flex items-center justify-between mb-2">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Territory violations
            </div>
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">{violationsQ.length}</Badge>
          </div>
          <ul className="space-y-1.5 max-h-32 overflow-y-auto">
            {violationsQ.slice(0, 5).map((v) => (
              <li key={v.id}>
                <button
                  type="button"
                  onClick={() => setModal({ type: "violation", id: v.id })}
                  className="w-full text-left text-[11px] rounded px-1.5 py-1 hover:bg-amber-100/60 transition min-h-[44px] flex flex-col justify-center"
                >
                  <div className="text-amber-900 font-medium">
                    seat #{v.seatId} ({v.attemptedRole}) → {v.attemptedTerritory}
                  </div>
                  {v.attemptedKey && <div className="text-amber-800/80 truncate">key: {v.attemptedKey}</div>}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Phase 2 — per-team cost cap rail */}
      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Team cost (24h)
          </div>
          {teamsAtCap.length > 0 && (
            <Badge className="bg-red-100 text-red-800 border-red-200">{teamsAtCap.length} at cap</Badge>
          )}
        </div>
        {topSpendingTeams.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No team spend yet today.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {topSpendingTeams.map((t) => {
              const pct = t.capUsd > 0 ? Math.min(100, Math.round((t.spentTodayUsd / t.capUsd) * 100)) : 0;
              const barColor = t.atCap ? "bg-red-500" : pct > 75 ? "bg-amber-500" : "bg-emerald-500";
              return (
                <li key={t.teamId} className="text-[11px]">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="truncate">{t.name}</span>
                    <span className="tabular-nums text-muted-foreground">
                      ${t.spentTodayUsd.toFixed(2)} / ${t.capUsd.toFixed(2)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className={`h-full ${barColor} transition-all`} style={{ width: `${pct}%` }} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      <Card className="p-3">
        <div className="flex items-center justify-between mb-2">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Recent handoffs
          </div>
        </div>
        {handoffsQ.length === 0 ? (
          <p className="text-[11px] text-muted-foreground italic">
            No inter-team handoffs yet.
          </p>
        ) : (
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {handoffsQ.slice(0, 6).map((h) => (
              <li key={h.id}>
                <button
                  type="button"
                  onClick={() => setModal({ type: "handoff", id: h.id })}
                  className="w-full text-left text-xs rounded px-1.5 py-1 hover:bg-muted/60 transition min-h-[44px] flex items-center justify-between gap-2"
                >
                  <span>
                    <span className="font-medium">{h.eventType}</span>
                    <span className="text-muted-foreground"> · {h.status}</span>
                  </span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground rotate-[-90deg] flex-shrink-0" />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Link href="/admin/agents/runs">
          <button className="text-[11px] text-muted-foreground hover:text-foreground mt-2 underline">
            View runs →
          </button>
        </Link>
      </Card>

      {/* Detail modals */}
      <DetailModal open={modal !== null} onClose={() => setModal(null)}>
        {modal?.type === "task" && <TaskDetailContent id={modal.id} onClose={() => setModal(null)} />}
        {modal?.type === "message" && <MessageThreadContent id={modal.id} />}
        {modal?.type === "violation" && <ViolationDetailContent id={modal.id} onClose={() => setModal(null)} />}
        {modal?.type === "handoff" && <HandoffDetailContent id={modal.id} onClose={() => setModal(null)} />}
      </DetailModal>
    </div>
  );
}

function statusDot(s: string): string {
  switch (s) {
    case "open":
      return "bg-slate-400";
    case "claimed":
      return "bg-blue-500";
    case "in_progress":
      return "bg-amber-500";
    case "blocked":
      return "bg-red-500";
    case "done":
      return "bg-green-500";
    default:
      return "bg-slate-300";
  }
}

// ─── Shared detail modal wrapper ─────────────────────────────────────────────

function DetailModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent
        className="w-full max-w-lg sm:max-w-xl max-h-[90vh] overflow-y-auto p-0"
        onPointerDownOutside={onClose}
      >
        {children}
      </DialogContent>
    </Dialog>
  );
}

function ModalSection({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
      {children}
    </div>
  );
}

function JsonCollapse({ data }: { data: unknown }) {
  const [open, setOpen] = useState(false);
  if (data === null || data === undefined) return <span className="text-muted-foreground text-xs italic">none</span>;
  return (
    <details open={open} onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="text-xs text-muted-foreground cursor-pointer select-none">
        {open ? "hide payload" : "show payload"}
      </summary>
      <pre className="mt-1 text-[11px] bg-muted/40 rounded px-2 py-1.5 overflow-x-auto max-h-48 overflow-y-auto">
        {JSON.stringify(data, null, 2)}
      </pre>
    </details>
  );
}

function fmtTs(v: Date | string | null | undefined): string {
  if (!v) return "—";
  try {
    return new Date(v as string).toLocaleString();
  } catch {
    return String(v);
  }
}

// ─── Task detail ─────────────────────────────────────────────────────────────

function TaskDetailContent({ id, onClose }: { id: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.agentTeams.getTaskDetail.useQuery({ id });
  const cancelMut = trpc.agentTeams.updateTaskStatus.useMutation({
    onSuccess: () => { utils.agentTeams.consoleSummary.invalidate(); onClose(); },
  });
  const blockMut = trpc.agentTeams.updateTaskStatus.useMutation({
    onSuccess: () => { utils.agentTeams.consoleSummary.invalidate(); onClose(); },
  });

  if (q.isLoading) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading task…</div>;
  if (q.error || !q.data) return <div className="p-6 text-sm text-destructive">This task has no recent activity yet — your bench is composing its work.</div>;

  const { task, team, claimedBySeat, artifacts, recentRuns, recentDms } = q.data;
  const ownerFiles = Array.isArray(task.ownerFiles) ? (task.ownerFiles as string[]) : [];

  return (
    <div>
      <DialogHeader className="px-4 pt-4 pb-2 border-b">
        <DialogTitle className="flex items-start gap-2">
          <FileText className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
          <span className="leading-snug">{task.title}</span>
        </DialogTitle>
      </DialogHeader>
      <div className="p-4 space-y-4">
        {/* Status + meta row */}
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline" className="capitalize">{task.status}</Badge>
          <Badge variant="outline" className="capitalize">{task.priority}</Badge>
          {team && <Badge variant="secondary">{team.department} / {team.name}</Badge>}
        </div>

        {task.description && (
          <ModalSection label="Description">
            <p className="text-sm whitespace-pre-wrap">{task.description}</p>
          </ModalSection>
        )}

        <ModalSection label="Claimed by">
          <p className="text-sm">{claimedBySeat ? `${claimedBySeat.seatName} (${claimedBySeat.department})` : "unclaimed"}</p>
        </ModalSection>

        {task.sourceEventType && (
          <ModalSection label="Source event">
            <p className="text-sm font-mono">{task.sourceEventType}</p>
            <JsonCollapse data={task.sourceEventPayload} />
          </ModalSection>
        )}

        {ownerFiles.length > 0 && (
          <ModalSection label="Owner files / artifacts">
            <ul className="text-xs font-mono space-y-0.5">
              {ownerFiles.map((f, i) => <li key={i} className="truncate text-muted-foreground">{f}</li>)}
            </ul>
          </ModalSection>
        )}

        {artifacts.length > 0 && (
          <ModalSection label="Artifacts">
            <ul className="space-y-1">
              {artifacts.map((a) => (
                <li key={a.id} className="text-xs flex items-start gap-1.5">
                  <Badge variant="outline" className="text-[10px] flex-shrink-0">{a.territory}</Badge>
                  <span className="font-mono truncate">{a.key}</span>
                </li>
              ))}
            </ul>
          </ModalSection>
        )}

        <ModalSection label="Timestamps">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Created</dt><dd>{fmtTs(task.createdAt)}</dd>
            <dt className="text-muted-foreground">Due</dt><dd>{fmtTs(task.dueAt)}</dd>
            <dt className="text-muted-foreground">Completed</dt><dd>{fmtTs(task.completedAt)}</dd>
          </dl>
        </ModalSection>

        {recentRuns.length > 0 && (
          <ModalSection label="Recent runs">
            <ul className="space-y-1">
              {recentRuns.slice(0, 5).map((r) => (
                <li key={r.id} className="text-xs flex items-center gap-2">
                  <Badge
                    variant={r.status === "success" ? "default" : "destructive"}
                    className="text-[10px] flex-shrink-0"
                  >
                    {r.status}
                  </Badge>
                  <span className="text-muted-foreground">{fmtTs(r.createdAt)}</span>
                  <span className="tabular-nums text-muted-foreground">${Number(r.costUsd).toFixed(4)}</span>
                </li>
              ))}
            </ul>
          </ModalSection>
        )}

        {recentDms.length > 0 && (
          <ModalSection label="Recent team DMs">
            <ul className="space-y-1">
              {recentDms.slice(0, 4).map((m) => (
                <li key={m.id} className="text-[11px] border-l-2 border-primary/30 pl-2">
                  <div className="text-muted-foreground">seat #{m.fromSeatId} → seat #{m.toSeatId ?? "team"}</div>
                  <div className="truncate">{m.body}</div>
                </li>
              ))}
            </ul>
          </ModalSection>
        )}

        {task.notes && (
          <ModalSection label="Notes">
            <p className="text-xs whitespace-pre-wrap text-muted-foreground">{task.notes}</p>
          </ModalSection>
        )}

        {/* Actions */}
        {task.status !== "done" && (
          <div className="pt-2 flex flex-wrap gap-2 border-t">
            <Button
              variant="destructive"
              size="sm"
              className="min-h-[44px]"
              disabled={cancelMut.isPending}
              onClick={() => cancelMut.mutate({ taskId: id, status: "done", notes: "Cancelled by operator." })}
            >
              Cancel task
            </Button>
            {task.status !== "blocked" && (
              <Button
                variant="outline"
                size="sm"
                className="min-h-[44px]"
                disabled={blockMut.isPending}
                onClick={() => blockMut.mutate({ taskId: id, status: "blocked", notes: "Marked blocked by operator." })}
              >
                <ShieldAlert className="w-3.5 h-3.5 mr-1" /> Mark blocked
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Message thread ───────────────────────────────────────────────────────────

function roleBadgeColor(role: string | null): string {
  switch (role) {
    case "frontend": return "bg-blue-100 text-blue-800 border-blue-200";
    case "backend": return "bg-purple-100 text-purple-800 border-purple-200";
    case "qa": return "bg-green-100 text-green-800 border-green-200";
    case "lead": return "bg-amber-100 text-amber-800 border-amber-200";
    default: return "";
  }
}

function MessageThreadContent({ id }: { id: number }) {
  const q = trpc.agentTeams.getMessageThread.useQuery({ id });

  if (q.isLoading) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading thread…</div>;
  if (q.error || !q.data) return <div className="p-6 text-sm text-destructive">Could not load this thread. The DMs are still flowing.</div>;

  const { message, team, fromSeat, toSeat, fromSeatRole, threadMessages, threadRoot } = q.data;

  return (
    <div>
      <DialogHeader className="px-4 pt-4 pb-2 border-b">
        <DialogTitle className="flex items-start gap-2">
          <MessageSquare className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
          <span>DM thread #{threadRoot}</span>
        </DialogTitle>
      </DialogHeader>
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{fromSeat?.seatName ?? `seat #${message.fromSeatId}`}</span>
          {fromSeatRole && (
            <span className={`text-[10px] px-1.5 py-0.5 rounded border ${roleBadgeColor(fromSeatRole)}`}>
              {fromSeatRole}
            </span>
          )}
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">{toSeat?.seatName ?? (message.toSeatId ? `seat #${message.toSeatId}` : "team broadcast")}</span>
          {team && <Badge variant="secondary" className="text-[10px]">{team.name}</Badge>}
        </div>

        <ModalSection label="Message">
          <p className="text-sm whitespace-pre-wrap bg-muted/30 rounded px-3 py-2">{message.body}</p>
        </ModalSection>

        <ModalSection label="Sent">
          <p className="text-xs text-muted-foreground">{fmtTs(message.createdAt)}</p>
        </ModalSection>

        {threadMessages.length > 0 && (
          <ModalSection label={`Thread (${threadMessages.length} more message${threadMessages.length === 1 ? "" : "s"})`}>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {threadMessages.map((m) => (
                <li key={m.id} className="text-xs border-l-2 border-primary/30 pl-2">
                  <div className="text-muted-foreground">seat #{m.fromSeatId} → {m.toSeatId ? `seat #${m.toSeatId}` : "team"} · {fmtTs(m.createdAt)}</div>
                  <div className="mt-0.5 whitespace-pre-wrap">{m.body}</div>
                </li>
              ))}
            </ul>
          </ModalSection>
        )}
      </div>
    </div>
  );
}

// ─── Violation detail ─────────────────────────────────────────────────────────

function ViolationDetailContent({ id, onClose }: { id: number; onClose: () => void }) {
  const q = trpc.agentTeams.getViolationDetail.useQuery({ id });

  if (q.isLoading) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading violation…</div>;
  if (q.error || !q.data) return <div className="p-6 text-sm text-destructive">Could not load this violation record.</div>;

  const { violation, seat, team, repeatCount } = q.data;

  return (
    <div>
      <DialogHeader className="px-4 pt-4 pb-2 border-b">
        <DialogTitle className="flex items-start gap-2">
          <ShieldAlert className="w-4 h-4 mt-0.5 text-amber-600 flex-shrink-0" />
          Territory violation
        </DialogTitle>
      </DialogHeader>
      <div className="p-4 space-y-4">
        <div className="flex flex-wrap gap-2">
          <Badge className="bg-amber-100 text-amber-800 border-amber-200">{violation.attemptedRole}</Badge>
          <Badge variant="outline">{violation.attemptedTerritory}</Badge>
          {repeatCount > 1 && (
            <Badge variant="destructive">{repeatCount}× repeat offender</Badge>
          )}
        </div>

        <ModalSection label="Seat">
          <p className="text-sm">{seat ? `${seat.seatName} (${seat.department})` : `seat #${violation.seatId}`}</p>
        </ModalSection>

        {team && (
          <ModalSection label="Team">
            <p className="text-sm">{team.name} · {team.department}</p>
          </ModalSection>
        )}

        {violation.attemptedKey && (
          <ModalSection label="File path">
            <p className="text-xs font-mono break-all">{violation.attemptedKey}</p>
          </ModalSection>
        )}

        {violation.reason && (
          <ModalSection label="Reason">
            <p className="text-sm">{violation.reason}</p>
          </ModalSection>
        )}

        <ModalSection label="When">
          <p className="text-xs text-muted-foreground">{fmtTs(violation.createdAt)}</p>
        </ModalSection>

        <div className="pt-2 flex flex-wrap gap-2 border-t">
          <Button
            variant="outline"
            size="sm"
            className="min-h-[44px]"
            onClick={() => {
              toast.success("Violation acknowledged.");
              onClose();
            }}
          >
            Acknowledge
          </Button>
          <Button
            variant="secondary"
            size="sm"
            className="min-h-[44px]"
            onClick={() => {
              toast.info(`Investigating seat ${seat?.seatName ?? `#${violation.seatId}`} — check /admin/agents/teams for seat details.`);
              onClose();
            }}
          >
            Investigate this seat
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Handoff detail ───────────────────────────────────────────────────────────

function HandoffDetailContent({ id, onClose }: { id: number; onClose: () => void }) {
  const utils = trpc.useUtils();
  const q = trpc.agentTeams.getHandoffDetail.useQuery({ id });
  const acceptMut = trpc.agentTeams.acceptHandoff.useMutation({
    onSuccess: () => { utils.agentTeams.consoleSummary.invalidate(); onClose(); },
  });
  const declineMut = trpc.agentTeams.declineHandoff.useMutation({
    onSuccess: () => { utils.agentTeams.consoleSummary.invalidate(); onClose(); },
  });

  if (q.isLoading) return <div className="p-6 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Loading handoff…</div>;
  if (q.error || !q.data) return <div className="p-6 text-sm text-destructive">Could not load this handoff record.</div>;

  const { handoff, fromTeam, toTeam } = q.data;

  return (
    <div>
      <DialogHeader className="px-4 pt-4 pb-2 border-b">
        <DialogTitle className="flex items-start gap-2">
          <ArrowRight className="w-4 h-4 mt-0.5 text-primary flex-shrink-0" />
          Handoff: {handoff.eventType}
        </DialogTitle>
      </DialogHeader>
      <div className="p-4 space-y-4">
        <div className="flex items-center gap-2 text-sm flex-wrap">
          <span className="font-medium">{fromTeam?.name ?? `team #${handoff.fromTeamId}`}</span>
          <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          <span className="font-medium">{toTeam?.name ?? `team #${handoff.toTeamId}`}</span>
          <Badge
            variant={handoff.status === "accepted" ? "default" : handoff.status === "declined" ? "destructive" : "outline"}
            className="capitalize"
          >
            {handoff.status}
          </Badge>
        </div>

        <ModalSection label="Payload">
          <JsonCollapse data={handoff.payload} />
        </ModalSection>

        <ModalSection label="Timeline">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs">
            <dt className="text-muted-foreground">Proposed</dt><dd>{fmtTs(handoff.createdAt)}</dd>
            {handoff.acceptedAt && <><dt className="text-muted-foreground">Accepted</dt><dd>{fmtTs(handoff.acceptedAt)}</dd></>}
            {handoff.declinedAt && <><dt className="text-muted-foreground">Declined</dt><dd>{fmtTs(handoff.declinedAt)}</dd></>}
          </dl>
        </ModalSection>

        {handoff.declineReason && (
          <ModalSection label="Decline reason">
            <p className="text-sm">{handoff.declineReason}</p>
          </ModalSection>
        )}

        {handoff.status === "pending" && (
          <div className="pt-2 flex flex-wrap gap-2 border-t">
            <Button
              size="sm"
              className="min-h-[44px]"
              disabled={acceptMut.isPending}
              onClick={() => acceptMut.mutate({ id })}
            >
              Accept handoff
            </Button>
            <Button
              variant="destructive"
              size="sm"
              className="min-h-[44px]"
              disabled={declineMut.isPending}
              onClick={() => declineMut.mutate({ id, reason: "Declined by operator." })}
            >
              Decline
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
