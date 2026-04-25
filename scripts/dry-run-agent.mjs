/**
 * scripts/dry-run-agent.mjs
 *
 * Manually trigger a single agent run against production and capture output.
 * Run inside Railway shell (where DATABASE_URL + ANTHROPIC_API_KEY are set):
 *
 *   railway run node scripts/dry-run-agent.mjs
 *   node scripts/dry-run-agent.mjs   (if env vars already exported)
 *
 * Default agent: ai_system_integrity (safest — read-only, no customer contact)
 * Override: AGENT_SEAT=ai_security node scripts/dry-run-agent.mjs
 */

import mysql from 'mysql2/promise';
import Anthropic from '@anthropic-ai/sdk';
import { writeFileSync } from 'fs';
import { resolve } from 'path';

const TARGET_SEAT = process.env.AGENT_SEAT ?? 'ai_system_integrity';
const DATABASE_URL = process.env.DATABASE_URL;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!DATABASE_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
if (!ANTHROPIC_API_KEY) { console.error('ANTHROPIC_API_KEY not set'); process.exit(1); }

const conn = await mysql.createConnection(DATABASE_URL);
const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

console.log(`[dry-run] Loading agent: ${TARGET_SEAT}`);

// 1. Load agent config
const [[agent]] = await conn.execute(
  'SELECT id, seatName, department, status, model, systemPrompt, costCapDailyUsd, runLimitDaily FROM ai_agents WHERE seatName = ?',
  [TARGET_SEAT]
);

if (!agent) { console.error(`Agent not found: ${TARGET_SEAT}`); process.exit(1); }
if (agent.status === 'paused' || agent.status === 'disabled') {
  console.error(`Agent ${TARGET_SEAT} is ${agent.status} — cannot run.`);
  process.exit(1);
}

console.log(`[dry-run] Agent #${agent.id} | status: ${agent.status} | model: ${agent.model}`);

// 2. Check daily cost ceiling
const [[costs]] = await conn.execute(
  'SELECT COALESCE(SUM(costUsd),0) as costSum, COUNT(*) as cnt FROM ai_agent_runs WHERE agentId = ? AND createdAt >= DATE_SUB(NOW(), INTERVAL 1 DAY)',
  [agent.id]
);
console.log(`[dry-run] Today: $${Number(costs.costSum).toFixed(4)} / $${agent.costCapDailyUsd} | runs: ${costs.cnt} / ${agent.runLimitDaily}`);

// 3. Create task row
const triggerPayload = { task: 'dry_run_integrity_check', triggeredBy: 'scripts/dry-run-agent.mjs' };
const [taskResult] = await conn.execute(
  'INSERT INTO ai_agent_tasks (agentId, triggerType, triggerPayload, status, startedAt) VALUES (?, ?, ?, ?, NOW())',
  [agent.id, 'manual', JSON.stringify(triggerPayload), 'running']
);
const taskId = taskResult.insertId;
console.log(`[dry-run] Task row created: #${taskId}`);

// 4. Load authorized tools
const [tools] = await conn.execute(
  'SELECT toolKey FROM ai_agent_tools WHERE agentId = ? AND authorized = 1',
  [agent.id]
);
console.log(`[dry-run] Authorized tools: ${tools.map(t => t.toolKey).join(', ') || 'none'}`);

// 5. Call Anthropic
console.log(`[dry-run] Calling ${agent.model}...`);
const started = Date.now();

let response;
try {
  response = await client.messages.create({
    model: agent.model,
    max_tokens: 512,
    system: [
      { type: 'text', text: agent.systemPrompt, cache_control: { type: 'ephemeral' } }
    ],
    messages: [{
      role: 'user',
      content: JSON.stringify({ trigger: 'manual', payload: triggerPayload })
    }]
  });
} catch (err) {
  console.error('[dry-run] Anthropic call failed:', err.message);
  await conn.execute(
    'INSERT INTO ai_agent_runs (taskId, agentId, input, output, toolCalls, inputTokens, outputTokens, costUsd, durationMs, status, errorMessage) VALUES (?, ?, ?, NULL, ?, 0, 0, 0, ?, "failed", ?)',
    [taskId, agent.id, JSON.stringify(triggerPayload), '[]', Date.now() - started, err.message]
  );
  await conn.execute('UPDATE ai_agent_tasks SET status = "failed", completedAt = NOW() WHERE id = ?', [taskId]);
  await conn.end();
  process.exit(1);
}

const durationMs = Date.now() - started;
const inputTokens = response.usage.input_tokens;
const outputTokens = response.usage.output_tokens;

// Simple pricing: haiku input $0.80/M, output $4.00/M
const MODEL_PRICING = {
  'claude-haiku-4-5-20251001': { input: 0.80, output: 4.00 },
  'claude-sonnet-4-6':          { input: 3.00, output: 15.00 },
};
const pricing = MODEL_PRICING[agent.model] ?? { input: 3.00, output: 15.00 };
const costUsd = (inputTokens / 1_000_000 * pricing.input) + (outputTokens / 1_000_000 * pricing.output);

const textParts = response.content.filter(b => b.type === 'text').map(b => b.text);
const output = textParts.join('\n\n');

console.log(`[dry-run] Response: ${inputTokens} in / ${outputTokens} out | $${costUsd.toFixed(6)} | ${durationMs}ms`);
console.log(`[dry-run] Output (first 300 chars):\n${output.substring(0, 300)}`);

// 6. Record run
const [runResult] = await conn.execute(
  `INSERT INTO ai_agent_runs (taskId, agentId, input, output, toolCalls, inputTokens, outputTokens, costUsd, durationMs, status)
   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, "success")`,
  [taskId, agent.id, JSON.stringify(triggerPayload), output, '[]', inputTokens, outputTokens, costUsd.toFixed(4), durationMs]
);
const runId = runResult.insertId;

await conn.execute('UPDATE ai_agent_tasks SET status = "completed", completedAt = NOW() WHERE id = ?', [taskId]);
await conn.execute('UPDATE ai_agents SET lastRunAt = NOW() WHERE id = ?', [agent.id]);

console.log(`[dry-run] Run #${runId} recorded. Task #${taskId} completed.`);

// 7. Write result doc
const outputPath = resolve('docs/agents/RUNTIME_DRY_RUN.md');
const doc = `# Agent Runtime Dry Run

**Date:** ${new Date().toISOString()}
**Agent:** \`${agent.seatName}\` (id: ${agent.id})
**Department:** ${agent.department}
**Model:** ${agent.model}
**Trigger:** manual — dry_run_integrity_check
**Task ID:** ${taskId} | **Run ID:** ${runId}

## Result

| Metric | Value |
|--------|-------|
| Status | success |
| Input tokens | ${inputTokens} |
| Output tokens | ${outputTokens} |
| Cost | $${costUsd.toFixed(6)} |
| Duration | ${durationMs}ms |

## Agent Output

\`\`\`
${output}
\`\`\`

## Verification

- [x] Agent loaded from \`ai_agents\` table
- [x] Daily cost ceiling checked (${Number(costs.costSum).toFixed(4)} / ${agent.costCapDailyUsd} USD used today)
- [x] Task row created in \`ai_agent_tasks\`
- [x] Anthropic API call succeeded
- [x] Run recorded in \`ai_agent_runs\`
- [x] \`ai_agents.lastRunAt\` updated

The runtime pipeline is **operational**.
`;

writeFileSync(outputPath, doc);
console.log(`[dry-run] Results written to ${outputPath}`);

await conn.end();
