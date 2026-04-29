import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { AdminShell } from "./AdminShell";

const STORAGE_KEY = "integrator.chat.activeConversationId";

type Message = {
  id: number;
  role: "user" | "assistant" | "tool";
  content: string;
  toolCalls: string | null;
  costUsd: string | null;
  createdAt: string | Date;
};

type ToolCallEntry = {
  key: string;
  input: unknown;
  output?: unknown;
  error?: string;
  requiresApproval?: boolean;
};

export default function IntegratorChat() {
  const utils = trpc.useUtils();
  const [activeId, setActiveId] = useState<number | null>(() => {
    const raw = typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    return raw ? Number(raw) : null;
  });
  const [draft, setDraft] = useState("");
  const [pending, setPending] = useState(false);
  const messagesRef = useRef<HTMLDivElement | null>(null);

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
  const archiveConv = trpc.integratorChat.archiveConversation.useMutation({
    onSuccess: () => {
      utils.integratorChat.listConversations.invalidate();
      setActiveId(null);
    },
  });
  const send = trpc.integratorChat.send.useMutation({
    onSuccess: () => {
      setDraft("");
      utils.integratorChat.listMessages.invalidate({ conversationId: activeId ?? 0 });
      utils.integratorChat.listConversations.invalidate();
    },
    onError: (err) => toast.error(err.message),
    onSettled: () => setPending(false),
  });

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (activeId !== null) {
      window.localStorage.setItem(STORAGE_KEY, String(activeId));
    }
  }, [activeId]);

  // Auto-scroll on new message
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messagesQ.data?.length, pending]);

  // If no conversation selected, default to most recent.
  useEffect(() => {
    if (activeId !== null) return;
    const list = conversationsQ.data ?? [];
    if (list.length > 0) setActiveId(list[0].id);
  }, [conversationsQ.data, activeId]);

  const conversations = conversationsQ.data ?? [];
  const messages = (messagesQ.data ?? []) as Message[];

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!draft.trim() || activeId === null || pending) return;
    setPending(true);
    send.mutate({ conversationId: activeId, message: draft.trim() });
  }

  function handleNew() {
    createConv.mutate({});
  }

  function handleInterrupt() {
    setPending(false);
    setDraft("");
    toast.message("Interrupt requested. Send a redirect message to continue.");
  }

  return (
    <AdminShell>
      <div className="grid grid-cols-[260px_1fr] gap-4 h-[calc(100vh-8rem)]">
        {/* ── Sidebar ─────────────────────────────────────────────────────── */}
        <Card className="p-3 flex flex-col gap-2 overflow-hidden">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Conversations</h2>
            <Button size="sm" variant="outline" onClick={handleNew} disabled={createConv.isPending}>
              + New
            </Button>
          </div>
          <div className="flex-1 overflow-y-auto -mx-1 px-1">
            {conversations.length === 0 ? (
              <p className="text-xs text-muted-foreground px-1 py-3">
                No conversations yet. Click + New to start chatting with the Integrator.
              </p>
            ) : (
              <ul className="space-y-1">
                {conversations.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => setActiveId(c.id)}
                      className={
                        "w-full text-left text-xs px-2 py-2 rounded transition " +
                        (c.id === activeId
                          ? "bg-primary/10 text-foreground font-medium"
                          : "hover:bg-muted text-muted-foreground")
                      }
                    >
                      <div className="truncate">{c.title || `Chat #${c.id}`}</div>
                      {c.lastMessageAt && (
                        <div className="text-[10px] opacity-70">
                          {new Date(c.lastMessageAt).toLocaleString()}
                        </div>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {activeId !== null && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => archiveConv.mutate({ id: activeId })}
              className="text-xs text-muted-foreground"
            >
              Archive current
            </Button>
          )}
        </Card>

        {/* ── Main pane ────────────────────────────────────────────────────── */}
        <Card className="flex flex-col overflow-hidden">
          <header className="px-4 py-3 border-b flex items-center justify-between">
            <div>
              <h1 className="text-base font-semibold">Integrator AI</h1>
              <p className="text-xs text-muted-foreground">
                Strategy + ops liaison. Chat persists across sessions.
              </p>
            </div>
            {pending && (
              <Badge variant="secondary" className="animate-pulse">
                Integrator is thinking…
              </Badge>
            )}
          </header>

          <div ref={messagesRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
            {activeId === null ? (
              <EmptyState onNew={handleNew} pending={createConv.isPending} />
            ) : messages.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                Start the conversation by sending a message below.
              </p>
            ) : (
              messages.map((m) => <MessageBubble key={m.id} message={m} />)
            )}
          </div>

          <form onSubmit={handleSubmit} className="border-t p-3 flex flex-col gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder={
                activeId === null
                  ? "Create a conversation to start chatting…"
                  : "Ask the Integrator anything — KPIs, agent runs, what to focus on this week…"
              }
              rows={3}
              disabled={activeId === null || pending}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  handleSubmit(e as unknown as FormEvent);
                }
              }}
            />
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                Cmd/Ctrl+Enter to send. The Integrator can call tools and queue tasks.
              </span>
              <div className="flex gap-2">
                {pending && (
                  <Button type="button" variant="ghost" size="sm" onClick={handleInterrupt}>
                    Interrupt
                  </Button>
                )}
                <Button
                  type="submit"
                  size="sm"
                  disabled={!draft.trim() || activeId === null || pending}
                >
                  {pending ? "Sending…" : "Send"}
                </Button>
              </div>
            </div>
          </form>
        </Card>
      </div>
    </AdminShell>
  );
}

