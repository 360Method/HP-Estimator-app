/**
 * The tools the AI voice agent can call mid-call.
 *
 * Each tool returns a short plain-text string the AI reads back to the caller
 * or uses to decide what to say next. Keep it conversational and never expose
 * internal cost, margin, or subcontractor language (OS rules).
 *
 * capture_lead mirrors the website lead form exactly (server/routers/publicInquiry.ts):
 * it upserts the customer, writes a structured address, opens an opportunity,
 * creates the leads-inbox record, and routes to the Nurturer — so a phone lead
 * is indistinguishable from a web lead downstream.
 */
import { nanoid } from "nanoid";
import {
  findCustomerByPhone,
  findOrCreateCustomerFromPhone,
  updateCustomer,
  createOpportunity,
  createOnlineRequest,
} from "../db";
import { onLeadCreated, type LeadSource } from "../leadRouting";
import { isRoadmapZipServed, normalizeZip } from "../lib/priorityTranslation/serviceArea";
import { sendSms, isTwilioConfigured } from "../twilio";
import { calendlyConfigured, getAvailableSlots, createSchedulingLink } from "./calendly";
import { ENV } from "../_core/env";
import type { NormalizedToolCall, NormalizedToolResult } from "./types";

export interface ToolContext {
  /** The caller's number, used as the default when a tool needs a phone. */
  fromNumber: string | null;
}

type ToolFn = (args: Record<string, unknown>, ctx: ToolContext) => Promise<string>;

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : v == null ? "" : String(v).trim();
}

/** Map whatever the AI says about intent into our internal buckets. */
function classifyIntent(raw: string): "membership" | "consultation" | "one_off" | "unsure" {
  const s = raw.toLowerCase();
  if (/member|360|proactive|path|subscrib|ongoing|maintenance plan/.test(s)) return "membership";
  if (/consult|estimate|quote|walk|assess|look at|come out/.test(s)) return "consultation";
  if (/one|job|repair|fix|project|install|replace/.test(s)) return "one_off";
  return "unsure";
}

const INTENT_LABEL: Record<string, string> = {
  membership: "Membership / 360 Method",
  consultation: "Consultation",
  one_off: "One-off project",
  unsure: "General inquiry",
};

/** Membership/360 interest gets a dedicated lead source; everything else is a call. */
function leadSourceFor(intent: string): LeadSource {
  return intent === "membership" ? "membership_intent" : "inbound_call";
}

