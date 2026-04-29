/**
 * PortalCommunicationThread — Portal-native reply view.
 *
 * Customers land here from the "Open conversation in your portal" CTA at the
 * bottom of every customer-facing email. The :threadId URL param is the
 * base64 reply-token from the original outbound subject — it scopes the view
 * to that opportunity's email thread without exposing internal IDs.
 *
 * Goal: keep customers in HP's world. Replying here drops directly into the
 * communications timeline + fires the operator notification — no Gmail bounce.
 */
import { useState, useRef, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Loader2, Send, ArrowLeft, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const HP_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

function fmtTimestamp(ts: number | Date | string | null | undefined) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function PortalCommunicationThread() {
  const { threadId } = useParams<{ threadId: string }>();
  const [, navigate] = useLocation();
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, error, refetch } = trpc.portal.getThread.useQuery(
    { threadId: threadId ?? "" },
    {
      enabled: !!threadId,
      refetchInterval: 20_000,
      retry: false,
    },
  );

  const replyMutation = trpc.portal.replyToThread.useMutation({
    onSuccess: () => {
      setReply("");
      refetch();
      toast.success("Reply sent. We'll get back to you shortly.");
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  if (!threadId) {
    return (
      <PortalLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <AlertCircle className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm text-gray-500">Missing thread link.</p>
        </div>
      </PortalLayout>
    );
  }

  if (error) {
    return (
      <PortalLayout>
        <div className="flex flex-col items-center justify-center min-h-[60vh] px-6 text-center">
          <AlertCircle className="w-10 h-10 text-gray-300 mb-3" />
          <p className="text-sm font-medium text-gray-700 mb-1">Can't open this thread</p>
          <p className="text-xs text-gray-500 max-w-xs mb-4">{error.message}</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/portal/messages")}>
            Go to Messages
          </Button>
        </div>
      </PortalLayout>
    );
  }

  return (
    <PortalLayout>
      <div className="flex flex-col h-[calc(100vh-56px)]">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/portal/home")}
              className="p-1.5 -ml-1.5 rounded-lg hover:bg-gray-100 text-gray-500"
              aria-label="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            <img src={HP_LOGO} alt="Handy Pioneers" className="w-10 h-10 rounded-lg object-contain border border-gray-100" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-0">Customer Portal &rsaquo; Conversation</p>
              <h1 className="text-base font-semibold text-gray-900 leading-tight truncate">
                {data?.opportunityTitle ?? "Email thread"}
              </h1>
              {data?.opportunityStage && (
                <p className="text-xs text-gray-400 capitalize">{data.opportunityStage.replace(/_/g, " ")}</p>
              )}
            </div>
          </div>
        </div>

        {/* Thread */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-3 bg-gray-50">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#c8922a]" />
            </div>
          ) : data?.messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm font-medium text-gray-700 mb-1">No prior messages yet</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Start the conversation below — we'll respond within 1 business day.
              </p>
            </div>
          ) : (
            <>
              {(data?.messages ?? []).map((m) => {
                const isCustomer = m.direction === "inbound";
                return (
                  <div
                    key={m.id}
                    className={`flex ${isCustomer ? "justify-end" : "justify-start"} items-end gap-2`}
                  >
                    {!isCustomer && (
                      <img
                        src={HP_LOGO}
                        alt="HP"
                        className="w-7 h-7 rounded-md object-contain border border-gray-100 shrink-0 mb-0.5"
                      />
                    )}
                    <div className={`max-w-xs sm:max-w-md lg:max-w-lg flex flex-col ${isCustomer ? "items-end" : "items-start"}`}>
                      {m.subject && !isCustomer && (
                        <p className="text-xs text-gray-400 mb-0.5 ml-1 font-medium truncate max-w-full">
                          {m.subject.replace(/\s*\[#[^\]]+\]\s*$/, "")}
                        </p>
                      )}
                      <div
                        className={`px-4 py-2.5 rounded-2xl text-sm whitespace-pre-wrap leading-relaxed ${
                          isCustomer
                            ? "text-white rounded-br-sm"
                            : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
                        }`}
                        style={isCustomer ? { background: "#1a2e1a" } : {}}
                      >
                        {m.body}
                      </div>
                      <p className={`text-xs mt-1 ${isCustomer ? "text-gray-400 text-right" : "text-gray-400 ml-1"}`}>
                        {fmtTimestamp(m.sentAt)}
                        {m.isPortalReply && isCustomer && <span className="ml-1.5 text-[10px] uppercase tracking-wide">via portal</span>}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </>
          )}
        </div>

        {/* Composer */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="max-w-3xl mx-auto">
            <div className="flex gap-2">
              <textarea
                className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 min-h-[44px] max-h-40"
                style={{ "--tw-ring-color": "#c8922a" } as React.CSSProperties}
                placeholder="Reply to Handy Pioneers…"
                value={reply}
                rows={2}
                onChange={(e) => setReply(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey && reply.trim() && !replyMutation.isPending) {
                    e.preventDefault();
                    replyMutation.mutate({ threadId, body: reply.trim() });
                  }
                }}
              />
              <Button
                size="icon"
                disabled={!reply.trim() || replyMutation.isPending}
                onClick={() => replyMutation.mutate({ threadId, body: reply.trim() })}
                className="rounded-xl h-11 w-11 shrink-0 text-white self-end"
                style={{ background: "#c8922a" }}
              >
                {replyMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </Button>
            </div>
            <p className="text-xs text-center text-gray-400 mt-1.5">
              Replies land directly with our team &bull; we typically respond within 1 business day
            </p>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
