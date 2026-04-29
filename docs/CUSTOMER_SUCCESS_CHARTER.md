# Customer Success Charter
**Version:** 1.0 · **Effective:** 2026-04-25 · **Owner:** Marcin / Concierge org

This charter is the policy document that defines how Handy Pioneers communicates with homeowners across the customer lifecycle. The Concierge org (currently the **Lead Nurturer** seat plus future **Annual Valuation** seat) executes against it. Engineering wires the system to make each policy mechanically reliable.

The charter is the source of truth for vocabulary, voice, ownership of touchpoints, and the rules that govern when communication happens automatically vs. when a human (or AI agent) reaches out personally.

---

## §1. Brand voice

### Identity
We speak as a stewardship partner to homeowners who treat their property as a living asset. The tone is warm, considered, and unhurried — never transactional, casual, or salesy.

### Vocabulary — never use
- **estimate**, **free**, **cheap**, **affordable**, **handyman**, **easy**
- **fix**, **repair**, **best**, **save**, **discount**, **limited time**

### Vocabulary — preferred substitutions
| Avoid | Use instead |
|---|---|
| estimate | scope and investment letter / project scope / your roadmap |
| free / no-charge | no obligation / no commitment / at our cost |
| fix / repair | remedy / restore / attend to / address |
| easy | straightforward / simple |
| best | proper / fitting / appropriate to your home |
| save / discount | (drop entirely; do not anchor on price) |
| limited time | (drop entirely) |
| handyman | (never; differentiator we will not concede) |

### Posture
- Identity-first ("homeowners who treat their property as a living asset")
- Value-heavy, price-quiet
- "We come to you." (never "schedule a free quote")
- "A stewardship conversation, not a presentation." (frames the consultation)
- Concierge speaks on behalf of the homeowner's standard of care, not on behalf of HP's calendar

---

## §2. Customer-facing auto-acknowledgments

Three transactional touchpoints fire automatically. All three use the affluent voice. Templates live in the `emailTemplates` table; code paths render the template via `renderEmailTemplate(key, vars)` with inline fallback copy if the seed has not yet been run against the DB.

| Trigger | Template key | Channels | Code path |
|---|---|---|---|
| Customer submits `/book` wizard | `booking_inquiry_received` | email + SMS (if `smsConsent`) | `server/routers/booking.ts → sendBookingInquiryAck` |
| Portal member submits service request | `service_request_acknowledged` | email | `server/routers/portal.ts → submitServiceRequest` |
| Appointment booked (Baseline / Consultation) | `appointment_confirmed` (or type-specific `appt_consultation_scheduled` / `appt_baseline_scheduled`) | email + SMS (if `customers.sendNotifications`) | `server/leadRouting.ts → sendAppointmentConfirmationToCustomer` |

### Paste-ready samples (for Marcin to eyeball)

#### A. Booking inquiry received

**Subject:** Your inquiry is in our care, {customerFirstName}
**Preheader:** Your Concierge will be in touch within one business day

> {customerFirstName},
>
> Your inquiry has reached us at Handy Pioneers, and it is in our care.
>
> Here is what happens next: a member of our Concierge team will reach out personally — by text or by email — within one business day to learn more about your home, understand the project you have in mind, and find a window of time that fits your schedule for a walkthrough conversation.
>
> Nothing further is needed from you in the meantime. We come to you.
>
> If anything time-sensitive surfaces, you are welcome to call us directly at (360) 241-5718.
>
> — The Handy Pioneers Team

**SMS (if consented):** "Your inquiry is in our care, {customerFirstName}. Your Handy Pioneers Concierge will reach out within one business day to align on timing. (360) 241-5718 if anything is time-sensitive."

---

#### B. Portal service request acknowledged

**Subject:** Your request is in our care, {customerFirstName}
**Preheader:** We are already reviewing it on your behalf

> {customerFirstName},
>
> We have received your request and added it to your home's standard-of-care file.
>
> Here is what happens next: your Concierge will review the details, gather what is needed from our records, and reach out personally to align on next steps and timing. Expect to hear from them within one business day.
>
> Your full home history is always available in your portal: [Open my portal →]
>
> For anything time-sensitive, call us directly at (360) 241-5718.
>
> — The Handy Pioneers Team

---

#### C. Appointment confirmed

**Subject:** Your visit on {appointmentDate} is confirmed
**Preheader:** What we will attend to and how to prepare