const tools: Record<string, ToolFn> = {
  /** Is this a returning Handy Pioneers contact? Pull what we know so the AI can confirm, not re-ask. */
  lookup_caller: async (args, ctx) => {
    const phone = str(args.phone) || str(ctx.fromNumber);
    if (!phone) return "No phone number is available to look up.";
    const c = await findCustomerByPhone(phone);
    if (!c) return "New caller. We have no record of them yet. Greet them as a first-time caller.";
    const name = str(c.displayName) || `${str(c.firstName)} ${str(c.lastName)}`.trim();
    const known = [
      name && name.toLowerCase().includes("unknown") ? "" : name ? `name on file: ${name}` : "",
      str(c.street) ? `address on file: ${[c.street, c.city, c.state, c.zip].filter(Boolean).join(", ")}` : "",
      str(c.email) ? `email on file` : "",
    ].filter(Boolean).join("; ");
    return known
      ? `Returning contact (${known}). Confirm these rather than re-asking, and update anything that changed.`
      : `We have this number on file but few details. Treat warmly and collect their info.`;
  },

  /** Confirm HP serves the caller's area before promising a visit. */
  check_service_area: async (args) => {
    const zip = normalizeZip(str(args.zip) || str(args.zipCode) || str(args.location));
    if (!zip) return "Ask the caller for their 5-digit ZIP code so we can confirm we serve their area.";
    const served = await isRoadmapZipServed(zip);
    return served
      ? `Yes, Handy Pioneers serves ${zip}. Go ahead and capture their details.`
      : `${zip} is outside our current service area. Let the caller know graciously, and still capture their details in case we expand.`;
  },

  /**
   * Save the caller as a full lead, mirroring the website form. Upserts the
   * customer (fixing any stale "Unknown Caller" record), writes structured
   * address, opens an opportunity, creates the leads-inbox record, and routes
   * to the Nurturer. Call once you have at least a name, callback number, and
   * what they need.
   */
  capture_lead: async (args, ctx) => {
    const phone = str(args.phone) || str(ctx.fromNumber);
    if (!phone) return "Ask the caller for the best callback number, then save the request again.";

    const nameWhole = str(args.name);
    const firstName = str(args.firstName) || nameWhole.split(/\s+/)[0] || "";
    const lastName = str(args.lastName) || nameWhole.split(/\s+/).slice(1).join(" ") || "";
    const email = str(args.email).toLowerCase();
    const street = str(args.street) || str(args.address);
    const city = str(args.city);
    const state = str(args.state);
    const zip = normalizeZip(str(args.zip) || str(args.zipCode)) || "";
    const bestTime = str(args.bestTimeToCall) || str(args.best_time) || str(args.bestTime);
    const budget = str(args.budget) || str(args.budgetRange) || str(args.investment);
    const summary = str(args.summary) || str(args.description) || str(args.reason);
    const timeline = str(args.timeline) || str(args.urgency) || "Flexible";
    const intent = classifyIntent(str(args.intent) || summary);
    const intentLabel = INTENT_LABEL[intent];
    const displayName = `${firstName} ${lastName}`.trim() || email || phone;

    // Upsert the customer by phone, then apply everything we learned. This is
    // what fixes the "pipeline shows John Smith but profile says Unknown Caller"
    // disconnect: a pre-existing stub gets its real details written here.
    const { customer } = await findOrCreateCustomerFromPhone(phone, {
      displayName: displayName || undefined,
      leadSource: "inbound_call",
    });
    const patch: Record<string, unknown> = { mobilePhone: phone };
    if (firstName) patch.firstName = firstName;
    if (lastName) patch.lastName = lastName;
    if (displayName) patch.displayName = displayName;
    if (email) patch.email = email;
    if (street) patch.street = street;
    if (city) patch.city = city;
    if (state) patch.state = state;
    if (zip) patch.zip = zip;
    await updateCustomer(customer.id, patch).catch((e) => console.error("[voiceAgent] updateCustomer:", e));

    // Opportunity (pipeline card).
    const leadId = nanoid();
    await createOpportunity({
      id: leadId,
      customerId: customer.id,
      area: "lead",
      stage: "New Lead",
      title: `${displayName} — ${intentLabel}`,
      notes: [
        "Source: AI phone agent",
        `Interest: ${intentLabel}`,
        summary ? `Need: ${summary}` : "",
        street || city || zip ? `Address: ${[street, city, state, zip].filter(Boolean).join(", ")}` : "",
        email ? `Email: ${email}` : "",
        `Callback: ${phone}`,
        bestTime ? `Best time to call: ${bestTime}` : "",
        budget ? `Budget mentioned: ${budget}` : "",
        `Timeline: ${timeline}`,
      ].filter(Boolean).join("\n"),
      archived: false,
    });

    // Leads-inbox record (mirrors the website form so phone leads show identically).
    const funnel = intent === "membership" ? "360_method" : intent === "consultation" ? "baseline_walkthrough" : "project";
    await createOnlineRequest({
      zip,
      serviceType: summary ? `${intentLabel}: ${summary}`.slice(0, 140) : intentLabel,
      description: summary || "(captured by phone)",
      timeline,
      photoUrls: [],
      firstName,
      lastName,
      phone,
      email,
      street,
      unit: "",
      city,
      state,
      smsConsent: false,
      customerId: customer.id,
      leadId,
      funnel,
    }).catch((e) => console.error("[voiceAgent] createOnlineRequest:", e));

    // Route to the Nurturer.
    const high = /emergency|asap|urgent|today|leak|flood|no heat|no water/.test((timeline + " " + summary).toLowerCase());
    onLeadCreated({
      opportunityId: leadId,
      customerId: customer.id,
      title: `New phone lead — ${displayName} (${intentLabel})`,
      source: leadSourceFor(intent),
      priority: high ? "high" : "normal",
    }).catch((e) => console.error("[voiceAgent] onLeadCreated:", e));

    const next =
      intent === "membership"
        ? "Let them know a team member will reach out to walk them through the Proactive Path and find the right fit."
        : "Let them know a team member will follow up to confirm the details and schedule a time.";
    return `Saved ${displayName}'s details and their ${intentLabel.toLowerCase()} request. ${next}`;
  },

  /** Read the next real openings so the agent can offer them on the call. */
  check_availability: async () => {
    if (!calendlyConfigured()) {
      return "Scheduling isn't connected. Ask their preferred day and time and capture it; the team will confirm.";
    }
    const slots = await getAvailableSlots(6);
    if (!slots.length) {
      return "No openings in the next week. Ask their preferred day and time and capture it; the team will confirm.";
    }
    return `Offer these openings, in Pacific time: ${slots.map((s) => s.label).join("; ")}. Once they pick one, call send_booking_link with that time.`;
  },

  /** Text the caller a one-tap link to lock in the time they chose. */
  send_booking_link: async (args, ctx) => {
    const phone = str(args.phone) || str(ctx.fromNumber);
    const chosenTime = str(args.chosenTime) || str(args.time);
    const name = str(args.name);
    const email = str(args.email);
    const link = await createSchedulingLink({ name: name || undefined, email: email || undefined });
    if (!link) {
      return "Couldn't create the booking link. Capture their preferred time and let them know the team will confirm.";
    }
    if (phone && isTwilioConfigured()) {
      const body = `Handy Pioneers: tap to confirm your assessment${chosenTime ? ` (${chosenTime})` : ""}: ${link}`;
      await sendSms(phone, body).catch((e) => console.error("[voiceAgent] booking SMS failed:", e));
    }
    return `Texted the booking link to ${phone || "the caller"}${chosenTime ? ` for ${chosenTime}` : ""}. Tell them to tap it to lock in the time, and that you have it noted.`;
  },

  /** Hand the live call to a person. Actual bridging is the platform's job. */
  transfer_to_human: async () => {
    const cell = str(ENV.ownerPhone) || str(ENV.twilioPhoneNumber);
    return cell
      ? `Transfer the caller to ${cell} now.`
      : "No transfer number is configured. Take a detailed message and capture the lead instead.";
  },
};

/** List of tool names this server implements (handy for setup docs / health). */
export const VOICE_AGENT_TOOLS = Object.keys(tools);

export async function runTool(
  call: NormalizedToolCall,
  ctx: ToolContext,
): Promise<NormalizedToolResult> {
  const fn = tools[call.name];
  if (!fn) {
    console.warn(`[voiceAgent] unknown tool requested: ${call.name}`);
    return { id: call.id, result: `Unknown tool "${call.name}".` };
  }
  try {
    const result = await fn(call.args ?? {}, ctx);
    return { id: call.id, result };
  } catch (err) {
    console.error(`[voiceAgent] tool ${call.name} failed:`, err);
    return {
      id: call.id,
      result: "That didn't go through on our end. Take the caller's details and let them know a team member will follow up.",
    };
  }
}
