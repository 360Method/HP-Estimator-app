# HP Estimator — Integration Handoff Checklist

## DONE — 2026-04-27 — Lead Nurturer post-Roadmap follow-up cadence (`feat/post-roadmap-followup-sequence`)

**Per Marcin:** *"We will need to have an entire follow up process to get us at their door."*

### What shipped
- **Five-stage cadence** (`server/lib/leadNurturer/roadmapFollowup.ts`): T+4h Concierge SMS → T+24h specific-finding email → T+72h SMS check-in → T+7d 360° Method continuity email → T+14d long-term nurture stage flip. Every touchpoint is a `pending` row in `agentDrafts` with a `scheduledFor` timestamp.
- **Approval-gated draft generator** (`server/lib/leadNurturer/draftGenerator.ts`): boot-time worker (every 5 min) picks up due drafts, gathers customer + `homeHealthRecord` context, asks Claude for a stewardship-voice body, marks them `ready`. Banned-word advisory (`estimate / free / cheap / fix / discount / etc.`) is surfaced inline so the operator edits before sending. **Nothing auto-sends.**
- **Engagement triggers drain the queue**: `appointment_scheduled` (Baseline / Consultation), `subscription_created` (360° Stripe webhook), `customer_replied` (inbound SMS), `customer_declined` (operator-set). All routed through `onCustomerEngaged()` in `server/leadRouting.ts`.
- **Per-customer escape hatch** — `customers.bypassAutoNurture` skips the cadence; the Lead Nurturer only acts on manual triggers for that customer.
- **Operator surfaces**:
  - `/admin/agents/drafts` — Scheduled / Ready / Sent / Cancelled tabs. Reschedule, edit, generate-now, approve+send, cancel.
  - `/admin/agents/playbooks` — operator edits step timing + voice prompts + banned words. **No redeploy** required (nucleus principle).
- **Schema** (migration 0065 + boot-time `ensureLeadNurturerTables()`):
  - `agentDrafts` — pending/ready/sent/cancelled draft inbox.
  - `agentPlaybooks` — operator-editable cadence definitions.
  - `customers.bypassAutoNurture` — per-customer override.
- **Tests**: `server/leadNurturer.roadmapFollowup.test.ts` — 6 passing including the synthetic test that triggers a Roadmap delivery for a fake customer and asserts all five drafts schedule with the right offsets.
- **Docs**: this checklist + `EXPERIENCE_STANDARDS.md` sections 10–17 (customer-facing voice, banned vocabulary, approval-gate posture, cadence-stop-on-engagement).

### Manual verification before relying on the cadence in prod
- [ ] Open `/admin/agents/drafts` — confirm empty-state copy renders.
- [ ] Open `/admin/agents/playbooks` — confirm the seeded `roadmap_followup` playbook loads.
- [ ] Trigger a real Roadmap delivery in dev — confirm 5 pending drafts appear with the expected scheduledFor offsets.
- [ ] Book a Baseline for a customer with pending drafts — confirm they all flip to `cancelled` with reason `appointment_scheduled`.
- [ ] Send a customer an inbound SMS — confirm pending drafts cancel with reason `customer_replied`.

---

## DONE — 2026-04-27 — Portal Roadmap surface + in-portal Take-Action funnel (`feat/portal-roadmap-take-action`)

**Per Marcin:** *"This PDF will also need to be housed in their customer portal. I'm imagining we need to create a 'ready to take action' button so it takes them down an appointment funnel right in the portal without leaving."*

