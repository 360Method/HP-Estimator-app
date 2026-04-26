# HP Estimator — Integration Handoff Checklist

## DONE — 2026-04-26 — Mobile-Responsive Admin Pass

**PR #27:** `feat/mobile-responsive-admin` — admin UI for ~390px iPhone viewport.

### What shipped
- **AdminShell** — desktop horizontal nav was overflowing on mobile. Now: hamburger drawer (full-screen overlay) with 9 admin links, each 48px tall. Sticky top bar shows current section name + hamburger button (44×44px tap target).
- **`/admin/agents/control`** — Activate-all CTA is now full-width and 48px on mobile (was a small `size="lg"` button buried in a `flex-wrap` row). Pause-all + System Integrity scan also full-width, stacked. Per-seat rows collapse to vertical layout: name on top, status badge + 40px select below. Per-department bulk controls grow to 40px.
- **`/admin/org-chart`** — control strip stacks on mobile (Activate / Pause / Scan full-width inside the dark control card), Stat row becomes a 3-col grid on small screens. Per-dept All-on/All-off bumped from 22px to 36px tap targets and `e.stopPropagation()` so they don't trigger card click.
- **`/admin/ai-agents/tasks`** (Approval Queue) — dual layout. Mobile: tappable cards with grid-2 Approve/Reject (44px each). Desktop: original table preserved.
- **`/admin/agents/runs`** — filter buttons + inputs stack vertically on mobile, all 36-40px tall. Table scrolls horizontally (acceptable for an observability surface, vs. forcing card view that hides columns).
- **CustomersListPage** — outer padding trimmed on mobile (`px-3 sm:px-6`), table given `min-w-[640px]` so horizontal scroll is predictable.

All edits Tailwind-only. Mobile-first defaults, `sm:`/`md:` desktop overrides. TS clean.

### Not yet mobile-friendly (P2 — surface in next pass)
- Customer profile page (deep edit screens, 800+ line file — full rewrite)
- /admin/jobs, /admin/invoices, /admin/leads list views
- /admin/agents/charters editor
- Settings sub-pages (most are forms — mostly fine but inputs not 44px)

---

## DONE — 2026-04-25 — Agent Engine (Phase 5)

**PR:** `feat/agent-engine` — *"Build the agent engine: multi-turn loop, missing event emits, self-optimization, one-click control"*

### What shipped
- **Multi-turn tool loop** in `server/lib/agentRuntime/runtime.ts` (was single-turn). Cap at 8 turns, prompt-caches the system prompt, pricing rolled up across all turns.
- **`agent.run_completed`** meta-event emitted by runtime after every run. Subscribers (System Integrity, downstream agents, KPI rollups) wake up off this.
- **5 missing event emit sites** wired: `invoice.created` (`portal.ts`), `call.missed` (`twilio.ts`), `customer.portal_account_created` (`portalDb.ts`), `subscription.renewed` + `subscription.cancelled` (Stripe webhook in `_core/index.ts`).
- **System Integrity self-optimization** (`server/lib/agentRuntime/systemIntegrity.ts`) — hourly anomaly scan + admin-inbox drafts. NEVER auto-modifies prompts (Marcin-rule hard stop).
- **`agent_optimization_tasks`** table — migration 0073 + boot-time `ensureOptimizationTasksTable`.
- **`/admin/org-chart`** — **canonical operations dashboard.** Live, data-driven Visionary → Integrator → 8 Department Heads → sub-agents tree. Visual style mirrors the static `hp-org-chart-v2.html` reference (gold = AI, blue = human, orange = Visionary, gradient = hybrid; status dot per seat). Click any seat → modal with charter excerpt + KPIs + authorized tools + recent runs + status toggle + "Test run" button. Per-seat status toggle inline; per-department "All on / All off" buttons. Mobile-responsive. **This is the page Marcin opens to see if the org is running.** Replaces the static reference HTML.
- **`/admin/agents/control`** — flatter operator view: one-click **Activate all** + **Emergency: pause all** kill switch + System Integrity flag inbox + per-department control rows.
- **`/admin/agents/runs`** — live observability page, filterable, expandable.
- **Synthetic E2E test** — `node scripts/agent-engine-e2e.mjs` fires lead.created, polls task→run→meta-event chain.
- **Phase 5 subscription seed** — `node scripts/seed-phase5-subscriptions.mjs` adds the 8 new subscriptions for the new events.

### To activate after deploy — three commands via Railway shell
```bash
node scripts/seed-ai-agents.mjs              # idempotent — only the missing seats
node scripts/seed-phase5-subscriptions.mjs   # NEW — adds the Phase 5 event subscriptions
node scripts/agent-engine-e2e.mjs            # smoke test — should print "✓ E2E PASS"
```

