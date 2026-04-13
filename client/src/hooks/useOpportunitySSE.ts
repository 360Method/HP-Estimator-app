/**
 * useOpportunitySSE — listens to the shared /api/inbox/events SSE stream
 * for `opportunity_updated` events and dispatches UPDATE_OPPORTUNITY into
 * EstimatorContext so the pro-side pipeline reflects portal changes in real time.
 *
 * Also listens for `portal_message` events and increments the portal unread
 * count in local state so the Inbox badge updates without a page refresh.
 */
import { useEffect, useRef } from "react";
import { useEstimator } from "@/contexts/EstimatorContext";

export function useOpportunitySSE(isAuthenticated: boolean) {
  const { dispatch } = useEstimator();
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (esRef.current) return; // already connected

    const es = new EventSource("/api/inbox/events", { withCredentials: true });
    esRef.current = es;

    es.addEventListener("opportunity_updated", (e) => {
      try {
        const data = JSON.parse(e.data);
        if (!data?.opportunityId) return;
        const update: Record<string, unknown> = {};
        if (data.stage !== undefined) update.stage = data.stage;
        if (data.wonAt !== undefined) update.wonAt = data.wonAt;
        if (data.portalApprovedAt !== undefined) update.portalApprovedAt = data.portalApprovedAt;
        if (data.updatedAt !== undefined) update.updatedAt = data.updatedAt;
        dispatch({
          type: "UPDATE_OPPORTUNITY",
          id: data.opportunityId,
          payload: update,
        });
        console.log("[SSE] opportunity_updated:", data.opportunityId, update);
      } catch {
        // ignore parse errors
      }
    });

    es.addEventListener("portal_message", () => {
      // Invalidate the unread count — the MetricsBar will re-query
      // We dispatch a no-op to trigger a re-render so polling hooks re-fire
      dispatch({ type: "PORTAL_UNREAD_PING" });
    });

    es.onerror = () => {
      // EventSource auto-reconnects; just log
      console.warn("[SSE] Connection error, will retry...");
    };

    return () => {
      es.close();
      esRef.current = null;
    };
  }, [isAuthenticated, dispatch]);
}
