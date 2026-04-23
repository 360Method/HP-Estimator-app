/**
 * useInboxSSE
 * Connects to the server's SSE endpoint and fires callbacks when
 * new messages, conversations, portal messages, or opportunity updates arrive.
 */

import { useEffect, useRef } from "react";

interface SSECallbacks {
  onNewMessage?: (conversationId: number, message: unknown) => void;
  onNewConversation?: (conversation: unknown) => void;
  /** Fired when a portal customer sends a message (customerId, message) */
  onPortalMessage?: (customerId: number, message: unknown) => void;
  /** Fired when a portal action updates an opportunity (e.g. approved, stage change) */
  onOpportunityUpdated?: (opportunityId: string, data: unknown) => void;
}

export function useInboxSSE({
  onNewMessage,
  onNewConversation,
  onPortalMessage,
  onOpportunityUpdated,
}: SSECallbacks) {
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

    es.addEventListener("portal_message", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onPortalMessage?.(data.customerId, data.message);
      } catch {}
    });

    es.addEventListener("opportunity_updated", (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data);
        onOpportunityUpdated?.(data.opportunityId, data);
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