### Then — Marcin's one-click activation
1. Open `https://app.handypioneers.com/admin/org-chart` (or `/admin/agents/control`)
2. Click **Activate all (N ready)** at the top of the chart
3. Watch each seat's status dot turn green; cost rollup ticks live; System Integrity flags appear inline if anything goes sideways.

---

## DONE — 2026-04-24 — Agent Runtime Fully Wired

**PR merged:** "Wire department charters into agent runtime"

### What shipped
- [x] Migration `0072_charter_runtime.sql` — creates `agentCharters`, `agentKpis`, `agentPlaybooks` tables + adds `charterLoaded/kpiCount/playbookCount` columns to `ai_agents`
- [x] Boot-time `ensureCharterTables()` idempotent guard (Railway deploy auto-creates tables on next boot)
- [x] 9 charter docs in `docs/agents/` — integrator, sales, operations, marketing, finance, customer_success, vendor-trades, technology, strategy-expansion
- [x] `server/routers/agents.ts` — tRPC procedures: list, get, status, listCharters, getCharter, updateCharter, listKpis, updateKpi
- [x] `server/routers/playbooks.ts` — list/get/update
- [x] Admin UI at Settings → Agent Charters & Playbooks
- [x] `scripts/seed-charters.mjs` — parses charter docs → agentCharters, agentKpis, agentPlaybooks
- [x] `scripts/seed-ai-agents.mjs` — **fully populated** with all 31 seats, system prompts, tool grants, event subscriptions, and cron schedules

### Seat registry (31 seats)

| Dept | seatName | Type | isDeptHead | Status |
|------|----------|------|-----------|--------|
| integrator | integrator | AI | — | draft_queue |
| sales | ai_sdr | AI | ✓ | draft_queue |
| sales | ai_membership_success | AI | | draft_queue |
| sales | cx_lead | HUMAN | | disabled |
| operations | ai_dispatch | AI | ✓ | draft_queue |
| operations | project_manager | HUMAN | | disabled |
| operations | ai_qa | AI | | draft_queue |
| operations | internal_tradesmen | HUMAN | | disabled |
| operations | external_contractor_network | Hybrid | | draft_queue |
| marketing | ai_content_seo | AI | ✓ | draft_queue |
| marketing | ai_paid_ads | AI | | draft_queue |
| marketing | ai_brand_guardian | AI | | draft_queue |
| marketing | ai_community_reviews | AI | | draft_queue |
| finance | ai_bookkeeping | AI | ✓ | draft_queue |
| finance | ai_margin_monitor | AI | | draft_queue |
| finance | ai_cash_flow | AI | | draft_queue |
| finance | cpa_tax | HUMAN | | disabled |
| customer_success | ai_onboarding | AI | ✓ | draft_queue |
| customer_success | ai_annual_valuation | AI | | draft_queue |
| customer_success | ai_nurture_cadence | AI | | draft_queue |
| customer_success | member_concierge | HUMAN | | disabled |
| vendor_network | ai_vendor_outreach | AI | ✓ | draft_queue |
| vendor_network | ai_vendor_onboarding | AI | | draft_queue |
| vendor_network | ai_trade_matching | AI | | draft_queue |
| vendor_network | ai_vendor_performance | AI | | draft_queue |
| technology | ai_system_integrity | AI | ✓ | draft_queue |
| technology | ai_security | AI | | draft_queue |
| technology | software_engineer | HUMAN | | disabled |
| strategy | ai_market_research | AI | ✓ | draft_queue |
| strategy | ai_expansion_playbook | AI | | draft_queue |
| strategy | ai_licensing_whitelabel | AI | | draft_queue |

### To activate after deploy — run these two commands via Railway shell

```bash
# 1. Seed all 31 agent seats into ai_agents
node scripts/seed-ai-agents.mjs

# 2. Parse charter docs → seed agentCharters, agentKpis, agentPlaybooks
node scripts/seed-charters.mjs
```

**Railway shell access:** Dashboard → HP-Estimator-app service → Deploy tab → Shell (or via `railway run` CLI)

### Activation order (after seeding)
Go to `/admin/ai-agents` and flip status from `draft_queue` → `autonomous` in this order:
1. `ai_system_integrity` — platform watchdog (autonomous, no customer contact)
2. `ai_bookkeeping` — reconciliation (autonomous, read-only financials)
3. `ai_security` — daily audit (autonomous, read-only)
4. `ai_sdr` — lead response (review first 10 drafts before going autonomous)
5. `ai_dispatch` — scheduling (review first week before going autonomous)
6. All others — activate as confidence grows

---

## DONE — 2026-04-24

### GBP OAuth (Google Business Profile)
- [x] Env vars wired in Railway: `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`, `GBP_REDIRECT_URI`
- [x] Redirect URI registered in Google Cloud Console
- [x] Code scaffolded: `server/integrations/gbp/oauth.ts`, `routes.ts`, `server/routers/gbp.ts`
- [x] `gbpTokens` table in schema + migration 0065
- [x] Connect button live at `/admin/settings` → Integrations → Google Business Profile
- **Status:** Awaiting first Connect click from `/admin/settings`. Token will persist in DB after first OAuth.

