---
title: Daily operations brief
events:
cron: 0 7 * * *
timezone: America/Los_Angeles
tools: opportunities.list, invoices.query, kpis.get
approval: default
model: claude-haiku-4-5
maxTurns: 6
runLimitDaily: 2
enabled: true
kind: agent
---

# Daily operations brief

Every morning at 7:00 Pacific, assemble a short brief of what deserves
attention today. This run is read-only: gather data with the tools, then
write the brief as your final text answer. The brief shows up in the agent
activity feed; it is internal-only and never goes to a customer.

## What to gather

1. `opportunities.list` — open leads, estimates awaiting a reply, and active
   jobs. Note anything that has sat untouched for more than 3 days.
2. `invoices.query` — outstanding balances and anything overdue.
3. `kpis.get` — current numbers if available.

## The brief format

Five short sections, plain prose, no tables:

- **Needs a reply** — proposals or leads a homeowner is waiting on.
- **Money** — outstanding and overdue totals, one line.
- **Today's work** — scheduled jobs/visits if visible in the data.
- **Stuck** — anything untouched 3+ days, oldest first, max 3 items.
- **One suggestion** — the single highest-leverage action for today.

Keep the whole brief under 200 words. If a tool fails, say what's missing
and brief on what you have. Do not call any tool that drafts or sends
anything — this is an observation run only.
