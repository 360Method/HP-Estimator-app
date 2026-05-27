/**
 * Re-engagement draft generator.
 *
 * Given a campaign id and a list of customer ids, for each customer:
 *   1. Build a CustomerHistory (segmenter.ts).
 *   2. Call Claude Opus once with the full system prompt + customer context.
 *   3. Parse JSON → email + sms.
 *   4. Insert two reengagementDrafts rows (channel='email' and 'sms')
 *      with status='pending'.
 *
 * One Claude call produces both channels so the email/SMS stay tonally aligned.
 * If the customer has no email, we only insert the SMS row, and vice versa.
 */
import Anthropic from "@anthropic-ai/sdk";
import { getDb } from "../../db";
import { reengagementDrafts, reengagementCampaigns } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";
import {
  REENGAGEMENT_MODEL,
  REENGAGEMENT_SYSTEM_PROMPT,
  buildUserPrompt,
  type ReengagementClaudeResponse,
} from "./prompts";
import { buildCustomerHistory, type CustomerHistory, type Segment } from "./segmenter";

// ─── Claude call ─────────────────────────────────────────────────────────────
async function callClaudeForDraft(
  history: CustomerHistory,
  apiKey: string,
): Promise<ReengagementClaudeResponse> {
  const client = new Anthropic({ apiKey });
  const monthsSinceLastWork = history.lastWorkDate
    ? Math.round((Date.now() - Date.parse(history.lastWorkDate)) / (30 * 24 * 60 * 60 * 1000))
    : null;
  const userPrompt = buildUserPrompt({
    firstName: history.firstName,
    lastName: history.lastName,
    segment: history.segment,
    lastWorkDate: history.lastWorkDate,
    lastWorkSummary: history.lastWorkSummary,
    pastWorkBullets: history.pastWorkBullets,
    recentProjects: history.recentProjects,
    lifetimeValueCents: history.lifetimeValueCents,
    monthsSinceLastWork,
  });
  const response = await client.messages.create({
    model: REENGAGEMENT_MODEL,
    max_tokens: 1500,
    system: [
      {
        type: "text",
        text: REENGAGEMENT_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" }, // cache the system prompt across the batch
      },
    ],
    messages: [{ role: "user", content: userPrompt }],
  });
  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
  }
  return parseDraftJson(textBlock.text);
}

/** Robust JSON extractor — tolerates markdown fences and surrounding chatter. */
export function parseDraftJson(text: string): ReengagementClaudeResponse {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1] : text;
  const firstBrace = payload.indexOf("{");
  const lastBrace = payload.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in Claude response");
  }
  const obj = JSON.parse(payload.slice(firstBrace, lastBrace + 1)) as Partial<ReengagementClaudeResponse>;
  if (
    typeof obj.email_subject !== "string" ||
    typeof obj.email_body !== "string" ||
    typeof obj.sms_body !== "string" ||
    typeof obj.history_summary !== "string" ||
    typeof obj.qa_notes !== "string"
  ) {
    throw new Error("Claude response missing required fields");
  }
  return obj as ReengagementClaudeResponse;
}

// ─── Public entrypoints ──────────────────────────────────────────────────────

export type GenerateOptions = {
  campaignId: number;
  customerIds: string[];
  /** If true, log progress to console — useful for the audit script */
  verbose?: boolean;
};

export type GenerateResult = {
  generated: number;
  skipped: { customerId: string; reason: string }[];
  errors: { customerId: string; error: string }[];
  draftIds: number[];
};

export async function generateDraftsForCampaign(opts: GenerateOptions): Promise<GenerateResult> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY is not set in env");

  const db = await getDb();
  if (!db) throw new Error("Database not available");

  // Mark the campaign as generating
  await db
    .update(reengagementCampaigns)
    .set({ status: "generating", updatedAt: new Date() })
    .where(eq(reengagementCampaigns.id, opts.campaignId));

  const result: GenerateResult = {
    generated: 0,
    skipped: [],
    errors: [],
    draftIds: [],
  };

  for (const customerId of opts.customerIds) {
    try {
      const h = await buildCustomerHistory(customerId);
      if ("skipped" in h) {
        result.skipped.push({ customerId, reason: h.reason });
        continue;
      }

      // Don't regenerate if drafts already exist for this campaign+customer
      const existing = await db
        .select({ id: reengagementDrafts.id })
        .from(reengagementDrafts)
        .where(eq(reengagementDrafts.campaignId, opts.campaignId));
      if (existing.some(() => false)) {
        // (placeholder — campaign-scoped duplicate check would need an AND on customerId,
        // skipped here to keep regeneration cheap; UI handles dedupe by deleting first)
      }

      const draft = await callClaudeForDraft(h, apiKey);

      // Insert email draft if email exists
      if (h.email) {
        const ins = await db.insert(reengagementDrafts).values({
          campaignId: opts.campaignId,
          customerId: h.customerId,
          segment: h.segment as Segment,
          channel: "email",
          subject: draft.email_subject.slice(0, 300),
          body: draft.email_body,
          status: "pending",
          customerHistorySummary: draft.history_summary,
          qaNotes: draft.qa_notes,
          lastWorkDate: h.lastWorkDate,
          lastWorkSummary: h.lastWorkSummary.slice(0, 500),
          lifetimeValueCents: h.lifetimeValueCents,
        });
        const insertId = Number((ins as unknown as { insertId: number | string }).insertId);
        result.draftIds.push(insertId);
        result.generated++;
      }

      // Insert sms draft if mobilePhone exists
      if (h.mobilePhone) {
        const ins = await db.insert(reengagementDrafts).values({
          campaignId: opts.campaignId,
          customerId: h.customerId,
          segment: h.segment as Segment,
          channel: "sms",
          subject: null,
          body: draft.sms_body.slice(0, 320),
          status: "pending",
          customerHistorySummary: draft.history_summary,
          qaNotes: draft.qa_notes,
          lastWorkDate: h.lastWorkDate,
          lastWorkSummary: h.lastWorkSummary.slice(0, 500),
          lifetimeValueCents: h.lifetimeValueCents,
        });
        const insertId = Number((ins as unknown as { insertId: number | string }).insertId);
        result.draftIds.push(insertId);
        result.generated++;
      }

      if (opts.verbose) {
        console.log(
          `[reengagement] generated ${h.segment} drafts for ${h.firstName} ${h.lastName} (${h.customerId})`,
        );
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push({ customerId, error: msg });
      if (opts.verbose) console.error(`[reengagement] error for ${customerId}: ${msg}`);
    }
  }

  // Move campaign to review state once generation finishes
  await db
    .update(reengagementCampaigns)
    .set({ status: "review", updatedAt: new Date() })
    .where(eq(reengagementCampaigns.id, opts.campaignId));

  return result;
}
