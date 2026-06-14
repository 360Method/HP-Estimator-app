/**
 * Smoke-test the live voice-agent webhook end to end (staging).
 * 1. Waits until the NEW capture_lead code is deployed.
 * 2. Calls capture_lead with a full lead, then lookup_caller on the same phone
 *    to prove the customer was upserted with real name + address (the fix for
 *    the "Unknown Caller" disconnect).
 * Reads the gate secret from env (VAPI_WEBHOOK_SECRET). Creates one obvious
 * test lead in staging ("Avery Testlead") — safe to delete.
 */
const URL = process.env.VAPI_WEBHOOK_URL || "https://staging-pro.handypioneers.com/api/voice-agent/vapi/events";
const SECRET = process.env.VAPI_WEBHOOK_SECRET;
const PHONE = "+13605550147";

async function post(toolName, args) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-vapi-secret": SECRET },
    body: JSON.stringify({
      message: {
        type: "tool-calls",
        call: { type: "inboundPhoneCall", customer: { number: PHONE } },
        toolCallList: [{ id: "smoke", function: { name: toolName, arguments: args } }],
      },
    }),
  });
  const j = await r.json().catch(() => null);
  return j?.results?.[0]?.result ?? JSON.stringify(j);
}

// 1. Wait for the new build (new success string contains "details and their").
let live = false;
for (let i = 0; i < 12; i++) {
  const res = await post("capture_lead", {
    firstName: "Avery", lastName: "Testlead", email: "avery@example.com",
    street: "742 Evergreen Terrace", city: "Vancouver", state: "WA", zip: "98682",
    intent: "consultation", summary: "kitchen faucet leaking", budget: "around two thousand",
    bestTimeToCall: "mornings", timeline: "this week",
  });
  if (/details and their/i.test(res)) { live = true; console.log("capture_lead (new):", res); break; }
  console.log(`attempt ${i + 1}: old build or error -> ${String(res).slice(0, 80)}; waiting...`);
  await new Promise((r) => setTimeout(r, 25000));
}
if (!live) { console.log("New build did not come up in time."); process.exit(1); }

// 2. Prove the customer now has the real name + address on file.
const look = await post("lookup_caller", {});
console.log("lookup_caller:", look);
