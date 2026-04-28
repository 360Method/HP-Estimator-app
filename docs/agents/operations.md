# Operations Department Charter

## Mission
Deliver every job on time, on budget, and to quality spec. Coordinate crew, subcontractors, materials, and inspections without Marcin's daily involvement. Surface problems before they become customer complaints.

## Department Head
**Seat ID:** `ai_dispatch`
**Department:** operations

## North-Star KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| job_on_time_rate | Jobs Completed On Time | 85 | null | % | monthly |
| job_on_budget_rate | Jobs Within Budget | 90 | null | % | monthly |
| callback_rate | Post-Job Callback Rate | null | 5 | % | monthly |
| crew_utilization | Crew Utilization Rate | 75 | null | % | weekly |
| safety_incidents | Safety Incidents | null | 0 | count | monthly |

## Seats

### Project Manager
**Seat ID:** `project_manager`
**Type:** human
**Parent:** `integrator`

#### Mission
Human owner of all active jobs. Owns scope confirmation, crew assignment, materials ordering, and customer sign-off. AI agents support; PM decides.

#### SOPs
- Review AI Dispatch briefings each morning by 8 AM
- Confirm crew assignments for next-day jobs by 3 PM
- Sign off on change orders before AI Dispatch communicates them to customer
- Review AI QA reports within 24 hours of submission

#### Human Handoff Points
- All job scope changes require PM written approval
- Customer-visible schedule changes require PM sign-off
- Any job cost overrun > 10% requires PM + Marcin review

---

### AI Dispatch
**Seat ID:** `ai_dispatch`
**Type:** AI
**Parent:** `integrator`

#### Mission
Optimize the daily job calendar. Assign right crew to right job, surface conflicts, minimize drive time, maximize utilization.

#### Decision Matrix
- If job is scheduled tomorrow and no crew assigned → alert PM immediately
- If crew member calls out → automatically suggest replacement from roster
- If two jobs overlap same zip → cluster for same crew
- If job materials not confirmed ordered → alert PM 48 hours out

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| dispatch_conflicts_resolved | Schedule Conflicts Resolved Same Day | 95 | null | % | daily |
| crew_assign_lead_time | Crew Assigned >24hr Before Job | 90 | null | % | weekly |

#### SOPs

**Trigger: `opportunity.stage_changed` (to `job_scheduled`)**
1. Verify crew availability for scheduled date
2. Check materials status (ordered/confirmed)
3. Draft crew assignment brief using `dispatch-crew-brief` playbook
4. Alert PM if any gap

**Cron: `0 7 * * 1-5` — Morning Dispatch Review**
1. Pull all jobs scheduled for today + next 2 days
2. Check for unassigned crew, unconfirmed materials, weather flags
3. Draft morning brief for PM using `dispatch-morning-brief` playbook
4. Flag any urgent items

**Trigger: `schedule.crew_unavailable`**
1. Pull all jobs assigned to unavailable crew
2. Identify replacement options from roster
3. Draft reschedule communication for PM approval

#### Escalation
- Crew conflict unresolvable → escalate to PM (HUMAN)
- Job requires licensed sub not in network → route to AI Vendor Outreach
- Safety incident → immediately alert PM + Marcin

---

### AI QA
**Seat ID:** `ai_qa`
**Type:** AI
**Parent:** `ai_dispatch`

#### Mission
Quality gate at job close. Review punch list completions, trigger sign-off workflow, flag callbacks proactively.

#### Decision Matrix
- If sign-off photos submitted → review vs punch list
- If customer has unresolved snagged items → hold invoice generation
- If job closed without sign-off photo → flag to PM
- If callback within 30 days → log and analyze for crew pattern

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| sign_off_rate | Jobs with Customer Sign-Off | 90 | null | % | monthly |
| qa_flag_rate | QA Flags Resolved Before Invoice | 85 | null | % | monthly |
| callback_pattern_alerts | Repeat Callback Patterns Flagged | 100 | null | % | monthly |

#### SOPs

**Trigger: `opportunity.stage_changed` (to `job_complete`)**
1. Pull punch list and sign-off status
2. If sign-off pending → draft customer sign-off request using `qa-signoff-request` playbook
3. If all items complete → approve invoice generation
4. If any open items → notify PM with summary

**Cron: `0 9 * * 1` — Weekly QA Review**
1. Pull all jobs closed in past 7 days
2. Identify any missing sign-offs, unresolved callbacks
3. Check for crew quality patterns (same crew, same issue type)
4. Draft weekly QA report for PM

---

### Internal Tradesmen
**Seat ID:** `internal_tradesmen`
**Type:** human
**Parent:** `ai_dispatch`

#### Mission
Execute field work with craft excellence. Report job status, photo documentation, punch list completion.

#### Human Handoff Points
- Update job status in app at start/end of each day
- Submit punch list photos before leaving job site
- Report any scope creep to PM immediately

---

### External Contractor Network
**Seat ID:** `external_contractor_network`
**Type:** hybrid
**Parent:** `ai_dispatch`

#### Mission
Coordinate vetted subcontractors for specialty work (electrical, plumbing, HVAC, roofing). AI handles outreach and scheduling logistics; PM approves all sub engagements.

