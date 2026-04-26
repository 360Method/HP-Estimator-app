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
