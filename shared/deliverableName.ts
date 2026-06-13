/**
 * Customer-facing deliverable names. Every PDF we file in the portal or
 * attach to an email gets the same identity: who it is for, which home,
 * and when it was produced. Used by the spot-inspection orchestrator, the
 * funnel roadmap delivery, the remodel quick quote, and the portal
 * documents list.
 */

export type DeliverableKind =
  | "spot_roadmap"
  | "funnel_roadmap"
  | "remodel_options"
  | "estimate"
  | "other";

const KIND_LABELS: Record<DeliverableKind, string> = {
  spot_roadmap: "Spot inspection roadmap",
  funnel_roadmap: "Home maintenance roadmap",
  remodel_options: "Remodel options",
  estimate: "Estimate",
  other: "Document",
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

/** "1234 Main St, Vancouver, WA 98660" → "1234 Main St" */
export function streetOnly(address: string | null | undefined): string {
  return clean(address).split(",")[0]?.trim() ?? "";
}

function kebab(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * File-key slug: "nguyen-1234-main-st-2026-06-12-1430". Parts that are
 * missing simply drop out; the result is never empty (falls back to the
 * timestamp alone).
 */
export function buildDeliverableFileSlug(opts: {
  lastName?: string | null;
  street?: string | null;
  date?: Date;
}): string {
  const date = opts.date ?? new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}`;
  const parts = [kebab(clean(opts.lastName)), kebab(streetOnly(opts.street)), stamp].filter(Boolean);
  return parts.join("-");
}

/**
 * Display name: "Spot inspection roadmap, Nguyen, 1234 Main St, Jun 12 2026, 2:30 PM".
 * Missing identity parts drop out so a row never shows a dangling comma.
 */
export function buildDeliverableDisplayName(opts: {
  kind: DeliverableKind;
  lastName?: string | null;
  street?: string | null;
  date?: Date;
}): string {
  const date = opts.date ?? new Date();
  const dateLabel = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "America/Los_Angeles",
  });
  const timeLabel = date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/Los_Angeles",
  });
  const parts = [
    KIND_LABELS[opts.kind],
    clean(opts.lastName),
    streetOnly(opts.street),
    dateLabel,
    timeLabel,
  ].filter(Boolean);
  return parts.join(", ");
}
