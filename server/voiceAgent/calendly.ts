/**
 * Calendly client for the voice agent. Calendly's API can read availability and
 * mint a single-use scheduling link, but it cannot create a confirmed booking
 * via API. So on a call we offer real openings and text the caller a one-tap
 * link; a Calendly webhook (server/_core webhook route) syncs the confirmed
 * appointment back into the portal.
 *
 * Env: CALENDLY_API_TOKEN, CALENDLY_EVENT_TYPE_URI.
 */
const API = "https://api.calendly.com";
const TZ = "America/Los_Angeles";

function token(): string {
  return process.env.CALENDLY_API_TOKEN || "";
}
function eventTypeUri(): string {
  return process.env.CALENDLY_EVENT_TYPE_URI || "";
}
export function calendlyConfigured(): boolean {
  return !!(token() && eventTypeUri());
}

async function cal(method: string, path: string, body?: unknown) {
  const r = await fetch(`${API}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: (await r.json().catch(() => null)) as any };
}

export interface Slot {
  startIso: string;
  label: string; // human, Pacific
}

export function formatPacific(iso: string): string {
  return (
    new Date(iso).toLocaleString("en-US", {
      timeZone: TZ,
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }) + " Pacific"
  );
}

/** Open slots over the next 7 days (Calendly's max window per call). */
export async function getAvailableSlots(limit = 6): Promise<Slot[]> {
  if (!calendlyConfigured()) return [];
  const start = new Date(Date.now() + 3600_000).toISOString().slice(0, 19) + "Z";
  const end = new Date(Date.now() + 6.5 * 86400_000).toISOString().slice(0, 19) + "Z";
  const r = await cal(
    "GET",
    `/event_type_available_times?event_type=${encodeURIComponent(eventTypeUri())}&start_time=${start}&end_time=${end}`,
  );
  if (r.status !== 200) {
    console.error("[calendly] available_times failed:", r.status, JSON.stringify(r.json).slice(0, 200));
    return [];
  }
  const coll: Array<{ start_time: string }> = r.json?.collection || [];
  return coll.slice(0, limit).map((s) => ({ startIso: s.start_time, label: formatPacific(s.start_time) }));
}

/** Mint a single-use scheduling link, optionally prefilled with the caller. */
export async function createSchedulingLink(prefill?: { name?: string; email?: string }): Promise<string | null> {
  if (!calendlyConfigured()) return null;
  const r = await cal("POST", "/scheduling_links", {
    max_event_count: 1,
    owner: eventTypeUri(),
    owner_type: "EventType",
  });
  let url: string | null = r.json?.resource?.booking_url || null;
  if (url && prefill) {
    const qs = new URLSearchParams();
    if (prefill.name) qs.set("name", prefill.name);
    if (prefill.email) qs.set("email", prefill.email);
    const q = qs.toString();
    if (q) url += (url.includes("?") ? "&" : "?") + q;
  }
  return url;
}
