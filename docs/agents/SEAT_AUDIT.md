# Agent Seat Audit

> **Auto-generated** by `node scripts/seed-charters.mjs` on each deploy.
> This file is overwritten on every seed run — do not edit manually.
> Last manual entry: pre-deploy baseline (no DB yet).

## Summary
- **Total expected seats:** 31
- **Found in ai_agents:** 0 (run `node scripts/seed-ai-agents.mjs` first)
- **Operational:** 0
- **Incomplete:** 31
- **Total KPIs seeded:** 0 (run `node scripts/seed-charters.mjs`)
- **Total playbooks seeded:** 0 (run `node scripts/seed-charters.mjs`)

## Expected Seats

| Seat | Department | Exists in ai_agents | Charter Loaded | KPIs Seeded | Playbooks Seeded | Trigger/Schedule | Status |
|------|-----------|---------------------|----------------|-------------|-----------------|-----------------|--------|
| Integrator (Main AI) | integrator_visionary | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** (not seeded) |
| AI SDR (Prospecting Research) | sales | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Membership Success | sales | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| Customer Experience Lead | sales | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| Project Manager | operations | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Dispatch | operations | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI QA | operations | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| Internal Tradesmen | operations | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| External Contractor Network | operations | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Content/SEO | marketing | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Paid Ads | marketing | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Brand Guardian | marketing | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Community/Reviews | marketing | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Bookkeeping | finance | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Margin Monitor | finance | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Cash Flow | finance | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| CPA/Tax | finance | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Onboarding | customer_success | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Annual Valuation | customer_success | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Nurture Cadence | customer_success | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| Member Concierge | customer_success | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Vendor Outreach | vendor_trades | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Vendor Onboarding | vendor_trades | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Trade Matching | vendor_trades | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Vendor Performance | vendor_trades | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI System Integrity | technology | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Security | technology | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| Software Engineer | technology | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Market Research | strategy_expansion | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Expansion Playbook | strategy_expansion | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |
| AI Licensing/White-Label | strategy_expansion | ✗ pending seed | ✗ | 0 | 0 | — | **incomplete** |

## Decisions Needed

- Run `node scripts/seed-ai-agents.mjs` to populate `aiAgents` table
- Run `node scripts/seed-charters.mjs` to seed charters, KPIs, and playbooks
- After seeding, re-run `node scripts/seed-charters.mjs` to regenerate this file
- **Seat count note:** User's original spec says "25 seats" but org chart lists 31. Recommend Marcin confirm which 6 seats to dedupe/remove. Options: merge `external_contractor_network` with `ai_vendor_outreach` (they overlap), and consolidate 4 strategy seats to 3.
- **Activation:** All AI seats start as `status='draft_queue'`. Marcin activates individually from `/settings` → Agent Charters → edit seat status.
