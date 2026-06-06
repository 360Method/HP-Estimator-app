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
import { nurturerPlaybooks, type PlaybookStep } from "../../../drizzle/schema";

export const ROADMAP_FOLLOWUP_KEY = "roadmap_followup";
export const ROADMAP_DROPOUT_KEY = "roadmap_dropout";

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

/**
 * Roadmap-funnel dropout cadence (2026-06-05). Anchored at step 1 of the
 * funnel (popup submit): the lead gave name + contact but never uploaded an
 * inspection report. Cancelled the moment the report lands (or on purchase /
 * appointment / reply). All steps approval-gated, like roadmap_followup.
 */
export const DEFAULT_ROADMAP_DROPOUT_STEPS: PlaybookStep[] = [
  {
    key: "t_plus_45m_email",
    channel: "email",
    delayMinutes: 45,
    label: "Your roadmap is one step away — finish the upload",
    voicePrompt:
      "First-name basis. They started their complimentary 360° Roadmap but " +
      "haven't sent their inspection report yet — the only missing piece. One " +
      "warm sentence on what the roadmap gives them (a clear NOW / SOON / WAIT " +
      "picture of their home), then the link to finish: " +
      "https://handypioneers.com/roadmap-generator. No pressure, no countdowns. " +
      "90–130 words.",
  },
  {
    key: "t_plus_24h_sms",
    channel: "sms",
    delayMinutes: 24 * 60,
    label: "Concierge SMS — offer to take the report by reply",
    voicePrompt:
      "Identify yourself as the Concierge from Handy Pioneers. They started " +
      "their complimentary roadmap; offer to take the inspection report by " +
      "reply or email if that's easier than the upload. Under 300 characters. " +
      "Warm, zero pressure.",
  },
  {
    key: "t_plus_3d_email",
    channel: "email",
    delayMinutes: 3 * 24 * 60,
    label: "Value email — what NOW / SOON / WAIT does for a homeowner",
    voicePrompt:
      "Affluent voice. Explain briefly what the three-tier roadmap does: most " +
      "inspection reports list everything and rank nothing — the roadmap sorts " +
      "their items into NOW (address this season), SOON (plan within the year), " +
      "and WAIT (monitor, don't spend yet), each with an investment range. Close " +
      "with 'send it over whenever convenient' and the link. 150–200 words.",
  },
  {
    key: "t_plus_7d_email",
    channel: "email",
    delayMinutes: 7 * 24 * 60,
    label: "Graceful close — door stays open",
    voicePrompt:
      "Last note of the cadence. Acknowledge the report may have fallen down " +
      "the list — happens to everyone. The roadmap offer stands whenever " +
      "they're ready; no expiry. Sign off warmly. 80–120 words. No ask beyond " +
      "the standing offer.",
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
 * Load a playbook from the DB. Falls back to the in-memory default for the
 * seeded playbooks so that smoke tests + cold starts never crash if the
 * boot-time seed hasn't run yet.
 */
export async function loadPlaybook(key: string): Promise<ResolvedPlaybook | null> {
  const db = await getDb();
  if (!db) {
    return defaultPlaybookFor(key);
  }

  try {
    const rows = await db.select().from(nurturerPlaybooks).where(eq(nurturerPlaybooks.key, key)).limit(1);
    const row = rows[0];
    if (!row) {
      return defaultPlaybookFor(key);
    }
    return {
      key: row.key,
      displayName: row.displayName,
      description: row.description,
      enabled: row.enabled,
      steps: parseSteps(row.stepsJson, defaultStepsFor(row.key)),
      voiceRules: parseVoiceRules(row.voiceRulesJson),
    };
  } catch (err) {
    console.warn("[leadNurturer.playbook] loadPlaybook fallback:", err);
    return defaultPlaybookFor(key);
  }
}

function defaultStepsFor(key: string): PlaybookStep[] {
  if (key === ROADMAP_DROPOUT_KEY) return DEFAULT_ROADMAP_DROPOUT_STEPS;
  return DEFAULT_ROADMAP_FOLLOWUP_STEPS;
}

function defaultPlaybookFor(key: string): ResolvedPlaybook | null {
  if (key === ROADMAP_FOLLOWUP_KEY) {
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
  if (key === ROADMAP_DROPOUT_KEY) {
    return {
      key: ROADMAP_DROPOUT_KEY,
      displayName: "Roadmap Funnel — Dropout Recovery",
      description:
        "Four-step cadence for leads who gave contact info in the roadmap funnel " +
        "but never uploaded an inspection report. Cancelled automatically when the " +
        "report lands, a membership is purchased, an appointment is booked, or the " +
        "lead replies. Drafts are approval-gated.",
      enabled: true,
      steps: DEFAULT_ROADMAP_DROPOUT_STEPS,
      voiceRules: DEFAULT_VOICE_RULES,
    };
  }
  return null;
}

function parseSteps(json: string, fallback: PlaybookStep[]): PlaybookStep[] {
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
  return fallback;
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
 * Boot-time seed. Inserts the default playbooks that don't already exist.
 * Idempotent; never overwrites operator edits.
 */
export async function ensureDefaultPlaybooks(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const seeds = [
    {
      key: ROADMAP_FOLLOWUP_KEY,
      displayName: "Post-Roadmap Follow-Up",
      description:
        "Five-stage cadence that converts every Roadmap delivery into a booked " +
        "Baseline Walkthrough, a 360° Method enrollment, or a graceful long-term " +
        "nurture handoff.",
      steps: DEFAULT_ROADMAP_FOLLOWUP_STEPS,
    },
    {
      key: ROADMAP_DROPOUT_KEY,
      displayName: "Roadmap Funnel — Dropout Recovery",
      description:
        "Four-step cadence for leads who gave contact info in the roadmap funnel " +
        "but never uploaded an inspection report. Cancelled automatically on report " +
        "submit, purchase, appointment, or reply.",
      steps: DEFAULT_ROADMAP_DROPOUT_STEPS,
    },
  ];
  for (const seed of seeds) {
    const existing = await db
      .select()
      .from(nurturerPlaybooks)
      .where(eq(nurturerPlaybooks.key, seed.key))
      .limit(1);
    if (existing[0]) continue;
    await db.insert(nurturerPlaybooks).values({
      key: seed.key,
      displayName: seed.displayName,
      description: seed.description,
      enabled: true,
      stepsJson: JSON.stringify(seed.steps),
      voiceRulesJson: JSON.stringify(DEFAULT_VOICE_RULES),
    });
    console.log(`[leadNurturer] seeded default ${seed.key} playbook`);
  }
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
