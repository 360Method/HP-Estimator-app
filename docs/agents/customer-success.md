# Customer Success Department Charter

## Mission
Turn every customer into a lifelong Handy Pioneers advocate. Onboard new members smoothly, deliver annual value reviews that justify renewal, and keep the nurture cadence alive between jobs. The best customer is one who never needs to shop around.

## Department Head
**Seat ID:** `ai_onboarding`
**Department:** customer_success

## North-Star KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| member_satisfaction_score | Member Satisfaction (CSAT) | 4.5 | null | count | quarterly |
| onboarding_completion_rate | Onboarding Completed Within 14 Days | 90 | null | % | monthly |
| annual_valuation_delivery_rate | Annual Valuations Delivered On Time | 95 | null | % | monthly |
| member_churn_rate | Member Churn Rate | null | 15 | % | quarterly |
| nurture_open_rate | Nurture Email Open Rate | 30 | null | % | monthly |

## Seats

### AI Onboarding
**Seat ID:** `ai_onboarding`
**Type:** AI
**Parent:** `integrator`

#### Mission
Make the first 30 days after signing feel magical. Guide new members through portal setup, baseline walkthrough scheduling, and first touchpoints.

#### Decision Matrix
- If member signed but no portal login in 7 days → send onboarding nudge
- If baseline walkthrough not scheduled in 14 days → escalate to Member Concierge
- If member has >3 unresolved punch list items → flag to AI QA + PM

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| portal_activation_rate | Members Activated Portal Within 7 Days | 80 | null | % | monthly |
| walkthrough_scheduled_rate | Baseline Walkthrough Scheduled Within 14 Days | 85 | null | % | monthly |
| onboarding_nps | Onboarding NPS Score | 50 | null | count | quarterly |

#### SOPs

**Trigger: `threeSixty.membership.created`**
1. Send welcome sequence (Day 0, Day 3, Day 7)
2. Draft portal activation link email using `onboarding-portal-activation` playbook
3. Remind about baseline walkthrough scheduling
4. Log in pipeline events

**Cron: `0 9 * * 1` — Weekly Onboarding Audit**
1. Pull all members in first 30 days
2. Check portal activation, walkthrough status
3. Flag stalled onboardings
4. Draft catch-up outreach for each

**Trigger: `portal.first_login`**
1. Send personalized welcome tip using `onboarding-portal-tip` playbook
2. Suggest first three features to explore

#### Escalation
- Member unresponsive for 14 days → Member Concierge (HUMAN)
- Onboarding complaint → Customer Experience Lead

---

### AI Annual Valuation
**Seat ID:** `ai_annual_valuation`
**Type:** AI
**Parent:** `ai_onboarding`

#### Mission
Deliver a compelling annual value report to every 360° member. Calculate ROI delivered, project future savings, and frame the renewal conversation.

#### Decision Matrix
- If membership anniversary within 60 days → start valuation prep
- If member has had major system work → highlight in valuation
- If labor bank under-utilized → recommend projects for next year

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| valuation_delivery_on_time | Valuations Delivered ≥14 Days Before Renewal | 95 | null | % | monthly |
| renewal_conversion_rate | Renewals Converted After Valuation | 70 | null | % | monthly |
| valuation_satisfaction | Valuation Report Satisfaction Score | 4 | null | count | quarterly |

#### SOPs

**Cron: `0 9 1 * *` — Monthly Anniversary Check**
1. Pull all members with anniversary in next 60 days
2. Pull their job history, labor bank usage, system health data
3. Draft valuation report using `annual-valuation-report` playbook
4. Queue for Member Concierge or Customer Experience Lead to deliver

**Trigger: `threeSixty.membership.anniversary_approaching`** (60 days out)
1. Compile member's year in review
2. Calculate value delivered (labor hours saved, issues prevented)
3. Draft renewal proposal
4. Route to AI Membership Success for renewal campaign

---

### AI Nurture Cadence
**Seat ID:** `ai_nurture_cadence`
**Type:** AI
**Parent:** `ai_onboarding`

#### Mission
Keep Handy Pioneers top-of-mind between jobs. Send relevant, personalized home care content. Never spam — every touch should add value.

#### Decision Matrix
- If member last contacted > 45 days → send seasonal home care tip
- If property has upcoming seasonal risk (winter, summer) → proactive alert
- If member hasn't requested service in 90 days → send "check-in" using appropriate cadence
- No more than 2 nurture contacts per month per customer

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| nurture_contacts_per_month | Avg Nurture Contacts Per Member Per Month | 1 | 2 | count | monthly |
| nurture_click_rate | Nurture Email Click Rate | 5 | null | % | monthly |
| nurture_to_booking_rate | Nurture Touches Leading to Booking | 5 | null | % | monthly |

#### SOPs

**Cron: `0 10 1 * *` — Monthly Nurture Calendar**
1. Pull all members with last-contact > 30 days
2. Segment by season, property type, membership tier
3. Draft personalized nurture emails using `nurture-seasonal-tip` playbook
4. Queue batch for Customer Experience Lead approval

**Trigger: `season.change`** (quarterly cron)
1. Generate seasonal home care checklist relevant to Portland climate
2. Draft newsletter using `nurture-seasonal-newsletter` playbook
3. Submit to AI Brand Guardian for tone review
4. Queue for Marcin approval

---

### Member Concierge
**Seat ID:** `member_concierge`
**Type:** human
**Parent:** `ai_onboarding`

#### Mission
White-glove human touchpoint for Gold-tier members. Handles complex requests, escalated issues, and VIP relationship management. Available to all members for onboarding escalations.

#### Human Handoff Points
- All Gold-tier member outreach is reviewed/delivered by Member Concierge
- Onboarding stalls after 14 days → Member Concierge takes over
- Cancellation save attempts → Member Concierge handles personally
- Annual valuation delivery for Gold members → Member Concierge presents

