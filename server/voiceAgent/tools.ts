/**
 * The tools the AI voice agent can call mid-call.
 *
 * Each tool returns a short plain-text string the AI reads back to the caller
 * or uses to decide what to say next. Keep the strings conversational and
 * never expose internal cost, margin, or subcontractor language (OS rules).
 *
 * Tools reuse the same app logic the rest of the system uses, so a lead
 * captured by phone is indistinguishable from a website lead downstream.
 */
import { nanoid } from "nanoid";
import {
  findCustomerByPhone,
  findOrCreateCustomerFromPhone,
  createOpportunity,
} from "../db";
import { onLeadCreated } from "../leadRouting";
import { isRoadmapZipServed, normalizeZip } from "../lib/priorityTranslation/serviceArea";
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

const tools: Record<string, ToolFn> = {
  /** Is this a returning Handy Pioneers contact? */
  lookup_caller: async (args, ctx) => {
    const phone = str(args.phone) || str(ctx.fromNumber);
    if (!phone) return "No phone number is available to look up.";
    const customer = await findCustomerByPhone(phone);
    if (!customer) {
      return "This is a new caller. We have no record of them yet. Greet them as a first-time caller.";
    }
    const name =
      str(customer.displayName) ||
      `${str(customer.firstName)} ${str(customer.lastName)}`.trim();
    return `Returning contact: ${name || phone}. Treat them as an existing Handy Pioneers customer and reference that you have their record.`;
  },

  /** Confirm HP serves the caller's area before promising a visit. */
  check_service_area: async (args) => {
    const zip = normalizeZip(str(args.zip) || str(args.zipCode) || str(args.location));
    if (!zip) {
      return "Ask the caller for their 5-digit ZIP code so we can confirm we serve their area.";
    }
    const served = await isRoadmapZipServed(zip);
    return served
      ? `Yes, Handy Pioneers serves ${zip}. You can go ahead and capture their request.`
      : `${zip} is outside our current service area. Let the caller know politely, and offer to take their details in case we expand to their area.`;
  },

  /**
   * Save the caller's request as a real lead: find or create the customer,
   * open an opportunity, and route it to the Nurturer for follow-up. The exact
   * appointment time is confirmed by a human, so this captures intent, not a
   * locked calendar slot.
   */
  capture_lead: async (args, ctx) => {
    const phone = str(args.phone) || str(ctx.fromNumber);
    if (!phone) return "Ask the caller for the best callback number, then save the request again.";
    const name = str(args.name);
    const summary = str(args.summary) || str(args.description) || str(args.reason);
    const address = str(args.address);
    const preferredTime = str(args.preferredTime) || str(args.preferred_time);
    const urgency = (str(args.urgency)).toLowerCase();

    const { customer } = await findOrCreateCustomerFromPhone(phone, {
      displayName: name || undefined,
      leadSource: "inbound_call",
    });

    const leadId = nanoid();
    const title = name ? `Phone call — ${name}` : `Phone call — ${phone}`;
    await createOpportunity({
      id: leadId,
      customerId: customer.id,
      area: "lead",
      stage: "New Lead",
      title,
      notes: [
        "Source: AI phone agent",
        summary ? `Request: ${summary}` : "",
        address ? `Address: ${address}` : "",
        preferredTime ? `Preferred time: ${preferredTime}` : "",
        urgency ? `Urgency: ${urgency}` : "",
        `Callback: ${phone}`,
      ]
        .filter(Boolean)
        .join("\n"),
      archived: false,
    });

    const high = urgency.includes("emergency") || urgency.includes("asap") || urgency.includes("urgent");
    onLeadCreated({
      opportunityId: leadId,
      customerId: customer.id,
      title: name ? `New phone lead — ${name}` : `New phone lead — ${phone}`,
      source: "inbound_call",
      priority: high ? "high" : "normal",
    }).catch((e) => console.error("[voiceAgent] onLeadCreated failed:", e));

    return "Saved. Their request is captured and our team will follow up shortly to confirm a time. Let the caller know we'll reach out soon.";
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
      result: "That lookup failed on our end. Take the caller's details and let them know a team member will follow up.",
    };
  }
}
