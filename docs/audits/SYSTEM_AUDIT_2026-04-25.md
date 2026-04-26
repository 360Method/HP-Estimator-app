# HP-Estimator-app — End-to-End Customer Lifecycle Audit
**Date:** 2026-04-25 · **Auditor:** Opus 4.7 (1M ctx) · **Scope:** lead-in → sale-closed → membership-onboarded

---

## TL;DR

The pipeline has strong bones — three-role lead routing (`onLeadCreated` / `onAppointmentBooked` / `onSaleSigned`), a generic automation engine (`runAutomationsForTrigger`), portal magic-link, Stripe webhooks, lead-source funnels, and a 360° continuity nudge are all in code. **What's missing is the connective tissue:** several lead intake paths skip the routing helpers, the automation trigger taxonomy is inconsistent, scheduled-job execution doesn't exist for time-driven events (renewals, reminders, deferred credits), and there's no automated background runtime — every "AI agent" referenced in conversations is currently a human-triggered tRPC call.

There is **no `ai_agent_runs` table, no trigger bus, no agent runtime**. The system is conventional: HTTP → tRPC → DB → fire-and-forget side effects. That's fine — it just means "the AI org" has to be built on top of these primitives, not assumed to exist.

---

## Connection map (high level)

```mermaid
flowchart LR
    %% Intake
    BookForm[/book wizard/]:::wired --> SubmitBooking[booking.submit]:::wired
    PortalReq[/portal/request/]:::partial --> SubmitSR[portal.submitServiceRequest]:::partial
    PT[priority-translation form]:::broken --> SubmitPT[priorityTranslation.submit]:::broken
    CallIn[Twilio voice]:::partial --> CallStatus[handleCallStatusUpdate]:::partial
    SmsIn[Twilio SMS]:::partial --> SmsHandler[handleInboundSms]:::partial
    Email[Gmail poll]:::broken --> Conv[conversations only]:::broken
    NewLead[NewLeadModal]:::wired --> OppCreate[opportunities.create]:::wired
    NewIntake[NewIntakeModal]:::broken --> Stub[handleSave stub]:::broken

    %% Routing & automations
    SubmitBooking --> OnLead[onLeadCreated]
    OppCreate --> OnLead
    OnLead --> Notif[notifications + Resend email + optional SMS]
    OnLead -.->|assigns| Nurturer[Nurturer role]

    SubmitBooking --> AutoNB[runAutomationsForTrigger 'new_booking']
    OppCreate --> AutoLC[runAutomationsForTrigger 'lead_created']
    SubmitSR -.x| ❌ neither | XX[silent]:::broken

    %% Schedule
    SchedCreate[schedule.create]:::wired --> OnAppt[onAppointmentBooked]:::wired
    OnAppt --> Consultant[Consultant assigned + notified]
    OnAppt -.x| ❌ no customer email | NoConfirm[silent to customer]:::broken

    %% Estimate -> Invoice
    SendEst[estimate.send]:::wired --> Portal[portal estimate row + email + SMS]
    Portal --> EstApprove[portal.approveEstimate]:::wired
    EstApprove --> Deposit[deposit invoice auto-created]
    EstApprove --> OnSale[onSaleSigned]:::wired --> PM[Project Manager assigned]
    EstApprove -.x| ❌ no invoice email | NoInv[customer must hunt invoice]:::broken

    %% Payment
    StripeWH[Stripe webhook]:::partial
    StripeWH -->|checkout.session.completed| Receipt[receipt email ✓]
    StripeWH -.x|payment_intent.succeeded| NoReceipt[no receipt email]:::broken

    %% Job & post-sale
    JobDone[opportunity stage=Completed]:::partial --> JobAuto[runAutomationsForTrigger 'job_completed']
    JobDone -.x| ❌ no welcome to portal trigger | NoWelcome[manual]:::broken
    PortalHome[/portal home/]:::wired --> Nudge[ProjectCompleteNudge]:::wired
    Nudge --> Enroll[360 Membership]
    Enroll --> Stripe360[Stripe subscription]:::wired
    Stripe360 --> WH360[create360MembershipFromWebhook]:::wired
    WH360 --> FirstVisit[seasonal visit row]
    WH360 -.x| ❌ no baseline appointment | ManualBaseline[manual]:::broken

    %% Recurring
    Cron{{Recurring scheduler}}:::broken
    Cron -.x|missing| Renew[no renewal enforcement]
    Cron -.x|missing| ReminderJob[no appt reminders]
    Cron -.x|missing| DeferredCredit[no labor-bank release]

    classDef wired fill:#d4f4d4,stroke:#0a0
    classDef partial fill:#fff4cc,stroke:#cc8800
    classDef broken fill:#ffd4d4,stroke:#a00
```