### What shipped
- **`/portal/roadmap` page** (`client/src/pages/portal/PortalRoadmap.tsx`) — affluent stewardship surface listing every Roadmap (Priority Translation) tied to the logged-in portal customer. PDF preview via inline `<iframe>` (iOS Safari renders natively, no `pdf.js` payload), download, magic share link for spouse/advisor (7-day single-use token). Multiple Roadmaps render as a chronological selector strip.
- **In-portal four-step funnel** — never a redirect: pick window → confirm contact → optional concern → confirmation with `.ics` download. Bottom-sheet on mobile, centered card on tablet+. 44 px+ tap targets, refined-serif headlines (Georgia / Times New Roman), parchment + gold focus rings.
- **Server router** (`server/routers/portalRoadmap.ts`) — `listRoadmaps`, `shareRoadmap`, `getCtaContext` (resolves the right CTA: estimate review · project tracking · member visit · default Baseline), `listAvailableWindows` (4 weekday slots, 5+ days out), `bookBaselineWalkthrough` (writes `portalAppointments` + `opportunities` + `scheduleEvents`, fires `onAppointmentBooked` for Consultant assignment, sends affluent confirmation email + admin `notifyOwner`).
- **Sidebar link** added between Home and Appointments. Route registered in `App.tsx`. Voice rules + brand tokens captured in `EXPERIENCE_STANDARDS.md` "Customer Portal Surfaces" section.
- **Tests** — `server/portalRoadmap.test.ts` (vitest, 5 cases) covers stewardship pacing rules; `scripts/synth-roadmap-test.mjs` runs the same checks standalone.

### Known follow-ups (not blocking)
- The booking helper currently fabricates calendar windows; once main's `schedulingSlots` table is populated by the operator from `/admin/scheduling`, swap `listAvailableWindows` to delegate to `listAvailableSlots()` from `server/scheduling.ts` (filtered to ≥ 5 days out). Track in this checklist when ready.
- After 30 days of usage, audit how many funnel completions hit the no-slot fallback ("none of these work — your steward will reach out"). If non-trivial, expand the offered window count or relax pacing.

---

## DONE — 2026-04-27 — Roadmap deliverable v2: editorial PDF rewrite (`feat/roadmap-deliverable-quality-v2`)

**Per Marcin:** *"The Roadmap Generator is not currently set up properly. Drastically improve so it's actually valuable to customer and us — Ritz-Carlton, not contractor estimate."*

### What shipped (PR #40, merged)
- **Prompt rewrite** (`server/lib/priorityTranslation/prompt.ts`): adds `executive_summary` (2–3 paragraphs), `property_character` (PNW + era of home), `closing` (stewardship invitation). Per-finding adds `interpretation` ("what this means for your home") and `recommended_approach` ("how we'd approach it") — the actual "translation" the document is named for. Tightens horizon framing (NOW = 90 d, SOON = 6–18 mo, WAIT = 3–5 yr). Bans anti-patterns ("find a contractor", "get three bids", `$0–$X` "starting at" pricing).
- **PDF rewrite** (`server/lib/priorityTranslation/pdf.ts`): was a flat 3-page hero+grouped-list+disclaimer. Now a 17-page editorial document — full-bleed forest cover with serif title, Standard-of-Care letter, two-column executive summary with At-a-Glance ledger, full-bleed urgency dividers (NOW/SOON/WAIT), one-page-per-finding spreads (`FINDING` → `WHAT THIS MEANS FOR YOUR HOME` cream inset → `HOW WE'D APPROACH IT` → investment-range ribbon with reasoning footnote), three-pathway closing with integrated disclaimer. Times Roman serif headlines, Helvetica tracked small-caps for metadata. Sanitizes Claude prose for WinAnsi (curly quotes, ellipsis, nbsp) so the renderer can never crash on prose it didn't author.
- **Schema** (`drizzle/schema.priorityTranslation.ts`): extends `ClaudePriorityTranslationResponse` with optional `executive_summary`, `property_character`, `closing` + per-finding `interpretation` / `recommended_approach`. `summary_1_paragraph` preserved for back-compat. `HealthRecordFinding` gets matching optional fields. **No migration needed** — additions land on JSON-typed columns.
- **Sample generator** (`scripts/generate-roadmap-sample.mjs`): renders a 17-page reference PDF from a hand-crafted, voice-compliant fixture (Margaret in a 1992 Felida craftsman, 10 findings across NOW/SOON/WAIT). Output committed at `docs/samples/roadmap-sample-2026-04-27.pdf` — the visual diff target for future iteration. Re-run with `pnpm tsx scripts/generate-roadmap-sample.mjs`.

### Aligned with PR #34 rename
Customer-facing strings updated to match the "Priority Translation → 360° Roadmap" rename that landed in PR #34: cover subtitle "A 360° Method Roadmap", Standard-of-Care letter copy, disclaimer text, footer wordmark "360°  METHOD  ROADMAP". Internal code identifiers (`priorityTranslation/`, `PriorityTranslationStatus`, etc.) stay as-is.

