# AI Voice Agent — Vapi Setup

This connects an AI phone agent (Vapi) to the Handy Pioneers line so it can
answer calls, confirm the service area, capture leads, and hand calls to a
person. Every call and transcript lands in the same Inbox as the Twilio calls.

The app side is already built and vendor-neutral. The Vapi side can be built
from the API with `scripts/setup-vapi.mjs` (idempotent), or by hand with the
steps below.

> **Provisioned 2026-06-13 via `scripts/setup-vapi.mjs`:**
> assistant "HP Front Desk" (`595194ca-2b0e-4a76-add7-f566f37f498b`), all four
> tools, greeting + system prompt, model `claude-3-5-sonnet-20241022`, voice
> `vapi/Elliot`, webhook -> staging. Attached to a **Vapi test number**:
> **+1 (360) 614-1198**. The live Twilio line (360) 838-6731 is untouched until
> go-live. Re-run: `railway run --service hp-estimator-staging -- node scripts/setup-vapi.mjs`.
> Swap the model with `VAPI_MODEL=...`, the voice with `VAPI_VOICE_ID=...`.

## What you'll need
- The HP Twilio number: **+1 (360) 838-6731**
- Twilio Account SID + Auth Token (Twilio Console → Account Info)
- About 30 minutes

## Webhook URLs (the app endpoint Vapi calls)
| Environment | Server URL |
|---|---|
| Staging (test here first) | `https://staging-pro.handypioneers.com/api/voice-agent/vapi/events` |
| Production | `https://pro.handypioneers.com/api/voice-agent/vapi/events` |

## The shared secret
The webhook is gated by the `VAPI_WEBHOOK_SECRET` env var. It is already set on
the **staging** Railway service. You paste the *same value* into Vapi's Server
"Secret" field below so Vapi's calls are trusted. Get the current value from
Railway (Variables → `VAPI_WEBHOOK_SECRET`) or ask in the build chat. For
production, the same var must be set on the prod service before going live.

---

## Steps

### 1. Create a Vapi account
Go to https://dashboard.vapi.ai and sign up (use help@handypioneers.com).

### 2. Bring the HP Twilio number into Vapi
Phone Numbers → Import → **Twilio**. Enter the Twilio Account SID, Auth Token,
and the number `+13608386731`. This keeps our existing number; Vapi just answers
it. (Vapi auto-points the number's voice webhook at itself.)

### 3. Create an Assistant
Assistants → Create.
- **Model:** Anthropic → Claude (keeps us on our standard brain). Any current
  Claude model is fine.
- **Voice:** pick a warm, natural US voice (11Labs or PlayHT options are good).
- **First message:** `Hi, thanks for calling Handy Pioneers. I'm the automated assistant at the front desk. I can take down what you need or connect you with a person. How can I help you today?`
- **System prompt:** paste the block in the next section.

### 4. Add the tools (functions)
Assistant → Tools → Add Tool → **Function** for each of the four below. Set each
tool's **Server URL** to the webhook URL from the table above and the **Secret**
to the `VAPI_WEBHOOK_SECRET` value. (If Vapi offers an org-level Server URL, set
it once there instead of per-tool.)

Paste these function definitions:

```json
{
  "name": "lookup_caller",
  "description": "Check whether the caller is an existing Handy Pioneers customer. Call this early using the caller's phone number.",
  "parameters": {
    "type": "object",
    "properties": {
      "phone": { "type": "string", "description": "Caller's phone in any format; defaults to the caller ID if omitted." }
    }
  }
}
```
```json
{
  "name": "check_service_area",
  "description": "Confirm Handy Pioneers serves a ZIP before promising a visit.",
  "parameters": {
    "type": "object",
    "properties": {
      "zip": { "type": "string", "description": "5-digit ZIP code of the home." }
    },
    "required": ["zip"]
  }
}
```
```json
{
  "name": "capture_lead",
  "description": "Save the caller's request as a lead so the team follows up. Call this once you have a name, callback number, and a short description of what they need.",
  "parameters": {
    "type": "object",
    "properties": {
      "name": { "type": "string", "description": "Caller's full name." },
      "phone": { "type": "string", "description": "Best callback number; defaults to caller ID." },
      "summary": { "type": "string", "description": "What the caller needs, in plain words." },
      "address": { "type": "string", "description": "Service address if given." },
      "preferredTime": { "type": "string", "description": "When they'd like service, if mentioned." },
      "urgency": { "type": "string", "description": "normal, urgent, or emergency." }
    },
    "required": ["summary"]
  }
}
```
```json
{
  "name": "transfer_to_human",
  "description": "Use when the caller asks for a person or the matter needs a human now.",
  "parameters": { "type": "object", "properties": {} }
}
```

> For an actual live transfer (bridging the call), also add Vapi's built-in
> **Transfer Call** tool with destination `+1 (360) 838-6731` (or your cell).
> The `transfer_to_human` function above just tells the AI the number to use.

### 5. Turn on server messages
Assistant → Advanced/Server → **Server Messages**: enable at least
`tool-calls` and `end-of-call-report`. Without these the app never hears from
Vapi.

### 6. Assign the assistant to the number
Phone Numbers → the HP number → set **Inbound Assistant** to the assistant you
built.

### 7. Test
Call **(360) 838-6731**. Walk through: give your name, a fake request, a ZIP in
Clark County (e.g. 98682). Then check **staging-pro.handypioneers.com → Inbox**:
you should see the call logged with the AI's summary, the transcript as an
internal note, and a new lead/opportunity for the Nurturer.

---

## System prompt (paste into the Assistant)

```
You are the front desk for Handy Pioneers, a residential maintenance and
handyman company serving the Vancouver / Clark County, Washington area. You are
warm, plain-spoken, and efficient. You are talking to a homeowner on the phone.

Your job on every call:
1. Greet them and find out what they need help with at their home.
2. Early on, quietly run lookup_caller so you know if they're already a customer.
3. If they want service, get their 5-digit ZIP and run check_service_area before
   promising anything. If we don't serve them, say so kindly and offer to take
   their info in case we expand.
4. Collect their name, a good callback number, the service address, what they
   need, and roughly when they'd like it. Then run capture_lead.
5. Let them know a team member will follow up to confirm a time. Do not promise a
   specific appointment slot yourself.
6. If they ask for a person or it's urgent, use transfer_to_human.

Hard rules:
- Never quote prices, hourly rates, or talk about cost, markup, or margins. We
  price by the project, and a team member handles quotes. If pressed, say a
  team member will give them a clear project price after understanding the work.
- Never mention subcontractors. We are Handy Pioneers.
- Never describe anything as free, cheap, or discounted. Our baseline home
  walkthrough is a paid, flat-fee visit.
- Be honest. If you don't know, say a team member will follow up.
- If asked whether you're a person, be honest and friendly: say you're the
  automated front desk and you'll connect them with a team member if they prefer.
- Keep it conversational and short. No jargon, no hard sell.
```

## Notes for the developer
- Adapter + tools live in `server/voiceAgent/`. Adding Retell or Bland later =
  one new file in `adapters/` plus a line in `ADAPTERS` in `index.ts`.
- The brain (Claude) is chosen inside Vapi, satisfying the OS evergreen rule.
- The route is signature-gated by `VAPI_WEBHOOK_SECRET`; a missing secret in
  production rejects all webhooks.
- Pre-existing, separate issue: the in-browser "click-to-call" dialer needs
  `TWILIO_API_KEY` (a Standard key) set in Railway. It does not affect this AI
  voice flow, inbound calls, or SMS.