function EmptyState({ onNew, pending }: { onNew: () => void; pending: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center gap-3">
      <div className="text-4xl">⌘</div>
      <h2 className="text-lg font-semibold">No conversation selected</h2>
      <p className="text-sm text-muted-foreground max-w-sm">
        Spin up a new chat with the Integrator. It has access to recent agent
        runs, pending approvals, KPIs, and the same tool library as the
        autonomous runtime.
      </p>
      <Button onClick={onNew} disabled={pending}>
        Start a new conversation
      </Button>
    </div>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === "user";
  const tools = useMemo<ToolCallEntry[]>(() => {
    if (!message.toolCalls) return [];
    try {
      const parsed = JSON.parse(message.toolCalls);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [message.toolCalls]);

  return (
    <div className={"flex " + (isUser ? "justify-end" : "justify-start")}>
      <div className={"max-w-[80%] " + (isUser ? "items-end" : "items-start") + " flex flex-col gap-2"}>
        <div
          className={
            "rounded-2xl px-4 py-3 text-sm whitespace-pre-wrap break-words " +
            (isUser
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground")
          }
        >
          {message.content || <em className="opacity-60">(no text)</em>}
        </div>
        {tools.length > 0 && (
          <details className="text-xs bg-card border rounded-md px-3 py-2 max-w-full">
            <summary className="cursor-pointer text-muted-foreground">
              {tools.length} tool call{tools.length === 1 ? "" : "s"}
              {tools.some((t) => t.requiresApproval) && (
                <Badge variant="outline" className="ml-2 text-[10px]">
                  approval needed
                </Badge>
              )}
              {tools.some((t) => t.error) && (
                <Badge variant="destructive" className="ml-2 text-[10px]">
                  error
                </Badge>
              )}
            </summary>
            <ul className="mt-2 space-y-2">
              {tools.map((t, idx) => (
                <li key={idx} className="border-t pt-2 first:border-0 first:pt-0">
                  <div className="font-mono text-[11px] font-semibold">{t.key}</div>
                  <pre className="text-[11px] bg-muted/40 rounded px-2 py-1 mt-1 overflow-x-auto">
                    {JSON.stringify(t.input, null, 2)}
                  </pre>
                  {t.output !== undefined && (
                    <pre className="text-[11px] bg-muted/30 rounded px-2 py-1 mt-1 overflow-x-auto">
                      {typeof t.output === "string" ? t.output : JSON.stringify(t.output, null, 2)}
                    </pre>
                  )}
                  {t.error && <p className="text-[11px] text-destructive mt-1">Error: {t.error}</p>}
                  {t.requiresApproval && (
                    <p className="text-[11px] text-amber-600 mt-1">
                      Parked in approval queue.
                    </p>
                  )}
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>
    </div>
  );
}

/**
 * Floating "Share to Integrator" button — drop it into any admin page that
 * wants to send a context snapshot to /admin/chat. Captures a snapshot the
 * Integrator can reason about, then redirects.
 *
 * Usage:
 *   import { ShareToIntegratorButton } from '@/pages/admin/IntegratorChat';
 *   <ShareToIntegratorButton snapshot={{ pageState }} sourceTitle="Pipeline" />
 */
export function ShareToIntegratorButton(props: {
  snapshot?: Record<string, unknown>;
  sourceTitle?: string;
  question?: string;
  className?: string;
}) {
  const start = trpc.integratorChat.startFromContext.useMutation({
    onSuccess: (res) => {
      try {
        window.localStorage.setItem(STORAGE_KEY, String(res.conversationId));
      } catch {
        // localStorage may be unavailable in some contexts; ignore.
      }
      window.location.href = "/admin/chat";
    },
    onError: (err) => toast.error(err.message),
  });
  return (
    <Button
      variant="outline"
      size="sm"
      className={props.className}
      onClick={() =>
        start.mutate({
          sourcePath: window.location.pathname,
          sourceTitle: props.sourceTitle,
          snapshot: props.snapshot,
          question: props.question,
        })
      }
      disabled={start.isPending}
    >
      Share to Integrator
    </Button>
  );
}