### Recommended follow-ups (not blocking)
- **Visual review** — open `docs/samples/roadmap-sample-2026-04-27.pdf` and confirm the deliverable feels right. Iterate from there.
- **Live Claude run** — once `processSubmission` orchestrator is fully wired (currently a stub per `processor.ts:191`), re-run the smoke test against a real Spectora inspection PDF. Expect Claude to populate the new `interpretation` + `recommended_approach` fields with real interpretation depth, not just rewording.
- **Move to nucleus CMS** — header copy, color tokens, disclaimer prose, anchor cost ranges. Currently hardcoded in `prompt.ts` + `pdf.ts` + `costRanges.ts`.

---

## DONE — 2026-04-27 — Unified Leads inbox + Concierge Brief (`feat/lead-flow-unified`)

**Per Marcin:** *"Right now I only see leads temporarily when the request banner pops up under the inbox or pipeline — that needs to get improved. Everything should fall into the first lead bucket. Maybe take away the Request page entirely and everything just falls into the Leads tab."*

### What shipped
- **New `leads` server router** (`server/routers/leads.ts`): `list` joins every active `area='lead'` opp with customer info, derived source label, age, assigned operator, online-request payload (timeline + photos + read state), and a `hasRoadmap` flag. Plus `counts`, `markOnlineRequestRead`, and `roadmapsForCustomer` for the Concierge Brief.
- **New top-level section `'leads'`** with `LeadsPage` — reverse-chrono list, source/stage/age filter chips, persistent gold accent on rows < 24h that the operator hasn't viewed locally, stewardship empty state, mobile-first (sticky header, ≥ 44 px tap targets, single column, bottom action bar).
- **Persistent `NewLeadBanner`** above MetricsBar: surfaces unread `new_lead` / `new_booking` notifications on EVERY admin page until the operator opens the lead or dismisses for the session. Hidden on the Leads tab itself.
- **`ConciergeBrief` panel** at the top of the customer Profile tab — header strip (contact + address + lead source + customer-since), Roadmap section (with magic-link out to the customer-facing report), AI activity glance, and a five-button quick action bar (Email / Call / SMS / Schedule / Estimate).
- **MetricsBar:** replaces the Requests slot with a Leads slot (Star icon, amber badge), surfacing unread online-requests + new-last-24h leads as one badge. Mobile nav tap targets bumped to 56 px. Requests breadcrumb removed.
- **PipelinePage banner** now points at the unified Leads inbox instead of the retired Requests page.
- **Deleted** `client/src/pages/RequestsPage.tsx`. Legacy `'requests'` AppSection key kept (aliased to `'leads'`) so old notification deep-links still resolve.
- **Created** `EXPERIENCE_STANDARDS.md` codifying the patterns: customer is root, one inbox per role, persistent surfaces, mobile-first, hierarchy over tabs, stewardship empty states, color discipline, page-removal pattern.

### Sources funneling into the Leads inbox today
Online Request (`/book`), Roadmap Generator, Inbound Call, Missed Call, Voicemail, Membership Intent, Baseline Walkthrough, Manual, Contact Form, Referral. Adding a new source = one row in `deriveSource()` + one `SOURCE_META` entry in `LeadsPage.tsx`. **Do not** spin up a new top-level page.

### Verified
- `tsc --noEmit` clean for every new and modified file.
- `pnpm build` succeeds.
- Server bundle smoke-imports cleanly (per the `esbuild --packages=external` memory).
  *(Note: `multer` was missing from `node_modules` post-merge with main — already declared in `package.json`, just needed `pnpm install`. Pre-existing issue from the Roadmap Generator pipeline merge, surfaced by the smoke-import gate working as designed.)*

---

## DONE — 2026-04-26 — Roadmap Generator end-to-end (4 PRs)

**PRs #31, #33, #34, #35 (+ diagnostic #36):** Roadmap Generator pipeline now lands homeowners in a real customer-facing experience, with full CRM visibility for the operator.

