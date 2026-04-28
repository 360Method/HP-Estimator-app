/**
 * Draft generator — turns a queued `agentDrafts` row into a paste-ready
 * SMS or email body using Claude.
 *
 * Inputs are gathered from the customer profile + the linked
 * homeHealthRecord (for "specific finding" steps). The prompt enforces the
 * stewardship voice rules from the playbook: first-name basis, no banned
 * words, no urgency theatre.
 *
 * The return shape is `{ subject, body }` where subject is undefined for
 * SMS. Callers persist these onto the agentDrafts row and flip status to
 * `ready` (approval-gated) — they are never auto-sent.
 */
import Anthropic from "@anthropic-ai/sdk";
import { type PlaybookStep } from "../../../drizzle/schema";
import { type DEFAULT_VOICE_RULES } from "./playbook";

const NURTURER_MODEL = "claude-opus-4-7";

export interface DraftContext {
  firstName: string;
  lastName: string;
  propertyAddress: string;
  operatorFirstName: string;
  /** A trimmed summary of the homeHealthRecord — Claude reads this for specificity. */
  homeHealthSummary: string | null;
  /** A single concrete finding (highest urgency available) for narrate-one steps. */
  topFinding: {
    category: string;
    finding: string;
    urgency: "NOW" | "SOON" | "WAIT";
    reasoning: string;
  } | null;
  /** Magic link to the in-portal Take-Action funnel. */
  portalMagicLinkUrl: string | null;
  /** Operator phone for the SMS sign-off — used in body. */
  conciergePhone: string | null;
}

export interface GeneratedDraft {
  subject: string | null;
  body: string;
}

const SYSTEM_PROMPT_HEADER = `You write outreach for Handy Pioneers — a Vancouver, WA premium home-care firm.

Voice: stewardship. Standard-of-care. Proactive. First-name basis. Never formal salutations (no Mr./Ms.).

You are drafting a single message that an operator will review before sending. Keep it tight, specific, and human. The reader is an affluent homeowner who just received a 360° Roadmap PDF.

NEVER use these words: estimate, free, cheap, affordable, handyman, easy, fix, repair, best, save, discount, limited time. They cheapen the brand.

Reference the property by city/year/address detail when you have it. If a specific finding from the homeHealthRecord is provided, narrate that finding in the reader's own physical context — not as a sales line.

Output format:
- For email: return JSON {"subject": "...", "body": "..."}.
- For SMS: return JSON {"subject": null, "body": "..."}.
- Body is plain text (line breaks ok). No markdown. No HTML.
- SMS: under 320 characters total. Email: 150–220 words unless the step says otherwise.`;

/**
 * Render a Claude prompt + call. Returns the parsed JSON result. Caller is
 * responsible for persisting the draft row.
 */
export async function generateDraftBody(args: {
  apiKey: string;
  step: PlaybookStep;
  context: DraftContext;
  voiceRules: typeof DEFAULT_VOICE_RULES;
}): Promise<GeneratedDraft> {
  const { apiKey, step, context, voiceRules } = args;
  const client = new Anthropic({ apiKey });

  const channelInstruction =
    step.channel === "sms"
      ? "Channel: SMS. Subject must be null."
      : "Channel: EMAIL. Subject must be present and under 60 characters.";

  const findingSection =
    context.topFinding != null
      ? `One specific finding from this homeowner's roadmap (urgency=${context.topFinding.urgency}): ` +
        `category="${context.topFinding.category}". finding="${context.topFinding.finding}". ` +
        `reasoning="${context.topFinding.reasoning}".`
      : "No specific finding selected — speak generally about the roadmap as a whole.";

  const summarySection = context.homeHealthSummary
    ? `Roadmap summary: ${context.homeHealthSummary}`
    : "";

  const linkSection = context.portalMagicLinkUrl
    ? `If you reference a link, use this exact URL: ${context.portalMagicLinkUrl}`
    : "Do not invent a URL. If you'd normally include one, omit it instead.";

  const userPrompt = [
    `Step: ${step.label}`,
    channelInstruction,
    `Step voice prompt: ${step.voicePrompt}`,
    "",
    `Recipient first name: ${context.firstName || "(unknown — fall back to 'there')"}`,
    `Operator first name (sign-off): ${context.operatorFirstName}`,
    `Property: ${context.propertyAddress || "(address unavailable)"}`,
    "",
    summarySection,
    findingSection,
    "",
    linkSection,
    "",
    `Banned words: ${voiceRules.bannedWords.join(", ")}.`,
    `Tone: ${voiceRules.tone}`,
    `Formality: ${voiceRules.formality}`,
    "",
    "Return only the JSON object — no preamble, no fences.",
  ].join("\n");

  const response = await client.messages.create({
    model: NURTURER_MODEL,
    max_tokens: 1024,
    system: [
      {
        type: "text",
        text: SYSTEM_PROMPT_HEADER,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Lead Nurturer received no text block from Claude");
  }
  const parsed = extractJsonObject(textBlock.text);
  const subject = step.channel === "email" ? String(parsed.subject ?? "").trim() || "A note about your Roadmap" : null;
  const body = String(parsed.body ?? "").trim();
  if (!body) throw new Error("Lead Nurturer Claude response missing body");

  return { subject, body };
}

function extractJsonObject(text: string): { subject?: unknown; body?: unknown } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1] : text;
  const first = payload.indexOf("{");
  const last = payload.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    throw new Error("No JSON object in Claude response");
  }
  const slice = payload.slice(first, last + 1);
  return JSON.parse(slice);
}

// ─── Voice-rule guard ────────────────────────────────────────────────────────
/**
 * Returns the list of banned words present in `text` (case-insensitive). The
 * admin inbox surfaces this so the operator can edit before sending. Cheap —
 * doesn't block the send path; it's an advisory.
 */
export function detectBannedWords(text: string, bannedWords: string[]): string[] {
  const lower = text.toLowerCase();
  return bannedWords.filter((w) => {
    const needle = w.toLowerCase();
    const pattern = new RegExp(`\\b${needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i");
    return pattern.test(lower);
  });
}
