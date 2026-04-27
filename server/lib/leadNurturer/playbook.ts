/**
 * Playbook registry for the Lead Nurturer.
 *
 * Playbooks define a cadence of `PlaybookStep`s. Operators edit them from
 * /admin/agents/playbooks without touching code (the nucleus principle).
 * The default `roadmap_followup` cadence is seeded at boot if missing.
 *
 * Step timings are stored in MINUTES so the unit is consistent with how the
 * cron-style worker compares `scheduledFor` to `now()`. The admin UI renders
 * them in a friendlier "hours / days" affordance.
 */
import { eq } from "drizzle-orm";
import { getDb } from "../../db";
import { agentPlaybooks, type PlaybookStep } from "../../../drizzle/schema";

export const ROADMAP_FOLLOWUP_KEY = "roadmap_followup";

/**
 * Default roadmap follow-up cadence. Marcin's directive of 2026-04-27.
 *   T+0       — Roadmap delivery email (already sent by priorityTranslation)
 *   T+4h      — Concierge SMS, paste-ready
 *   T+24h     — "A few thoughts on your Roadmap" email
 *   T+72h     — SMS check-in
 *   T+7d      — 360° Method continuity email
 *   T+14d     — long-term nurture handoff (no draft generated; stage flip)
 */
export const DEFAULT_ROADMAP_FOLLOWUP_STEPS: PlaybookStep[] = [
  {
    key: "t_plus_4h_sms",
    channel: "sms",
    delayMinutes: 4 * 60,
    label: "Concierge SMS — read-the-roadmap nudge",
    voicePrompt:
      "First-name basis. Identify yourself as the Concierge from Handy Pioneers. " +
      "Acknowledge that the Roadmap landed in their inbox earlier today. Offer to " +
      "walk through it in person at their home this week. Keep it under 320 " +
      "characters. Stewardship voice — no urgency, no discount talk, no 'estimate'.",
  },
  {
    key: "t_plus_24h_email",
    channel: "email",
    delayMinutes: 24 * 60,
    label: "Specific-finding email — narrate one item from their report",
    voicePrompt:
      "Affluent voice. Narrate ONE specific finding from their homeHealthRecord " +
      "with the standard-of-care framing. Open with the property identifier (city + " +
      "year). Reference the urgency tag (NOW/SOON/WAIT) without using the word " +
      "'urgent'. Close with an offer to walk the property — never a CTA button. " +
      "150–200 words.",
  },
  {
    key: "t_plus_72h_sms",
    channel: "sms",
    delayMinutes: 72 * 60,
    label: "Light SMS check-in",
    voicePrompt:
      "Lightweight. Acknowledge that the Roadmap arrived. Offer to answer any " +
      "questions or schedule a walkthrough whenever fits. Under 280 characters. " +
      "Avoid 'just checking in' phrasing.",
  },
  {
    key: "t_plus_7d_email_360",
    channel: "email",
    delayMinutes: 7 * 24 * 60,
    label: "360° Method continuity introduction",
    voicePrompt:
      "Stewardship framing — most clients use a roadmap once; a few extend it " +
      "into ongoing standard-of-care via the 360° Method. Describe what that " +
      "looks like for a property like theirs (reference one detail from their " +
      "homeHealthRecord summary). Soft close — 'happy to walk you through it'. " +
      "180–220 words. No discount language.",
  },
  {
    key: "t_plus_14d_handoff",
    channel: "email",
    delayMinutes: 14 * 24 * 60,
    label: "Long-term nurture handoff (no message — stage flip + monthly insights)",
    voicePrompt:
      "Acknowledge the roadmap is theirs to keep. Tell them they'll occasionally " +
      "receive seasonal insights tailored to their property. No ask. Sets the " +
      "expectation for the monthly newsletter. 100–140 words.",
  },
];

export const DEFAULT_VOICE_RULES = {
  bannedWords: [
    "estimate",
    "free",
    "cheap",
    "affordable",
    "handyman",
    "easy",
    "fix",
    "repair",
    "best",
    "save",
    "discount",
    "limited time",
  ],
  tone: "Stewardship. Standard-of-care. Proactive. First-name basis.",
  formality:
    "First name only. Never use Mr./Ms./formal salutations. Sign off as 'Marcin' " +
    "or use the operator's first name when available.",
  brand: "Handy Pioneers — Vancouver, WA. 360° Method is the membership tier.",
};

