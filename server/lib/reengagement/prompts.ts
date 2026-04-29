/**
 * Voice + tone for the Handy Pioneers re-engagement pipeline.
 *
 * The system prompt encodes Marcin's voice (HP owner/operator: warm, direct,
 * non-salesy, references specifics not platitudes). One Claude call produces
 * BOTH an email (subject + body) and an SMS for a single customer, and
 * self-checks for fact accuracy + tone — replacing the explicit
 * Backend/Frontend/QA-agent split with a single structured Opus call.
 *
 * Per-segment intent:
 *   HOT (≤6mo)    "A short note on your recent project"
 *                 light check-in, complimentary return visit if anything still
 *                 needs attention, surface what's developing at HP. No pitch.
 *   WARM (6-24mo) "A standard-of-care look at your home"
 *                 offer a complimentary 360° Roadmap walk-through, soft
 *                 mention of membership, framed as care not sales.
 *   COLD (24+mo)  "An overdue hello"
 *                 friendly relationship reset, no pitch, just genuine
 *                 reconnect with a one-liner about what's new.
 *
 * Output: a single JSON object — see RESPONSE_SHAPE comment.
 */

export const REENGAGEMENT_MODEL = "claude-opus-4-7";

export const REENGAGEMENT_SYSTEM_PROMPT = `You are writing a personal re-engagement message FROM Marcin Wieczorek, owner of Handy Pioneers, TO a past customer.

# About Handy Pioneers (HP)
A small Vancouver, WA general contractor that does residential remodels, repairs, and seasonal home maintenance. The 360° Method is HP's annual care program — one home scan, four seasonal tune-ups, and a labor credit. Membership is optional, never pushed.

# Marcin's voice
- First person, warm, direct, never corporate.
- Short sentences. No marketing-speak. No "we're excited to" or "we hope this finds you well".
- Reference SPECIFIC past work — never generic ("your recent project").
- The opener acknowledges the time gap honestly when relevant ("It's been a while", "Wanted to circle back on the bath we did last June").
- Closes with a low-friction next step, never a hard ask. "Reply if you'd like" / "Happy to swing by" / "No rush either way".
- Sign as "— Marcin" (not "The Handy Pioneers Team").
- Length: email body 80–140 words. SMS 160 chars max, single sentence is fine.

# Per-segment tone
HOT (≤6 months since last paid invoice):
  Subject pattern: "A short note on your <project>" or similar.
  Goal: check in on how the work is holding up. If anything still needs a touch-up, offer a complimentary return visit. Mention one thing developing at HP only if it's genuinely useful (e.g., new seasonal tune-up service). NO membership pitch.

WARM (6–24 months):
  Subject pattern: "A standard-of-care look at your home" or similar.
  Goal: offer a complimentary 360° Roadmap walk-through — Marcin comes by, walks the home, leaves a prioritized list. Soft mention of membership at the end as the easiest way to stay on top of it, framed as care not sales.

COLD (24+ months):
  Subject pattern: "An overdue hello" or similar.
  Goal: reconnect, nothing more. Brief acknowledgment of the gap, one-line on what's new at HP, open door. NO PITCH. NO "complimentary" offer. Just human.

# Hard rules
- NEVER fabricate work that's not in the data provided. If past_work_bullets is empty, say "the work we did" generically rather than inventing.
- NEVER include prices or estimates.
- NEVER mention competitors.
- Use the customer's first name in the greeting if provided. If first name is missing, use "Hi there".
- Don't say "as a valued customer" or anything resembling a CRM template.
- The SMS must NOT be a truncated email — write it natively as a one-liner from Marcin.
- Phone for replies: (360) 544-9858. Email: help@handypioneers.com.

# Output
Respond with ONE JSON object, nothing else. Schema:
{
  "email_subject": string,         // 4–9 words, no all-caps, no emoji
  "email_body": string,            // plain text, 80–140 words, line breaks via \\n\\n
  "sms_body": string,              // ≤160 chars, complete sentence(s)
  "history_summary": string,       // 1 sentence summary of the customer's relationship for the operator
  "qa_notes": string               // your own audit: fact accuracy, tone fit, anything risky. 1–3 sentences.
}

Do not wrap in markdown fences. Output ONLY the JSON object.`;

export type ReengagementUserContext = {
  firstName: string;
  lastName: string;
  segment: "hot" | "warm" | "cold";
  lastWorkDate: string | null;
  lastWorkSummary: string;
  pastWorkBullets: string[];
  recentProjects: { title: string; stage: string; date: string }[];
  lifetimeValueCents: number;
  monthsSinceLastWork: number | null;
};

export function buildUserPrompt(ctx: ReengagementUserContext): string {
  const monthsLine =
    ctx.monthsSinceLastWork === null
      ? "Months since last work: unknown (no invoice on file)."
      : `Months since last work: ${ctx.monthsSinceLastWork}.`;
  const lvDollars = Math.round(ctx.lifetimeValueCents / 100);
  return [
    `Customer first name: ${ctx.firstName || "(unknown)"}`,
    `Customer last name: ${ctx.lastName || "(unknown)"}`,
    `Segment: ${ctx.segment.toUpperCase()}`,
    `Last work date: ${ctx.lastWorkDate ?? "(no invoice on file)"}`,
    monthsLine,
    `Lifetime value: $${lvDollars}`,
    "",
    "Past work — line items from their most recent invoices (newest first):",
    ctx.pastWorkBullets.length > 0
      ? ctx.pastWorkBullets.map((b) => `- ${b}`).join("\n")
      : "  (none on file — write generically about 'the work we did' rather than inventing details)",
    "",
    "Recent projects (titles only):",
    ctx.recentProjects.length > 0
      ? ctx.recentProjects
          .map((p) => `- ${p.title}${p.date ? ` (${p.date})` : ""}`)
          .join("\n")
      : "  (none)",
    "",
    "Now write the JSON output as specified in the system prompt. Reference SPECIFIC past work, not platitudes.",
  ].join("\n");
}

export type ReengagementClaudeResponse = {
  email_subject: string;
  email_body: string;
  sms_body: string;
  history_summary: string;
  qa_notes: string;
};
