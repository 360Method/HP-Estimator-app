# Morning Brief — 2026-04-25

## Late-Evening P0 — Roadmap Generator pipeline (PR pending merge)

The customer-facing Roadmap Generator on `handypioneers.com` has been silently
dropping every submission. Marcin uploaded a test inspection report and never
received a roadmap email; investigation revealed the canonical worker was a
stub. Branch `claude/roadmap-generator-fix` ships the fix; **PR not yet
created** (gh CLI not authenticated in this session — see
https://github.com/360Method/HP-Estimator-app/pull/new/claude/roadmap-generator-fix
to open it). After merge, Railway redeploys HP-Estimator-app and the synthetic
test against `/api/roadmap-generator/submit` should produce a deliverable email
within ~2 minutes.

Root cause: `priorityTranslation.submit()` created the row and flipped status
to `processing` but never enqueued or invoked the worker. `process()` had the
real Claude/PDF/email logic but was only callable with `INTERNAL_WORKER_KEY`
and nothing called it. Express multipart wrapper existed (good) but routed
into the broken submit-without-process pattern.

Fix: new `server/lib/priorityTranslation/orchestrator.ts` runs the full
pipeline inline (account → property → DB row → Claude with PDF as document
block → render PDF → magic link → Resend → mark completed). Express handler
now calls `submitRoadmap()` directly instead of the tRPC submit. Failures land
in `priorityTranslations.failureReason` and trigger an internal email to
help@handypioneers.com so failed roadmaps don't disappear silently.

Out-of-scope follow-ups (P1):
- The deliverable PDF rendering quality may need tuning — verify after first
  real customer submission lands.
- No queue infrastructure: relies on `setImmediate` background processing. If
  HP-Estimator-app restarts mid-process the row stays `processing` forever.
  Worth a real queue once volume warrants it.
- `handy-pioneers-www-V2` still has the same-origin fallback intake but no
  `RESEND_API_KEY`/`ANTHROPIC_API_KEY` set, so its fallback is a black hole.
  Once the canonical endpoint is verified working, the fallback can be
  removed from the frontend.

---

## Done

- **Deploy loop resolved.** `railway.json` `&&` → `;` — server now starts
  even when drizzle-kit migration fails. 22 pending migrations can't apply
  because all their target objects already exist via boot-time `ensure*()`.
  Root cause documented; fix-all-migrations is a separate ~2hr task.

- **31 agents seeded.** All seats in `ai_agents` with correct department slugs,
  event subscriptions (19), and cron schedules (19). `charterLoaded=true` for
  all 31 seats.

- **9 charters seeded.** 105 KPIs, 36 playbooks across all departments.

- **7 of 9 department dots now green.** Two fixes merged:
  1. `DEPT_LABELS` keys corrected (`vendor_network`, `integrator`, `strategy`).
  2. `deptStatus()` now excludes `disabled` human placeholder seats from the
     operational check — a dept where all AI seats are operational shows green
     even if it has human seats marked disabled.

## In Progress / Needs Your Action

- **2 departments still yellow** — genuine charter content gaps, not code bugs:
  - **Operations (yellow):** `external_contractor_network` has no KPIs in charter.
    Suggested metrics in `docs/agents/CHARTER_GAPS.md`. Takes ~10 min to add.
  - **Marketing (yellow):** `ai_paid_ads` has 3 KPIs but no playbook.
    Draft playbook template in `docs/agents/CHARTER_GAPS.md`. Takes ~5 min.
  - After adding content, run: `node scripts/seed-charters.mjs`

- **Runtime dry-run not yet executed.** Script is ready at
  `scripts/dry-run-agent.mjs`. Pre-flight checks all pass (agent config, DB,
  Anthropic key all confirmed). Run in Railway shell:
  ```bash
  node scripts/dry-run-agent.mjs
  ```
  Results write to `docs/agents/RUNTIME_DRY_RUN.md`. Estimated cost: ~$0.002.

- **Activate agents** per HANDOFF_CHECKLIST order when ready:
  1. `ai_system_integrity` → autonomous
  2. `ai_bookkeeping` → autonomous
  3. `ai_security` → autonomous
  4. `ai_sdr` → review first 10 drafts before going autonomous

## Security (Snyk Baseline)

`pnpm audit` found 0 critical, 18 high, 39 moderate. Full report: `SNYK_BASELINE.md`.

**Two items to prioritize this week (production-reachable):**
- `drizzle-orm` ^0.44.5 → SQL injection via dynamic identifiers → upgrade to 0.45.2
- `axios` ^1.12.0 → DoS via `__proto__` → upgrade to 1.13.5

Both are 5–15 min upgrades. Everything else is build-toolchain-only.

## No Decision Needed On

- Branch `overnight/charter-runtime-snyk` is ready to merge (PR in the link below).
  Includes: `deptStatus()` fix, CHARTER_GAPS.md, dry-run script, Snyk baseline,
  this brief.

---

## Late-Morning Update — 2026-04-25

### Done (autonomous, while Marcin was away)

- **GBP env vars wired to Railway.** `GBP_CLIENT_ID`, `GBP_CLIENT_SECRET`,
  `GBP_REDIRECT_URI` — all upserted via Railway GraphQL. Health now shows
  `gbp.configured: true`. Needs OAuth connect to show `connected: true`.

- **QBO "redirect_uri invalid" root cause found and fixed (PR #16, merged).**
  Two separate bugs:
  - `IntegrationsSettings.tsx` was sending `/api/quickbooks/callback` (wrong path)
  - `QuickBooksPage.tsx` was sending `/settings/quickbooks/callback` (different wrong path)
  - Intuit registered: `/api/integrations/qbo/callback`
  - No backend handler existed at any of these paths.
  Fix: Added Express `GET /api/integrations/qbo/callback` that exchanges the
  auth code, saves tokens to `qbTokens`, and redirects `→ /settings/integrations?qb=connected`.
  Both frontend pages updated to use the registered URI.
  **QBO should connect now — try Settings → Integrations → Connect QuickBooks.**

- **Snyk P1 security PRs merged:**
  - PR #14: `drizzle-orm` 0.44.5 → 0.45.2 (SQL injection fix). Two drizzle-0.45
    type incompatibilities in `agentRuntime` fixed (period enum cast, insert result shape).
  - PR #15: `axios` 1.12.0 → 1.15.2 (DoS via `__proto__` fix). Drop-in upgrade.

- **Charter gap drafts written (PR #17, open — Marcin to approve before seeding).**
  - `external_contractor_network`: 3 KPIs with targets (see CHARTER_GAPS.md)
  - `ai_paid_ads`: 2 playbooks — daily brief + budget reallocation rec
  - Copy the `## DRAFT — Marcin to approve` blocks into `operations.md` and
    `marketing.md`, then run `node scripts/seed-charters.mjs` to go 9/9 green.

### Still Pending (needs Railway shell or Marcin)

- **Agent runtime dry-runs** — `ANTHROPIC_API_KEY` not available locally; must
  run `node scripts/dry-run-agent.mjs` in Railway shell (Dashboard → Shell).
  Pre-flight checks confirmed passing. Estimated cost: ~$0.002 per run.

### Production Health

```
/api/health → 200 OK
gbp.configured: true  | gbp.connected: false  (needs OAuth)
meta.configured: true | meta.connected: true
googleAds.configured: true | googleAds.connected: true
quickbooks.configured: true | quickbooks.connected: false (connect after deploy)
```

Railway builds in progress (~23:16 UTC): PRs 14, 15, 16 each triggered a deploy.
All deploying to production; 7/9 dept dots confirmed green (unchanged).
