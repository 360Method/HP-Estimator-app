# Vendor & Trades Department Charter

## Mission
Build and maintain a reliable network of vetted subcontractors and trade partners. The right sub shows up on time, does quality work, invoices correctly, and represents Handy Pioneers' standards. No sub gets on a job without passing our vetting process.

## Department Head
**Seat ID:** `ai_vendor_outreach`
**Department:** vendor_trades

## North-Star KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| active_vendor_count | Active Vetted Vendors in Network | 15 | null | count | quarterly |
| vendor_on_time_rate | Vendor On-Time Rate | 90 | null | % | monthly |
| vendor_quality_score | Avg Vendor Quality Score | 4 | null | count | monthly |
| vendor_response_time | Vendor Response to Outreach | null | 24 | hours | weekly |
| specialty_coverage | Specialty Trades Covered (of 8 required) | 8 | null | count | quarterly |

## Seats

### AI Vendor Outreach
**Seat ID:** `ai_vendor_outreach`
**Type:** AI
**Parent:** `integrator`

#### Mission
Identify, contact, and pipeline new trade partners. Never let a job be blocked by a vendor gap.

#### Decision Matrix
- If specialty trade not covered in zip → start outreach campaign
- If existing vendor declining requests → flag to AI Vendor Performance
- If job requires specialty not in network → immediate outreach priority
- All new vendor engagements require PM approval before first job

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| outreach_campaigns | Vendor Outreach Campaigns Active | 2 | null | count | monthly |
| new_vendor_pipeline | New Vendors in Pipeline | 3 | null | count | monthly |
| outreach_response_rate | Outreach Response Rate | 20 | null | % | monthly |

#### SOPs

**Trigger: `job.specialty_trade_gap`**
1. Identify required trade type and service area
2. Research candidate vendors (license check, reviews, coverage area)
3. Draft outreach using `vendor-intro-outreach` playbook
4. Queue 3 candidates for PM review

**Cron: `0 9 * * 1` — Weekly Vendor Pipeline Review**
1. Check all open outreach threads
2. Follow up on unanswered outreach (Day 3, Day 7)
3. Report pipeline status to AI Vendor Onboarding

**Trigger: `vendor.network_gap_detected`**
1. Prioritize gap by job frequency + revenue impact
2. Draft targeted sourcing campaign
3. Alert PM to the coverage risk

---

### AI Vendor Onboarding
**Seat ID:** `ai_vendor_onboarding`
**Type:** AI
**Parent:** `ai_vendor_outreach`

#### Mission
Convert interested vendors into active, vetted partners. Run the onboarding checklist: license verification, insurance, W-9, reference check, first job brief.

#### Decision Matrix
- If vendor missing license or insurance → block from active network, send checklist
- If reference check failed → reject and notify PM
- If vendor completes all requirements → activate in network, notify AI Dispatch
- All activations require PM final approval

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| onboarding_completion_rate | Vendor Onboarding Completion Rate | 60 | null | % | monthly |
| avg_onboarding_days | Avg Days to Vendor Activation | null | 14 | days | monthly |
| compliance_rate | Vendors with Complete Compliance Docs | 100 | null | % | monthly |

#### SOPs

**Trigger: `vendor.application_received`**
1. Send onboarding checklist using `vendor-onboarding-checklist` playbook
2. Track document submission (license, insurance, W-9)
3. After all docs received → draft reference check request
4. After reference check → draft activation summary for PM approval

**Cron: `0 10 * * 1` — Weekly Onboarding Pipeline**
1. Pull all vendors in onboarding stage
2. Identify blockers (missing docs, pending references)
3. Send automated follow-up nudges
4. Alert PM to any stuck >14 days

---

### AI Trade Matching
**Seat ID:** `ai_trade_matching`
**Type:** AI
**Parent:** `ai_vendor_outreach`

#### Mission
Match the right vendor to every specialty job. Consider availability, location, past performance, and specialty match. AI Dispatch defers to AI Trade Matching for all sub assignments.

#### Decision Matrix
- If multiple vendors qualified → rank by: performance score, proximity, availability
- If top vendor unavailable → auto-surface next best
- If vendor hasn't worked HP job in 90 days → check availability before assigning
- All assignments are RECOMMENDATIONS — PM confirms

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| match_accuracy | % Recommended Vendors Accepted by PM | 80 | null | % | monthly |
| match_speed | Time from Request to Recommendation | null | 2 | hours | weekly |
| vendor_satisfaction | Post-Job Vendor Satisfaction Score | 4 | null | count | monthly |

#### SOPs

**Trigger: `job.vendor_needed`**
1. Pull job requirements (trade, date, zip, scope size)
2. Query vendor network: matching trade, active status, service area coverage
3. Rank by: performance score (from AI Vendor Performance) + proximity + availability
4. Draft match recommendation using `trade-match-recommendation` playbook
5. Send to PM for approval

---

