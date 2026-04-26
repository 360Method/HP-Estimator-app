# Agent Runtime Dry Run — Pre-flight Verification

**Date:** 2026-04-25
**Prepared by:** Automated overnight audit
**Status:** PENDING — requires execution in Railway shell (ANTHROPIC_API_KEY available there)

## How to Execute

```bash
# In Railway shell (Dashboard → HP-Estimator-app → Deploy tab → Shell):
node scripts/dry-run-agent.mjs

# Override agent:
AGENT_SEAT=ai_security node scripts/dry-run-agent.mjs
```

The script will overwrite this file with live results on completion.

---

## Pre-flight Checks (Verified Against Prod DB — 2026-04-25)

| Check | Status | Detail |
|-------|--------|--------|
| `ai_system_integrity` exists in `ai_agents` | ✓ | id=26 |
| Status is runnable (not paused/disabled) | ✓ | status=`draft_queue` |
| Model configured | ✓ | `claude-haiku-4-5-20251001` |
| Charter loaded | ✓ | `charterLoaded=true` |
| KPIs seeded | ✓ | `kpiCount=8` |
| Playbooks seeded | ✓ | `playbookCount=3` |
| `ai_agent_tasks` table exists | ✓ | verified in schema |
| `ai_agent_runs` table exists | ✓ | verified in schema |
| ANTHROPIC_API_KEY in Railway env | ✓ | sk-ant-api03-... (confirmed via Railway GraphQL) |
| DATABASE_URL reachable | ✓ | public proxy confirmed alive |

## Runtime Code Path Verified

```
scripts/dry-run-agent.mjs
  → mysql.createConnection(DATABASE_URL)
  → SELECT ai_agents WHERE seatName = 'ai_system_integrity'
  → cost ceiling check (ai_agent_runs last 24h)
  → INSERT ai_agent_tasks (status=running)
  → SELECT ai_agent_tools WHERE agentId=26 AND authorized=1
  → client.messages.create(model, systemPrompt, triggerPayload)
  → INSERT ai_agent_runs (status, tokens, cost, output)
  → UPDATE ai_agent_tasks (status=completed)
  → UPDATE ai_agents (lastRunAt=now)
  → write docs/agents/RUNTIME_DRY_RUN.md with live output
```

## Known Constraints

- `ai_system_integrity` is currently `draft_queue`, not `autonomous`.
  The scheduler only auto-runs `autonomous` agents. Manual trigger via this
  script works regardless of status (only `paused`/`disabled` are blocked).
- Agent has no authorized tools yet (tool registry is seeded but not assigned
  to individual agents in `ai_agent_tools`). The API call will return text-only.
- First run will charge against the $5.00/day cost cap. With haiku pricing
  ($0.80/M input, $4.00/M output), a 512-token response costs ~$0.002.

## Expected Output Shape

The `ai_system_integrity` agent's system prompt covers platform monitoring and
integrity checks. With `task: 'dry_run_integrity_check'`, expected output is
a brief status summary from the agent acknowledging the trigger.

Run `node scripts/dry-run-agent.mjs` in Railway shell to replace this file
with live results.
