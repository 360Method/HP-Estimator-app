/**
 * Idempotently register the Calendly invitee.created webhook -> our app, so a
 * confirmed booking syncs into the portal. Reads CALENDLY_API_TOKEN +
 * CALENDLY_WEBHOOK_SECRET. URL base defaults to staging.
 */
const TOKEN = process.env.CALENDLY_API_TOKEN;
const SECRET = process.env.CALENDLY_WEBHOOK_SECRET;
const BASE = process.env.CALENDLY_WEBHOOK_BASE || "https://staging-pro.handypioneers.com";
if (!TOKEN) { console.error("CALENDLY_API_TOKEN missing"); process.exit(1); }
if (!SECRET) { console.error("CALENDLY_WEBHOOK_SECRET missing"); process.exit(1); }

const URL = `${BASE}/api/voice-agent/calendly?s=${encodeURIComponent(SECRET)}`;

async function cal(method, path, body) {
  const r = await fetch(`https://api.calendly.com${path}`, {
    method,
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

const me = await cal("GET", "/users/me");
const user = me.json?.resource?.uri;
const org = me.json?.resource?.current_organization;
if (!user || !org) { console.error("users/me failed", me.status); process.exit(1); }

const existing = await cal("GET", `/webhook_subscriptions?organization=${encodeURIComponent(org)}&scope=user&user=${encodeURIComponent(user)}&count=100`);
const dup = (existing.json?.collection || []).find((w) => w.callback_url === URL);
if (dup) { console.log("Webhook already registered:", dup.uri, "state:", dup.state); process.exit(0); }

const created = await cal("POST", "/webhook_subscriptions", {
  url: URL,
  events: ["invitee.created"],
  organization: org,
  user,
  scope: "user",
});
if (created.status >= 300) {
  console.error("create failed:", created.status, JSON.stringify(created.json).slice(0, 400));
  process.exit(1);
}
console.log("Webhook registered:", created.json?.resource?.uri);
console.log("  events: invitee.created  ->", URL.replace(/s=[^&]+/, "s=***"));
