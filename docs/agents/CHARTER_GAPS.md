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

**Action needed:** Add a `#### KPIs` table to the `external_contractor_network`
section in `docs/agents/operations.md`, then re-run `node scripts/seed-charters.mjs`.

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

**Suggested playbook to define (Marcin approves content/format):**

```markdown
### Playbook: Paid Ad Daily Brief
**Slug:** `paid-ad-daily-brief`
**Category:** internal-memo
**Owner:** `ai_paid_ads`
**Variables:** `{{date}}`, `{{campaigns}}`, `{{total_spend}}`, `{{cpl}}`, `{{flags}}`

Paid Ad Brief — {{date}}

Campaigns: {{campaigns}}
Total spend: {{total_spend}}
Avg CPL: {{cpl}}

Flags: {{flags}}
```

**Action needed:** Add the above playbook block to the Initial Playbook Library
section of `docs/agents/marketing.md`, then re-run `node scripts/seed-charters.mjs`.

---

## Expected result after fixes

All 9 departments → green dot. Currently 7/9 are green after the `deptStatus()`
fix that excludes `disabled` human seats from the operational check.