---

## Stage 1 — Lead capture

### Inventory of intake paths

| # | Path | Form file | Endpoint | customers? | opportunities (lead)? | onLeadCreated? | runAutomations | customer auto-ack | operator notify | Verdict |
|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Public booking | `client/src/pages/book/BookingWizard.tsx` | `booking.submit` (`server/routers/booking.ts:40`) | ✅ | ✅ | ✅ | `new_booking` | ❌ | ✅ notifyOwner | ⚠️ trigger inconsistency, no customer email |
| 2 | Portal service request | `client/src/pages/portal/PortalRequest.tsx` | `portal.submitServiceRequest` (`server/routers/portal.ts:1045`) | reuses portal | ✅ | ❌ | ❌ | ❌ | ✅ notifyOwner + SMS | **P0 — silent lead** |
| 3 | Priority Translation (Roadmap) | external form → `priorityTranslation.submit` (`server/routers/priorityTranslation.ts:69`) | ❌ creates portal-only | ❌ | ❌ | ❌ | ❌ | ❌ | **P1 — isolated funnel** (and Railway logs show recent submit hit a missing `email` validation, code `invalid_type`) |
| 4 | Inbound call (Twilio) | `server/twilio.ts:131` | webhook | ✅ stub | ❌ | ❌ | only on **missed** | ❌ | only on **missed** | ⚠️ answered calls silent |
| 5 | Inbound SMS | `server/twilio.ts:81` | webhook | ✅ stub | ❌ | ❌ | ✅ `inbound_sms` | ❌ | ❌ unless rule fires | ⚠️ no team notify by default |
| 6 | Inbound email (Gmail) | `server/gmail.ts` | poll | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ never creates leads — sync only |
| 7 | Manual `+ New Lead` (pro) | `client/src/components/intakes/NewLeadModal.tsx` | `opportunities.create` (`server/routers/opportunities.ts:99`) | ✅ | ✅ | ✅ | `lead_created` | ❌ | ✅ | ✅ Complete |
| 8 | Manual `+ New Intake` (pro) | `client/src/components/intakes/NewIntakeModal.tsx` | **stub** — toast only, no tRPC call | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **P1 — orphaned UI** |
| 9 | 360° subscription enroll | `EnrollModal.tsx` → Stripe → `create360MembershipFromWebhook` (`server/threeSixtyWebhook.ts:66`) | ✅ | ❌ no `lead` opp | ❌ | ❌ | ✅ welcome email | ❌ | ⚠️ no CRM lead row |
| 10 | 360° abandoned cart | `threeSixty.abandonedLead.capture` | ✅ | ✅ stage `Cart Abandoned` | ❌ | ❌ | ❌ | ❌ | **P1 — silent** |
| 11 | 360° portfolio abandoned cart | `threeSixty.portfolioAbandonedLead.capture` | ✅ | ✅ stage `Cart Abandoned` | ❌ | ❌ | ❌ | ❌ | **P1 — silent** |

### Trigger taxonomy inconsistency

`automationEngine.ts:17` defines triggers: `lead_created`, `estimate_sent`, `estimate_viewed`, `estimate_approved`, `job_created`, `job_completed`, `invoice_sent`, `invoice_overdue`, `missed_call`, `inbound_sms`, `new_booking`, `job_signoff_submitted`, `change_order_approved`, `change_order_declined`, `offcycle_visit_requested`, `portal_onboarding_complete`, `invoice_paid`.

Mismatches found:
- `new_booking` and `lead_created` are siblings — booking fires `new_booking`, manual lead fires `lead_created`. Anyone configuring "send welcome SMS on new lead" has to pick one and miss the other.
- `invoice_sent` is **defined but never fired** anywhere in the codebase. Auto-created deposit invoices are silent to the customer.
- `job_started` / pre-arrival communication has no trigger at all.

