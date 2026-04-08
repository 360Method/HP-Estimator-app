/**
 * useInboxSSE
 * Connects to the server's SSE endpoint and fires callbacks when
 * new messages or conversations arrive.
 */

import { useEffect, useRef } from "react";

interface SSECallbacks {
  onNewMessage?: (conversationId: number, message: unknown) => void;
  onNewConversation?: (conversation: unknown) => void;
}

export function useInboxSSE({ onNewMessage, onNewConversation }: SSECallbacks) {
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const es = new EventSource("/api/inbox/events");
    esRef.current = es;

    es.addEventListener("new_message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onNewMessage?.(data.conversationId, data.message);
      } catch {}
    });

    es.addEventListener("new_conversation", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onNewConversation?.(data.conversation);
      } catch {}
    });

    es.onerror = () => {
      // EventSource auto-reconnects on error
      console.warn("[SSE] Connection error, will retry...");
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, []);
}
