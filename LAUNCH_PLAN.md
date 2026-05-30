# HP Estimator — Launch Plan

Last updated: 2026-05-30. This is the single current source of truth for launch.
It supersedes the scattered, pre-migration readiness docs listed at the bottom.

## Launch bar (Rock 1)

Ship the HP Estimator app, target **2026-06-15**. The app is already deployed and
in daily use, so "launch" here means: money-paths verified on the new stack, the
experience finished enough to drive marketing traffic, and the first 360 members
enrolled (Rock 2).

## Current status — 2026-05-30

- Live on **Supabase (Postgres)** after the MySQL to Postgres cutover.
  `/api/health` green (db connected, Resend ready, Gmail connected).
- App reads and writes confirmed on Postgres (AI agent runs active today; public
  lead form returns 201 and persists customer + opportunity + online request).
- All known Postgres-incompatible SQL fixed (migrator NOT-NULL handling, boot
  department-head flags, 360 labor-bank UPDATEs). All DB access now goes through
  Drizzle (dialect-portable).
- MySQL retained as rollback until ~2026-06-13, then archive.

## Critical path to launch (1 -> 2 -> 3)

### 1. Lock the migration — verify money-paths on Postgres
Ref: `MIGRATION_RUNBOOK.md` §10-11

- [x] Public lead form (`/api/public/inquiry`) persists customer + opp + request (verified 05-30)
- [x] Broad read/write health on Postgres (agent runs, customers, conversations current)
- [ ] **Marcin (browser):** admin login, Inbox loads and paginates
- [ ] **Marcin (browser):** open a customer profile, confirm opportunities + invoices load
- [ ] **Marcin (browser):** portal magic-link — request it, click it, land on portal home
- [ ] **Marcin (browser):** trigger one Twilio call/SMS from the dialer
- [ ] Keep MySQL rollback net live through ~06-13, then archive

### 2. Roadmap / 360 funnel — confirmed wired (was the one launch-gating unknown)
Ref: `MARKETING_READINESS_2026-04-28.md` issue #1; code in `server/lib/priorityTranslation/`

- [x] The old "loadReportText is a stub that throws" concern is **stale/resolved** —
      that function no longer exists. Pipeline was refactored to
      orchestrator -> Claude (native PDF OCR) -> Resend. No stubs; the `throw`s are
      input guards. (verified 05-30)
- [ ] One real end-to-end run before campaigns: upload a sample inspection PDF,
      confirm a Roadmap PDF emails out and a `priorityTranslations` row lands.
      (Only 1 has ever been generated, back on 2026-04-26 — barely exercised.)

### 3. 360 money-path end-to-end — Rock 2 dependency
Ref: `CONSULTANT_BASELINE_TOOL_PLAN.md`, `docs/CUSTOMER_SUCCESS_CHARTER.md`

- [x] Labor-bank credit/debit SQL fixed and verified against Postgres (05-30)
- [ ] Walk the path: Stripe checkout -> membership created -> labor-bank balance ->
      visit credit/debit reflects correctly
- [ ] Enroll the first founding member as the live test

### 4. Experience polish — non-blocking, pick the customer-facing few
Ref: `todo.md` (10 P1 items), `docs/EXPERIENCE_STANDARDS.md` (9 items)

- [ ] PortalLayout chrome (cream/parchment background + hairline borders)
- [ ] Status-badge palette audit (estimates / invoices / appointments)
- [ ] 360 member portal home concierge polish
- [ ] Defer the rest (CustomerSection redesign, InboxPage desk, branding tokens) to post-launch

### 5. Green-light and go
Ref: `MARKETING_READINESS_2026-04-28.md`

- [ ] Re-confirm prod health post-migration (re-run section 1)
- [ ] Test-suite hygiene: skip-filter the env-dependent tests so `pnpm test` is
      green by default (52 fail locally on missing secrets — not real failures)
- [ ] Drive marketing traffic / launch campaigns

## Owners

- **AIOS (Claude):** code verification, fixes, DB checks, keeping this plan current.
- **Marcin:** the browser/auth smoke tests in section 1, and the live 360
  enrollment in section 3.

## Source docs consolidated here (now historical / pre-migration)

- `MARKETING_READINESS_2026-04-28.md` — green-lit marketing 04-29, but predates the migration
- `MIGRATION_RUNBOOK.md` — §10 smoke tests, §11 rollback (migration now executed)
- `todo.md` — P1 experience-polish backlog
- `docs/EXPERIENCE_STANDARDS.md` — experience P1s
- `HANDOFF_CHECKLIST.md` — shipped-features log + manual verify steps
- `PORTAL_AUDIT_2026-04-28.md`, `CONSULTANT_BASELINE_TOOL_PLAN.md` — portal / 360 specifics