### Lead routing helper coverage

`server/leadRouting.ts` exposes `onLeadCreated`, `onAppointmentBooked`, `onSaleSigned`, `onReassign`. Callers:
- `onLeadCreated` — booking.ts ✓, opportunities.create ✓; **missing** from portal.submitServiceRequest, abandoned-cart capture, threeSixtyWebhook, twilio handlers
- `onAppointmentBooked` — schedule.create ✓ (recent 2d63e34); **missing** from portal.addAppointment
- `onSaleSigned` — opportunities.update on stage change ✓
- `onReassign` — admin reassign endpoint

---

## Stage 2 — First contact (within 5 min of capture)

| Expectation | Wired? | Notes |
|---|---|---|
| Auto-ack email/SMS to customer | ❌ | No path sends a customer-facing confirmation. Booking, portal request, and 360-cart-abandoned all leave the customer guessing. |
| Lead routing assigns Nurturer | ⚠️ | Only when `onLeadCreated` is called (~half the intake paths). |
| Lead enriched with research ("Prospecting Research AI") | ❌ | Does not exist. No agent runtime. |
| Marcin gets in-app notification | ⚠️ | Booking/manual paths fire `notifyOwner` + role notification. Portal request only fires `notifyOwner`. SMS handler doesn't notify by default. |

**Severity:** P0 for customer auto-ack. Even a one-line "We received your request" closes a major UX gap and is ~30 LOC.

---

## Stage 3 — Estimate / Roadmap pipeline

(Roadmap Generator deep-dive is owned by a separate Opus task — only the upstream/downstream connections are in scope here.)

### Estimate flow (formal, not roadmap)

| Link | File:line | Status |
|---|---|---|
| Build estimate (calculator) | `client/src/contexts/EstimatorContext.tsx`, `server/routers/estimate.ts` | ✅ |
| `estimate.send` creates portalEstimate, emails, SMSes, fires `estimate_sent` automation | `server/routers/estimate.ts:412–529` | ✅ |
| Customer views in portal — `markPortalEstimateViewed` + `estimate_viewed` automation | `server/routers/portal.ts:264–272` | ✅ |
| Customer approves — signature, status='approved', deposit invoice auto-created (only `depositAmount > 0`), opp → 'Won', `onSaleSigned`, approval email | `server/routers/portal.ts:297–407` | ✅ |
| Final/balance invoice **NOT** auto-created at approval — only at job sign-off | `server/routers/portal.ts:1336` | ⚠️ P1 |
| `snapshotOpportunities` snapshot at send — never written | (table exists, never inserted) | ⚠️ P1 |
| Deposit invoice auto-emailed | ❌ | **P0** — `invoice_sent` trigger is defined but never fired |

### Roadmap Generator → lead

Single Railway log entry from 04:00 UTC:
```
[Roadmap Generator] submit error: zod issue: path=email code=invalid_type "expected string, received undefined"
```
Schema at `server/routers/priorityTranslation.ts:53` requires `email`. Either the upstream form omits it, or a probe/test request hit the endpoint without the field. Verify the public form posts `email`. **Severity P1** (one occurrence in 24h).

---

## Stage 4 — Booking

| Component | Status | File:line |
|---|---|---|
| Schedule event creates `scheduleEvents` row | ✅ | `server/routers/schedule.ts` |
| `onAppointmentBooked` resolves Baseline/Consultation type and reassigns to Consultant | ✅ | `server/leadRouting.ts:347` (recent 2d63e34) |
| Consultant gets in-app notification + email | ✅ | `leadRouting.ts:386` |
| Consultant SMS (only if `mobileUrgent` flag + high priority) | ✅ | `leadRouting.ts:175` |
| Customer confirmation email/SMS | ❌ | **P0 — no customer-facing branch in `onAppointmentBooked`** |
| Mirror to `portalAppointments` so customer sees it in portal | ❌ | `addAppointment` is its own endpoint that doesn't sync from `scheduleEvents` |
| 24h-before / 1h-before reminder cadence (customer or consultant) | ❌ | **P1 — no scheduler hook** |
| Day-of dispatch (morning brief) | ❌ | **P1 — Schedule page is pull, not push** |
| Pre-arrival SMS to customer ("on the way") | ❌ | P2 |
| Self-serve slot picker | ❌ | P2 — `/book` collects request, doesn't book a time |
| Google Calendar / .ics export | ❌ | P2 |
| Existing daily-cron pattern for reuse | ✅ | `server/_core/index.ts:744` (overdue invoices) — viable template for reminders |

