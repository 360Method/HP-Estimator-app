/**
 * Seed AI agent tool registry (aiAgentTools table).
 * All tools are mode='draft_only' — agents draft, humans approve in inbox.
 *
 * Usage: node scripts/seed-ai-agents.mjs
 */
import mysql from "mysql2/promise";
import "dotenv/config";

const tools = [
  // ── GBP ────────────────────────────────────────────────────────────────────
  {
    toolName: "gbp.fetchReviews",
    description: "Fetch recent reviews from the connected Google Business Profile listing.",
    mode: "draft_only",
    category: "gbp",
  },
  {
    toolName: "gbp.draftReviewResponse",
    description: "Draft a response to a GBP review. Human must approve before posting.",
    mode: "draft_only",
    category: "gbp",
  },
  {
    toolName: "gbp.draftPostUpdate",
    description: "Draft a Google Business Profile post. Human must approve before publishing.",
    mode: "draft_only",
    category: "gbp",
  },
  // ── Meta ───────────────────────────────────────────────────────────────────
  {
    toolName: "meta.fetchAdInsights",
    description: "Fetch Meta Ads campaign performance insights (impressions, clicks, spend, CPC, CTR).",
    mode: "draft_only",
    category: "meta",
  },
  {
    toolName: "meta.draftAdCreative",
    description: "Draft a Meta ad creative (headline + body). Human must submit via Ads Manager.",
    mode: "draft_only",
    category: "meta",
  },
  {
    toolName: "meta.fetchPageMessages",
    description: "Fetch recent Messenger conversations from connected Facebook pages.",
    mode: "draft_only",
    category: "meta",
  },
  {
    toolName: "meta.draftPageReply",
    description: "Draft a Messenger reply. Human must send from /admin/marketing/messages.",
    mode: "draft_only",
    category: "meta",
  },
  // ── Google Ads ─────────────────────────────────────────────────────────────
  {
    toolName: "googleAds.fetchCampaigns",
    description: "List active Google Ads campaigns with impression, click, and cost metrics.",
    mode: "draft_only",
    category: "googleAds",
  },
  {
    toolName: "googleAds.fetchPerformance",
    description: "Fetch Google Ads campaign performance over a date range.",
    mode: "draft_only",
    category: "googleAds",
  },
  {
    toolName: "googleAds.keywordResearch",
    description: "Generate keyword ideas and search volume estimates for given seed keywords.",
    mode: "draft_only",
    category: "googleAds",
  },
  {
    toolName: "googleAds.draftAdCreative",
    description: "Draft a Responsive Search Ad. Human must create it in Google Ads console.",
    mode: "draft_only",
    category: "googleAds",
  },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const conn = await mysql.createConnection(url);

  for (const tool of tools) {
    await conn.execute(
      `INSERT INTO aiAgentTools (toolName, description, mode, category)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         description = VALUES(description),
         mode        = VALUES(mode),
         category    = VALUES(category)`,
      [tool.toolName, tool.description, tool.mode, tool.category]
    );
    console.log(`[seed] upserted ${tool.toolName}`);
  }

  await conn.end();
  console.log(`[seed] done — ${tools.length} agent tools registered`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
