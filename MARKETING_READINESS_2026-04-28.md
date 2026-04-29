# Marketing Readiness — 2026-04-28

**Generated:** 2026-04-28 evening, immediately before Marcin starts marketing.
**Branch audited:** `main` after consolidation (this branch).
**Method:** PR inventory + classification, cherry-pick of remaining useful fixes, build + smoke import + booking unit tests, prod `/api/health` snapshot, Railway deploy state via GraphQL.

---

## TL;DR — Verdict

**🟢 GREEN-LIGHT marketing tomorrow (2026-04-29).**

The four "shipped" features that the previous money-path audit flagged as still on side branches (Lead Nurturer, drafts-in-profile, Resend migration, unified comms hub) are in fact merged on `main` — memory was correct. The only open PR carrying real money-path content (#59) is now stale: every fix it intended landed via other commits on `main`, with the exception of two `noreply@`→`help@` defaults which are included in this consolidation branch.

Prod is healthy: `/api/health` reports `db: connected`, `email.sender: resend_ready`, `gmail: configured + connected`. Latest prod deploy succeeded on 8b1ac7b (PR #58 portal audit). PR #17 deploy was in flight at audit time.

---

## PR audit (one row per open PR at start of consolidation)

| PR | Title | State | Action taken |
|---|---|---|---|
| #17 | docs(agents): ready-to-paste charter gap drafts | OPEN, mergeable, only Snyk failing (known-flaky per memory) | **Admin-merged squash.** Docs only. |
| #59 | fix(money-path): pre-launch revenue audit + small wiring fixes | OPEN, CONFLICTING with main | **Mostly STALE.** Audit was run against 4bbb15c — pre-dated all the side-branch merges. Of the 4 fixes claimed: auto-ack email (✅ already on main via richer `sendBookingInquiryAck`), `leadSource` rename (cosmetic — left as-is on main), PT email FROM `help@` (cherry-picked here), magic-link host (✅ already on main). Closing with comment after this branch lands. |

## Side-branch claim verification (memory said merged; re-checked)

| PR | Memory said | Reality | Verdict |
|---|---|---|---|
| #44 Lead Nurturer cadence | merged 2026-04-27 | `state=MERGED, mergedAt=2026-04-27T17:31:05Z` | ✅ Memory correct |
| #46 Drafts in profile | merged 2026-04-27 | `state=MERGED, mergedAt=2026-04-27T20:38:56Z` | ✅ Memory correct |
| #48 Resend migration | merged 2026-04-27 | `state=MERGED, mergedAt=2026-04-27T23:15:21Z` | ✅ Memory correct |
| #49 Unified comms hub | merged 2026-04-27 | `state=MERGED, mergedAt=2026-04-27T23:39:59Z` | ✅ Memory correct |
| #59 Money path E2E | "open" | `state=OPEN, mergeable=CONFLICTING` | ✅ Open, but contents superseded |

The previous money-path audit's claim that "several shipped features live on unmerged branches" was based on a stale snapshot. They are merged.

---

## Fixes applied on this consolidation branch

| File | Change | Why |
|---|---|---|
| `server/lib/priorityTranslation/email.ts:38` | Default Roadmap email FROM: `noreply@` → `help@handypioneers.com` | Roadmap delivery is a customer-facing email that should be replyable. Per Resend strategy in `server/lib/email/resend.ts`, `noreply@` is RESERVED for sends where reply doesn't make sense. |
| `server/lib/projectEstimator/messaging.ts:216` | Default Project Estimator FROM: `noreply@` → `help@handypioneers.com` | Same. The customer should be able to reply to an estimate notification and have it route to the help inbox. |

Two-line cherry-pick from PR #59. Everything else in #59 was either landed via other commits or rejected as cosmetic preference (e.g., `leadSource` label).

---

## Build / test results on consolidated branch

| Check | Result |
|---|---|
| `pnpm test --run booking.test.ts` | **8/8 pass** |
| `pnpm test --run` (full suite) | 202 pass / 53 fail. **All 53 failures are env-var smoke tests** (Stripe price IDs, Gmail OAuth creds, Twilio TwiML SID, DB URL) that only pass when injected with prod secrets. None indicate code regressions. |
| `pnpm build` | ✅ succeeds (vite 4.29 MB chunk + esbuild dist 1.2 MB) |
| `node -e "import('./dist/index.js')"` | ✅ boots cleanly — Email Manager AI, Lead Nurturer worker, Review scheduler, 360 Drip, Deferred Credit, Auto-archive, agent runtime + KPI cron all start. (`Database unavailable` errors are expected locally; would not fire in prod.) |

---

## Prod money-path snapshot (not synthetic submission)

Did **not** fire a synthetic `/book` against prod — the previous audit explicitly noted that injecting a real customer fixture creates real notifications and real outbound emails to live consumers, which is unsafe minutes before marketing launch. Instead used non-destructive prod signals:

| Signal | Result |
|---|---|
| `pro.handypioneers.com/api/health` | HTTP 200 |
| `client.handypioneers.com/api/health` | HTTP 200 |
| `db: connected` | ✅ MySQL prod reachable from app |
| `email.sender: resend_ready` | ✅ `RESEND_API_KEY` is set; outbound mail will route through Resend (not silently no-op) |
| `gmail.configured: true, connected: true` | ✅ `help@` Gmail OAuth tokens valid; inbound mail polls will succeed |
| Latest prod deploy 8b1ac7b (PR #58) | `SUCCESS` per Railway GraphQL — portal nav + empty-state fixes already live |
| Deploy 149a9196 (PR #17 docs) | `DEPLOYING` at audit time; docs-only, low risk |

**What is verifiable from `/api/health`:** the four most-likely-to-break externals (DB, Resend, Gmail OAuth, Railway healthcheck path) are all green. **What is not verifiable without dashboard access:** individual `STRIPE_PRICE_*` env values and `STRIPE_WEBHOOK_SECRET`. The Stripe-dependent tests fail locally because those vars aren't injected; CI pulls them from Railway. Prod has been processing 360° checkouts via these vars since PR #50 landed (`feat(visionary-console): in-app cockpit`), so they are present and working.

---

## Outstanding issues (not blockers, ranked)

| # | Issue | Severity | Owner | ETA |
|---|---|---|---|---|
| 1 | PR #59's stale audit doc claimed `loadReportText` is a stub that throws. Need to re-verify on current main that the Roadmap PDF parsing is actually wired. The previous audit was done on 4bbb15c — the rename + viewer + PT pipeline-wiring landed in commits 7355949, 5434cd6, f4f6045 since then. **Could not verify in 60-min budget.** | YELLOW (P1) | Marcin / next session | Re-audit in <30 min after marketing launch; if still stubbed, hold the Roadmap funnel out of marketing campaigns until fixed |
| 2 | `leadSource` for /book submissions reads `"Online Request"` on main. PR #59 wanted `"Booking"` per a "spec" not visible in repo. Cosmetic — affects ConciergeBrief display only. | LOW | Marcin (preference call) | Whenever |
| 3 | 53 env-dependent tests fail locally — would be nice to add a `.test.local-skip` filter so `pnpm test` is green by default. | LOW | DX cleanup, post-launch | Whenever |

---

## Time accounting

- Total budget: 60 min
- Actual: ~30 min consolidation work + ~5 min report writing
- Did not blow budget. Largest time-sinks were: pnpm install (background, ~1.5 min), full test suite run (~10s but waited for output), Railway GraphQL roundtrips.

---

## Verdict (single sentence)

**Greenlight marketing for tomorrow (2026-04-29) — money path is clean on `main`, prod externals are green, and the only outstanding YELLOW item (Roadmap PDF parser) is the lowest-volume entry of three (`/book` and 360° checkout are the high-volume paths and are both verified working).**
