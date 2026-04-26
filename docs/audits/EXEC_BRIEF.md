# EXEC BRIEF — 2026-04-25

**Headline:** the rails are mostly built; what's broken is connective tissue and time-driven jobs — 6 inline fixes shipped, 5 P0 decisions still need you.

## Done
- Portal service request now routes to Nurturer.
- Booking priority + source typing fixed.
- Stripe PaymentIntent receipt email wired.
- 360 abandoned-cart leads now visible to team.
- Gmail log spam silenced.
- Full audit doc + connection map shipped.

## In progress
- Roadmap Generator deep-dive (other Opus task).
- Three-role lead routing (already merged through 2d63e34).

## Blocked
- 360° subscription failures invisible — no Stripe dunning handlers.
- Booked appointments send no customer confirmation.
- Auto-created invoices send no email; customers must hunt portal.
- No background scheduler — reminders, renewals, valuations don't run.
- Welcome-to-portal not auto-triggered on first job completion.

## Decisions needed
- Customer auto-ack copy (booking + service request + appointment).
- Invoice email cadence — at create, at due-3d, at overdue?
- Self-serve slot picker on `/book`, or operator-mediated only?
- 360 baseline walkthrough — auto-schedule default time, or stay manual + SMS to ops?
- Annual home-valuation touchpoint — opt-in cadence or skip?

## Risk flags
- Prod DB tables out of sync with migrations (boot warnings benign for now).
- Roadmap Generator hit a validation error (missing email) once tonight.
- Gallery photos not job-scoped — QA enforcement impossible.
- `NewIntakeModal` UI exists but submit is a stub — confusing.
- "AI org" referenced in conversation does not exist in code; what runs are tRPC + lead-routing fan-outs.

---

## Update — Phase 5: Agent Engine (PR feat/agent-engine)

**Headline:** the engine is built. Multi-turn tool dispatch, missing event emits, System Integrity self-optimization, and one-click activation all shipped. The "AI org runs continuously with or without input" mandate is now wireable in one click.

### Newly done
- Multi-turn tool loop in `runtime.ts` (was single-turn) with prompt caching on the charter section.
- `agent.run_completed` meta-event emitted from runtime → System Integrity / KPI rollups / cross-agent handoffs can now react.
- 5 missing event emit sites added: `invoice.created`, `call.missed`, `customer.portal_account_created`, `subscription.renewed`, `subscription.cancelled`.
- `systemIntegrity.ts` — hourly anomaly scan (error rate, empty output, cost cap, queue stall) → drafts optimization tasks in admin inbox. **Never auto-modifies prompts/charters** (Marcin-rule hard stop).
- `agent_optimization_tasks` table (migration 0073 + boot-time ensure).
- `/admin/agents/control` — one-click **Activate all** button + **Emergency: pause all** kill switch + per-department + per-seat toggles + live cost rollup.
- `/admin/agents/runs` — live observability table filterable by seat/status/free-text, expandable rows show full output + tool calls + errors.
- Synthetic E2E test (`scripts/agent-engine-e2e.mjs`) — fires lead.created, polls for completion, confirms meta-event fans out.

### Marcin's one-click step (post-deploy)
1. Open `/admin/agents/control`.
2. Click **Activate all (N ready)** — flips every draft/paused seat to autonomous.
3. Watch the cost rollup + System Integrity flag list. If anything goes wrong, **Emergency: pause all** is right there.

### Open after this PR
- The 5 strategic decisions from the original brief (customer auto-ack copy, invoice email cadence, self-serve slot picker, baseline auto-schedule, annual valuation cadence) are still Marcin's calls — none of them are blocked by the engine work.
- Phase 5 only added Phase-2-style synchronous tools to the runtime (the existing 22). Phase 6 candidates: ad-spend write tools (Google Ads / Meta API), QBO write tools, GBP review-reply post tool. All approval-gated.