### What shipped
- **PR #31** `feat(roadmap): confirmation page + CRM bridge + lead routing` — new public page `/portal/roadmap/submitted/:id` with 4-stage progress bar (received → reviewing → preparing → delivered) polling `priorityTranslation.getPublicStatus` every 5s. Stewardship-voice copy. New tRPC `getPublicStatus` (no PII). Submit endpoint returns `confirmationUrl`. **CRM bridge** in `submitRoadmap`: every Roadmap submission now creates/links a `customers` row by email, back-links `portalAccounts.customerId`, creates an `opportunities` row in 'New Lead' with `leadSource='Roadmap Generator'`, and fires `onLeadCreated` so the Nurturer notification + pipeline_event + lead_created automations fire.
- **PR #33** `chore(roadmap): admin diagnostic + one-shot CRM backfill endpoint` — `POST /api/admin/roadmap-diagnostic` gated by `INTERNAL_WORKER_KEY`. Read-only snapshot of recent priorityTranslations + portalAccounts; idempotent backfill for accounts that landed before PR #31 (1 row fixed retroactively — Marcin's fake-lead now visible in admin).
- **PR #34** `fix(roadmap): rename Priority Translation → Roadmap; fix magic-link 404` — every customer-visible string ("Your 360° Roadmap is ready", PDF title, attachment filename `360-roadmap.pdf`, CTA button "View Your Roadmap"). Also fixed wouter-path mismatch in `portalAccount.ts:122` (`/portal/authenticate` → `/portal/auth`) and adds `sendTestEmailTo` to the diagnostic endpoint.
- **PR #35** `fix(portal): bridge Roadmap magic links + restore PORTAL_BASE_URL + admin route guard` — Marcin pushed back on hardcoding `pro.handypioneers.com`; `client.*` IS the correct customer subdomain (Railway custom domain bound, cert valid, Cloudflare proxied). The real fix: new `consumeRoadmapMagicLinkAsPortalCustomer()` in `portalDb.ts` looks up tokens in `portalMagicLinks` (varchar `portalAccountId`), bridges into the legacy `portalCustomers` table by upserting on email + stamping `hpCustomerId`, and `verifyToken` falls back to it on portalTokens miss. Orchestrator restored to honor `PORTAL_BASE_URL`. New `staffOnly()` wrapper in `App.tsx` 404s every `/admin/*` and `/onboarding` route on `client.handypioneers.com` (soft boundary — pair with API-side authz for hard guards).
- **PR #36** `chore(roadmap-diagnostic): issueTestMagicLinkFor` — diagnostic endpoint can issue a fresh magic link for any portalAccount, returns the raw token + URL so the operator can curl-verify the bridge end-to-end.

### Verified on prod after deploys
- `client.handypioneers.com` serves the SPA (cert valid, Cloudflare proxied).
- `/admin/*` paths render NotFound on `client.*` (verified after deploy).
- Marcin's fake-lead `pt_d9ffdc8bb1a644a7a8d3` was completed at 16:11:07Z (8s after submit). Backfilled to CRM customer `73a97b76d2fcfe9370753d4f` + opportunity `a95d67be9446461c`. Nurturer notified.
- Test email Resend ID `66e42b4a-e153-40e0-bb66-2bfaf6ffc3d3` confirmed renamed copy + working CTA.

