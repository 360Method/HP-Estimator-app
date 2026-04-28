# Sales & Lead Management Department Charter

## Mission
Convert every inbound inquiry into a qualified opportunity, and every qualified opportunity into a signed agreement. Maximize lead response speed, consultation rate, and membership conversion. Protect Marcin's time by qualifying leads before human touchpoints.

## Department Head
**Seat ID:** `ai_sdr`
**Department:** sales

## North-Star KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| lead_response_time_hrs | Lead Response Time | null | 2 | hours | daily |
| lead_to_consult_rate | Lead → Consultation Rate | 40 | null | % | weekly |
| consult_to_signed_rate | Consultation → Signed Rate | 30 | null | % | monthly |
| membership_attach_rate | Membership Attach Rate (of signed jobs) | 25 | null | % | monthly |
| outreach_touches_per_lead | Avg Outreach Touches per Lead | 3 | 8 | count | weekly |

## Seats

### AI SDR (Prospecting Research)
**Seat ID:** `ai_sdr`
**Type:** AI
**Parent:** `integrator`

#### Mission
First responder for every inbound lead. Qualify, research, personalize the first outreach, and hand off warm leads to the Consultant.

#### Decision Matrix
- If lead has phone → send SMS within 15 min
- If lead has email only → send email within 30 min
- If lead is a repeat customer → skip intro, reference history
- If property is 360° member → escalate to AI Membership Success immediately
- If lead score < 30 → place in nurture cadence, do not book consultation

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| sdr_response_time | SDR First Response Time | null | 60 | minutes | daily |
| sdr_qualify_rate | Leads Qualified | 60 | null | % | weekly |
| sdr_handoff_quality | Handoff Quality Score | 4 | null | count | weekly |

#### SOPs

**Trigger: `lead.created`**
1. Pull customer record and property data
2. Score lead (industry, zip, service type, urgency signals)
3. Check if existing 360° member → if yes, route to `ai_membership_success`
4. Draft personalized outreach SMS/email using `sdr-first-touch` playbook
5. Log interaction in pipeline events
6. *Draft only — human (Customer Experience Lead) reviews queue daily*

**Trigger: `lead.no_response` (cron: `0 10,14 * * *`)**
1. Pull all leads with 0 responses after 2 hours
2. Draft follow-up using `sdr-followup-2hr` playbook
3. Queue for Customer Experience Lead review

**Cron: `0 8 * * 1-5` — Morning Lead Review**
1. List all open leads from past 24 hours
2. Re-score any with new data
3. Flag leads that need same-day outreach
4. Draft priority list → internal memo

#### Escalation Paths
- Qualified lead ready for consult → notify `consultant` role user
- Unresponsive lead after 5 touches → escalate to Customer Experience Lead
- 360° member inquiry → immediately route to `ai_membership_success`

#### Human Handoff Points
- All outbound SMS/email is DRAFT ONLY — Customer Experience Lead approves queue
- Consultation booking: Customer Experience Lead confirms and sends calendar invite

---

### AI Membership Success
**Seat ID:** `ai_membership_success`
**Type:** AI
**Parent:** `ai_sdr`

#### Mission
Own the 360° membership pipeline. Convert service customers to annual members, handle member renewals, and maximize member lifetime value.

#### Decision Matrix
- If customer has active 360° membership → proactive annual value review
- If member's annual date is within 60 days → start renewal campaign
- If member has 0 visits this year → trigger re-engagement sequence
- If member cancels → route to Customer Experience Lead for save attempt

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| member_retention_rate | Member Retention Rate | 80 | null | % | quarterly |
| member_upgrade_rate | Member Tier Upgrade Rate | 10 | null | % | quarterly |
| annual_value_per_member | Avg Annual Value per Member | 2400 | null | $ | quarterly |
| renewal_outreach_on_time | Renewals Outreached On Time | 100 | null | % | monthly |

#### SOPs

**Trigger: `threeSixty.membership.created`**
1. Send welcome sequence using `membership-welcome` playbook
2. Schedule 30-day check-in cron task
3. Log in pipeline events

**Cron: `0 9 * * 1` — Weekly Membership Health Review**
1. Pull all active memberships
2. Flag: renewal due within 60 days, 0 visits in 90 days, open service requests
3. Draft personalized outreach for each flagged member
4. Queue for Customer Experience Lead

