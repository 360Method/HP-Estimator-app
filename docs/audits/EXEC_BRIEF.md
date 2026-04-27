# EXEC BRIEF — 2026-04-25 (revised after Marcin's decisions)

**Headline:** all 5 strategic decisions resolved; charter + auto-ack copy + portal toggle shipped — 9 items closed across two PRs, Nurturer agent runtime remains spec-only (downstream of background-job infrastructure).

## Done
- Audit doc + connection map + 30 ranked gaps shipped.
- 6 silent-lead / receipt fixes shipped (silly-shockley PR).
- Customer Success Charter authored — voice, vocabulary, scheduling playbook, tool-auth spec.
- Affluent-voice templates shipped: booking, service request, appointment.
- Booking, portal service request, and `onAppointmentBooked` now fire customer auto-acks.
- Daily 9 AM overdue-invoice cron disabled; manual reminder endpoint preserved.
- Annual Home Health Report opt-in toggle live in portal (default OFF).
- 360° abandoned-cart leads now route through Nurturer notifications.

## In progress
- Nurturer agent runtime (spec only — see Charter §4); tied to background-job infrastructure.
- Roadmap Generator deep-dive (separate Opus task).

## Blocked
- Auto-create deposit + balance invoice emails at creation (audit P0 #3 still pending — needs the email body Marcin will eyeball).
- Stripe subscription dunning (`subscription.updated` / `payment_failed` / `subscription.deleted` handlers not yet wired).
- Background scheduler for time-driven events (renewals, anniversary reports, deferred labor-bank credits).

## Decisions resolved this round
- Voice + auto-ack copy → Charter §1, §2 (paste-ready samples in Charter).
- Invoice cadence → Charter §3 (one email at create, no chasers).
- /book scheduling → Charter §4 (Lead Nurturer owns; no self-serve, no operator).
- 360° baseline scheduling → Charter §4 (same playbook).
- Annual valuation → Charter §5 (opt-in toggle live; default OFF).

## Risk flags
- Charter §4 describes a Nurturer that doesn't exist in code. The lead-routing helpers + role notifications today push to a human nurturer; the agent runtime is future work, dependent on a background-job system that also doesn't exist.
- Prod DB still drifting from drizzle migrations — boot-ensure helpers carry the load. The new `annualValuationOptIn` column has its own ensure helper (`ensureAnnualValuationOptInColumn`) following the established pattern.
- Email templates need to be re-seeded against prod after merge: `node scripts/seed-email-templates.mjs` (idempotent).
- Disabling overdue reminders is a policy decision — if collections suffers, the cron is preserved as a comment block and can be re-enabled in one revert.
