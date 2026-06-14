/** Discover Calendly user/org/event types AND probe availability for the configured event. */
const TOKEN = process.env.CALENDLY_API_TOKEN;
const EVENT = process.env.CALENDLY_EVENT_TYPE_URI;
if (!TOKEN) { console.error("CALENDLY_API_TOKEN missing"); process.exit(1); }

async function cal(path) {
  const r = await fetch(`https://api.calendly.com${path}`, {
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
  });
  return { status: r.status, json: await r.json().catch(() => null) };
}

const me = await cal("/users/me");
const user = me.json?.resource;
console.log("User:", user?.name, "| tz:", user?.timezone);

if (EVENT) {
  const start = new Date(Date.now() + 3600_000).toISOString().slice(0, 19) + "Z";
  const end = new Date(Date.now() + 6.5 * 86400_000).toISOString().slice(0, 19) + "Z";
  const at = await cal(`/event_type_available_times?event_type=${encodeURIComponent(EVENT)}&start_time=${start}&end_time=${end}`);
  console.log("availability HTTP:", at.status);
  const slots = at.json?.collection || [];
  console.log("slots in next 7 days:", slots.length);
  for (const s of slots.slice(0, 8)) {
    console.log("  ", new Date(s.start_time).toLocaleString("en-US", {
      timeZone: "America/Los_Angeles", weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    }), "PT");
  }
  if (!slots.length) console.log("  raw:", JSON.stringify(at.json).slice(0, 400));
}
