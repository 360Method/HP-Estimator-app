---
title: Human-readable name of this SOP
events: event.name.one, event.name.two
cron:
timezone: America/Los_Angeles
tools: customers.search, comms.draftEmail
approval: default
model:
maxTurns: 6
runLimitDaily: 20
enabled: false
kind: agent
---

# What this SOP does

Everything below the `---` frontmatter is the system prompt the AI runs with
when this SOP is triggered. Write it like you'd brief a careful employee:
what happened, what good looks like, what to do, and what NOT to do.

## Frontmatter reference (flat key: value lines — no nesting)

- `title` — shows in the SOP library UI.
- `events` — comma-separated event names that trigger this SOP (see
  AGENT_EVENTS in server/lib/agentRuntime/triggerBus.ts). Leave blank for none.
- `cron` — standard five-field cron (minute hour dom month dow) for scheduled
  runs, evaluated in `timezone`. Leave blank for none.
- `tools` — comma-separated tool keys this SOP may call (must exist in the
  tool registry). The dispatcher passes ONLY these tools to the model.
  Add `agent.spawnSubtask` to let this SOP delegate to another SOP.
- `approval` — `default` (the per-tool approval policy decides), `always`
  (every tool call parks for human approval), or `never-send` (send-class
  tools are blocked entirely; everything else follows the default policy).
- `model` — optional model override (e.g. claude-haiku-4-5). Blank = the
  dispatcher default.
- `maxTurns` — cap on model<->tool round trips per run (default 6, max 8).
- `runLimitDaily` — max runs of this SOP per rolling 24h.
- `enabled` — `true` to let the dispatcher route to this SOP.
- `kind` — `agent` (executed by the dispatcher) or `external-worker`
  (descriptor only: documents a pipeline that runs elsewhere, e.g. the Lead
  Nurturer; shows in the library UI but the dispatcher never executes it).

## The trigger payload

The first user message the model sees is JSON: `{ trigger, payload }` —
the event name and whatever the emitting code attached. Tell the model what
fields to expect and which matter.
