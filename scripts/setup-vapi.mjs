/**
 * setup-vapi.mjs — idempotently provision the HP front-desk assistant in Vapi.
 *
 * Creates (or updates) an assistant wired to our voice-agent webhook, with the
 * four tools, the greeting, and the system prompt. Then attaches it to a Vapi
 * test number so the line can be called without touching the live Twilio number.
 *
 * Reads everything from env (no secrets in the file). Run with the staging env
 * injected so VAPI_API_KEY + VAPI_WEBHOOK_SECRET are present:
 *
 *   railway run --service hp-estimator-staging -- node scripts/setup-vapi.mjs
 *
 * Re-running is safe: it updates the existing assistant in place.
 *
 * Optional env:
 *   VAPI_WEBHOOK_URL  default = staging webhook
 *   VAPI_MODEL        default = claude-3-5-sonnet-20241022
 *   VAPI_VOICE_ID     default = Elliot (Vapi native voice)
 */

const VAPI = "https://api.vapi.ai";
const KEY = process.env.VAPI_API_KEY;
const SECRET = process.env.VAPI_WEBHOOK_SECRET;
const WEBHOOK = process.env.VAPI_WEBHOOK_URL || "https://staging-pro.handypioneers.com/api/voice-agent/vapi/events";
const MODEL = process.env.VAPI_MODEL || "claude-haiku-4-5-20251001";
// ElevenLabs "Rachel" — clear American female, low-latency turbo model.
const VOICE_PROVIDER = process.env.VAPI_VOICE_PROVIDER || "11labs";
const VOICE_ID = process.env.VAPI_VOICE_ID || "21m00Tcm4TlvDq8ikWAM";
const ASSISTANT_NAME = "HP Front Desk";
const TEST_NUMBER_NAME = "HP Test (Vapi)";

if (!KEY) { console.error("VAPI_API_KEY missing"); process.exit(1); }
if (!SECRET) { console.error("VAPI_WEBHOOK_SECRET missing"); process.exit(1); }

async function vapi(method, path, body) {
  const r = await fetch(VAPI + path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let json;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: r.status, json };
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v && Array.isArray(v.results)) return v.results;
  return [];
}

const server = { url: WEBHOOK, secret: SECRET };

function fnTool(name, description, properties, required) {
  return {
    type: "function",
    function: { name, description, parameters: { type: "object", properties, required } },
    server,
  };
}

const tools = [
  fnTool(
    "lookup_caller",
    "Check whether the caller is an existing Handy Pioneers customer. Call early using the caller's phone number.",
    { phone: { type: "string", description: "Caller's phone; defaults to caller ID if omitted." } },
    [],
  ),
  fnTool(
    "check_service_area",
    "Confirm Handy Pioneers serves a ZIP before promising a visit.",
    { zip: { type: "string", description: "5-digit ZIP of the home." } },
    ["zip"],
  ),
  fnTool(
    "capture_lead",
    "Save the caller's request as a lead so the team follows up. Call once you have a name, callback number, and a short description.",
    {
      name: { type: "string", description: "Caller's full name." },
      phone: { type: "string", description: "Best callback number; defaults to caller ID." },
      summary: { type: "string", description: "What the caller needs, in plain words." },
      address: { type: "string", description: "Service address if given." },
      preferredTime: { type: "string", description: "When they'd like service, if mentioned." },
      urgency: { type: "string", description: "normal, urgent, or emergency." },
    },
    ["summary"],
  ),
  fnTool(
    "transfer_to_human",
    "Use when the caller asks for a person or the matter needs a human now.",
    {},
    [],
  ),
];

const SYSTEM_PROMPT = `You are the front desk for Handy Pioneers, a residential maintenance and handyman company serving the Vancouver / Clark County, Washington area. You are warm, plain-spoken, and efficient. You are talking to a homeowner on the phone.

Your job on every call:
1. Greet them and find out what they need help with at their home.
2. Early on, quietly run lookup_caller so you know if they're already a customer.
3. If they want service, get their 5-digit ZIP and run check_service_area before promising anything. If we don't serve them, say so kindly and offer to take their info in case we expand.
4. Collect their name, a good callback number, the service address, what they need, and roughly when they'd like it. Then run capture_lead.
5. Let them know a team member will follow up to confirm a time. Do not promise a specific appointment slot yourself.
6. If they ask for a person or it's urgent, use transfer_to_human.

Hard rules:
- Never quote prices, hourly rates, or talk about cost, markup, or margins. We price by the project, and a team member handles quotes. If pressed, say a team member will give them a clear project price after understanding the work.
- Never mention subcontractors. We are Handy Pioneers.
- Never describe anything as free, cheap, or discounted. Our baseline home walkthrough is a paid, flat-fee visit.
- Be honest. If you don't know, say a team member will follow up.
- If asked whether you're a person, be honest and friendly: say you're the automated front desk and you'll connect them with a team member if they prefer.
- Keep it conversational and short. No jargon, no hard sell.`;