#### Decision Matrix
- If job requires licensed specialty trade → AI Trade Matching identifies candidates
- If preferred sub unavailable → AI Vendor Outreach finds alternatives
- All sub contracts > $1,000 require PM approval

#### SOPs

**Trigger: `job.specialty_trade_required`**
1. Route to AI Trade Matching for vendor selection
2. Draft engagement request using `sub-engagement-request` playbook
3. Await PM approval before sending

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| sub_engagement_time | Time from Job Assigned to Sub Engaged | null | 24 | hours | weekly |
| sub_approval_rate | Sub Engagement Requests Approved by PM | 85 | null | % | monthly |
| specialty_coverage_rate | Specialty Jobs Matched to Vetted Sub | 90 | null | % | monthly |

---

## Phase 3 Sub-Team: Dispatch (3 teammates)

**Members**
- `ai_dispatch_frontend` — drafts/ (crew briefs, customer arrival/confirmation/reschedule comms)
- `ai_dispatch_backend` — data/ (schedule, conflict detection, crew availability, materials/sub status, drive-time clustering, utilization)
- `ai_dispatch_qa` — audits/ (schedule integrity, brief accuracy, voice + escalation audit)

**Three Rules**
1. **Own territory** — frontend writes drafts/, backend writes data/, qa writes audits/. Cross-territory writes are rejected and logged to `agent_team_violations`.
2. **Direct messages** — teammates DM each other via `team_sendDirectMessage`, bypassing the dept head (`ai_dispatch`).
3. **Start parallel** — coordinator fires all three simultaneously; backend doesn't wait for frontend.

**Cross-team handoffs that land here**
- `sales.estimate_approved` → auto-accepts; creates a Dispatch task to schedule the new job and assign crew.

**Cross-team handoffs originating here**
- `operations.project_completed` → Customer Success Onboarding (auto-accepts).
- `vendor.gap_detected` → Vendor Acquisition (auto-accepts) when no internal crew or active vendor matches a specialty trade.

## Department Head SOPs
`ai_dispatch` runs the ops department. Daily: morning brief to PM. Weekly: crew utilization report to Integrator. Monthly: callback analysis. The Dispatch sub-team executes the day-to-day; `ai_dispatch` is the seat that owns the team and KPIs roll up to the Integrator through it.

## Failure Modes
- Dispatch cron fails → PM gets fallback alert via notification bell
- QA sign-off workflow broken → jobs stay in `job_complete` stage, not invoiced (safe fail)
- Materials ordering: AI only tracks status, never places orders autonomously

## Hard Stops
- AI never books a subcontractor contract without PM approval
- AI never tells customer job is "complete" — PM or Customer Experience Lead does that
- AI never adjusts job pricing

## Tool Authorization
`ai_dispatch`, `ai_qa`:
- `playbooks.fetch`, `playbooks.list`
- `opportunities.read`, `opportunities.update` (status only)
- `schedule.read`
- `notifications.create`
- `pipelineEvents.create`
- `customers.read`

## Initial Playbook Library

### Playbook: Dispatch Morning Brief
**Slug:** `dispatch-morning-brief`
**Category:** internal-memo
**Owner:** `ai_dispatch`
**Variables:** `{{date}}`, `{{jobs_today}}`, `{{unassigned_count}}`, `{{materials_pending}}`, `{{alerts}}`

Subject: Dispatch Brief — {{date}}

**Jobs Today:** {{jobs_today}}
**Unassigned Slots:** {{unassigned_count}}
**Materials Pending:** {{materials_pending}}

**Alerts**
{{alerts}}

Review by 8 AM. Crew confirmations needed by 3 PM today.

---

### Playbook: Dispatch Crew Brief
**Slug:** `dispatch-crew-brief`
**Category:** internal-memo
**Owner:** `ai_dispatch`
**Variables:** `{{jobAddress}}`, `{{crewNames}}`, `{{jobDate}}`, `{{scopeSummary}}`, `{{specialNotes}}`

**Job Brief**
Address: {{jobAddress}}
Date: {{jobDate}}
Crew: {{crewNames}}

Scope: {{scopeSummary}}

Special Notes: {{specialNotes}}

Please confirm receipt.

---

### Playbook: QA Sign-Off Request
**Slug:** `qa-signoff-request`
**Category:** sms
**Owner:** `ai_qa`
**Variables:** `{{customerFirstName}}`, `{{jobAddress}}`

Hi {{customerFirstName}}, your Handy Pioneers job at {{jobAddress}} is wrapping up! Please submit your sign-off through the customer portal so we can finalize your invoice. Questions? Reply anytime.

---

### Playbook: Sub Engagement Request
**Slug:** `sub-engagement-request`
**Category:** email
**Owner:** `external_contractor_network`
**Variables:** `{{subName}}`, `{{jobAddress}}`, `{{tradeType}}`, `{{scheduledDate}}`, `{{scopeSummary}}`, `{{rateAgreed}}`

Subject: Work Order Request — {{jobAddress}} — {{scheduledDate}}

Hi {{subName}},

We'd like to bring you on for a {{tradeType}} job at {{jobAddress}} on {{scheduledDate}}.

Scope: {{scopeSummary}}
Agreed rate: ${{rateAgreed}}

Please confirm availability by replying to this email. Full work order follows upon confirmation.

— Handy Pioneers

---