**Trigger: `threeSixty.membership.renewal_due`**
1. Draft renewal proposal email using `membership-renewal` playbook
2. Calculate member's annual savings/value delivered
3. Queue for human send

#### Escalation
- Cancellation request → immediately escalate to Customer Experience Lead (HUMAN)
- Billing dispute → escalate to AI Cash Flow + Customer Experience Lead

---

### Customer Experience Lead
**Seat ID:** `cx_lead`
**Type:** human
**Parent:** `ai_sdr`

#### Mission
Human quality gate for all customer-facing communications. Reviews AI drafts, books consultations, handles escalations, and ensures every customer interaction reflects Handy Pioneers' brand voice.

#### SOPs
- Daily: review and approve/edit all AI draft queue (target < 2 hours)
- Weekly: spot-check 5 random AI-sent communications for brand compliance
- For every complaint: respond within 1 business hour, log in pipeline events

#### Human Handoff Points
- Approves all AI-drafted customer SMS/emails
- Owns consultation booking calendar
- Sole responder for complaints and cancellation saves

---

## Department Head SOPs
`ai_sdr` runs the department. Weekly: compile lead funnel metrics, identify pipeline gaps, report to Integrator.

## Failure Modes
- Response time > 2 hours → auto-alert Customer Experience Lead + Integrator
- Lead score system error → default all leads to human review
- Membership webhook missed → nightly reconciliation cron catches gaps

## Hard Stops
- No direct financial commitments to customers without human approval
- No booking confirmations without Customer Experience Lead sign-off
- No lead scoring data shared externally

## Tool Authorization
`ai_sdr`, `ai_membership_success`:
- `playbooks.fetch`, `playbooks.list`
- `notifications.create` (draft, internal)
- `customers.read`
- `opportunities.read`, `opportunities.update` (stage only)
- `threeSixty.read`
- `pipelineEvents.create`

## Initial Playbook Library

### Playbook: SDR First Touch SMS
**Slug:** `sdr-first-touch-sms`
**Category:** sms
**Owner:** `ai_sdr`
**Variables:** `{{customerFirstName}}`, `{{serviceType}}`, `{{estimatedRange}}`

Hi {{customerFirstName}}, thanks for reaching out to Handy Pioneers! We specialize in {{serviceType}} and would love to help. Can I ask a quick question about your project?

---

### Playbook: SDR First Touch Email
**Slug:** `sdr-first-touch-email`
**Category:** email
**Owner:** `ai_sdr`
**Variables:** `{{customerFirstName}}`, `{{serviceType}}`, `{{propertyAddress}}`

Subject: Your {{serviceType}} request — Handy Pioneers

Hi {{customerFirstName}},

Thanks for reaching out! I've reviewed your request for {{serviceType}} at {{propertyAddress}} and would love to connect.

Could you share a bit more about what you're hoping to accomplish? I want to make sure we put together the right solution for you.

Best,
The Handy Pioneers Team

---

### Playbook: SDR Follow-Up 2 Hour
**Slug:** `sdr-followup-2hr`
**Category:** sms
**Owner:** `ai_sdr`
**Variables:** `{{customerFirstName}}`

Hi {{customerFirstName}}, just following up on your request to Handy Pioneers! Still here if you have questions. — HP Team

---

### Playbook: Membership Welcome
**Slug:** `membership-welcome`
**Category:** email
**Owner:** `ai_membership_success`
**Variables:** `{{customerFirstName}}`, `{{membershipTier}}`, `{{annualDate}}`, `{{laborBankBalance}}`

Subject: Welcome to Handy Pioneers 360°, {{customerFirstName}}!

Hi {{customerFirstName}},

You're officially a {{membershipTier}} member! Here's what happens next:

- Your labor bank balance: **${{laborBankBalance}}**
- Annual review date: **{{annualDate}}**
- Portal access: log in at any time to track your home's health

We'll reach out to schedule your first walkthrough — you're in great hands.

— The HP Team

---

### Playbook: Membership Renewal
**Slug:** `membership-renewal`
**Category:** email
**Owner:** `ai_membership_success`
**Variables:** `{{customerFirstName}}`, `{{membershipTier}}`, `{{valueDelivered}}`, `{{renewalDate}}`, `{{renewalRate}}`

Subject: Your Handy Pioneers 360° renewal is coming up

