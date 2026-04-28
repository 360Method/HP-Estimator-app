/**
 * server/lib/agentRuntime/integratorBrief.ts
 *
 * Monday-morning weekly brief from the Integrator AI to Marcin. Pulls last
 * week's company-level KPIs, agent activity, and customer movement, then asks
 * Claude to render a 5-bucket digest:
 *
 *   • Done — what shipped / closed
 *   • In Progress — what's mid-flight
 *   • Blocked — what's stuck and why
 *   • Decisions Needed — what Marcin needs to weigh in on
 *   • Risk Flags — what's drifting that should be watched
 *
 * Output:
 *   • Bell notification (priority=high, role=admin) so it's the first thing
 *     Marcin sees on Monday.
 *   • Email to help@handypioneers.com (Marcin's inbox) via Resend.
 *
 * Idempotency: claimCronRun("integrator_weekly_brief", isoWeek) — restarting
 * the server at 6:30am Monday won't re-fire the brief.
 *
 * Cadence: Monday 06:00 America/Los_Angeles. Polls every 15 minutes; fires
 * on the first tick where Pacific weekday=Mon and hour=6 and the week hasn't
 * been claimed yet.
 */

import Anthropic from "@anthropic-ai/sdk";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "../../db";
import {
  aiAgentRuns,
  aiAgents,
  aiAgentTasks,
  agentDrafts,
  customers,
  kpiMetrics,
  notifications,
  opportunities,
} from "../../../drizzle/schema";
import { sendEmail } from "../../gmail";
import {
  claimCronRun,
  markCronRunResult,
  pacificIsoWeekKey,
} from "./cronRuns";

const BRIEF_HOUR_PT = 6;
const BRIEF_MODEL = "claude-opus-4-7";
const OWNER_EMAIL = "help@handypioneers.com";

export type BriefBucket =
  | "Done"
  | "In Progress"
  | "Blocked"
  | "Decisions Needed"
  | "Risk Flags";

export interface BriefBullet {
  bucket: BriefBucket;
  text: string;
}

export interface IntegratorBrief {
  weekKey: string;
  bullets: BriefBullet[];
  rawText: string;
}

/**
 * Build the Integrator brief end-to-end. Returns the structured brief.
 * Side effects: sends email + writes admin notification. Skips both if
 * `dryRun` is true (used by tests).
 */
export async function runIntegratorBrief(args: { dryRun?: boolean; now?: Date } = {}): Promise<{
  status: "sent" | "skipped_already_run" | "skipped_dry_run" | "failed_no_api_key";
  brief: IntegratorBrief | null;
}> {
  const now = args.now ?? new Date();
  const weekKey = pacificIsoWeekKey(now);

  if (!args.dryRun) {
    const claimed = await claimCronRun("integrator_weekly_brief", weekKey);
    if (!claimed) {
      return { status: "skipped_already_run", brief: null };
    }
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    if (!args.dryRun) {
      await markCronRunResult(
        "integrator_weekly_brief",
        weekKey,
        "failed",
        "ANTHROPIC_API_KEY not set",
      );
    }
    return { status: "failed_no_api_key", brief: null };
  }

  try {
    const ctx = await gatherWeeklyContext(now);
    const bullets = await draftBullets(apiKey, ctx);
    const brief: IntegratorBrief = {
      weekKey,
      bullets,
      rawText: bullets.map((b) => `• [${b.bucket}] ${b.text}`).join("\n"),
    };

    if (args.dryRun) {
      return { status: "skipped_dry_run", brief };
    }

    await Promise.all([
      sendBriefEmail(brief, ctx).catch((err) =>
        console.warn("[integratorBrief] email send failed:", err),
      ),
      writeBriefNotification(brief).catch((err) =>
        console.warn("[integratorBrief] notification write failed:", err),
      ),
    ]);

    await markCronRunResult(
      "integrator_weekly_brief",
      weekKey,
      "succeeded",
      `bullets=${bullets.length}`,
    );
    return { status: "sent", brief };
  } catch (err) {
    const detail = err instanceof Error ? err.message.slice(0, 200) : "error";
    if (!args.dryRun) {
      await markCronRunResult("integrator_weekly_brief", weekKey, "failed", detail);
    }
    throw err;
  }
}

interface WeeklyContext {
  weekKey: string;
  weekStart: Date;
  companyKpis: Array<{ key: string; value: number; unit: string }>;
  agentActivity: { runs: number; failed: number; costUsd: number; pendingApprovals: number };
  customerActivity: { newCustomers: number; newOpportunities: number; closedWon: number };
  draftActivity: { generated: number; sent: number; pendingReady: number };
  topAgentsByCost: Array<{ seatName: string; runs: number; costUsd: number; failed: number }>;
}