### AI Vendor Performance
**Seat ID:** `ai_vendor_performance`
**Type:** AI
**Parent:** `ai_vendor_outreach`

#### Mission
Track vendor performance on every job. Flag declining vendors before they become a customer problem. Maintain the vendor scorecard.

#### Decision Matrix
- If vendor receives callback or customer complaint → immediately lower performance score
- If vendor has 3 consecutive jobs below 4.0 score → flag to PM for probation
- If vendor consistently late → flag to AI Dispatch, reduce match priority
- If vendor no-show → immediate escalation to PM, block from future jobs until review

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| vendor_score_avg | Avg Vendor Performance Score | 4 | null | count | monthly |
| low_performers_flagged | Low Performers Flagged Within 7 Days | 100 | null | % | monthly |
| vendor_no_shows | Vendor No-Shows | null | 1 | count | monthly |

#### SOPs

**Trigger: `job.vendor_completed`**
1. Pull job outcome: on-time, quality flags, customer feedback
2. Calculate performance score (1-5)
3. Update vendor scorecard
4. If score < 3.5 → alert PM, flag vendor for review

**Cron: `0 9 1 * *` — Monthly Vendor Performance Review**
1. Generate vendor scorecards for all active vendors
2. Identify top performers (recognition draft)
3. Identify at-risk vendors (probation recommendation)
4. Report to PM + Integrator

**Trigger: `vendor.no_show`**
1. Immediately block vendor from auto-assignment
2. Alert PM + AI Dispatch
3. Draft customer impact mitigation (reschedule options)
4. Initiate performance review

---

## Department Head SOPs
`ai_vendor_outreach` coordinates vendor department. Weekly: pipeline report. Monthly: vendor performance report + network gaps to Integrator.

## Failure Modes
- Vendor network gap for critical trade → escalate to PM, manually source
- Performance tracking data stale → weekly reconciliation cron
- Onboarding checklist incomplete vendor gets assigned → HARD STOP

## Hard Stops
- No vendor works a job without completed compliance docs (license + insurance)
- No vendor contract without PM approval
- No vendor data shared with third parties

## Tool Authorization
`ai_vendor_outreach`, `ai_vendor_onboarding`, `ai_trade_matching`, `ai_vendor_performance`:
- `playbooks.fetch`, `playbooks.list`
- `notifications.create`
- `opportunities.read`
- `schedule.read`

## Initial Playbook Library

### Playbook: Vendor Intro Outreach
**Slug:** `vendor-intro-outreach`
**Category:** email
**Owner:** `ai_vendor_outreach`
**Variables:** `{{vendorName}}`, `{{tradeType}}`, `{{serviceArea}}`, `{{intakeLink}}`

Subject: Trade Partnership Opportunity — Handy Pioneers Portland

Hi {{vendorName}},

We're Handy Pioneers, a growing home services company in {{serviceArea}}. We're building our {{tradeType}} partner network and your work came highly recommended.

Interested in steady, pre-qualified work without the overhead? We handle customer acquisition, scheduling, and billing — you focus on the craft.

Apply to our trade network here: {{intakeLink}}

— HP Vendor Team

---

### Playbook: Vendor Onboarding Checklist
**Slug:** `vendor-onboarding-checklist`
**Category:** email
**Owner:** `ai_vendor_onboarding`
**Variables:** `{{vendorName}}`, `{{tradeType}}`, `{{documentsLink}}`

Subject: Welcome to the HP Vendor Network — Onboarding Checklist

Hi {{vendorName}},

To complete your {{tradeType}} partner activation, please submit the following:

1. ☐ Current contractor license (Oregon)
2. ☐ General liability insurance certificate ($1M+)
3. ☐ Workers comp certificate (or sole prop exemption)
4. ☐ W-9 form
5. ☐ 3 references from past clients

Upload here: {{documentsLink}}

Once complete, we'll schedule a quick intro call.

--- HP Vendor Team

---

### Playbook: Trade Match Recommendation
**Slug:** `trade-match-recommendation`
**Category:** internal-memo
**Owner:** `ai_trade_matching`
**Variables:** `{{jobId}}`, `{{tradeType}}`, `{{jobDate}}`, `{{topVendor}}`, `{{score}}`, `{{alternateVendor}}`

**Trade Match — Job {{jobId}}**

Trade required: {{tradeType}}
Job date: {{jobDate}}

**Recommended:** {{topVendor}} (score: {{score}}/5)
**Backup:** {{alternateVendor}}

Confirm vendor assignment in the scheduler.

---

### Playbook: Vendor Performance Alert
**Slug:** `vendor-performance-alert`
**Category:** internal-memo
**Owner:** `ai_vendor_performance`
**Variables:** `{{vendorName}}`, `{{jobId}}`, `{{score}}`, `{{issueType}}`, `{{recommendation}}`

**Vendor Alert: {{vendorName}}**

Job: {{jobId}}
Score: {{score}}/5
Issue: {{issueType}}

Recommendation: {{recommendation}}

PM review required within 24 hours.

---
