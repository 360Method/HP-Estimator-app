/**
 * NewLeadBanner — persistent, app-wide alert for items the operator must
 * see. Surfaces TWO kinds of unread notifications:
 *
 *   1. new_lead / new_booking — gold/amber banner: "New lead from …"
 *   2. draft_needs_approval   — sky banner: "<customer>'s draft is awaiting
 *                                your approval — review now"
 *
 * Sits above MetricsBar inside AdminApp so it shows on EVERY admin page.
 * Polls the notifications feed for unread events. Each unread event
 * surfaces as a one-line banner. Tap to open that customer's profile
 * (which marks the row read and, for drafts, scrolls to Pending Review).
 *
 * Auto-collapses to a compact pill once dismissed locally so the operator
 * isn't punished for acknowledging — but the bell still owns the canonical
 * unread count, and a fresh notification reopens the banner.
 *
 * Hidden on the relevant inbox surface (Leads inbox for new leads, Drafts
 * inbox for drafts) so we don't shout about rows that are already in front
 * of the operator.
 */
import { useEffect, useMemo, useState } from "react";
import { Bell, X, ChevronRight, Star, Sparkles } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useEstimator } from "@/contexts/EstimatorContext";

const DISMISSED_KEY = "hp:new-lead-banner:dismissed";

function readDismissed(): Set<number> {
  try {
    const raw = sessionStorage.getItem(DISMISSED_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? (arr as number[]) : []);
  } catch {
    return new Set();
  }
}
function writeDismissed(set: Set<number>) {
  try {
    sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(Array.from(set).slice(-50)));
  } catch {
    /* ignore quota */
  }
}

function fmtAgo(iso: string | Date | null | undefined): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  const ms = Date.now() - t;
  const m = Math.floor(ms / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return new Date(iso).toLocaleDateString();
}

export default function NewLeadBanner() {
  const { state, navigateToTopLevel, setActiveCustomer } = useEstimator();
  const utils = trpc.useUtils();

  // Pull the most-recent notifications. We need to filter for new-lead events
  // and unread state on the client because the server query doesn't take a
  // type filter today and we don't want to widen its surface for one banner.
  const { data: items = [] } = trpc.notifications.list.useQuery(
    { limit: 20 },
    { refetchInterval: 30_000, staleTime: 15_000 },
  );

  const markRead = trpc.notifications.markRead.useMutation({
    onSuccess: () => utils.notifications.list.invalidate(),
  });

  const [dismissed, setDismissed] = useState<Set<number>>(() => readDismissed());

  // Reset dismissals if a new event arrives — fresh leads override the
  // operator's earlier "X" so we never silently swallow a real signal.
  useEffect(() => {
    const ids = new Set(items.map((i) => i.id));
    setDismissed((d) => {
      const next = new Set<number>();
      for (const id of d) if (ids.has(id)) next.add(id);
      writeDismissed(next);
      return next;
    });
  }, [items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const banners = useMemo(() => {
    return items
      .filter((n) => !n.readAt)
      .filter(
        (n) =>
          n.eventType === "new_lead" ||
          n.eventType === "new_booking" ||
          n.eventType === "draft_needs_approval",
      )
      .filter((n) => !dismissed.has(n.id))
      .slice(0, 3); // never stack more than three
  }, [items, dismissed]);

  // Hide the banner when the operator is already on the surface that owns
  // the corresponding rows.
  const hiddenOnSection =
    state.activeSection === "leads" ||
    state.activeSection === "requests";

  if (hiddenOnSection || banners.length === 0) return null;

  const handleOpen = (n: typeof banners[number]) => {
    markRead.mutate({ id: n.id });
    if (n.customerId) {
      const focus = n.eventType === "draft_needs_approval" ? "pending-review" : null;
      setActiveCustomer(n.customerId, "direct", focus);
    } else {
      navigateToTopLevel("leads");
    }
  };

  const isDraft = (eventType: string) => eventType === "draft_needs_approval";

  const bannerWrapClass = (eventType: string) =>
    isDraft(eventType)
      ? "sticky top-0 z-40 bg-gradient-to-r from-sky-600 to-sky-700 text-white shadow-md no-print"
      : "sticky top-0 z-40 bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md no-print";

  const handleDismiss = (id: number) => {
    setDismissed((d) => {
      const next = new Set(d);
      next.add(id);
      writeDismissed(next);
      return next;
    });
  };

  // Group leads and drafts so each renders in its own colored band.
  const leadBanners = banners.filter((n) => !isDraft(n.eventType));
  const draftBanners = banners.filter((n) => isDraft(n.eventType));

  const renderRow = (n: typeof banners[number], i: number, total: number, accent: string) => {
    const customerName = (n as any).customerName as string | null | undefined;
    const draft = isDraft(n.eventType);
    let primary: string;
    if (draft) {
      primary = customerName
        ? `${customerName}'s draft is awaiting your approval`
        : "A draft is awaiting your approval";
    } else {
      const sourceMatch = n.body?.match(/from\s+([^.]+)/i);
      const sourceLabel = sourceMatch?.[1]?.trim() ?? "a new contact";
      primary = `New lead from ${sourceLabel}${customerName ? ` — ${customerName}` : ""}`;
    }
    return (
      <div
        key={n.id}
        className={`flex items-center gap-3 px-4 sm:px-6 ${i > 0 ? `border-t ${accent}` : ""}`}
        style={{ minHeight: 44 }}
      >
        <button
          onClick={() => handleOpen(n)}
          className="flex-1 flex items-center gap-2 sm:gap-3 py-2 text-left min-w-0"
        >
          <span className="shrink-0 w-7 h-7 rounded-full bg-white/15 flex items-center justify-center">
            {draft ? <Sparkles className="w-3.5 h-3.5" /> : <Star className="w-3.5 h-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs sm:text-sm font-semibold truncate">
              {primary}
            </div>
            <div className="text-[10px] sm:text-[11px] text-white/80 truncate">
              {draft ? "Tap to review →" : n.title} · {fmtAgo(n.createdAt)}
            </div>
          </div>
          <ChevronRight className="w-4 h-4 shrink-0 opacity-80" />
        </button>
        <button
          onClick={() => handleDismiss(n.id)}
          className="shrink-0 p-2 rounded-md hover:bg-white/15 text-white/80 hover:text-white transition-colors"
          title="Dismiss for now"
          style={{ minWidth: 44, minHeight: 44 }}
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="sticky top-0 z-40 no-print">
      {leadBanners.length > 0 && (
        <div className="bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md relative">
          {leadBanners.map((n, i) => renderRow(n, i, leadBanners.length, "border-amber-400/40"))}
          <button
            onClick={() => navigateToTopLevel("leads")}
            className="hidden sm:flex items-center gap-1 absolute right-3 -bottom-3 translate-y-full bg-white border border-amber-200 text-amber-700 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full shadow"
          >
            <Bell className="w-3 h-3" /> Open Leads
          </button>
        </div>
      )}
      {draftBanners.length > 0 && (
        <div className="bg-gradient-to-r from-sky-600 to-sky-700 text-white shadow-md">
          {draftBanners.map((n, i) => renderRow(n, i, draftBanners.length, "border-sky-400/40"))}
        </div>
      )}
    </div>
  );
}