const firstMessage =
  "Hi, thanks for calling Handy Pioneers. I'm the automated assistant at the front desk. I can take down what you need or connect you with a person. How can I help you today?";

const assistantBody = {
  name: ASSISTANT_NAME,
  firstMessage,
  model: {
    provider: "anthropic",
    model: MODEL,
    temperature: 0.4,
    messages: [{ role: "system", content: SYSTEM_PROMPT }],
    tools,
  },
  voice:
    VOICE_PROVIDER === "11labs"
      ? { provider: "11labs", voiceId: VOICE_ID, model: "eleven_turbo_v2_5" }
      : { provider: VOICE_PROVIDER, voiceId: VOICE_ID },
  server,
  serverMessages: ["tool-calls", "end-of-call-report"],
};

function fail(where, res) {
  console.error(`\nFAILED at ${where}: HTTP ${res.status}`);
  console.error(typeof res.json === "string" ? res.json.slice(0, 1500) : JSON.stringify(res.json, null, 2).slice(0, 1500));
  process.exit(1);
}

(async () => {
  console.log(`Webhook: ${WEBHOOK}`);
  console.log(`Model:   ${MODEL}`);
  console.log(`Voice:   ${VOICE_PROVIDER}/${VOICE_ID}\n`);

  // 1. Assistant — create or update.
  const list = await vapi("GET", "/assistant?limit=100");
  if (list.status >= 300) fail("list assistants", list);
  let assistant = asArray(list.json).find((a) => a.name === ASSISTANT_NAME);

  if (assistant) {
    const upd = await vapi("PATCH", `/assistant/${assistant.id}`, assistantBody);
    if (upd.status >= 300) fail("update assistant", upd);
    assistant = upd.json;
    console.log(`Updated assistant: ${assistant.id}`);
  } else {
    const cre = await vapi("POST", "/assistant", assistantBody);
    if (cre.status >= 300) fail("create assistant", cre);
    assistant = cre.json;
    console.log(`Created assistant: ${assistant.id}`);
  }

  // 2. Test phone number — reuse, or provision a free Vapi number.
  const nums = await vapi("GET", "/phone-number?limit=100");
  if (nums.status >= 300) fail("list phone numbers", nums);
  let num = asArray(nums.json).find(
    (n) => n.name === TEST_NUMBER_NAME || n.assistantId === assistant.id,
  );

  if (num) {
    await vapi("PATCH", `/phone-number/${num.id}`, { assistantId: assistant.id });
    console.log(`Reused test number: ${num.number}`);
  } else {
    const buy = await vapi("POST", "/phone-number", {
      provider: "vapi",
      name: TEST_NUMBER_NAME,
      assistantId: assistant.id,
      numberDesiredAreaCode: process.env.VAPI_AREA_CODE || "360",
    });
    if (buy.status >= 300) {
      console.warn(
        `\nCould not auto-provision a free Vapi number (HTTP ${buy.status}). ` +
          `Create one in the dashboard: Phone Numbers -> Create -> Free Vapi Number, ` +
          `then set its assistant to "${ASSISTANT_NAME}".`,
      );
      console.warn(typeof buy.json === "string" ? buy.json.slice(0, 400) : JSON.stringify(buy.json).slice(0, 400));
    } else {
      num = buy.json;
      console.log(`Provisioned test number: ${num.number}`);
    }
  }

  console.log("\n=== DONE ===");
  console.log(`Assistant ID: ${assistant.id}`);
  console.log(`Model:        ${assistant?.model?.model}`);
  console.log(`Tools:        ${(assistant?.model?.tools || []).map((t) => t.function?.name).join(", ")}`);
  console.log(`Test number:  ${num?.number || "(provision in dashboard — see warning above)"}`);
})();