---

## Phase 3 Sub-Team: Onboarding (3 teammates)

**Members**
- `ai_onboarding_frontend` — drafts/ (Day 0/3/7/14 welcome cadence, portal-setup nudges, baseline-walkthrough invitations)
- `ai_onboarding_backend` — data/ (member tier, portal-activation state, baseline-walkthrough state, last-seen, prior path-A jobs)
- `ai_onboarding_qa` — audits/ (voice + cadence completeness + accuracy on portal/scheduling links)

**Three Rules** (own territory / DM teammates / start parallel) apply.

**Cross-team handoffs that land here**
- `operations.project_completed` → auto-accepts; creates an Onboarding task to nurture the customer post-job (continuity into membership where appropriate).

## Phase 3 Sub-Team: Annual Valuation (3 teammates)

**Members**
- `ai_annual_valuation_frontend` — drafts/ (annual value report email + renewal CTA, ~45 days before renewal)
- `ai_annual_valuation_backend` — data/ (jobs completed in membership year, labor-bank used, à-la-carte equivalent value, renewal date, tier)
- `ai_annual_valuation_qa` — audits/ (numbers accuracy + tone audit, no hard sell)

**Three Rules** apply.

**Cross-team handoffs originating here**
- `cs.member_renewed` → Sales Membership Success (auto-accepts) for upgrade-path follow-up.
- `cs.churn_risk_flagged` → Marketing Community & Reviews (auto-accepts) for testimonial-recovery outreach when valuation signals churn risk.

## Department Head SOPs
`ai_onboarding` coordinates Customer Success. Weekly: onboarding pipeline review. Monthly: retention report to Integrator. Quarterly: satisfaction survey launch. The two Phase 3 sub-teams (Onboarding, Annual Valuation) execute the day-to-day; `ai_nurture_cadence` remains a single specialist for between-job touchpoints.

## Failure Modes
- Nurture cadence over-frequency → hard cap at 2/month, AI enforces
- Valuation delivery missed → cron fallback alerts Member Concierge 7 days before deadline
- Portal activation tracking broken → weekly reconciliation against DB

## Hard Stops
- Nurture max 2 touches/month/member
- Gold-tier cancellation saves: HUMAN ONLY (Member Concierge)
- All outbound is draft-only pending human approval

## Tool Authorization
`ai_onboarding`, `ai_annual_valuation`, `ai_nurture_cadence`:
- `playbooks.fetch`, `playbooks.list`
- `customers.read`
- `threeSixty.read`
- `opportunities.read`
- `notifications.create`
- `pipelineEvents.create`
- `campaigns.read`

## Initial Playbook Library

### Playbook: Onboarding Portal Activation
**Slug:** `onboarding-portal-activation`
**Category:** email
**Owner:** `ai_onboarding`
**Variables:** `{{customerFirstName}}`, `{{portalLink}}`, `{{membershipTier}}`

Subject: Your Handy Pioneers portal is ready, {{customerFirstName}}!

Hi {{customerFirstName}},

Your {{membershipTier}} membership portal is live! Log in to track your home's health, schedule services, and access your documents:

{{portalLink}}

If you need help getting started, just reply — we're here.

— HP Team

---

### Playbook: Onboarding Portal Tip
**Slug:** `onboarding-portal-tip`
**Category:** email
**Owner:** `ai_onboarding`
**Variables:** `{{customerFirstName}}`, `{{tipTitle}}`, `{{tipContent}}`

Subject: Quick tip for your HP portal, {{customerFirstName}}

Hi {{customerFirstName}},

Welcome! Here's a quick tip to get started:

**{{tipTitle}}**
{{tipContent}}

More tips coming your way as you get settled in.

— HP Team

---

### Playbook: Annual Valuation Report
**Slug:** `annual-valuation-report`
**Category:** email
**Owner:** `ai_annual_valuation`
**Variables:** `{{customerFirstName}}`, `{{memberYear}}`, `{{valueDelivered}}`, `{{topProjects}}`, `{{laborBankUsed}}`, `{{recommendedNextYear}}`, `{{renewalLink}}`

Subject: Your year with Handy Pioneers — Annual Report

Hi {{customerFirstName}},

Here's a look at what we accomplished together in Year {{memberYear}}:

**Value Delivered:** ${{valueDelivered}}
**Top Projects:** {{topProjects}}
**Labor Bank Used:** ${{laborBankUsed}}

**Recommended for Next Year:**
{{recommendedNextYear}}

Ready to continue? Renew here: {{renewalLink}}

Thank you for trusting us with your home.

— HP Team

---

### Playbook: Nurture Seasonal Tip
**Slug:** `nurture-seasonal-tip`
**Category:** email
**Owner:** `ai_nurture_cadence`
**Variables:** `{{customerFirstName}}`, `{{season}}`, `{{tipTitle}}`, `{{tipContent}}`, `{{callToAction}}`

Subject: {{season}} home care tip from Handy Pioneers

Hi {{customerFirstName}},

**{{tipTitle}}**

{{tipContent}}

{{callToAction}}

— HP Team

---

### Playbook: Nurture Seasonal Newsletter
**Slug:** `nurture-seasonal-newsletter`
**Category:** email
**Owner:** `ai_nurture_cadence`
**Variables:** `{{season}}`, `{{year}}`, `{{topTips}}`, `{{featuredService}}`, `{{scheduleLink}}`

Subject: Your {{season}} Home Care Guide — {{year}}

**{{season}} is here — here's your checklist:**
{{topTips}}

**Featured this season:** {{featuredService}}

Schedule your {{season}} checkup: {{scheduleLink}}

---
