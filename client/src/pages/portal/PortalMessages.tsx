import { useState, useRef, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import PortalLayout from "@/components/PortalLayout";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";

function fmtTime(ts: number | Date | null | undefined) {
  if (!ts) return "";
  return new Date(ts).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default function PortalMessages() {
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, refetch } = trpc.portal.getMessages.useQuery();
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

  return (
    <PortalLayout>
      <div className="flex flex-col h-[calc(100vh-56px)]">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <p className="text-xs text-gray-400 mb-0.5">Customer Portal &rsaquo; Messages</p>
          <h1 className="text-xl font-semibold text-gray-900">Handy Pioneers</h1>
          <p className="text-xs text-gray-500">(360) 544-9858 | help@handypioneers.com</p>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <p className="text-sm">No messages yet. Send us a message below!</p>
            </div>
          ) : (
            messages.map((msg) => {
              const isCustomer = msg.senderRole === "customer";
              return (
                <div key={msg.id} className={`flex ${isCustomer ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-xs lg:max-w-md px-4 py-2.5 rounded-2xl text-sm ${
                      isCustomer
                        ? "bg-blue-600 text-white rounded-br-sm"
                        : "bg-gray-100 text-gray-800 rounded-bl-sm"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.body}</p>
                    <p className={`text-xs mt-1 ${isCustomer ? "text-blue-200" : "text-gray-400"}`}>
                      {fmtTime(msg.createdAt)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={bottomRef} />
        </div>

        {/* Compose */}
        <div className="bg-white border-t border-gray-200 px-4 py-3">
          <div className="flex gap-2 max-w-3xl mx-auto">
            <textarea
              className="flex-1 resize-none border border-gray-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[40px] max-h-32"
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
              className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl h-10 w-10 shrink-0"
              disabled={!text.trim() || sendMutation.isPending}
              onClick={() => sendMutation.mutate({ body: text.trim() })}
            >
              {sendMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
        </div>
      </div>
    </PortalLayout>
  );
}