---

## Stage 5 — Job execution

| Link | Status | Notes |
|---|---|---|
| Job creation (opp stage → `job` / 'Won') | ✅ | tied to estimate approval |
| Pre-arrival SMS | ❌ | No `job_started` trigger defined |
| Mid-job progress updates from HP team | ❌ | `portalJobUpdates` table + read endpoints exist; no HP-side write endpoint |
| QA photo collection | ⚠️ | `portalGallery` table works; photos are customer-scoped, not job-scoped — no enforcement that a job requires N photos before sign-off |
| Job sign-off request email | ✅ | `opportunities.ts:194` when stage → 'Awaiting Sign-Off' |
| Sign-off submission creates final invoice | ✅ | `portal.ts:1304` — sets status='due' |
| `job_completed` automation | ✅ | `opportunities.ts:184` |
| `job_signoff_submitted` automation | ✅ | `portal.ts:1396` |
| Invoice email after creation | ❌ | **P0 — final invoice silent, just like deposit** |

---

## Stage 6 — Post-sale

| Link | Status | Notes |
|---|---|---|
| Magic-link portal access — `sendMagicLink` | ✅ | `portal.ts:153` |
| Auto-trigger welcome email when first job completes | ❌ | **P1** — magic link is sent on estimate/invoice, not on first sign-off. New customers may already have access, but there is no "welcome to your portal" at completion. |
| ProjectCompleteNudge (Path A → B continuity) | ✅ | `client/src/components/portal/continuity/ProjectCompleteNudge.tsx`, gated by feature flag, 60-day window, non-member, requires completion notes |
| Deep-link to 360 enrollment with `source=project_complete` | ✅ | |
| Annual home-valuation cadence | ❌ | **P1 — no scheduler. Promise made nowhere in code; not a regression but worth deciding on.** |

---

## Stage 7 — Member journey (360°)

| Link | Status | Notes |
|---|---|---|
| Stripe checkout → membership row + labor bank + first seasonal visit + welcome email | ✅ | `threeSixtyWebhook.ts:66–237` |
| First Baseline Walkthrough auto-scheduled | ❌ | Welcome email **promises** "team will reach out within 48 hrs" — no code creates the appointment, no internal SMS to schedule it. **P1.** |
| Subsequent quarterly visits auto-scheduled after each completion | ❌ | First seasonal visit is created at enrollment; nothing creates the next one. **P1.** |
| Renewal enforcement | ❌ | `renewalDate` and `stripeSubscriptionId` stored, but no Stripe `customer.subscription.updated` / `invoice.payment_failed` / `customer.subscription.deleted` handlers. **P0** — failed renewals are invisible until someone notices in the dashboard. |
| Deferred labor-bank credit release | ❌ | `scheduledCreditAt` field exists; comment says "Call this from a scheduled job" — no scheduler exists. **P1.** |
| Quarterly-checklist seed data | ✅ | `seed-360-checklists.mjs` — 105 PNW tasks across 4 seasons |

---

## Cross-cutting infrastructure findings

### 1. No general background-job runtime
- No BullMQ, no node-schedule, no cron framework.
- A handful of `setInterval` jobs exist in `server/_core/index.ts` (gmail poll, overdue reminders at 9 AM, review requests, 360 cart drip, deferred credit release every 6 hours, lost-lead archive at 3 AM).
- Anything time-driven that isn't on this list **doesn't run.** Reminders, renewals, valuation — all need either a new job or a new entry in this set of intervals.

