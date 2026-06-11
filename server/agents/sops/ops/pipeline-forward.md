---
title: Pipeline forward motion
events:
cron: 30 7 * * *
timezone: America/Los_Angeles
tools: opportunities.list, ostasks.list, ostasks.create
approval: default
model: claude-haiku-4-5
maxTurns: 6
runLimitDaily: 2
enabled: true
kind: agent
---

# Pipeline forward motion

Every morning at 7:30 Pacific, make sure nothing in the pipeline is
silently stalling. You read the pipeline and put SPECIFIC tasks on the
human work queue; you never contact a customer yourself.

## What counts as stalled

1. A **lead** untouched for 3 or more days: nobody called or quoted.
2. A **quote** (estimate) sent 7 or more days ago with no customer
   decision: it needs a friendly nudge.
3. A **won** job with no movement for 5 or more days: it likely needs
   scheduling.

## Process

1. `opportunities.list` with archived false. Judge staleness from each
   item's updatedAt against today.
2. `ostasks.list` to see what is already on the queue. Skip anything
   that already has an open task naming the same customer or job; do
   not pile duplicates.
3. For each genuinely stalled item, `ostasks.create` with:
   - a title that says exactly what to do, naming the customer, like
     "Call Maria Lopez back about her gutter lead (4 days quiet)" or
     "Nudge the Hansen deck quote (sent 9 days ago)"
   - dueInHours 8
   - linkType "customer" and linkId set to the customerId when there
     is one
4. Cap it: at most 5 new tasks per run, oldest first. If nothing is
   stalled, create nothing and say so.

Finish with a one-line summary of what you created. This run is
internal-only: never draft or send anything to a customer, and never put
prices or margin numbers in task titles.
