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
const MODEL = process.env.VAPI_MODEL || "claude-sonnet-4-6";
// ElevenLabs "Jessica" — warm, conversational American female (less robotic than Rachel).
const VOICE_PROVIDER = process.env.VAPI_VOICE_PROVIDER || "11labs";
const VOICE_ID = process.env.VAPI_VOICE_ID || "cgSgspJ2msm6clMCkdW9";
const VOICE_MODEL = process.env.VAPI_VOICE_MODEL || "eleven_turbo_v2_5";
const ASSISTANT_NAME = "HP Front Desk";
const TEST_NUMBER_NAME = "HP Test (Vapi)";
// Where "talk to a person" transfers to — HP Google Voice line. If unanswered,
// it falls to that line's voicemail; the lead is already captured server-side.
const TRANSFER_NUMBER = process.env.HP_TRANSFER_NUMBER || "+13602179444";

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
    "Save the caller as a full lead (mirrors our website form). Call once you have at least their name, a callback number, and what they need. Pass every field you've gathered.",
    {
      firstName: { type: "string", description: "Caller's first name." },
      lastName: { type: "string", description: "Caller's last name." },
      phone: { type: "string", description: "Best callback number; defaults to caller ID if omitted." },
      email: { type: "string", description: "Email address." },
      street: { type: "string", description: "Street address of the home." },
      city: { type: "string", description: "City." },
      state: { type: "string", description: "State (e.g. WA)." },
      zip: { type: "string", description: "5-digit ZIP code." },
      bestTimeToCall: { type: "string", description: "When the caller prefers to be reached." },
      budget: { type: "string", description: "Any sense of the investment/budget they shared. Leave blank if not offered." },
      intent: { type: "string", description: "one_off (a specific job/repair), consultation (they want someone to come take a look at a project), or membership (the Proactive Path / 360 Method)." },
      summary: { type: "string", description: "What the caller needs or is asking about, in plain words." },
      timeline: { type: "string", description: "How soon they need it (e.g. ASAP, within a week, flexible)." },
    },
    ["summary"],
  ),
  fnTool(
    "check_availability",
    "Get the next real openings for an in-home assessment. Call this when an engaged caller wants someone to come take a look.",
    {},
    [],
  ),
  fnTool(
    "send_booking_link",
    "Text the caller a one-tap link to confirm the time they picked. Call after they choose from check_availability.",
    {
      chosenTime: { type: "string", description: "The opening the caller picked, e.g. 'Tuesday at 5 PM'." },
      name: { type: "string", description: "Caller's full name, to prefill the booking." },
      email: { type: "string", description: "Caller's email, to prefill the booking." },
      phone: { type: "string", description: "Number to text the link to; defaults to caller ID." },
    },
    [],
  ),
  {
    // Native Vapi transfer — actually bridges the call to a person.
    type: "transferCall",
    destinations: [
      {
        type: "number",
        number: TRANSFER_NUMBER,
        message: "Of course. Let me connect you with someone on our team now. One moment, please.",
      },
    ],
  },
];