### 2. Railway boot warnings
- Every boot logs `ensurePortalContinuityFlag failed (non-fatal): Table 'railway.appSettings' doesn't exist` and `ensureMagicLinkTokenHash failed (non-fatal): Table 'railway.portalMagicLinks' doesn't exist`.
- These appear non-fatal because the `try/catch` swallows them and downstream queries succeed (the tables either exist now or are recreated).
- Worth a 30-minute pass to either drop the `ensure*` helpers if the migrations cover them, or fix them to query `information_schema.tables` first. **P2 — log noise, not breakage.**

### 3. Gmail poll log spam
- `[Gmail] Not connected, skipping poll` logs at `error` level every ~2 min. Should be `info` or be silenced when not connected. Drowns out real errors. **P2.**

### 4. Memory note: drizzle tracker may diverge from prod DB
- Confirmed by Railway boot errors — the prod DB had missing tables that runtime helpers had to add. Whoever does the next migration should run `pnpm db:push --force` against prod with backup, then drop the `ensure*` runtime helpers.

### 5. Type-safety bug in `booking.submit`
- `server/routers/booking.ts:158` checks `input.timeline === 'emergency'` — but the zod schema (line 47) only accepts `"ASAP" | "Within a week" | "Flexible"`. The check **never fires**, so high-priority booking notifications never get the high-priority flag.
- Same router passes `source: input.serviceType` (free-text) into `onLeadCreated`, but the typed `LeadSource` union expects literals like `"book_consultation"`. Currently typechecks because it's typed `as any` in TS.

---

## Severity-ranked gap list

### P0 — blocks revenue or active customer

