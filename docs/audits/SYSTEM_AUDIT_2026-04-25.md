# HP-Estimator System Audit — 2026-04-25

Auditor: Claude (claude-sonnet-4-6)  
Branch: claude/thirsty-northcutt-03a206  
Scope: Full customer lifecycle, lead-to-member

---

## Connection Map (Event → Agent → Output → Next Event)

```
[Lead enters system]
  └─ booking.submit / PT.submit / 360.event / inbound_call
       ├─ createCustomer (customers table)
       ├─ createOpportunity (opportunities table, area=lead)
       ├─ onLeadCreated() → pipelineEvents row + notifications row
       │      └─ createNotification() → Resend email to Nurturer
       │                              → Twilio SMS if mobileUrgent=true
       └─ runAutomationsForTrigger("lead_created") → automationRules rows

[Appointment booked]
  └─ opportunities.update (stage = Consultation Booked)
       └─ onAppointmentBooked() → reassign to Consultant + notify

[Sale signed]
  └─ opportunities.update (stage = Won / Job)
       └─ onSaleSigned() → reassign to PM + notify

[Job complete]
  └─ portalJobSignOffs → review request email (hourly cron)

[Invoice paid]
  └─ Stripe webhook → updatePortalInvoicePaid()
       └─ runAutomationsForTrigger("invoice_paid")

[360° enrollment]
  └─ Stripe checkout.session.completed
       └─ create360MembershipFromWebhook() → threeSixtyMemberships row
            └─ releaseDeferredLaborBankCredits() (every 6h)
```

---

## 1. Lead Capture

### Expected
Every public form creates `customers` + `opportunities` + fires `onLeadCreated` → nurturer gets notified within seconds.

### What is wired

| Entry Point | Endpoint | customer row | opportunity row | onLeadCreated | Nurturer notified |
|---|---|---|---|---|---|
| handypioneers.com booking form | `POST /api/trpc/booking.submit` | ✅ | ✅ | ✅ (fixed 2026-04-25) | ✅ |
| 360.handypioneers.com checkout_started | `POST /api/360/event` | ✅ | ✅ (stage=Cart Abandoned) | ❌ | ❌ |
| Priority Translation form | `POST /api/trpc/priorityTranslation.submit` | ✅ (fixed 2026-04-25) | ✅ (fixed 2026-04-25) | ✅ (fixed 2026-04-25) | ✅ (fixed 2026-04-25) |
| Manual (internal UI) | `POST /api/trpc/opportunities.create` | (pre-existing) | ✅ | ✅ (source=manual) | ✅ |
| Inbound phone call | Twilio webhook `/api/twilio/voice/inbound` | ❌ no auto-create | ❌ | ❌ | ❌ |

### Gaps

**GAP-L1 (P1):** 360° cart abandonment (`checkout_started` event) creates customer + opportunity but never calls `onLeadCreated`. Nurturer is not notified of high-intent funnel drops.

**GAP-L2 (P1):** Inbound phone calls create a `callLogs` row and a `conversations` thread but do NOT auto-create a customer or opportunity. Marcin must manually create the lead after reviewing missed calls.

**GAP-L3 (P2):** No public form on 360.handypioneers.com for Priority Translation that uploads a PDF file (multipart). Current PT form only accepts a URL to an already-hosted PDF. Limits adoption.

---

## 2. First Contact (within 5 minutes of lead creation)

### Expected
- Auto-acknowledgment email/SMS to the customer
- Lead routed to nurturer
- Lead enriched by any available research

### What is wired

| Action | Wired | Notes |
|---|---|---|
| Nurturer notified in-app | ✅ | `createNotification()` in `leadRouting.ts` |
| Nurturer email notification | ✅ | Resend via `deliverChannels()` if `userId` has email on record |
| Nurturer SMS if urgent | ✅ | Gated by `mobileUrgent=true` on userRoles row |
| Customer auto-ack email | ❌ | Not wired on any path |
| Customer auto-ack SMS | ❌ | smsConsent captured in booking form but nothing sent |
| Lead enrichment (research) | ❌ | No Prospecting Research agent |