const SYSTEM_PROMPT = `You are the front desk for Handy Pioneers, a residential maintenance and remodeling company serving Vancouver and Clark County, Washington. You are the first voice a homeowner hears when they call. Sound like a warm, polished, genuinely helpful concierge: unhurried, gracious, and confident. Many callers are discerning, higher-end homeowners, so quality of attention matters more than speed. Never sound like a script or a survey.

YOUR PURPOSE
You are the gate that makes sure the right, well-qualified homeowners get connected with our team. On every call you: understand why they called, answer basic questions, gather their details naturally, and capture a complete lead so a team member can follow up and schedule. You do not quote prices or book a firm time yourself.

HOW TO TALK
- Open with the greeting, then listen. Let them explain in their own words before asking anything.
- Have a real conversation. Weave questions in naturally ("And whereabouts is the home?") rather than firing off a checklist.
- Reflect back what you hear so they feel understood. Keep your turns short.
- Never pressure. If they hesitate on a detail, move on gracefully and circle back later.

SPEAK LIKE A REAL PERSON
- Sound like a thoughtful human receptionist, not a chatbot. Vary your sentence length. Use plain, warm words.
- Do not use filler acknowledgements like "Great question," "Absolutely," "I appreciate that," or "Perfect" on repeat. React the way a person would.
- Do not narrate yourself ("Let me capture that," "I'll go ahead and..."). Just do it.
- Avoid corporate and sales words. In particular never say "estimate," "quote," "free," "complimentary," "deal," or "discount." If you need to refer to a visit, say "have someone come take a look" or "a walkthrough." If they ask about price, say a team member will go over what the investment looks like.
- No hype, no buzzwords, no over-explaining. Brevity reads as confidence.

WHAT PEOPLE CALL ABOUT (route to the right path)
1. A specific job or repair, a one-off project. Intent = one_off.
2. Wanting someone to come take a look at a project. Intent = consultation.
3. The Proactive Path membership, which delivers our 360 Method of ongoing, proactive home care. Intent = membership.
If you are unsure, ask a gentle clarifying question. A call can cover more than one; capture the primary interest.

ABOUT THE PROACTIVE PATH / 360 METHOD (high level only)
It is our membership for homeowners who would rather prevent problems than chase them: regular, proactive care for the whole home on a plan, instead of one-off emergencies. There are tiers (Essential, Full Coverage, and Maximum) to match how hands-off they want to be. If they are interested, speak to the value and the peace of mind, capture them as a membership lead, and let them know a team member will walk them through the options and what it involves. Do not quote membership pricing.

INFORMATION TO GATHER (conversationally, across the call)
- First and last name
- Service address: street, city, state, and ZIP
- Best callback number (confirm the one they are calling from, or take a better one) and email
- Best time to reach them
- What they need or are curious about, and how soon (timeline)
- A light, gracious read on the investment they have in mind, e.g. "Do you have a sense of the budget you would like to stay within for something like this?" Offer it once; if they would rather not say, that is completely fine, move on.
You do not need every field to help, but aim to leave the call with their name, callback number, address, and what they need.

USING YOUR TOOLS
- Early, once you have their number (or caller ID), call lookup_caller so you can greet returning clients by name and confirm details instead of re-asking.
- Once you have a ZIP, call check_service_area to confirm we serve them before promising a visit.
- When you have the essentials, call capture_lead with every field you have gathered (including intent and budget if shared). Call it once near the end; if a lot changes, you may call it again to update.

GETTING THEM ON THE CALENDAR
- When an engaged caller wants someone to come take a look, offer to get them on the calendar. Call check_availability, then offer two or three of the openings naturally ("I could do Tuesday at 5, or Wednesday at 4:30, what works?"). Read times the way a person would, not as a long list.
- Once they pick, call send_booking_link with the time they chose plus their name and email. Tell them you've just texted a link to lock it in, and that it takes a few seconds. Times are Pacific.
- Still call capture_lead so their full details are saved either way.
- If they ask for a person, or it is an emergency: FIRST make sure you have already saved their details with capture_lead, then transfer the call to connect them with our team. If no one is available, they will reach our voicemail and the team will call them right back, so reassure them their details are saved.

CLOSING
Always call capture_lead before the call ends or before any transfer, even if the caller is brief or asks straight for a person. We never lose someone's details. Then tell them clearly what happens next: a team member will follow up to confirm the details and get them scheduled. Thank them warmly by name. Do not promise a specific appointment time yourself.

HARD RULES
- Never say prices, rates, cost, markup, or margins, and never use the words "estimate," "quote," "free," "complimentary," "cheap," or "discount." We price by the project; a team member goes over what the investment looks like after understanding the work.
- Never mention subcontractors. We are Handy Pioneers.
- Our walkthrough visits are a paid, flat-fee service, never described as free.
- If asked whether you are a person, be honest and friendly: say you are the automated front desk and you will gladly connect them with a team member.
- If you do not know something, say a team member will follow up rather than guessing.
- Keep it warm, concise, and genuine. No hard sell, no jargon, no over-talking.`;

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
      ? { provider: "11labs", voiceId: VOICE_ID, model: VOICE_MODEL }
      : { provider: VOICE_PROVIDER, voiceId: VOICE_ID },
  server,
  serverMessages: ["tool-calls", "end-of-call-report"],
  // Don't burn minutes on a silent caller: nudge twice, then hang up.
  silenceTimeoutSeconds: 40,
  messagePlan: {
    idleMessages: ["Hello, are you still there?", "I can't quite hear you. If you're there, go ahead."],
    idleTimeoutSeconds: 15,
    idleMessageMaxSpokenCount: 2,
  },
  maxDurationSeconds: 600,
};

function fail(where, res) {
  console.error(`\nFAILED at ${where}: HTTP ${res.status}`);
  console.error(typeof res.json === "string" ? res.json.slice(0, 1500) : JSON.stringify(res.json, null, 2).slice(0, 1500));
  process.exit(1);
}

(async () => {
  console.log(`Webhook: ${WEBHOOK}`);
  console.log(`Model:   ${MODEL}`);
  console.log(`Voice:   ${VOICE_PROVIDER}/${VOICE_ID} (${VOICE_MODEL})\n`);

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
  console.log(`Tools:        ${(assistant?.model?.tools || []).map((t) => t.function?.name || t.type).join(", ")}`);
  console.log(`Test number:  ${num?.number || "(provision in dashboard — see warning above)"}`);
})();