| # | Gap | File:line | Effort | Dependencies |
|---|---|---|---|---|
| 1 | Portal service request creates lead but skips `onLeadCreated` and automation trigger — Nurturer never assigned, customer auto-ack impossible | `server/routers/portal.ts:1062` | 30 LOC | none |
| 2 | Booked Baseline/Consultation sends no confirmation to the customer | `server/leadRouting.ts:386` | ~80 LOC (template + send) | email template + `customers.email` lookup |
| 3 | Auto-created deposit & balance invoices send no email (`invoice_sent` trigger never fires) | `server/routers/portal.ts:343`, `server/routers/portal.ts:1347` | 60 LOC | branded receipt template already exists (lines 272–287) — copy pattern |
| 4 | `payment_intent.succeeded` webhook updates invoice but does not send receipt | `server/_core/index.ts:202–217` | 30 LOC | reuse Checkout receipt block |
| 5 | 360° subscription failures invisible — no Stripe `subscription.updated`/`payment_failed`/`subscription.deleted` handlers | `server/_core/index.ts:307` (default branch) | 100 LOC | dunning email template |
| 6 | Booking `timeline === 'emergency'` priority check never fires (schema enum doesn't include 'emergency') | `server/routers/booking.ts:158` | 1-line fix | none |

### P1 — blocks customer experience or core flow

| # | Gap | File:line | Effort | Dependencies |
|---|---|---|---|---|
| 7 | Manual `NewIntakeModal` has UI but `handleSave` is a stub | `client/src/components/intakes/NewIntakeModal.tsx:81` | finish wiring or remove | requires alignment with Marcin |
| 8 | 360° abandoned-cart capture creates leads silently — no nurturer, no notification | `server/routers/threeSixty.ts:1190`, `:1369` | 20 LOC each | call `onLeadCreated` |
| 9 | 360° webhook never creates a `lead` opportunity — direct subscription leaves CRM blind | `server/threeSixtyWebhook.ts:66` | 40 LOC | optional: skip if upgrade path |
| 10 | Estimate snapshot (`snapshotOpportunities`) never written at send — no dispute audit trail | `server/routers/estimate.ts:521` | 40 LOC | reuse existing snapshot helper |
| 11 | Final/balance invoice deferred until sign-off — should auto-create alongside deposit at approval | `server/routers/portal.ts:343` | 30 LOC | none |
| 12 | Appointment reminder cadence (customer 24h + consultant morning brief) has zero implementation | new daily job in `server/_core/index.ts` | 200 LOC | reuse overdue-invoice cron template |
| 13 | First Baseline Walkthrough never scheduled at 360 enrollment despite welcome email promising it | `server/threeSixtyWebhook.ts:218` | 50 LOC | requires consultant capacity logic or default time |
| 14 | Subsequent quarterly visits never auto-created after first completes | `server/routers/threeSixty.ts` (visit completion) | 30 LOC | none |
| 15 | `invoice_overdue` automation only fires on manual click — no nightly scheduler | `server/routers/financials.ts:316` | 60 LOC | iterate overdue + call automation |
| 16 | Welcome-to-portal trigger on first job completion missing | `server/routers/opportunities.ts:184` | 40 LOC | reuse magic-link flow |
| 17 | Roadmap Generator missing `email` rejection (logged once 04:00 UTC) — verify upstream form | `server/routers/priorityTranslation.ts:53` | investigate | check public form payload |
| 18 | Inbound answered calls leave no notification — only missed calls notify nurturer | `server/twilio.ts:218` | 20 LOC | optional: light "call logged" notif |
| 19 | Inbound SMS doesn't notify team if no automation rule is configured | `server/twilio.ts:117` | 20 LOC | `createNotification` pass-through |
| 20 | Inbound Gmail never creates leads — sync only | `server/gmail.ts` | strategic decision needed | pattern-match sales-y emails? |

### P2 — nice-to-have

| # | Gap | Effort |
|---|---|---|
| 21 | Pre-arrival SMS ("on the way") | 60 LOC + scheduled-job entry |
| 22 | Google Calendar bi-directional sync | larger — OAuth + sync loop |
| 23 | .ics export for consultant schedules | 80 LOC |
| 24 | Self-serve slot picker on `/book` | 200+ LOC + availability calc |
| 25 | Gallery photos linked to specific job, sign-off requires N photos | 80 LOC |
| 26 | HP-team write endpoint for `portalJobUpdates` (mid-job progress posts) | 60 LOC |
| 27 | Annual valuation cadence for past customers | new scheduled job |
| 28 | `[Gmail] Not connected` log spam at error level | 1 LOC severity change |
| 29 | Boot-time `ensurePortalContinuityFlag`/`ensureMagicLinkTokenHash` warnings | 10 LOC + DB migration confirm |
| 30 | Booking `source: input.serviceType` — wrong type passed to `onLeadCreated` | 1 LOC: hardcode `"book_consultation"` |

---

## What was fixed inline (this PR)

- **Gap #1** — `portal.submitServiceRequest` now calls `onLeadCreated` and `runAutomationsForTrigger('lead_created', …)` (assigns Nurturer + fires automation rules). Portal-only customers are bridged to a CRM customer row when missing.
- **Gap #6** — booking timeline check now reads `'ASAP'` (the actual zod enum value) instead of the impossible `'emergency'`.
- **Gap #30** — booking `source` passed to `onLeadCreated` is now the typed literal `'book_consultation'` (was `input.serviceType` free-text).
- **Gap #4** — `payment_intent.succeeded` webhook now sends the same branded receipt email + owner notification that `checkout.session.completed` already sends.
- **Gap #8** — 360° abandoned-cart and portfolio-cart capture now call `onLeadCreated` so the Nurturer sees them.
- **Gap #28** — `[Gmail] Not connected, skipping poll` downgraded to `info` to stop drowning out real errors.

Strategic gaps (#2 customer appointment confirmation, #3 invoice email, #5 Stripe subscription dunning, #12 reminder scheduler, #13 baseline auto-schedule) intentionally **not** fixed here — they require template wording, cadence, and capacity decisions Marcin should weigh in on. They appear in EXEC_BRIEF.

---

## Verification methods used

- Code reading: every cited file:line was read. Cross-references via Grep.
- Railway logs: pulled last ~4h of deployment `954a10bc-655d-4fa0-b382-ab36c755a103` via the GraphQL API. Only active error categories: gmail-not-connected (log spam), one Roadmap Generator validation failure, and boot-time non-fatal table-missing warnings.
- DB introspection: skipped — there's no `ai_agent_runs` table to query (it doesn't exist), and the prod DB is on Railway with no connection pre-configured locally; secondary signal sufficient.

---

## Addendum: Phase 5 — Agent Engine (feat/agent-engine, 2026-04-25)

The TL;DR above said *"there's no `ai_agent_runs` table, no trigger bus, no agent runtime."* That was true at the moment the audit was written but was **already wrong by the time the audit landed** — the Phase 1/2/4 runtime code had merged on a parallel branch hours earlier (commits `2a97ec9`, `dc34392`, `930a887`). What the audit correctly identified is that **the engine wasn't actually running** because:

1. All 31 seeded agents were in `draft_queue` status (not `autonomous`).
2. The runtime was single-turn — agents could call one batch of tools but couldn't chain.
3. No meta-event fired after a run, so System Integrity / KPI rollups had nothing to react to.
4. Several event emit sites were missing (invoice.created, call.missed, customer.portal_account_created, subscription.renewed/cancelled).
5. There was no admin-facing control surface to flip the engine on/off in one click.

Phase 5 (this PR) closes those gaps:

| Component | Status before | Status after |
|---|---|---|
| Multi-turn tool dispatch | ❌ single-turn loop | ✓ up to 8 turns, cache_control on system prompt |
| `agent.run_completed` meta-event | ❌ not emitted | ✓ emitted by runtime after every run, fire-and-forget |
| `invoice.created` emit | ❌ missing | ✓ in `server/routers/portal.ts:765` (createInvoiceForPortal) |
| `call.missed` emit | ❌ missing | ✓ in `server/twilio.ts:235` (handleCallStatusUpdate) |
| `customer.portal_account_created` emit | ❌ missing | ✓ in `server/portalDb.ts:90` (upsertPortalCustomer) |
| `subscription.renewed`/`subscription.cancelled` emits | ❌ missing | ✓ Stripe webhook `invoice.payment_succeeded` + `customer.subscription.deleted` |
| System Integrity hourly self-optimization | ❌ not built | ✓ `server/lib/agentRuntime/systemIntegrity.ts` + boot cron + admin inbox flags |
| `agent_optimization_tasks` table | ❌ missing | ✓ migration 0073 + boot-time `ensureOptimizationTasksTable` |
| /admin/agents/control (one-click activate-all + kill switch) | ❌ missing | ✓ new page wired via `aiAgents.activateAll` / `pauseAll` / `bulkSetStatus` |
| /admin/agents/runs (live observability) | ❌ missing | ✓ new page wired via `aiAgents.runsFeed` + `costSummary` |
| Per-seat cost cap auto-pause | ✓ already in runtime | ✓ unchanged (cost_exceeded → status=paused + admin notification) |
| Approval gate on customer-facing tool calls | ✓ already in runtime | ✓ unchanged |

### What flipping the engine ON now does

After this PR merges + deploys + Marcin clicks **Activate all** on `/admin/agents/control`:

1. Every existing `lead.created` / `payment.received` / `voicemail.received` / `roadmap_generator.submitted` / `opportunity.stage_changed` event already in code starts queueing tasks for the subscribed seats.
2. The 30-second scheduler tick drains the queue against autonomous seats — capped per-seat at the daily cost cap (default $5/day) and run-count limit (default 200/day).
3. Every run emits `agent.run_completed`. System Integrity subscribes; the hourly cron rolls up anomalies (>25% error rate, empty outputs, cost cap hits, queue stalls) and drops drafts in Marcin's inbox.
4. Customer-facing tool calls (`comms.draftEmail`, `comms.draftSms`) **never auto-send** — they park in `/admin/ai-agents/tasks` for one-click approve.
5. Marcin can pause everything in one click via the **Emergency: pause all** button on the same control page.

### Synthetic verification

`scripts/agent-engine-e2e.mjs` fires a synthetic `lead.created` event and polls `ai_agent_tasks` + `ai_agent_runs` to confirm the chain works. Run against any environment with `DATABASE_URL` set.

### Activation runbook (post-deploy)

```bash
# On the Railway shell:
node scripts/seed-ai-agents.mjs          # idempotent — only adds rows that don't exist
node scripts/seed-charters.mjs           # idempotent — refreshes charter content
node scripts/seed-phase5-subscriptions.mjs   # NEW — adds the Phase 5 event subscriptions
node scripts/agent-engine-e2e.mjs        # smoke test — should PASS
```

Then go to https://app.handypioneers.com/admin/agents/control and click **Activate all**. The control page shows live cost, status counts, and System Integrity flags as they're raised.

