# Charter Gaps — Needs Marcin Input

Generated: 2026-04-25

Two AI seats are missing charter content that cannot be generated without
operator decisions. These are the only two gaps preventing all 9 department
dots from turning green.

---

## Gap 1 — `external_contractor_network` (Operations dept) — Missing KPIs

**Impact:** Operations dept shows yellow dot.

**Current state:** Seat has a charter, 1 playbook (`sub-engagement-request`),
and 1 event subscription (`job.specialty_trade_required`). But `kpiCount = 0`
because the charter doc (`docs/agents/operations.md`) has no `#### KPIs`
section under the External Contractor Network seat.

**What the SOP says the seat does:**
- Routes specialty trade jobs to vetted subcontractors
- Drafts sub-engagement requests (AI role)
- All sub contracts > $1,000 require PM approval

**Suggested KPIs to define (Marcin decides targets):**

| Candidate key | Candidate label | Unit | Period |
|---------------|----------------|------|--------|
| `sub_engagement_time` | Time from job assigned to sub engaged | hours | weekly |
| `sub_approval_rate` | Sub engagement requests approved by PM | % | monthly |
| `specialty_coverage_rate` | Specialty jobs covered by vetted sub (vs declined) | % | monthly |

---

## DRAFT — Marcin to approve

Add this block to `docs/agents/operations.md` under the `### External Contractor Network` section, immediately after the `#### SOPs` block:

```markdown
#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| sub_engagement_time | Time from Job Assigned to Sub Engaged | null | 24 | hours | weekly |
| sub_approval_rate | Sub Engagement Requests Approved by PM | 85 | null | % | monthly |
| specialty_coverage_rate | Specialty Jobs Matched to Vetted Sub | 90 | null | % | monthly |
```

**Notes on targets:**
- `sub_engagement_time < 24h` — matches the charter SOP expectation that PM gets notified same day; adjust if typical subs take longer to respond
- `sub_approval_rate > 85%` — measures quality of AI's sub-selection; lower than 85% means AI is routing to wrong vendors
- `specialty_coverage_rate > 90%` — measures network breadth; if <90%, the contractor network needs expansion

After adding, run: `node scripts/seed-charters.mjs`

---

## Gap 2 — `ai_paid_ads` (Marketing dept) — Missing Playbook

**Impact:** Marketing dept shows yellow dot.

**Current state:** Seat has 3 KPIs and 2 SOPs (daily ad check, weekly review).
SOPs reference "Draft daily ad brief for Marcin" and "Draft budget reallocation
recommendation" — but neither is defined in the charter's Initial Playbook Library.

**What the SOP says the seat drafts:**
- Daily ad performance brief
- Weekly campaign review summary
- Budget reallocation recommendation

---

## DRAFT — Marcin to approve

Add this block to `docs/agents/marketing.md` in the `## Initial Playbook Library` section (after the `brand-weekly-audit` playbook at the end of the file):

```markdown
### Playbook: Paid Ad Daily Brief
**Slug:** `paid-ad-daily-brief`
**Category:** internal-memo
**Owner:** `ai_paid_ads`
**Variables:** `{{date}}`, `{{campaigns}}`, `{{total_spend}}`, `{{cpl}}`, `{{flags}}`

Paid Ad Brief — {{date}}

| Campaign | Spend | Leads | CPL |
|----------|-------|-------|-----|
{{campaigns}}

**Total spend:** {{total_spend}}
**Avg CPL:** {{cpl}}

**Flags:**
{{flags}}

No action required if no flags. Reply to pause any campaign.

---

### Playbook: Budget Reallocation Recommendation
**Slug:** `budget-reallocation-rec`
**Category:** internal-memo
**Owner:** `ai_paid_ads`
**Variables:** `{{week_of}}`, `{{top_performer}}`, `{{underperformer}}`, `{{recommendation}}`, `{{projected_cpl_improvement}}`

Budget Reallocation — Week of {{week_of}}

**Top performer:** {{top_performer}}
**Underperformer:** {{underperformer}}

**Recommendation:** {{recommendation}}

Projected CPL improvement if approved: {{projected_cpl_improvement}}

ACTION: Reply "approve" to reallocate or "hold" to keep current budget.
```

After adding, run: `node scripts/seed-charters.mjs`

---

## Expected result after fixes

All 9 departments → green dot. Currently 7/9 are green after the `deptStatus()`
fix that excludes `disabled` human seats from the operational check.