async function gatherWeeklyContext(now: Date): Promise<WeeklyContext> {
  const db = await getDb();
  const weekKey = pacificIsoWeekKey(now);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  if (!db) {
    return {
      weekKey,
      weekStart,
      companyKpis: [],
      agentActivity: { runs: 0, failed: 0, costUsd: 0, pendingApprovals: 0 },
      customerActivity: { newCustomers: 0, newOpportunities: 0, closedWon: 0 },
      draftActivity: { generated: 0, sent: 0, pendingReady: 0 },
      topAgentsByCost: [],
    };
  }

  const companyRows = await db
    .select()
    .from(kpiMetrics)
    .where(eq(kpiMetrics.scope, "company"))
    .orderBy(desc(kpiMetrics.computedAt))
    .limit(200);
  const latestByKey = new Map<string, { key: string; value: number; unit: string }>();
  for (const r of companyRows) {
    if (!latestByKey.has(r.key)) {
      latestByKey.set(r.key, { key: r.key, value: Number(r.value), unit: r.unit });
    }
  }

  const [activity] = await db
    .select({
      runs: sql<number>`COUNT(*)`,
      failed: sql<number>`SUM(CASE WHEN ${aiAgentRuns.status} IN ('failed','tool_error') THEN 1 ELSE 0 END)`,
      cost: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
    })
    .from(aiAgentRuns)
    .where(gte(aiAgentRuns.createdAt, weekStart));
  const [pending] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(aiAgentTasks)
    .where(eq(aiAgentTasks.status, "awaiting_approval"));

  const [newCust] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(customers)
    .where(gte(customers.createdAt, weekStart));
  const [newOpp] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(opportunities)
    .where(gte(opportunities.createdAt, weekStart));
  const [closedWon] = await db
    .select({ c: sql<number>`COUNT(*)` })
    .from(opportunities)
    .where(and(gte(opportunities.updatedAt, weekStart), eq(opportunities.stage, "Closed Won")));

  const [draftStats] = await db
    .select({
      generated: sql<number>`SUM(CASE WHEN ${agentDrafts.generatedAt} IS NOT NULL AND ${agentDrafts.generatedAt} >= ${weekStart} THEN 1 ELSE 0 END)`,
      sent: sql<number>`SUM(CASE WHEN ${agentDrafts.status} = 'sent' AND ${agentDrafts.sentAt} >= ${weekStart} THEN 1 ELSE 0 END)`,
      pendingReady: sql<number>`SUM(CASE WHEN ${agentDrafts.status} = 'ready' THEN 1 ELSE 0 END)`,
    })
    .from(agentDrafts);

  const topAgents = await db
    .select({
      agentId: aiAgentRuns.agentId,
      runs: sql<number>`COUNT(*)`,
      cost: sql<number>`COALESCE(SUM(${aiAgentRuns.costUsd}), 0)`,
      failed: sql<number>`SUM(CASE WHEN ${aiAgentRuns.status} IN ('failed','tool_error') THEN 1 ELSE 0 END)`,
    })
    .from(aiAgentRuns)
    .where(gte(aiAgentRuns.createdAt, weekStart))
    .groupBy(aiAgentRuns.agentId)
    .orderBy(sql`COALESCE(SUM(${aiAgentRuns.costUsd}), 0) DESC`)
    .limit(5);
  const seatLookup = new Map<number, string>();
  if (topAgents.length > 0) {
    const seats = await db.select().from(aiAgents);
    for (const s of seats) seatLookup.set(s.id, s.seatName);
  }

  return {
    weekKey,
    weekStart,
    companyKpis: Array.from(latestByKey.values()),
    agentActivity: {
      runs: Number(activity?.runs ?? 0),
      failed: Number(activity?.failed ?? 0),
      costUsd: Number(activity?.cost ?? 0),
      pendingApprovals: Number(pending?.c ?? 0),
    },
    customerActivity: {
      newCustomers: Number(newCust?.c ?? 0),
      newOpportunities: Number(newOpp?.c ?? 0),
      closedWon: Number(closedWon?.c ?? 0),
    },
    draftActivity: {
      generated: Number(draftStats?.generated ?? 0),
      sent: Number(draftStats?.sent ?? 0),
      pendingReady: Number(draftStats?.pendingReady ?? 0),
    },
    topAgentsByCost: topAgents.map((r) => ({
      seatName: seatLookup.get(Number(r.agentId)) ?? `agent#${r.agentId}`,
      runs: Number(r.runs),
      costUsd: Number(r.cost),
      failed: Number(r.failed),
    })),
  };
}