### Gaps

**GAP-F1 (P1):** No auto-acknowledgment email is sent to the customer after any form submission. Customer submits a request and hears nothing until a human responds manually. Churn risk.

**GAP-F2 (P1):** smsConsent is captured and stored but never acted upon. A customer who opts in to SMS gets no confirmation text.

**GAP-F3 (P2):** No lead enrichment / research step. The nurturer works cold with only what the customer typed.

---

## 3. Estimate / Roadmap Generator

### Expected
PDF upload → Anthropic call → branded PDF → email to customer with magic-link portal access.

### What was broken (fixed 2026-04-25)

**ROOT CAUSE of Marcin's bug:**

The `.submit` procedure created the DB row and set status=`processing`, then returned. No worker, no queue consumer, and no scheduled job ever called `.process`. The `loadReportText()` helper inside `.process` was a stub that unconditionally threw `"not yet implemented"`. Translation rows sat in `processing` state forever. The email was never sent.

**Fix shipped (this branch):**

1. `server/lib/priorityTranslation/processor.ts` — added `callClaudeWithPdfBuffer()`. Passes the inspection PDF directly to Claude as a native base64 document (Claude reads it natively — no `pdf-parse` dep needed).

2. `server/routers/priorityTranslation.ts` — full rewrite:
   - `loadReportText` stub → `loadPdfBuffer()` (fetches from `reportUrl` or reads from `pdfStoragePath`)
   - Extracted `runPriorityTranslation(db, translationId)` — the 6-step pipeline in one callable function
   - In `.submit`: fires `runPriorityTranslation()` in `setImmediate()` so the HTTP response returns instantly and processing runs async
   - Also: creates CRM `customers` row + `opportunities` row + calls `onLeadCreated()` so the lead appears in the pipeline
   - `notifyOwner()` fires immediately on submit so Marcin is pinged before the PDF is even ready

**Remaining gap:**

**GAP-R1 (P2):** No multipart PDF upload endpoint exists. The form must pass a `reportUrl` (URL to an already-hosted PDF). If the user uploads a file directly, it is not persisted. A multipart endpoint at `POST /api/pt/upload` is needed that stores to Railway volume or S3 and returns `pdfStoragePath`.

**GAP-R2 (P2):** The PT form UI is not part of this codebase. It presumably lives on 360.handypioneers.com. No integration test exists for the full form → API → email path.

**GAP-R3 (P2):** Stuck `processing` rows from before this fix are not retried. A one-time backfill to re-trigger them is needed.

---

## 4. Booking — Baseline Walkthrough / Consultation

### Expected
Online form → lead created → scheduling widget → appointment on calendar → reminders before appointment → day-of dispatch.

### What is wired

| Step | Wired | Notes |
|---|---|---|
| Online request form | ✅ | `booking.submit` — creates customer + lead |
| Service zip validation | ✅ | `booking.checkZip` |
| Nurturer notification | ✅ | Via `onLeadCreated` |
| Appointment creation | ✅ | `scheduleEvents` table via `schedule` router |
| `onAppointmentBooked` fired | ❌ | `schedule` router does NOT call `onAppointmentBooked()` |
| Consultant notified on booking | ❌ | Depends on above |
| Calendar sync (Google/Outlook) | ❌ | No external calendar integration |
| Pre-appointment reminder emails | ❌ | No reminder cadence |
| Pre-appointment reminder SMS | ❌ | No reminder cadence |
| Day-of dispatch info to PM/trades | ❌ | Manual |

### Gaps

**GAP-B1 (P1):** `schedule` router creates `scheduleEvents` rows but does NOT call `onAppointmentBooked()`. The Consultant is never automatically notified when an appointment is booked. Lead stays owned by the nurturer.

**GAP-B2 (P1):** No pre-appointment reminder cadence (email or SMS). Industry standard: 48h + 2h reminders. Zero reminders = missed appointments.

**GAP-B3 (P2):** No Google Calendar or Outlook integration. Schedule exists only in the app.