### Meta (Facebook / Instagram)
- [x] Env vars wired in Railway: `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN`, `META_AD_ACCOUNT_ID`
- [x] System-user token pattern (no per-user OAuth flow)
- [x] Code scaffolded: `server/integrations/meta/client.ts`, `routes.ts`, `server/routers/meta.ts`
- [x] `metaConnections` table in schema + migration 0065
- [x] "Verify token" button live at `/admin/settings` → Integrations → Meta
- **Status:** Env wired + code scaffolded. Click "Verify token" in settings to activate and write the first `metaConnections` row.

### Google Ads
- [x] Env vars wired in Railway: `GOOGLE_ADS_DEVELOPER_TOKEN`, `GOOGLE_ADS_CLIENT_ID`, `GOOGLE_ADS_CLIENT_SECRET`, `GOOGLE_ADS_CUSTOMER_ID`, `GOOGLE_ADS_REDIRECT_URI`
- [x] Redirect URI registered in Google Cloud Console
- [x] Code scaffolded: `server/integrations/google-ads/oauth.ts`, `client.ts`, `routes.ts`, `server/routers/googleAds.ts`
- [x] `googleAdsTokens` table in schema + migration 0065
- [x] Connect button live at `/admin/settings` → Integrations → Google Ads
- **Status:** Env wired + code scaffolded. Awaiting first Connect click. **Developer token is still in test/pending state** until Google approves the application — API calls will fail with a 403 until approval lands.

### GA4
- [x] Env var wired in Railway: `VITE_GA4_MEASUREMENT_ID`
- [x] gtag.js bootstrap added to `client/index.html` (lazy-loads only when var is set)
- [x] Route-change pageview tracking added to `client/src/App.tsx`
- [x] `trackEvent()` helper exported from `App.tsx` for custom events (lead form submitted, baseline booked, membership tier viewed, estimate downloaded)
- **Status:** Tracking active on next deploy. Wire `trackEvent('lead_form_submitted', {...})` calls at the relevant submit handlers when ready.

### AI Agent Tools
- [x] `aiAgentTools` table added to schema + migration 0065
- [x] Boot-time `CREATE TABLE IF NOT EXISTS` guard in `server/_core/index.ts`
- [x] `scripts/seed-ai-agents.mjs` seeds 11 tools across GBP, Meta, Google Ads categories
- [x] All tools are `mode: 'draft_only'` — agents draft, humans approve in inbox

---

### Snyk Security Scanning
- [x] `SNYK_TOKEN` added to GitHub Actions secrets for HP-Estimator-app repo
- [x] `.github/workflows/security.yml` added — triggers on PR → main, push to main, weekly Monday 4 AM UTC
- [x] `snyk test --severity-threshold=high` + `snyk monitor` steps wired
- [x] First run uses `continue-on-error: true` to capture baseline findings without blocking the integration PR
- **Status:** Workflow ships with this PR. After first run, triage findings and remove `continue-on-error` to start gating merges on high/critical.

---

## DEFERRED — skip indefinitely

### Yelp Fusion API
- **Decision:** Deferred indefinitely.
- **Reason:** Post-trial pricing is $229–$643/mo, which blows the lean-tier budget. The affluent ICP (home stewardship advisory) does not use Yelp to find vendors. Google Business Profile (already wired, free) covers the review/discovery surface fully.
- **Optional future swap:** Houzz Pro free listing tier if Marcin wants more review presence beyond GBP.
- **Cleanup:** Yelp removed from any agent tool stubs or scaffolded routes. References remaining in the codebase are limited to lead-source dropdowns (historical data field), which are intentionally preserved for backward compatibility with existing records.

---

## Rotate after initial wiring

These secrets should be rotated in their respective consoles after the first successful connection is confirmed in production:

| Secret | Console |
|--------|---------|
| `GBP_CLIENT_SECRET` | Google Cloud Console → Credentials → OAuth 2.0 Client IDs |
| `META_APP_SECRET` | Meta for Developers → App Settings → Basic |
| `META_SYSTEM_USER_TOKEN` | Meta Business Manager → System Users → Generate new token |
| `GOOGLE_ADS_CLIENT_SECRET` | Google Cloud Console → Credentials → OAuth 2.0 Client IDs |

---

## Next steps after Google Ads approval

1. Google will email when the developer token is approved (test → production tier).
2. Update `GOOGLE_ADS_DEVELOPER_TOKEN` in Railway with the production token.
3. Click "Connect" in `/admin/settings` → Integrations → Google Ads.
4. Confirm `/api/health` returns `googleAds: { configured: true, connected: true }`.