async function draftBullets(apiKey: string, ctx: WeeklyContext): Promise<BriefBullet[]> {
  const client = new Anthropic({ apiKey });

  const ctxBlock = [
    `Week: ${ctx.weekKey} (since ${ctx.weekStart.toISOString().slice(0, 10)})`,
    "",
    `Customer activity:`,
    `  • New customers: ${ctx.customerActivity.newCustomers}`,
    `  • New opportunities: ${ctx.customerActivity.newOpportunities}`,
    `  • Closed-Won: ${ctx.customerActivity.closedWon}`,
    "",
    `Agent activity:`,
    `  • Runs: ${ctx.agentActivity.runs}  Failed: ${ctx.agentActivity.failed}  Spend: $${ctx.agentActivity.costUsd.toFixed(2)}`,
    `  • Pending approvals (queue depth): ${ctx.agentActivity.pendingApprovals}`,
    "",
    `Lead Nurturer drafts:`,
    `  • Generated: ${ctx.draftActivity.generated}  Sent: ${ctx.draftActivity.sent}  Awaiting approval: ${ctx.draftActivity.pendingReady}`,
    "",
    `Top 5 seats by spend:`,
    ...(ctx.topAgentsByCost.length > 0
      ? ctx.topAgentsByCost.map(
          (a) =>
            `  • ${a.seatName}: ${a.runs} runs, $${a.costUsd.toFixed(2)}, ${a.failed} failed`,
        )
      : ["  (no agent activity yet)"]),
    "",
    `Latest company KPIs:`,
    ...(ctx.companyKpis.length > 0
      ? ctx.companyKpis
          .slice(0, 12)
          .map((k) => `  • ${k.key}: ${k.value} ${k.unit}`)
      : ["  (no company-level KPI rollups yet)"]),
  ].join("\n");

  const system = `You are the Integrator AI for Handy Pioneers, briefing the founder Marcin every Monday at 6am.

Voice: stewardship + ops-room. Direct. No corporate filler. Marcin scans this on his phone before standup — every line has to earn its space.

Output exactly 5 bullets, one per bucket, in this order:
  1. [Done] — what shipped or closed last week
  2. [In Progress] — what is actively mid-flight
  3. [Blocked] — what is stuck and the specific blocker
  4. [Decisions Needed] — what Marcin needs to weigh in on this week
  5. [Risk Flags] — what is drifting and should be watched

Rules:
- One bullet per bucket. Each bullet ≤ 220 characters.
- Lead with the concrete thing, then the metric/why.
- If a bucket has no real signal, write "Nothing material this week." for that bucket — do not invent.
- No marketing copy. No exclamation marks. No "I" statements.

Return ONLY a JSON object: {"bullets":[{"bucket":"Done","text":"..."},{"bucket":"In Progress","text":"..."},{"bucket":"Blocked","text":"..."},{"bucket":"Decisions Needed","text":"..."},{"bucket":"Risk Flags","text":"..."}]}.
No prose, no fences, no preamble.`;

  const response = await client.messages.create({
    model: BRIEF_MODEL,
    max_tokens: 1024,
    system: [
      { type: "text", text: system, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: `Last week's signals — synthesize the 5-bucket brief:\n\n${ctxBlock}`,
      },
    ],
  });

  const textBlock = response.content.find((b) => b.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Integrator brief: Claude returned no text block");
  }
  const parsed = parseBriefJson(textBlock.text);
  return normalizeBullets(parsed);
}

function parseBriefJson(text: string): { bullets?: unknown } {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const payload = fenced ? fenced[1] : text;
  const first = payload.indexOf("{");
  const last = payload.lastIndexOf("}");
  if (first === -1 || last === -1 || last < first) {
    throw new Error("Integrator brief: no JSON object in response");
  }
  return JSON.parse(payload.slice(first, last + 1));
}

const BUCKET_ORDER: BriefBucket[] = [
  "Done",
  "In Progress",
  "Blocked",
  "Decisions Needed",
  "Risk Flags",
];

function normalizeBullets(parsed: { bullets?: unknown }): BriefBullet[] {
  const arr = Array.isArray(parsed.bullets) ? parsed.bullets : [];
  const byBucket = new Map<BriefBucket, string>();
  for (const item of arr) {
    if (!item || typeof item !== "object") continue;
    const bucket = (item as { bucket?: unknown }).bucket;
    const text = (item as { text?: unknown }).text;
    if (typeof bucket !== "string" || typeof text !== "string") continue;
    const matched = BUCKET_ORDER.find((b) => b.toLowerCase() === bucket.trim().toLowerCase());
    if (!matched) continue;
    if (!byBucket.has(matched)) byBucket.set(matched, text.trim());
  }
  return BUCKET_ORDER.map((b) => ({
    bucket: b,
    text: byBucket.get(b) ?? "Nothing material this week.",
  }));
}

