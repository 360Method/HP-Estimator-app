/**
 * Transcript extraction. The live agent sometimes calls capture_lead with thin
 * or empty arguments, but the transcript always has the truth. After the call
 * we read the transcript with our brain (the vendor-neutral LLM seam) and pull
 * a clean, structured lead, so the customer record and pipeline card are right
 * regardless of how well the live tool call was populated.
 */
import { getLlmProvider, type LlmToolDef } from "../lib/agentRuntime/llm";

export interface ExtractedLead {
  firstName?: string;
  lastName?: string;
  email?: string;
  street?: string;
  city?: string;
  state?: string;
  zip?: string;
  intent?: "one_off" | "consultation" | "membership" | "unsure";
  summary?: string;
  budget?: string;
  bestTimeToCall?: string;
  timeline?: string;
}

const RECORD_TOOL: LlmToolDef = {
  name: "record_lead",
  description: "Record the homeowner's details exactly as stated on the call.",
  input_schema: {
    type: "object",
    properties: {
      firstName: { type: "string", description: "First name, proper case." },
      lastName: { type: "string", description: "Last name, proper case." },
      email: { type: "string", description: "Email address if stated." },
      street: { type: "string", description: "Street address, e.g. 1235 Main Street." },
      city: { type: "string", description: "City." },
      state: { type: "string", description: "Two-letter state code, e.g. WA." },
      zip: { type: "string", description: "5-digit ZIP." },
      intent: {
        type: "string",
        enum: ["one_off", "consultation", "membership", "unsure"],
        description: "one_off: a specific job/repair. consultation: wants someone to come look. membership: the Proactive Path / 360 Method.",
      },
      summary: { type: "string", description: "What they need, one plain sentence." },
      budget: { type: "string", description: "Level of investment they mentioned for the project, if any." },
      bestTimeToCall: { type: "string", description: "When to reach them, if stated." },
      timeline: { type: "string", description: "How soon they need it, if stated." },
    },
    required: [],
  },
};

const SYSTEM = `You extract a home-services lead from a phone call transcript for Handy Pioneers.
Use only what the caller actually said. Leave a field out entirely if it was not clearly stated; never guess or invent. Names in proper case, state as a 2-letter code. Call record_lead exactly once.`;

export async function extractLeadFromTranscript(
  transcript: string,
  summary?: string | null,
): Promise<ExtractedLead | null> {
  try {
    const provider = getLlmProvider();
    const model = process.env.VOICE_EXTRACT_MODEL || "claude-haiku-4-5-20251001";
    const res = await provider.complete({
      model,
      maxTokens: 700,
      system: SYSTEM,
      tools: [RECORD_TOOL],
      messages: [
        {
          role: "user",
          content: `Call transcript:\n${transcript}\n${summary ? `\nCall summary: ${summary}` : ""}\n\nExtract the lead with record_lead.`,
        },
      ],
    });
    const block = res.content.find((b) => b.type === "tool_use" && b.name === "record_lead");
    if (block && block.type === "tool_use") {
      const clean: ExtractedLead = {};
      for (const [k, v] of Object.entries(block.input as Record<string, unknown>)) {
        if (typeof v === "string" && v.trim()) (clean as Record<string, string>)[k] = v.trim();
      }
      return clean;
    }
    return null;
  } catch (e) {
    console.error("[voiceAgent] extractLeadFromTranscript failed:", e);
    return null;
  }
}
