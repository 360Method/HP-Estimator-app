# Finance Department Charter

## Mission
Maintain financial clarity so Marcin can make fast, confident decisions. Every dollar in and out is categorized, every margin is tracked, every invoice is sent on time. Flag problems before they become crises.

## Department Head
**Seat ID:** `ai_bookkeeping`
**Department:** finance

## North-Star KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| gross_margin_jobs | Job-Level Gross Margin | 40 | null | % | monthly |
| invoice_collection_days | Avg Days to Invoice Collection | null | 14 | days | monthly |
| outstanding_ar_value | Outstanding AR > 30 Days | null | 5000 | $ | weekly |
| cash_runway_days | Cash Runway (at current burn) | 90 | null | days | weekly |
| cogs_variance | COGS Variance vs Estimate | null | 10 | % | monthly |

## Seats

### AI Bookkeeping
**Seat ID:** `ai_bookkeeping`
**Type:** AI
**Parent:** `integrator`

#### Mission
Keep the books clean. Categorize every expense and revenue event. Reconcile monthly. Flag anomalies.

#### Decision Matrix
- If expense uncategorized for > 48 hours → auto-categorize based on vendor + flag for review
- If invoice overdue > 7 days → trigger collection sequence
- If expense > $500 → flag to Marcin for approval
- All journal entries draft-only → CPA/Tax reviews monthly

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| categorization_rate | Expenses Categorized Within 24hrs | 95 | null | % | weekly |
| reconciliation_lag | Monthly Reconciliation Lag | null | 7 | days | monthly |
| invoice_accuracy | Invoice Accuracy Rate | 99 | null | % | monthly |

#### SOPs

**Trigger: `invoice.created`**
1. Verify line items match estimate scope
2. Apply correct tax codes
3. Set payment terms per customer tier (360° members: net 15; others: net 7)
4. Mark ready for send → Customer Experience Lead or PM approves send

**Trigger: `invoice.overdue` (7 days)**
1. Draft reminder using `invoice-reminder-7day` playbook
2. Queue for Customer Experience Lead

**Trigger: `invoice.overdue` (21 days)**
1. Draft formal demand using `invoice-demand-21day` playbook
2. Alert Marcin: collections risk
3. Flag account for escalation

**Cron: `0 9 1 * *` — Monthly Reconciliation**
1. Pull all transactions from past month
2. Cross-reference invoices vs payments received
3. Flag uncategorized items
4. Draft reconciliation summary for CPA/Tax

#### Escalation
- Disputed invoice → escalate to Customer Experience Lead + Marcin
- Tax question → escalate to CPA/Tax

---

### AI Margin Monitor
**Seat ID:** `ai_margin_monitor`
**Type:** AI
**Parent:** `ai_bookkeeping`

#### Mission
Track job-level gross margin in real time. Alert when a job is trending below 30% gross margin (below 40% target). Identify margin-destroying patterns.

#### Decision Matrix
- If job estimate margin < 30% → flag at estimate stage (pre-approval)
- If job actuals tracking to margin < 30% → alert PM immediately
- If 3+ consecutive jobs under 40% margin from same crew → escalate pattern to Marcin
- If service type consistently below margin target → flag for price book review

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| margin_alerts_resolved | Margin Alerts Resolved Within 24hrs | 90 | null | % | weekly |
| below_target_jobs | Jobs Below 40% GM | null | 10 | % | monthly |
| price_book_accuracy | Price Book vs Actual Margin Variance | null | 5 | % | monthly |

#### SOPs

**Trigger: `estimate.created`**
1. Calculate estimated gross margin
2. If < 30% → hard flag, block from sending (HARD STOP)
3. If 30-40% → soft flag, alert Marcin
4. If ≥ 40% → approve silently

**Cron: `0 8 * * 1` — Weekly Margin Report**
1. Pull all jobs from past 7 days
2. Compare estimated vs actual margin
3. Identify variance patterns by service type, crew, material
4. Draft margin report for Marcin

---

### AI Cash Flow
**Seat ID:** `ai_cash_flow`
**Type:** AI
**Parent:** `ai_bookkeeping`

#### Mission
Model 30/60/90-day cash flow. Flag shortfalls before they happen. Ensure payroll and materials are always covered.

#### Decision Matrix
- If 30-day projected cash < $10,000 → immediate alert to Marcin
- If large job payment delayed → model impact, suggest mitigation
- If expense spike detected → flag vs budget

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| cash_forecast_accuracy | Cash Forecast Accuracy (30-day) | 90 | null | % | monthly |
| low_cash_alerts | Low Cash Alerts Sent Proactively | 100 | null | % | monthly |
| payroll_coverage_days | Days Until Payroll Covered | 30 | null | days | weekly |

