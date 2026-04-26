/**
 * server/lib/priorityTranslation/processor.ts
 *
 * Async pipeline for the Priority Translation lead magnet:
 *
 *   1. Find-or-create portal account by email.
 *   2. Find-or-create portal property by (account_id, street, zip).
 *   3. Find-or-create home_health_record (one per property).
 *   4. Persist priority_translations row with status = "processing".
 *   5. Extract text from the uploaded PDF (or fetch the URL).
 *   6. Call Claude with the system prompt; parse JSON response.
 *   7. Merge findings into home_health_record.findings.
 *   8. Render branded output PDF.
 *   9. Send magic-link email with PDF attached; record delivered_at.
 *  10. Enqueue Path B nurture sequence 2.
 *
 * This file is the orchestrator. The individual steps live in peer modules
 * so each can be unit-tested in isolation.
 *
 * TODO(wire-up): this module depends on the (currently missing from origin/main)
 * ../../db module, ../../../drizzle/schema module, and the Claude SDK wrapper
 * at ../../_core/llm. Import paths here assume those files exist after the
 * broken git state is resolved.
 */

import { randomUUID } from "crypto";
import Anthropic from "@anthropic-ai/sdk";
import {
  PRIORITY_TRANSLATION_MODEL,
  PRIORITY_TRANSLATION_SYSTEM_PROMPT,
  PRIORITY_TRANSLATION_USER_TEMPLATE,
} from "./prompt";
import type {
  ClaudePriorityTranslationResponse,
  HealthRecordFinding,
} from "../../../drizzle/schema.priorityTranslation";

// ─── Types ──────────────────────────────────────────────────────────────────
export type SubmitInput = {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  propertyAddress: string; // free-text; light parsing below
  pdfBuffer?: Buffer;
  reportUrl?: string;
  notes?: string;
};

export type SubmitResult = {
  priorityTranslationId: string;
  portalAccountId: string;
  propertyId: string;
  homeHealthRecordId: string;
};

// ─── Address parsing ────────────────────────────────────────────────────────
const ZIP_RE = /\b(\d{5})(?:-\d{4})?\b/;
const STATE_RE = /\b([A-Z]{2})\b/;

export function parseAddress(raw: string) {
  const zipMatch = raw.match(ZIP_RE);
  const stateMatch = raw.match(STATE_RE);
  const zip = zipMatch?.[1] ?? "";
  const state = stateMatch?.[1] ?? "WA";
  // naive comma split: "123 Main St, Vancouver, WA 98660"
  const parts = raw.split(",").map((s) => s.trim());
  return {
    street: parts[0] ?? raw,
    city: parts[1] ?? "",
    state,
    zip,
  };
}

// ─── Claude call (text) ─────────────────────────────────────────────────────
export async function callClaudeForTranslation(args: {
  propertyAddress: string;
  reportText: string;
  apiKey: string;
}): Promise<ClaudePriorityTranslationResponse> {
  const client = new Anthropic({ apiKey: args.apiKey });
  const response = await client.messages.create({
    model: PRIORITY_TRANSLATION_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: PRIORITY_TRANSLATION_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: PRIORITY_TRANSLATION_USER_TEMPLATE({
          propertyAddress: args.propertyAddress,
          reportText: args.reportText,
        }),
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
  }

  const json = extractJson(textBlock.text);
  return json as ClaudePriorityTranslationResponse;
}

// ─── Claude call (PDF buffer — no text extraction needed) ───────────────────
/**
 * Passes the inspection report PDF directly to Claude as a base64 document.
 * Claude reads the PDF natively — no pdf-parse dep required.
 * Supported on claude-3-5-* and claude-opus-4-* models.
 */
export async function callClaudeWithPdfBuffer(args: {
  propertyAddress: string;
  pdfBuffer: Buffer;
  apiKey: string;
}): Promise<ClaudePriorityTranslationResponse> {
  const client = new Anthropic({ apiKey: args.apiKey });
  const pdfBase64 = args.pdfBuffer.toString("base64");

  const response = await client.messages.create({
    model: PRIORITY_TRANSLATION_MODEL,
    max_tokens: 4096,
    system: [
      {
        type: "text",
        text: PRIORITY_TRANSLATION_SYSTEM_PROMPT,
        cache_control: { type: "ephemeral" },
      },
    ],
    messages: [
      {
        role: "user",
        content: [
          {
            type: "document",
            source: {
              type: "base64",
              media_type: "application/pdf",
              data: pdfBase64,
            },
          } as any,
          {
            type: "text",
            text: PRIORITY_TRANSLATION_USER_TEMPLATE({
              propertyAddress: args.propertyAddress,
              reportText: "[Inspection report provided as the attached PDF document above]",
            }),
          },
        ],
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude returned no text block");
  }
  return extractJson(textBlock.text) as ClaudePriorityTranslationResponse;
}

/** Extract the first JSON object from a Claude response (handles ```json fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1] : text;
  const firstBrace = payload.indexOf("{");
  const lastBrace = payload.lastIndexOf("}");
  if (firstBrace === -1 || lastBrace === -1) {
    throw new Error("No JSON object found in Claude response");
  }
  return JSON.parse(payload.slice(firstBrace, lastBrace + 1));
}

// ─── Merge strategy ─────────────────────────────────────────────────────────
export function mergeFindings(
  existing: HealthRecordFinding[],
  incoming: ClaudePriorityTranslationResponse["findings"],
  sourceId: string
): HealthRecordFinding[] {
  const now = new Date().toISOString();
  const additions: HealthRecordFinding[] = incoming.map((f) => ({
    source: "priority_translation",
    source_id: sourceId,
    category: f.category,
    finding: f.finding,
    urgency: f.urgency,
    investment_range_low_usd: f.investment_range_low_usd,
    investment_range_high_usd: f.investment_range_high_usd,
    reasoning: f.reasoning,
    status: "open",
    added_at: now,
  }));

  // De-dupe by (source, source_id, category) so re-processing is idempotent.
  const keyOf = (f: HealthRecordFinding) => `${f.source}|${f.source_id}|${f.category}`;
  const seen = new Set(existing.map(keyOf));
  const deduped = additions.filter((f) => !seen.has(keyOf(f)));
  return [...existing, ...deduped];
}

// ─── Orchestrator skeleton ──────────────────────────────────────────────────
// The full orchestrator runs through the priorityTranslation router.
// processSubmission is kept for API completeness but defers to the router's
// runPriorityTranslation() which has direct db access.
export async function processSubmission(_input: SubmitInput): Promise<SubmitResult> {
  throw new Error(
    "processSubmission: use priorityTranslationRouter.process or runPriorityTranslation() in the router instead"
  );
}

export function newTranslationId(): string {
  return `pt_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
}