---

## 5. Job Execution

### Expected
Scheduled job → pre-arrival SMS → job performed → QA photos → invoice via Stripe → sign-off.

### What is wired

| Step | Wired | Notes |
|---|---|---|
| Job sign-off (portal) | ✅ | `portalJobSignOffs` table |
| Review request email post-sign-off | ✅ | Hourly cron in `index.ts` (initial + 48h reminder) |
| Invoice creation | ✅ | `invoices` + `portalInvoices` tables |
| Stripe payment | ✅ | Checkout session + webhook handler |
| Pre-arrival SMS | ❌ | Not wired |
| QA photo collection at completion | ❌ | `portalGallery` table exists, no enforced collection flow |
| Automated invoice delivery (email) | ❌ | Portal invoice exists but no auto-send email with Stripe link |

### Gaps

**GAP-J1 (P1):** No pre-arrival SMS to customer. Customer doesn't know when crew is ~30 min out. Common cause of "no one was home" problems.

**GAP-J2 (P1):** Invoice is created in the portal but no email is sent to the customer with a payment link. Customer must log into portal to discover invoice.

**GAP-J3 (P2):** No mandatory QA photo step at job completion. `portalGallery` exists but is optional.

---

## 6. Post-Sale (After First Project Closes)

### Expected
Job complete → welcome to portal → 360° pitch → annual valuation cadence.

### What is wired

| Step | Wired | Notes |
|---|---|---|
| Portal account provisioning | ✅ | Estimate approval triggers portal invite |
| 360° soft pitch in portal | ✅ | `Portal360Membership.tsx` page exists; `portalContinuityEnabled` flag |
| Welcome to portal email | ❌ | No auto-send on first portal access |
| Annual valuation cadence | ❌ | Not wired |
| Follow-up sequence post-project | ❌ | No automated sequence |

### Gaps

**GAP-P1 (P2):** No welcome email when a customer first logs into their portal. Significant onboarding gap.

**GAP-P2 (P2):** No annual home valuation / property health cadence. This is core to the 360° promise but has no automation.

---

## 7. Member Journey (360° Method)

### Expected
Enrollment → onboarding sequence → quarterly check-ins → renewal handling.

### What is wired

| Step | Wired | Notes |
|---|---|---|
| Enrollment via Stripe Checkout | ✅ | `/api/360/checkout` + webhook handler |
| Membership row created | ✅ | `create360MembershipFromWebhook()` |
| Deferred labor bank credit | ✅ | `releaseDeferredLaborBankCredits()` every 6h |
| Cart abandonment drip (3 emails) | ✅ | Hourly cron, 24h/72h/7d cadence |
| Annual scan scheduling | ✅ | `threeSixtyVisits` table |
| Onboarding email sequence | ❌ | No automated sequence post-enrollment |
| Quarterly check-in emails | ❌ | Not wired |
| Renewal reminder emails | ❌ | Not wired |
| Cancellation / pause handling | ❌ | `status` field exists but no automation |

### Gaps

**GAP-M1 (P1):** No onboarding sequence after 360° enrollment. Member pays, gets silence. High churn risk in first 30 days.

**GAP-M2 (P2):** No quarterly check-in cadence. Members should receive a health update every 90 days.

**GAP-M3 (P2):** No renewal reminder sequence (e.g., 60d / 30d / 7d before renewal date).

---

## Gap List — Severity Ranked