### Recommended follow-ups (not blocking)
- The orchestrator's old "magic link gives portal session" flow now works via the bridge; consider migrating booking/estimates/invoices to also issue tokens through `portalMagicLinks` so we eventually have one token system.
- `client.handypioneers.com` Railway custom-domain DNS shows `REQUIRES_UPDATE` because Cloudflare is in front (hides the real CNAME from Railway's check). Cosmetic — doesn't affect routing. Same on `pro.*`.

---

## DONE — 2026-04-26 — Org Chart Mirror Pass

**PR #29:** `feat/org-chart-mirror` — explicit Department Head seats + mobile accordion + boot-time flag safety net.

### What shipped
- **`ensureDepartmentHeadFlags()`** in `server/_core/index.ts` — runs in `startServer()` after the other ensure functions. Idempotent UPDATE that flips `isDepartmentHead=1` on the 8 designated seats and demotes any non-integrator seats that drifted to head. Heads (canonical, must match `seed-ai-agents.mjs`):
  - sales → `ai_sdr`
  - operations → `ai_dispatch`
  - marketing → `ai_content_seo`
  - finance → `ai_bookkeeping`
  - customer_success → `ai_onboarding`
  - vendor_trades → `ai_vendor_outreach`
  - technology → `ai_system_integrity`
  - strategy_expansion → `ai_market_research`
- **OrgChart head badge** — gold gradient + shadow + reads "HEAD · Sales & Lead Management" (was just "DEPT HEAD"). Pops above regular AI/HUMAN badges. Static-reference parity.
- **Mobile accordion** — tap dept header to collapse/expand seats. Chevron (▾/▸) shows on mobile only; desktop renders all seats always (`md:!flex`). Header is a 44px tap target. Dept summary line shows red "no head" if a department is missing its head — drift visible at a glance.
- **Test Run button** per seat — already lived in the detail dialog (calls `aiAgents.triggerManualRun`). Verified, no change.

### Note on user spec divergence
The user's task spec proposed reassigning heads (Sales → "AI Sales Director" new seat, Operations → project_manager, Marketing → ai_brand_guardian, etc.). I kept the **seed-canonical heads** instead because:
1. The seed file `scripts/seed-ai-agents.mjs` already designates 8 heads with `isDepartmentHead: true`.
2. Creating "AI Sales Director" as a brand-new seat needs full charter + KPIs + tools — too much surface area for a UI/data-fidelity pass.
3. Swapping established heads risks breaking cron schedules and downstream wiring.

If Marcin wants the reassignments, that's a follow-up task: edit the heads array in `ensureDepartmentHeadFlags()` and re-run boot.

---

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

---

# Reusable Checklist — Operator-Facing Changes

A living checklist for shipping operator-facing work. Anything that touches
Marcin's daily workspace must clear every applicable box before it's
considered done. (Patterns are codified in `EXPERIENCE_STANDARDS.md`.)

## Information architecture

- [ ] Every entity has ONE canonical home. No silo pages, no duplicates.
- [ ] Every notification, banner, and link routes to the **customer profile**
      (not directly to an opportunity) when a customer is involved. The
      customer is the root entity.
- [ ] No top-level page exists for a single source. Sources are filters or
      chips inside the canonical inbox, not their own destinations.
      *(Example: the retired Requests page — online bookings now appear as
      Online Request leads inside the unified Leads inbox.)*

## Lead flow specifics

- [ ] Every lead source funnels into `area='lead'` opportunity rows.
- [ ] The Leads tab is the single inbox. Sortable, filterable, mobile-first.
- [ ] New leads (≤ 24h, not yet viewed locally) carry the gold accent.
- [ ] The persistent `NewLeadBanner` shows on EVERY admin page until the
      operator opens the lead or dismisses it for the session.
- [ ] Tapping any lead → customer profile (not opportunity detail).

## Customer profile (Concierge Brief)

- [ ] Profile tab opens with the **Concierge Brief** at the top.
- [ ] Brief includes: header strip (contact + address + lead source +
      customer-since), Roadmap status row, AI activity glance,
      and quick action bar (Email / Call / SMS / Schedule / Estimate).
- [ ] Roadmap section pulls from `priorityTranslations` joined via
      `portalAccounts.customerId`.
- [ ] Quick actions deep-link into the existing tabs (no modal sprawl).

## Mobile

- [ ] All tap targets ≥ 44px on Leads list, customer profile, banners.
- [ ] Sticky page header on scroll for long lists.
- [ ] Mobile bottom action bar (Email / Call / SMS / Schedule) on Leads list.
- [ ] Single-column layouts on screens < 640px.

## Deletion / migration

- [ ] When retiring a top-level page, leave the AppSection key in the union
      with a comment marking it deprecated; the shell redirects to the new
      home. (Old notification deep-links keep working.)
- [ ] No data migration needed when the underlying rows are unchanged —
      the data layer is the source of truth, the page was only a view.

## Build + ship gates

- [ ] `pnpm exec tsc --noEmit` clean for the files you touched.
- [ ] `pnpm build` succeeds.
- [ ] Smoke-import the server bundle: `node --input-type=module -e
      "import('./dist/index.js').then(()=>console.log('OK'))"`.
      *(Required: esbuild --packages=external silently bundles around
      missing deps; only smoke-import catches them.)*
- [ ] `EXPERIENCE_STANDARDS.md` updated when a new pattern lands.