Hi {{customerFirstName}},

Your membership renews on **{{renewalDate}}**. Here's a quick look at what we've delivered this year:

**Value Delivered:** ${{valueDelivered}}

Ready to renew at {{renewalRate}}/year? Reply YES to confirm, or let's talk if you'd like to adjust your tier.

— HP Team

---

## Phase 2 — 3-Teammate Sub-Teams (Visionary Console)

Sales is split into three sub-teams that execute customer-facing work in parallel. Each sub-team has three seats — frontend (drafts/), backend (data/), QA (audits/) — and follows the same three rules.

### The Three Rules

1. **Own Territory** — frontend writes only to `drafts/` (customer-facing copy), backend writes only to `data/` (research, calculations, history), QA writes only to `audits/` (voice, fact, margin, policy reviews). Cross-territory writes are rejected by `team_writeArtifact` and logged to `agent_team_violations`.
2. **Direct Messages** — teammates DM each other via `team_sendDirectMessage(toSeatName, body)` to coordinate. The team lead does not see this chatter; only the synthesized output. `team_readMessages` filters to messages addressed to the caller plus broadcasts.
3. **Start Parallel** — the coordinator (`teamCoordinator.executeTeamTask`) fans out to all three teammates simultaneously via `Promise.all`. No teammate's claim blocks another. Each independently writes to its own territory; the synthesis step composes the final output.

### Sub-Team 1: Lead Nurturer

**Team ID:** `sales/Lead Nurturer`
**Mission:** Customer-facing nurture — drafts SMS/email/call scripts, pulls customer history + scheduling, audits voice + escalation triggers.

| Seat | Role | Territory | Key tools |
|------|------|-----------|-----------|
| `ai_lead_nurturer_frontend` | frontend | drafts/ | customers.get, opportunities.list, team.* |
| `ai_lead_nurturer_backend`  | backend  | data/   | customers.get, opportunities.list, scheduling.listSlots, team.* |
| `ai_lead_nurturer_qa`       | qa       | audits/ | customers.get, opportunities.get, team.* |

### Sub-Team 2: Project Estimator

**Team ID:** `sales/Project Estimator`
**Mission:** Estimate authoring — scope narrative + price range presentation, cost calculation with margin floor enforcement, confidence-tier audit.

| Seat | Role | Territory | Key tools |
|------|------|-----------|-----------|
| `ai_project_estimator_frontend` | frontend | drafts/ | opportunities.get, team.* |
| `ai_project_estimator_backend`  | backend  | data/   | opportunities.get, invoices.query, team.* |
| `ai_project_estimator_qa`       | qa       | audits/ | opportunities.get, team.* |

**Cost rules (Backend enforces, QA validates):**
- Internal labor: $150/hr
- Subcontractor cost × 1.5
- Materials × markup (default 1.4)
- Hard margin floor: 30% gross margin (40% on small jobs under $2,000 hard cost)

### Sub-Team 3: Membership Success

**Team ID:** `sales/Membership Success`
**Mission:** Path A → Path B continuity — outreach drafts (no hard sell), upsell-window detection, cadence/voice audit.

| Seat | Role | Territory | Key tools |
|------|------|-----------|-----------|
| `ai_membership_success_frontend` | frontend | drafts/ | customers.get, opportunities.list, team.* |
| `ai_membership_success_backend`  | backend  | data/   | customers.get, opportunities.list, opportunities.get, invoices.query, team.* |
| `ai_membership_success_qa`       | qa       | audits/ | customers.get, team.* |

### Cross-Department Handoffs (auto-accept)

When the Sales sub-team produces an outcome that should escalate cross-department, it (or the Integrator on its behalf) calls `agentTeams_proposeHandoff(fromTeamId, toTeamId, eventType, payload)`:

- `sales.estimate_approved` — auto-accepted by Operations; creates a dispatch task on the Operations team.

### Voice Rules (apply to every Sales sub-team draft)

- Refer to customers as "Owners" or by name; never "homeowners," "clients," "leads."
- **Forbidden vocab:** handyman, cheap, affordable, easy, fix, repair, best, save, discount, limited time, deal.
- Frame outcomes as stewardship of the home, not transactions.
- Identity-first: address the Owner by name in every personalized comm.
- 360° members get continuity-tone outreach; non-members get an invitation to consultation.