| ID | Description | Severity | Effort | Depends On |
|---|---|---|---|---|
| **Fixed** | PT pipeline: loadReportText stub → loadPdfBuffer, processing wired inline | **P0** | Done | — |
| **Fixed** | PT submit: CRM customer + opportunity + onLeadCreated | **P0** | Done | — |
| **Fixed** | booking.ts: source type 'inbound_call' vs arbitrary string | **P0** | Done | — |
| GAP-F1 | Customer auto-ack email after any form submit | P1 | 2h | Resend template |
| GAP-B1 | schedule router does not call onAppointmentBooked | P1 | 1h | — |
| GAP-F2 | smsConsent captured but no SMS sent | P1 | 2h | Twilio |
| GAP-J2 | No invoice email to customer with Stripe payment link | P1 | 3h | Resend + portalInvoices |
| GAP-L1 | 360° cart abandonment never calls onLeadCreated | P1 | 1h | — |
| GAP-L2 | Inbound calls don't auto-create customer/opportunity | P1 | 3h | Twilio flow redesign |
| GAP-M1 | No 360° member onboarding sequence | P1 | 4h | Email templates |
| GAP-J1 | No pre-arrival SMS | P2 | 3h | Twilio + schedule |
| GAP-B2 | No pre-appointment reminder emails/SMS | P2 | 4h | schedule + Twilio/Resend |
| GAP-P1 | No portal welcome email on first login | P2 | 2h | Resend |
| GAP-R1 | No multipart PDF upload endpoint for PT form | P2 | 3h | S3/Railway volume |
| GAP-R3 | Stuck "processing" PT rows not retried | P2 | 1h | DB query + re-trigger |
| GAP-L3 | PT form only accepts URL, not file upload | P2 | 3h | GAP-R1 |
| GAP-M2 | No quarterly 360° check-in cadence | P2 | 4h | Email templates |
| GAP-M3 | No renewal reminder sequence | P2 | 4h | Email templates |
| GAP-P2 | No annual valuation cadence | P2 | 6h | Scheduling + email |
| GAP-F3 | No lead enrichment / research step | P2 | 8h | External data API |
| GAP-B3 | No Google Calendar sync | P2 | 8h | Google Calendar API |
| GAP-J3 | No mandatory QA photo at job completion | P2 | 4h | Portal flow update |

---

## Scheduled Jobs (always-on crons in index.ts)

| Job | Frequency | Status |
|---|---|---|
| Gmail poll | Every 2 min | ✅ Running |
| Overdue invoice reminders | Daily 9 AM | ✅ Running |
| Review request emails | Every 1h | ✅ Running |
| 360° cart abandonment drip | Every 1h | ✅ Running |
| 360° deferred labor credit release | Every 6h | ✅ Running |
| Lost lead auto-archive (90d) | Daily 3 AM | ✅ Running |
| PT processing worker | — | ❌ Not a cron — now fires inline on submit |

---

## AI Agent Runs (ai_agent_runs table)

No `ai_agent_runs` table exists in the schema. The only AI agents are:
- **Priority Translation processor** — `callClaudeWithPdfBuffer()` (now wired via submit inline)
- **SOW generator** — `estimate.generateSOW` tRPC call (synchronous, on demand)
- **Project schedule generator** — `estimate.generateProjectSchedule` (synchronous, on demand)

No background AI agent runner infrastructure exists. Agents are invoked synchronously or (PT) via setImmediate.

---

## Railway Error Log Summary

Cannot query Railway logs directly from this audit. Recommend running:

```bash
railway logs --service hp-estimator-app --lines 500 | grep -E "(ERROR|WARN|failed|throw)" | sort | uniq -c | sort -rn
```

Focus on: `[PT]` prefix for Priority Translation errors, `[leadRouting]` for notification failures, `[Resend]` for email delivery.

---

## Synthetic E2E Test

A synthetic booking-form submit can be verified with:

```bash
curl -X POST https://[RAILWAY_URL]/api/trpc/booking.submit \
  -H "Content-Type: application/json" \
  -d '{"json":{"zip":"98683","serviceType":"General Inquiry","description":"Test lead","timeline":"ASAP","photoUrls":[],"firstName":"Test","lastName":"Lead","phone":"3601234567","email":"test+e2e@handypioneers.com","street":"123 Test St","unit":"","city":"Vancouver","state":"WA","smsConsent":false}}'
```

Expected: `{"result":{"data":{"json":{"success":true,"leadId":"...","customerId":"..."}}}}}`

Check: customers table has a row for `test+e2e@handypioneers.com`, opportunities table has a row with area=`lead`, pipelineEvents has a `lead_created` row, notifications has a `new_lead` row.
