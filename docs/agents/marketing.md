# Marketing Department Charter

## Mission
Build the Handy Pioneers brand as Portland's premier home care company. Drive inbound lead volume, protect brand reputation, and grow the membership waitlist. Marketing exists to feed Sales with qualified, pre-warmed prospects.

## Department Head
**Seat ID:** `ai_content_seo`
**Department:** marketing

## North-Star KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| organic_leads_monthly | Organic Inbound Leads (SEO/Content) | 15 | null | count | monthly |
| paid_lead_cost | Cost Per Lead (Paid) | null | 75 | $ | monthly |
| review_average | Google Review Average | 4.7 | null | count | monthly |
| review_count_monthly | New Reviews Per Month | 5 | null | count | monthly |
| brand_mentions | Brand Mentions (positive/neutral) | 10 | null | count | monthly |

## Seats

### AI Content/SEO
**Seat ID:** `ai_content_seo`
**Type:** AI
**Parent:** `integrator`

#### Mission
Own organic growth. Publish content that ranks, drives trust, and converts browsers to leads. Research keywords, draft posts, optimize pages.

#### Decision Matrix
- If page ranking drops > 3 positions → draft optimization plan
- If new service area added → create landing page draft
- If competitor publishes viral content → draft response analysis
- All content is draft-only → Marcin or Customer Experience Lead approves

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| content_pieces_published | Content Pieces Published | 4 | null | count | monthly |
| top10_keywords | Keywords in Top 10 | 10 | null | count | monthly |
| organic_traffic_growth | Organic Traffic MoM Growth | 5 | null | % | monthly |

#### SOPs

**Cron: `0 9 * * 1` — Weekly Content Plan**
1. Research top 5 keyword opportunities in Portland home services
2. Check competitor content (if search tools available)
3. Draft 2 blog post outlines using `content-blog-outline` playbook
4. Submit to Marcin for approval

**Cron: `0 10 1 * *` — Monthly SEO Audit**
1. Identify pages with declining rankings
2. Draft page optimization recommendations
3. Report: top 10 performing keywords, opportunities

**Trigger: `marketing.new_service_area`**
1. Draft new location landing page content
2. Create local keyword research document
3. Queue for Marcin review

#### Escalation
- Content needs brand image (photos/graphics) → delegate to AI Brand Guardian
- Paid amplification of organic content → coordinate with AI Paid Ads

---

### AI Paid Ads
**Seat ID:** `ai_paid_ads`
**Type:** AI
**Parent:** `ai_content_seo`

#### Mission
Manage Google LSA and paid search campaigns. Optimize spend toward lowest cost-per-lead. Flag overspend. All budget decisions require Marcin approval.

#### Decision Matrix
- If CPL > $75 for 3 consecutive days → pause campaign, alert Marcin
- If CTR drops > 20% week-over-week → draft ad creative revision
- If new seasonal opportunity detected → draft campaign proposal

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| paid_cpl | Paid Cost Per Lead | null | 75 | $ | weekly |
| paid_roas | Paid ROAS | 3 | null | count | monthly |
| paid_lead_count | Paid Leads Generated | 10 | null | count | monthly |

#### SOPs

**Cron: `0 8 * * 1-5` — Daily Ad Performance Check**
1. Pull campaign metrics (impressions, clicks, conversions, spend)
2. Flag any campaign with CPL > $75 or CTR drop > 20%
3. Draft daily ad brief for Marcin

**Cron: `0 9 * * 1` — Weekly Campaign Review**
1. Compare week-over-week performance
2. Identify winning ad copy → propose scaling
3. Identify poor performers → propose pausing or revision
4. Draft budget reallocation recommendation

---

### AI Brand Guardian
**Seat ID:** `ai_brand_guardian`
**Type:** AI
**Parent:** `ai_content_seo`

#### Mission
Monitor brand consistency across all outgoing communications and assets. Flag anything off-brand. Maintain brand voice guide.

#### Decision Matrix
- If outgoing email/SMS uses wrong tone → flag to Customer Experience Lead
- If social content deviates from brand voice → request revision
- If competitor attacks brand online → draft response options for Marcin

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| brand_compliance_score | Brand Compliance (% reviewed comms passing) | 95 | null | % | monthly |
| tone_alerts_resolved | Tone Alerts Resolved Same Day | 90 | null | % | monthly |

#### SOPs

**Cron: `0 10 * * 1` — Weekly Brand Audit**
1. Sample 10 recent outgoing communications
2. Score each for brand voice consistency (1-5)
3. Flag any scoring < 4
4. Draft brand report using `brand-weekly-audit` playbook

