/**
 * PortalMessages — Customer ↔ HP team chat.
 * HP brand colors, date grouping, auto-scroll, polling every 15s.
 */
import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Loader2, Send, Phone, Mail } from "lucide-react";
import { toast } from "sonner";

const HP_LOGO = "https://d2xsxph8kpxj0f.cloudfront.net/310519663386531688/jKW2dpQJM3yXZZUUDoADTE/hp-logo_42a4678f.jpg";

function fmtTime(ts: number | Date | null | undefined) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

function fmtDateLabel(ts: number | Date | null | undefined) {
  if (!ts) return "";
  const d = new Date(ts);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function PortalMessages() {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = trpc.portal.getMessages.useQuery(undefined, {
    refetchInterval: 15_000,
  });
  const messages = data ?? [];

  const sendMutation = trpc.portal.sendMessage.useMutation({
    onSuccess: () => {
      setText("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Group messages by date
  const grouped: { label: string; messages: typeof messages }[] = [];
  let lastLabel = "";
  for (const msg of messages) {
    const label = fmtDateLabel(msg.createdAt);
    if (label !== lastLabel) {
      grouped.push({ label, messages: [] });
      lastLabel = label;
    }
    grouped[grouped.length - 1].messages.push(msg);
  }

  return (
    <PortalLayout>
      <div className="flex flex-col h-[calc(100vh-56px)]">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <img src={HP_LOGO} alt="Handy Pioneers" className="w-10 h-10 rounded-lg object-contain border border-gray-100" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-gray-400 mb-0">Customer Portal &rsaquo; Messages</p>
              <h1 className="text-base font-semibold text-gray-900 leading-tight">Handy Pioneers</h1>
            </div>
            <div className="flex gap-2 shrink-0">
              <a
                href="tel:3605449858"
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#1a2e1a] transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
              >
                <Phone className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">(360) 544-9858</span>
              </a>
              <a
                href="mailto:help@handypioneers.com"
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#1a2e1a] transition-colors px-2 py-1 rounded-lg hover:bg-gray-100"
              >
                <Mail className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Email</span>
              </a>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4 space-y-6 bg-gray-50">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-[#c8922a]" />
            </div>
          ) : messages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <div
                className="w-14 h-14 rounded-full flex items-center justify-center mb-3"
                style={{ background: "rgba(26,46,26,0.08)" }}
              >
                <img src={HP_LOGO} alt="" className="w-8 h-8 rounded-md object-contain" />
              </div>
              <p className="text-sm font-medium text-gray-700 mb-1">Start a conversation</p>
              <p className="text-xs text-gray-400 max-w-xs">
                Send us a message and we'll get back to you within 1 business day.
              </p>
            </div>
          ) : (
            grouped.map((group) => (
              <div key={group.label}>
                {/* Date separator */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400 font-medium">{group.label}</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
                <div className="space-y-3">
                  {group.messages.map((msg) => {
                    const isCustomer = msg.senderRole === "customer";
                    return (
                      <div key={msg.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"} items-end gap-2`}>
                        {!isCustomer && (
                          <img src={HP_LOGO} alt="HP" className="w-7 h-7 rounded-md object-contain border border-gray-100 shrink-0 mb-0.5" />
                        )}
                        <div className={`max-w-xs sm:max-w-md lg:max-w-lg ${isCustomer ? "items-end" : "items-start"} flex flex-col`}>
                          {!isCustomer && msg.senderName && (
                            <p className="text-xs text-gray-500 mb-0.5 ml-1">{msg.senderName}</p>
                          )}
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm ${
                              isCustomer
                                ? "text-white rounded-br-sm"
                                : "bg-white border border-gray-200 text-gray-800 rounded-bl-sm shadow-sm"
                            }`}
                            style={isCustomer ? { background: "#1a2e1a" } : {}}
                          >
                            <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                          </div>
                          <p className={`text-xs mt-1 ${isCustomer ? "text-gray-400 text-right" : "text-gray-400 ml-1"}`}>
                            {fmtTime(msg.createdAt)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <textarea
              className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 min-h-[42px] max-h-32"
              style={{ "--tw-ring-color": "#c8922a" } as React.CSSProperties}
              placeholder="Type a message…"
              value={text}
              rows={1}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && text.trim()) {
                  e.preventDefault();
                  sendMutation.mutate({ body: text.trim() });
                }
              }}
            />
            <Button
              size="icon"
              disabled={!text.trim() || sendMutation.isPending}
              onClick={() => sendMutation.mutate({ body: text.trim() })}
              className="rounded-xl h-10 w-10 shrink-0 text-white"
              style={{ background: "#c8922a" }}
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-center text-gray-400 mt-1.5">
            We typically respond within 1 business day &bull; (360) 544-9858
          </p>
        </div>
      </div>
    </PortalLayout>
  );
}
