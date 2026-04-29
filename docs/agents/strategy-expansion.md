# Strategy & Expansion Department Charter

## Mission
Chart the path from Portland solo-operator to scalable regional brand. Research new markets, model expansion economics, and build the licensing/franchise playbook. Marcin leads strategy; AI agents do the research heavy lifting.

## Department Head
**Seat ID:** `ai_market_research`
**Department:** strategy_expansion

## North-Star KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| market_reports_delivered | Market Research Reports Delivered | 1 | null | count | monthly |
| expansion_markets_evaluated | Expansion Markets Evaluated | 4 | null | count | quarterly |
| licensing_leads | Licensing/Franchise Inquiries Qualified | 2 | null | count | quarterly |
| strategy_docs_current | Strategy Documents Updated Within 90 Days | 100 | null | % | quarterly |

## Seats

### AI Market Research
**Seat ID:** `ai_market_research`
**Type:** AI
**Parent:** `integrator`

#### Mission
Research and model new market opportunities. Competitor analysis, demographic data, home services market sizing, regulatory environment. Deliver research briefs Marcin can act on.

#### Decision Matrix
- If Marcin asks about a new city → build full market analysis within 7 days
- If competitor enters Portland market → draft competitive analysis within 48 hours
- If housing market data shows opportunity shift → flag to Marcin
- All research is draft deliverables → Marcin reviews and decides

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| research_turnaround | Market Brief Delivered Within SLA | 90 | null | % | monthly |
| research_actionability | Research Briefs Rated Actionable | 80 | null | % | monthly |
| competitive_intel_current | Competitive Intel Updated Within 90 Days | 100 | null | % | quarterly |

#### SOPs

**Trigger: `strategy.market_research_requested`**
1. Gather market data: population, median home value, competitor density
2. Model serviceable addressable market (SAM)
3. Research regulatory requirements (contractor licensing, bonding)
4. Draft market analysis using `market-analysis-brief` playbook
5. Submit to Marcin for review

**Cron: `0 9 1 * *` — Monthly Market Monitor**
1. Check for new competitor activity in Portland and target markets
2. Review housing market trends (permits, prices, inventory)
3. Update competitive intelligence document
4. Draft monthly market brief for Marcin

**Trigger: `competitor.new_entry`**
1. Research competitor: pricing, service areas, differentiators, reviews
2. Draft competitive response brief using `competitive-analysis` playbook
3. Route to Marcin within 48 hours

---

### AI Expansion Playbook
**Seat ID:** `ai_expansion_playbook`
**Type:** AI
**Parent:** `ai_market_research`

#### Mission
Build and maintain the operational playbook for replicating Handy Pioneers in a new market. Translate Portland learnings into a repeatable launch guide.

#### Decision Matrix
- If new market approved by Marcin → activate full playbook build
- If existing playbook > 6 months old → flag for review
- If Portland KPIs show new replicable pattern → document as playbook module

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| playbook_completeness | Expansion Playbook Sections Complete | 80 | null | % | quarterly |
| playbook_freshness | Playbook Updated Within 6 Months | 100 | null | % | quarterly |

#### SOPs

**Cron: `0 9 1 1/3 *` — Quarterly Playbook Review**
1. Pull current Portland operational metrics
2. Identify what's working that should be codified
3. Draft playbook updates for each department
4. Flag sections that need Marcin review

**Trigger: `strategy.new_market_approved`**
1. Build market-specific launch timeline (90-day, 6-month, 1-year)
2. Identify key hire sequence (lead tech, office manager, field lead)
3. Draft startup cost model
4. Route full plan to Marcin for approval

---

### AI Licensing/White-Label
**Seat ID:** `ai_licensing_whitelabel`
**Type:** AI
**Parent:** `ai_market_research`

#### Mission
Build the licensing model that lets Handy Pioneers scale without Marcin personally operating each market. Research franchise law, model license economics, draft FDD-ready materials.

#### Decision Matrix
- If licensing inquiry received → qualify the lead, draft response
- If Marcin approves licensing path → begin FDD research compilation
- If licensing law changes in target state → update compliance brief
- All licensing commitments: HUMAN ONLY (Marcin + attorney)

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| licensing_model_readiness | Licensing Model Document Completeness | 60 | null | % | quarterly |
| legal_research_current | Legal Research Updated Within 6 Months | 100 | null | % | quarterly |

#### SOPs

**Cron: `0 9 1 1/3 *` — Quarterly Licensing Review**
1. Update licensing research (FTC franchise regulations, state requirements)
2. Review licensing model economics
3. Draft licensing readiness report for Marcin

**Trigger: `licensing.inquiry_received`**
1. Research inquirer background and market
2. Draft qualification questionnaire response
3. If qualified → draft intro package using `licensing-intro-package` playbook
4. Route to Marcin for approval before responding

---

## Department Head SOPs
`ai_market_research` coordinates strategy. Monthly: market brief to Marcin. Quarterly: expansion readiness report. Annually: competitive landscape refresh.

## Failure Modes
- Research data source unavailable → flag, use available data, note gaps
- Expansion model stale → cron alerts every 6 months
- Licensing inquiry unrouted → fallback notification to Marcin directly

## Hard Stops
- No expansion commitments without Marcin written approval
- No licensing agreements or FDD without attorney review
- All external strategy communications: Marcin sends personally

## Tool Authorization
`ai_market_research`, `ai_expansion_playbook`, `ai_licensing_whitelabel`:
- `playbooks.fetch`, `playbooks.list`
- `notifications.create`
- `appSettings.read`

## Initial Playbook Library

### Playbook: Market Analysis Brief
**Slug:** `market-analysis-brief`
**Category:** internal-memo
**Owner:** `ai_market_research`
**Variables:** `{{marketName}}`, `{{population}}`, `{{medianHomeValue}}`, `{{competitorCount}}`, `{{samEstimate}}`, `{{entryRisk}}`, `{{recommendation}}`

Market Analysis: {{marketName}}

Population: {{population}}
Median home value: ${{medianHomeValue}}
Competitors identified: {{competitorCount}}
Estimated SAM: ${{samEstimate}}

Entry risk: {{entryRisk}}

Recommendation: {{recommendation}}

Full data appendix attached.

---

### Playbook: Competitive Analysis
**Slug:** `competitive-analysis`
**Category:** internal-memo
**Owner:** `ai_market_research`
**Variables:** `{{competitorName}}`, `{{marketEntered}}`, `{{pricing}}`, `{{differentiators}}`, `{{weaknesses}}`, `{{recommendedResponse}}`

Competitive Brief: {{competitorName}}

Market: {{marketEntered}}
Pricing signals: {{pricing}}
Differentiators: {{differentiators}}
Weaknesses: {{weaknesses}}

Recommended HP response: {{recommendedResponse}}

---

### Playbook: Licensing Intro Package
**Slug:** `licensing-intro-package`
**Category:** email
**Owner:** `ai_licensing_whitelabel`
**Variables:** `{{inquirerName}}`, `{{targetMarket}}`, `{{hpOverview}}`, `{{licenseModelSummary}}`, `{{nextSteps}}`

Subject: Handy Pioneers Licensing — Introduction

Hi {{inquirerName}},

Thank you for your interest in bringing Handy Pioneers to {{targetMarket}}.

{{hpOverview}}

Our licensing model in brief:
{{licenseModelSummary}}

Next steps: {{nextSteps}}

This information is confidential. Please do not share without written consent.

— Marcin / Handy Pioneers

---