async function sendBriefEmail(brief: IntegratorBrief, ctx: WeeklyContext): Promise<void> {
  const subject = `Integrator weekly brief — ${brief.weekKey}`;
  const bulletsHtml = brief.bullets
    .map(
      (b) =>
        `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;">
          <div style="font-size:11px;letter-spacing:0.12em;color:#888;text-transform:uppercase;">${b.bucket}</div>
          <div style="font-size:15px;color:#1a1a1a;line-height:1.5;margin-top:2px;">${escapeHtml(b.text)}</div>
        </td></tr>`,
    )
    .join("");
  const statsHtml = `
    <table width="100%" style="margin-top:16px;font-size:13px;color:#555;border-collapse:collapse;">
      <tr><td style="padding:4px 0;">Customers added</td><td align="right"><strong>${ctx.customerActivity.newCustomers}</strong></td></tr>
      <tr><td style="padding:4px 0;">Opportunities opened</td><td align="right"><strong>${ctx.customerActivity.newOpportunities}</strong></td></tr>
      <tr><td style="padding:4px 0;">Closed-Won</td><td align="right"><strong>${ctx.customerActivity.closedWon}</strong></td></tr>
      <tr><td style="padding:4px 0;">Agent runs / failures</td><td align="right"><strong>${ctx.agentActivity.runs} / ${ctx.agentActivity.failed}</strong></td></tr>
      <tr><td style="padding:4px 0;">Agent spend</td><td align="right"><strong>$${ctx.agentActivity.costUsd.toFixed(2)}</strong></td></tr>
      <tr><td style="padding:4px 0;">Drafts awaiting approval</td><td align="right"><strong>${ctx.draftActivity.pendingReady}</strong></td></tr>
    </table>`;
  const html = `<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f8f6f2;padding:32px 16px;color:#1a1a1a;">
<table width="640" style="max-width:640px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
  <tr><td style="background:#1a2e1a;padding:24px 36px;">
    <p style="color:rgba(255,255,255,0.65);font-size:11px;letter-spacing:0.16em;text-transform:uppercase;margin:0;">Handy Pioneers · Integrator</p>
    <p style="color:#fff;font-size:20px;margin:8px 0 0;font-weight:700;">Weekly brief — ${brief.weekKey}</p>
  </td></tr>
  <tr><td style="padding:28px 36px;">
    <table width="100%" style="border-collapse:collapse;">${bulletsHtml}</table>
    <div style="margin-top:24px;font-size:11px;color:#999;letter-spacing:0.12em;text-transform:uppercase;">By the numbers</div>
    ${statsHtml}
  </td></tr>
  <tr><td style="padding:18px 36px;border-top:1px solid #eee;font-size:12px;color:#888;">
    Generated ${new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles", dateStyle: "full", timeStyle: "short" })} PT.
    Open <a href="https://pro.handypioneers.com/admin/agents" style="color:#c8922a;">/admin/agents</a> for the live console.
  </td></tr>
</table></body></html>`;
  await sendEmail({ to: OWNER_EMAIL, subject, html });
}

async function writeBriefNotification(brief: IntegratorBrief): Promise<void> {
  const db = await getDb();
  if (!db) return;
  const body = brief.bullets
    .map((b) => `[${b.bucket}] ${b.text}`)
    .join("\n");
  await db.insert(notifications).values({
    userId: 1,
    role: "admin",
    eventType: "integrator_weekly_brief",
    title: `Integrator brief — ${brief.weekKey}`,
    body: body.slice(0, 2000),
    linkUrl: "/admin/agents",
    priority: "high",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// ─── Cron timer ──────────────────────────────────────────────────────────────

let interval: NodeJS.Timeout | null = null;

function isPacificMondayBriefHour(now: Date = new Date()): boolean {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const weekday = parts.weekday;
  const hour = Number(parts.hour);
  return weekday === "Mon" && hour === BRIEF_HOUR_PT;
}

/** Start the Monday-6am-PT brief cron. Idempotent. Polls every 15 minutes. */
export function startIntegratorBriefCron(periodMs: number = 15 * 60 * 1000): void {
  if (interval) return;
  interval = setInterval(async () => {
    try {
      if (!isPacificMondayBriefHour()) return;
      const result = await runIntegratorBrief();
      if (result.status === "sent") {
        console.log(`[integratorBrief] sent for ${result.brief?.weekKey}`);
      } else if (result.status === "failed_no_api_key") {
        console.warn("[integratorBrief] skipped — ANTHROPIC_API_KEY not set");
      }
    } catch (err) {
      console.error("[integratorBrief] tick failed:", err);
    }
  }, periodMs);
  console.log("[integratorBrief] scheduler started (Monday 6am PT, polls every 15 min)");
}

export function stopIntegratorBriefCron(): void {
  if (interval) clearInterval(interval);
  interval = null;
}

// Exported for tests / manual ops triggers.
export const _internal = {
  isPacificMondayBriefHour,
  gatherWeeklyContext,
  normalizeBullets,
  parseBriefJson,
};