> {customerFirstName},
>
> Your visit with Handy Pioneers is confirmed.
>
> - **When:** {appointmentDate} at {appointmentTime}
> - **Where:** {appointmentAddress}
> - **Visiting:** {consultantName}
> - **Length:** approximately {appointmentDuration}
>
> This is a stewardship conversation, not a presentation. We will walk your home with you, listen to what you have in mind, and share what a proper standard of care looks like for the project ahead.
>
> Nothing to prepare on your end — though if there is anything you have been watching or wondering about, jot it down so we can attend to it together.
>
> [View in portal →]
>
> Need to adjust the time? Reply to this email or call (360) 241-5718.
>
> — The Handy Pioneers Team

**SMS:** "{customerFirstName}, your Handy Pioneers visit is confirmed for {appointmentDate} at {appointmentTime}. {consultantName} will see you. (360) 241-5718 if anything changes."

---

## §3. Invoice email cadence

**Policy:** one notification at invoice creation. No due-date reminders, no overdue chasers, no escalations.

### What this means in code
- The daily 9 AM `runOverdueReminders` cron in `server/_core/index.ts` is **disabled** (commented out, with a note explaining the policy and how to restore if the policy ever changes).
- The manual `financials.sendReminder` endpoint **remains available** for one-off operator use, but no scheduled job calls it.
- Invoice creation should send the customer an email with the invoice details and payment link. (Audit gap #3 from `SYSTEM_AUDIT_2026-04-25.md` — the at-create email is still pending; a P0 fix item for the next sprint.)

### Why
A homeowner who has invested in stewardship should not receive automated chase emails. If a balance lingers, the Concierge handles it personally and in context — once. Repeated automated nudging erodes trust and is incompatible with the brand voice.

---

## §4. Lead Nurturer scheduling playbook (canonical)

The Lead Nurturer owns scheduling end-to-end. The operator (Marcin) has zero involvement in scheduling or appointment-setting. This applies to all three contexts:

1. New `/book` inquiries → consultation
2. New portal service requests → on-site visit
3. Path A → Path B membership conversion → first 360° Baseline Walkthrough

### Operating principles

1. **Scheduling is a conversation, not a form.** Self-serve calendar widgets are not used. Customers do not pick from a slot grid.
2. **The Nurturer comes to the customer.** Outreach is personal — by text or email — and is shaped by what we already know about the customer (last interaction, prior projects, urgency cues from their inquiry).
3. **One mutually agreeable time, on the first try.** The Nurturer suggests a small set of options that fit both the customer's stated availability and the consultant's real calendar.
4. **Three attempts, then escalate.** If the Nurturer cannot reach the customer after three attempts spaced over one week (text → email → text), the case is flagged in the Concierge inbox for human review. No more than three automated outreach attempts; we do not chase indefinitely.

### Escalation rules
- **Attempt 1:** within 1 business hour of inquiry. Channel matches what the customer used (SMS for SMS-consenting bookings; email for portal requests).
- **Attempt 2:** 24 business hours later, opposite channel.
- **Attempt 3:** 72 business hours later, original channel, with a soft offer to reach by phone.
- After Attempt 3: flag to Concierge inbox, mark opportunity stage = `Awaiting Concierge Review`, cease automated outreach.

### Outreach templates (Nurturer voice)

**Attempt 1 — SMS (for /book inquiries with smsConsent):**
> "Hi {firstName}, this is the Handy Pioneers Concierge following up on your inquiry. We'd like to walk your home with you. What does your week look like — afternoons or mornings? Reply with a window that suits you."

**Attempt 1 — Email (no SMS consent / portal requests):**
> Subject: A short conversation about your home, {firstName}
>
> {firstName},
>
> Following up on the inquiry you sent in. We'd like to walk your home with you and listen to what you have in mind. The conversation is unhurried — about an hour — and we come to you.
>
> Two options to start:
>
> - **{Option A — date and time}**
> - **{Option B — date and time}**
>
> If neither fits, reply with a few windows that suit you and we'll match a Concierge to your schedule.
>
> — The Handy Pioneers Concierge

**Attempt 2 — opposite-channel reminder, lighter tone:**
> "{firstName}, just circling back so this doesn't slip — we're holding two windows for you next week. Anything closer to your schedule? Reply here or call (360) 241-5718."

**Attempt 3 — soft-touch with phone offer:**
> "Last note from us so we don't keep hovering. If a quick phone conversation is easier, the Concierge line is (360) 241-5718 — they pick up directly. Otherwise we'll be here whenever you're ready."

**Confirmation (when slot agreed):**
> "Wonderful — we have you on the calendar for {date} at {time}. {Consultant first name} will visit you at {address}. You'll receive a confirmation email within a few minutes. — Handy Pioneers Concierge"

The slot-agreed step then triggers the existing `appointment_confirmed` email/SMS in §2C above.

### Time-suggestion logic (spec for the agent runtime)

When the Nurturer needs to propose times:

1. Pull the consultant's existing calendar entries from `scheduleEvents` for the next 7 business days.
2. Compute free slots that:
   - Honor the consultant's working hours (default 8:00–17:00, configurable per user).
   - Allow 30 min of travel buffer between in-home visits.
   - Fit the appointment's expected duration (consultation = 60 min, baseline = 120 min).
3. Pick the two slots that maximize the customer's stated availability window, with tie-breaks on (a) earliest day, (b) earliest hour within day.
4. Hold the slots tentatively for 24 hours; release on Attempt 2 send.

### Tool authorization (spec — runtime not yet built)

When the Lead Nurturer agent runtime exists, it will need authorization to call these tools. This is a spec; the runtime itself is future work.

| Tool | Read | Write | Notes |
|---|---|---|---|
| `customers.get` | ✓ | — | Look up the customer record |
| `opportunities.get` / `opportunities.update` | ✓ | ✓ | Update stage, notes, last contact timestamp |
| `schedule.list` | ✓ | — | Read consultant calendar to find free slots |
| `schedule.create` | — | ✓ | Create the appointment after slot is agreed (this fires `onAppointmentBooked` which triggers §2C) |
| `inbox.send` (SMS) | — | ✓ | Outbound SMS in the customer's existing thread |
| `gmail.send` | — | ✓ | Outbound email |
| `notifications.create` | — | ✓ | Flag escalations to the Concierge inbox |
| Stripe / payments | — | ✗ | Never authorized for the Nurturer; payments are out of scope for scheduling |
| Estimate / scope creation | — | ✗ | Strictly the Consultant's purview |

### Where the playbook is enforced today
The runtime that executes this playbook **does not yet exist** in the codebase. Today, the `nurturer` role is held by a human (default user with role assignment via `userRoles`). The lead-routing helpers (`onLeadCreated`, `onAppointmentBooked`, `onSaleSigned`) deliver the right notifications to the right human; this charter is the spec for the agent that will eventually take over those notifications and act on them autonomously.

The audit (`docs/audits/SYSTEM_AUDIT_2026-04-25.md`) flags the absence of the agent runtime explicitly — it is not a regression, it is unstarted work. Building it is downstream of:
- A general background-job runtime (currently 7 ad-hoc `setInterval`s in `server/_core/index.ts`)
- Tool-call authorization scaffolding
- An `ai_agent_runs` table or equivalent for traceability

---

## §5. Annual Home Health Report (opt-in)

**Policy:** opt-in, default OFF. Members enable via a portal toggle on the 360° Membership page.

### Customer-facing description
> Members can opt into an Annual Home Health Report — a comprehensive valuation of your property's standard of care.

### Mechanics
- DB: `threeSixtyMemberships.annualValuationOptIn` (boolean, default `false`).
- Boot-time ensure helper (`ensureAnnualValuationOptInColumn` in `server/_core/index.ts`) adds the column on first deploy.
- Portal: `Portal360Membership` page renders an `AnnualValuationOptIn` toggle card above the Upgrade nudge. Toggling fires `portal.setAnnualValuationOptIn`.
- Admin: `threeSixty.update` accepts `annualValuationOptIn` in its input shape so the operator (or future agent) can manage the flag from the pro side.
- Future runtime: when the AI Annual Valuation seat exists, it reads this flag on each member's onboarding anniversary and, if `true`, schedules the report. The seat itself is future work.

---

## §6. What happens when this charter changes

This is a living document. The brand voice, vocabulary list, and ownership of touchpoints can evolve, but each change is intentional:

1. Edit the relevant section of this doc.
2. Update template copy in `scripts/seed-email-templates.mjs` to match.
3. Re-run the seed against staging, verify renderings, then prod: `node scripts/seed-email-templates.mjs`.
4. Note the change in `docs/audits/EXEC_BRIEF.md` if it affects ongoing decisions.

The seed is idempotent — re-running it updates copy in place without disturbing IDs.