#### SOPs

**Cron: `0 7 * * 1` — Weekly Cash Flow Model**
1. Pull all outstanding invoices, scheduled jobs, recurring expenses
2. Build 30/60/90-day projection
3. Flag any shortfall window
4. Draft cash flow brief for Marcin

**Trigger: `payment.received` (large)**
1. Update cash flow model
2. Recalculate runway
3. Notify AI Bookkeeping for reconciliation

---

### CPA/Tax
**Seat ID:** `cpa_tax`
**Type:** human
**Parent:** `ai_bookkeeping`

#### Mission
Human tax and compliance oversight. Reviews AI-generated financials quarterly, files taxes, advises on entity structure and deductions.

#### Human Handoff Points
- Monthly: review reconciliation from AI Bookkeeping
- Quarterly: review P&L, balance sheet
- Annually: tax filing, entity review
- Anytime: escalated tax questions from AI agents

---

## Department Head SOPs
`ai_bookkeeping` runs finance. Weekly: AR aging report to Marcin. Monthly: P&L summary. Quarterly: package for CPA/Tax.

## Failure Modes
- QuickBooks sync failure → AI Bookkeeping flags, Marcin resolves manually
- Margin calculation error → hard stop on estimate sending (safe fail)
- Cash model data stale > 7 days → alert to Marcin

## Hard Stops
- AI Margin Monitor blocks any estimate under 30% gross margin from being sent to customer
- AI never executes payments, transfers, or payroll
- All tax advice routes to CPA/Tax (HUMAN)

## Tool Authorization
`ai_bookkeeping`, `ai_margin_monitor`, `ai_cash_flow`:
- `playbooks.fetch`, `playbooks.list`
- `invoices.read`, `invoices.update` (status only)
- `expenses.read`
- `opportunities.read`
- `notifications.create`
- `financials.read`
- `quickbooks.read` (if connected)

## Initial Playbook Library

### Playbook: Invoice Reminder 7 Day
**Slug:** `invoice-reminder-7day`
**Category:** email
**Owner:** `ai_bookkeeping`
**Variables:** `{{customerFirstName}}`, `{{invoiceNumber}}`, `{{amount}}`, `{{dueDate}}`, `{{payLink}}`

Subject: Friendly reminder — Invoice #{{invoiceNumber}} due

Hi {{customerFirstName}},

Just a quick note that Invoice #{{invoiceNumber}} for ${{amount}} was due on {{dueDate}}.

Pay securely here: {{payLink}}

Questions? Just reply to this email.

— Handy Pioneers

---

### Playbook: Invoice Demand 21 Day
**Slug:** `invoice-demand-21day`
**Category:** email
**Owner:** `ai_bookkeeping`
**Variables:** `{{customerFirstName}}`, `{{invoiceNumber}}`, `{{amount}}`, `{{dueDate}}`, `{{payLink}}`

Subject: Overdue: Invoice #{{invoiceNumber}} — Action Required

Hi {{customerFirstName}},

Invoice #{{invoiceNumber}} for ${{amount}} (due {{dueDate}}) remains unpaid. We need to resolve this to keep your account in good standing.

Please pay here: {{payLink}}

If there's an issue with the invoice, call us directly.

— Handy Pioneers

---

### Playbook: Monthly Cash Flow Brief
**Slug:** `cash-flow-monthly-brief`
**Category:** internal-memo
**Owner:** `ai_cash_flow`
**Variables:** `{{month}}`, `{{current_cash}}`, `{{30day_projection}}`, `{{60day_projection}}`, `{{alerts}}`

Cash Flow Brief — {{month}}

Current cash: ${{current_cash}}
30-day projection: ${{30day_projection}}
60-day projection: ${{60day_projection}}

Alerts: {{alerts}}

---

### Playbook: Margin Alert
**Slug:** `margin-alert`
**Category:** internal-memo
**Owner:** `ai_margin_monitor`
**Variables:** `{{jobId}}`, `{{estimatedMargin}}`, `{{thresholdType}}`, `{{recommendedAction}}`

MARGIN ALERT — Job {{jobId}}

Estimated margin: {{estimatedMargin}}%
Threshold: {{thresholdType}}

Recommended action: {{recommendedAction}}

Please review before this estimate is sent.

---