export interface ResolvedPlaybook {
  key: string;
  displayName: string;
  description: string | null;
  enabled: boolean;
  steps: PlaybookStep[];
  voiceRules: typeof DEFAULT_VOICE_RULES;
}

/**
 * Load a playbook from the DB. Falls back to the in-memory default for
 * `roadmap_followup` so that smoke tests + cold starts never crash if the
 * boot-time seed hasn't run yet.
 */
export async function loadPlaybook(key: string): Promise<ResolvedPlaybook | null> {
  const db = await getDb();
  if (!db) {
    return key === ROADMAP_FOLLOWUP_KEY ? defaultRoadmapFollowupPlaybook() : null;
  }

  try {
    const rows = await db.select().from(agentPlaybooks).where(eq(agentPlaybooks.key, key)).limit(1);
    const row = rows[0];
    if (!row) {
      return key === ROADMAP_FOLLOWUP_KEY ? defaultRoadmapFollowupPlaybook() : null;
    }
    return {
      key: row.key,
      displayName: row.displayName,
      description: row.description,
      enabled: row.enabled,
      steps: parseSteps(row.stepsJson),
      voiceRules: parseVoiceRules(row.voiceRulesJson),
    };
  } catch (err) {
    console.warn("[leadNurturer.playbook] loadPlaybook fallback:", err);
    return key === ROADMAP_FOLLOWUP_KEY ? defaultRoadmapFollowupPlaybook() : null;
  }
}

function defaultRoadmapFollowupPlaybook(): ResolvedPlaybook {
  return {
    key: ROADMAP_FOLLOWUP_KEY,
    displayName: "Post-Roadmap Follow-Up",
    description:
      "Five-stage cadence that converts every Roadmap delivery into a booked " +
      "Baseline Walkthrough, a 360° Method enrollment, or a graceful long-term " +
      "nurture handoff. Drafts are approval-gated.",
    enabled: true,
    steps: DEFAULT_ROADMAP_FOLLOWUP_STEPS,
    voiceRules: DEFAULT_VOICE_RULES,
  };
}

function parseSteps(json: string): PlaybookStep[] {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return parsed.filter(
        (s): s is PlaybookStep =>
          !!s &&
          typeof s === "object" &&
          typeof s.key === "string" &&
          (s.channel === "sms" || s.channel === "email") &&
          typeof s.delayMinutes === "number" &&
          typeof s.label === "string",
      );
    }
  } catch (err) {
    console.warn("[leadNurturer.playbook] stepsJson parse failed:", err);
  }
  return DEFAULT_ROADMAP_FOLLOWUP_STEPS;
}

function parseVoiceRules(json: string | null): typeof DEFAULT_VOICE_RULES {
  if (!json) return DEFAULT_VOICE_RULES;
  try {
    const parsed = JSON.parse(json);
    return { ...DEFAULT_VOICE_RULES, ...parsed };
  } catch {
    return DEFAULT_VOICE_RULES;
  }
}

/**
 * Boot-time seed. Inserts the default roadmap_followup playbook if it doesn't
 * already exist. Idempotent.
 */
export async function ensureDefaultPlaybooks(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const existing = await db
    .select()
    .from(agentPlaybooks)
    .where(eq(agentPlaybooks.key, ROADMAP_FOLLOWUP_KEY))
    .limit(1);
  if (existing[0]) return;
  await db.insert(agentPlaybooks).values({
    key: ROADMAP_FOLLOWUP_KEY,
    displayName: "Post-Roadmap Follow-Up",
    description:
      "Five-stage cadence that converts every Roadmap delivery into a booked " +
      "Baseline Walkthrough, a 360° Method enrollment, or a graceful long-term " +
      "nurture handoff.",
    enabled: true,
    stepsJson: JSON.stringify(DEFAULT_ROADMAP_FOLLOWUP_STEPS),
    voiceRulesJson: JSON.stringify(DEFAULT_VOICE_RULES),
  });
  console.log("[leadNurturer] seeded default roadmap_followup playbook");
}

/**
 * Compute scheduledFor timestamps for each step relative to a starting point.
 * Pure — no DB. Used by the orchestrator and by the synthetic test.
 */
export function planSchedule(
  steps: PlaybookStep[],
  startedAt: Date,
): Array<PlaybookStep & { scheduledFor: Date }> {
  return steps.map((s) => ({
    ...s,
    scheduledFor: new Date(startedAt.getTime() + s.delayMinutes * 60_000),
  }));
}