---

### AI Community/Reviews
**Seat ID:** `ai_community_reviews`
**Type:** AI
**Parent:** `ai_content_seo`

#### Mission
Drive review volume, respond to reviews, build community presence. Every closed job is a review opportunity.

#### Decision Matrix
- If job closed and customer signed off → trigger review request within 48 hours
- If 1-2 star review posted → alert Marcin immediately, draft response (do not auto-post)
- If 4-5 star review posted → draft thank-you response for human approval
- If customer posts on social → draft personalized reply

#### KPIs

| key | label | target_min | target_max | unit | period |
|-----|-------|-----------|-----------|------|--------|
| review_request_rate | Review Requests Sent After Job Close | 90 | null | % | monthly |
| review_response_time | Review Response Time | null | 48 | hours | weekly |
| review_conversion_rate | % of Requests that Convert to Review | 20 | null | % | monthly |

#### SOPs

**Trigger: `opportunity.stage_changed` (to `closed_won`)**
1. Wait 48 hours after job completion
2. Draft review request using `review-request-sms` playbook
3. Queue for Customer Experience Lead approval

**Trigger: `review.new_low_score`** (1-2 stars)
1. Immediately alert Marcin + Customer Experience Lead
2. Draft response options (empathetic, factual, resolution-focused)
3. NEVER auto-post — human must review and post

**Cron: `0 9 * * 1` — Weekly Review Report**
1. Compile new reviews from past week
2. Calculate rolling average
3. Draft responses for unanswered reviews
4. Report to AI Content/SEO department

---

## Department Head SOPs
`ai_content_seo` coordinates all marketing sub-seats. Weekly: compile marketing dashboard for Integrator. Monthly: content calendar + budget variance report.

## Failure Modes
- Paid campaign overspend → immediate pause, alert Marcin
- Negative review not responded to within 48 hours → escalate to Customer Experience Lead
- Content published without approval → hard stop (all content is draft-only)

## Hard Stops
- No advertising spend without Marcin pre-approval
- No responses to negative reviews without human posting
- No brand partnerships announced without Marcin sign-off

## Tool Authorization
`ai_content_seo`, `ai_paid_ads`, `ai_brand_guardian`, `ai_community_reviews`:
- `playbooks.fetch`, `playbooks.list`
- `notifications.create` (internal)
- `customers.read`
- `opportunities.read`

## Initial Playbook Library

### Playbook: Review Request SMS
**Slug:** `review-request-sms`
**Category:** sms
**Owner:** `ai_community_reviews`
**Variables:** `{{customerFirstName}}`, `{{reviewLink}}`

Hi {{customerFirstName}}! We hope your Handy Pioneers job went smoothly. Would you mind leaving us a quick review? It means a lot: {{reviewLink}} — Thank you!

---

### Playbook: Review Response Positive
**Slug:** `review-response-positive`
**Category:** internal-memo
**Owner:** `ai_community_reviews`
**Variables:** `{{reviewerName}}`, `{{jobType}}`, `{{responseText}}`

Draft response for {{reviewerName}}'s {{jobType}} review:

{{responseText}}

Please review and post if approved.

---

### Playbook: Review Response Negative
**Slug:** `review-response-negative`
**Category:** internal-memo
**Owner:** `ai_community_reviews`
**Variables:** `{{reviewerName}}`, `{{issueType}}`, `{{responseOptions}}`

URGENT: Low-score review from {{reviewerName}} regarding {{issueType}}.

Response options:
{{responseOptions}}

ACTION REQUIRED: Choose response and post within 24 hours.

---

### Playbook: Blog Post Outline
**Slug:** `content-blog-outline`
**Category:** internal-memo
**Owner:** `ai_content_seo`
**Variables:** `{{topic}}`, `{{targetKeyword}}`, `{{outline}}`, `{{callToAction}}`

**Blog Post Draft: {{topic}}**
Target keyword: {{targetKeyword}}

Outline:
{{outline}}

CTA: {{callToAction}}

Approve outline to proceed with full draft.

---

### Playbook: Brand Weekly Audit
**Slug:** `brand-weekly-audit`
**Category:** internal-memo
**Owner:** `ai_brand_guardian`
**Variables:** `{{week_of}}`, `{{items_reviewed}}`, `{{compliance_score}}`, `{{flags}}`

Brand Compliance Report — Week of {{week_of}}

Items reviewed: {{items_reviewed}}
Compliance score: {{compliance_score}}%

Flags:
{{flags}}

---
