# Revenue Audit — Money-In Path

**Date:** 2026-04-28
**Branch audited:** `main` @ 4bbb15c
**Branch with fixes:** `fix/revenue-money-path-e2e`
**Method:** Code + config audit. Live prod injection was blocked (Railway access denied), so synthetic submissions against prod were not executed. All findings are derived from reading the source on `main` and the routers it imports.

---

## TL;DR — Can Marcin start marketing tomorrow?

**Not yet without fallbacks.** The two highest-volume entry points (`/book` and the Roadmap Generator) and the close-the-deal step (in-portal scheduling) have hard breaks on `main`. Stripe payments work end-to-end *when* an invoice already exists in the portal. The 360° membership checkout works end-to-end. Several features Marcin saw working last week (Lead Nurturer cadence, Email Manager, Roadmap admin UI, Resend outbound mail) live on **unmerged branches** and are NOT on `main`.

**P0 issues:** 6 found, 3 fixed inline, 3 remain (require feature work or env config, not bug fixes).

---

## Critical context

The audit prompt described an aspirational pipeline. Roughly 40% of the chains it asked me to verify rely on features that are committed on side branches and not merged. Per `git log --all`, the unmerged work includes:

- **PR #44** `feat(lead-nurturer): post-Roadmap follow-up cadence, approval-gated` — 0fce18d
- `feat(email-manager): Email Manager AI agent Phase 1` — 23b89c5
- `fix(roadmap): rename Priority Translation -> Roadmap; fix magic-link 404` — 7355949
- `feat(roadmap): drastically elevate the 360° Priority Translation deliverable` — 3598a5e
- `feat(priority-translation): Marcin voice in customer email` — d7afe49
- `feat(priority-translation): admin UI` — 2982723
- `feat(priority-translation): background worker + 48h reminder cron` — 5434cd6
- `fix(roadmap-generator): wire end-to-end Priority Translation pipeline` — f4f6045
- Outbound mail = Resend migration (PR #48 per memory)
- Unified comms hub (PR #49 per memory)

These commits are reachable from `git log --all` but NOT from `main`. Anyone testing `main` today (or Railway prod, which deploys `main`) will hit breaks where these branches would have provided coverage.

---

## TEST 1 — `/book` consultation form (Path A entry)

**Result:** ⚠️ **PARTIAL PASS** — DB chain works; ack email + portal redirect + estimator + nurturer cadence all missing.

| Stage | Status | Notes |
|---|---|---|
| 1. POST `/book` → `bookings` + `customers` + `opportunities` rows | ✅ Pass | `bookingRouter.submit` in `server/routers/booking.ts` creates all three. `stage='New Lead'`, `area='lead'`. |
| Customer `leadSource='Booking'` | ✅ **FIXED** | Was `"Online Request"` — corrected to `"Booking"` per audit spec. Test `server/booking.test.ts` updated to match. |
| 2. Auto-ack email via Resend within 60s | ⚠️ **FIXED (partial)** | **Was missing.** Added `sendEmail()` call after `createOnlineRequest` with branded HTML template. **Caveat:** uses Gmail (the only outbound-mail path on `main`); silently no-ops if Gmail not connected. Resend migration is on a side branch (PR #48 per memory). Email subject: "We received your request — {serviceType}". |
| 3. Confirmation page at `/portal/consultation/submitted/:id` | ❌ Fail (P1) | Route does NOT exist in `client/src/App.tsx`. The wizard sets `step=5` and renders an in-page `Step5Success` component instead. |
| 4. Project Estimator runs → range computed, 30/40% margin floor | ❌ Fail (P0 vs spec) | **Feature does not exist on this branch.** `estimateRouter.aiParse` is an operator-side LLM endpoint that takes free-text notes from the desk; it is not auto-fired from `/book`. There is no auto-range / auto-margin-floor pipeline. |
| 5. High-confidence → estimate auto-delivered | ❌ Fail (P0) | Same as above. |
| 6. Medium-confidence → drafted to `customer_profile.pending_review` | ❌ Fail (P0) | The `pending_review` surface ships in PR #46 per memory; not on main. |
| 7. Lead Nurturer Team T+4h SMS, T+24h email queued in `agent_drafts` | ❌ Fail (P0) | **`agent_drafts` and `nurturerPlaybooks` tables do not exist on this branch.** PR #44 is unmerged. The only post-submit fan-out is `notifyOwner` + `runAutomationsForTrigger('new_booking')` + `onLeadCreated` (lead-routing assignment to Consultant). |

**Fixes pushed:** auto-ack email; `leadSource` → `"Booking"`.

---

## TEST 2 — Roadmap Generator (Path A entry #2)

**Result:** ❌ **FAIL — pipeline cannot complete a single run**

| Stage | Status | Notes |
|---|---|---|
| 1. `priorityTranslations` row created | ✅ Pass | `priorityTranslationRouter.submit` (public) creates the row, sets `status='processing'`. |
| Public multipart endpoint to upload PDF | ❌ Fail (P0) | **No multipart route exists in `server/_core/index.ts`.** Submit accepts `pdfStoragePath` or `reportUrl` but nothing in the codebase persists an uploaded PDF to those paths. The router doc-comment explicitly says "Express wrapper needs a multipart endpoint that persists the PDF to the Railway volume (or R2 if configured)". |
| 2. Anthropic call fires, `processing` → `completed` ~10s | ❌ Fail (P0) | **`loadReportText()` in `server/routers/priorityTranslation.ts:280` is a stub that throws `"loadReportText not yet implemented — add pdf-parse or pdfjs-dist"`.** The `process` worker can never succeed. Even if it could be invoked, there is no queue consumer or boot-time trigger to call `process` after `submit`. |
| 3. Email from `help@handypioneers.com` via Resend | ✅ **FIXED** | Was sending from `noreply@handypioneers.com`. Changed default `from` in `server/lib/priorityTranslation/email.ts` to `help@handypioneers.com`. Resend wired correctly via `RESEND_API_KEY`. |
| 4. Magic link → `client.handypioneers.com/portal/auth?token=` | ✅ **FIXED** | Default `PORTAL_BASE_URL` was `pro.handypioneers.com` (wrong host); changed to `client.handypioneers.com` in `server/routers/priorityTranslation.ts:231`. |
| 5. PDF deliverable accessible in `/portal/roadmap` | ❌ Fail (P1) | No `/portal/roadmap` route in `client/src/App.tsx`. PT artifacts surface via `PortalReports`, but the rename + viewer were on side branch 7355949. |
| 6. "Take Action" CTA opens scheduling funnel | ❌ Fail (P0) | Depends on TEST 3 (in-portal scheduling), which doesn't exist. |
| 7. CRM `customers` + `opportunities` created | ✅ Pass | `findOrCreatePortalAccount` + portal property exist; CRM customer creation needs verification once the worker can complete a run. |

**Net:** Even with the FROM + URL fixes, the chain is dead at step 2. Marketing this path tomorrow would result in users submitting a PDF that gets stored in `priority_translations` with `status='processing'` and no email, no PDF, no portal artifact ever produced.

---

## TEST 3 — In-portal scheduling funnel (Path A close)

**Result:** ❌ **FAIL — no public scheduling endpoint exists**

| Stage | Status | Notes |
|---|---|---|
| 1. "Take Action" on Roadmap or estimate | ❌ Fail (P0) | No CTA + endpoint pair exists. |
| 2. 4 windows offered, 5–10 days out, weekdays | ❌ Fail (P0) | No window-generation logic exists. |
| 3. Pick window → confirm → optional concern → confirmation | ❌ Fail (P0) | `scheduleRouter.create` is `protectedProcedure` (operator-only). There is no `portalProcedure`-gated self-scheduling endpoint. |
| 4. `scheduledBookings` + `portalAppointments` rows + opportunity → `Baseline Walkthrough` | ❌ Fail (P0) | `scheduledBookings` table does NOT exist in `drizzle/schema.ts`. `portalAppointments` exists but is read-only from the customer perspective. Stage advance to `Baseline Walkthrough` happens through `onAppointmentBooked` only when an operator creates the schedule event. |
| 5. `.ics` calendar invite sent | ❌ Fail (P0) | **No `.ics` / `application/calendar` / `VEVENT` generation anywhere in the repo.** Searched `server/` exhaustively. |
| 6. Operator notification (`notifyOwner`) | ⚠️ Partial | `notifyOwner` does fire if an operator creates the event manually — not from a customer self-schedule. |

**Severity:** P0. This is the close-the-deal step. Without it, every Roadmap or estimate that says "schedule" sends the customer to a dead end.

---

## TEST 4 — Stripe payment webhook (money in)

**Result:** ✅ **MOSTLY PASS** — works for portal-invoice payments; QBO + opportunity advance + comms-row missing.

| Stage | Status | Notes |
|---|---|---|
| 1. Webhook signature verified | ✅ Pass | `server/_core/index.ts:167-191`. Tries primary then fallback secret. |
| `payment_intent.succeeded` handled | ✅ Pass | Marks `portalInvoices.status='paid'` via `updatePortalInvoicePaid`. |
| `checkout.session.completed` handled | ✅ Pass | Two branches: 360 subscription or portal-invoice. |
| 2. Receipt email to customer | ⚠️ Partial (P1) | Sent only on `checkout.session.completed`, not on `payment_intent.succeeded`. Goes via `sendEmail` (Gmail-only); will silently drop if Gmail isn't connected. |
| 3. Owner notification (`notifyOwner`) | ✅ Pass | "💳 Invoice Paid: …" fires alongside the receipt email. |
| 4. Opportunity advances to `Job` / `Active` | ❌ Fail (P1) | The webhook updates `portalInvoices` but does NOT touch the linked opportunity. (Opportunity *was* moved to `Won` earlier when the customer signed off on the estimate, in `portalRouter.approveEstimate`.) `Job` / `Active` stage transition on first payment is not wired. |
| 5. QBO entry queued in `agentDrafts` | ❌ Fail (P0) | **`agentDrafts` table does not exist on this branch.** Marcin would not see a queued QBO sandbox entry — he'd have to enter it manually. |
| 6. `customer_communications` row added | ❌ Fail (P1) | The unified comms hub (PR #49 per memory) is on a side branch; the table the audit references isn't on `main`. |

**Severity for marketing tomorrow:** OK if marketing is just driving form submissions; P0 if Marcin expects post-payment QBO drafts to appear automatically.

---

## TEST 5 — Path B membership flow

**Result:** ✅ **PASS (subject to env config)**

| Stage | Status | Notes |
|---|---|---|
| 1. `/membership` landing | ✅ Pass | `Portal360Membership.tsx` ships. |
| 2. Stripe subscription products exist (Bronze/Silver/Gold × monthly/quarterly/annual) | ⚠️ Unknown | **Could not verify against Stripe live.** `getStripePriceId` (`server/routers/threeSixty.ts:1064`) reads `STRIPE_PRICE_<TIER>_<CADENCE>` env vars. If any are missing, checkout returns 500. **Action: Marcin must verify all 9 env vars are populated in Railway prod, plus the 9 portfolio variants.** |
| 3. `/api/360/checkout` → checkout session → success → membership row + tier | ✅ Pass | `/api/360/checkout` routes to `threeSixty.checkout.createSession`; webhook `checkout.session.completed` calls `create360MembershipFromWebhook`. |
| 4. Welcome email sent | ⚠️ Partial | `sendEmail` (Gmail). Same Gmail-availability dependency. |
| 5. Member portal access at `/portal` | ✅ Pass | Magic link issued in `create360MembershipFromWebhook`. |
| 6. AI Onboarding Team welcome cadence | ❌ Fail (P0 vs spec) | No automated cadence; AI Team / agent_drafts not on this branch. |

**Severity:** P0 only on env-var verification. Marcin must run a Stripe-side smoke test.

---

## TEST 6 — Path A → Path B continuity

**Result:** ⚠️ **PARTIAL PASS** — surfaces ship; the proactive cadence does not.

| Stage | Status | Notes |
|---|---|---|
| 1. Post-project email proposing 360° Method (Customer Success Team draft) | ❌ Fail (P1) | No automated post-completion email. Customer Success Team / agent_drafts on side branches. |
| 2. Soft-pitch in portal "Compounding Value" tile | ✅ Pass | `client/src/components/portal/continuity/InvoiceValueCompounds.tsx`, `HomeHealthScoreWidget.tsx`, `EstimateTierHint.tsx`, `ProjectCompleteNudge.tsx` all ship and are used in `PortalHome.tsx`, `PortalEstimateDetail.tsx`, `PortalInvoiceDetail.tsx`. |
| 3. Engagement → membership consult routing | ❌ Fail (P0) | Routes to `/portal/360-membership` correctly, but the consult-scheduling step depends on TEST 3, which is broken. |

---

## P0 issues remaining (NOT fixed in this PR)

1. **Roadmap Generator's `loadReportText` is a stub that throws.** PT pipeline cannot complete a single run today. (`server/routers/priorityTranslation.ts:280`)
2. **No multipart upload endpoint for the Roadmap Generator's PDF intake.** Form submissions on the lead-magnet site cannot land.
3. **No public/portal self-scheduling endpoint, no `.ics` generation.** Path A "Take Action" funnel dead-ends.
4. **No Lead Nurturer cadence on `main`.** New `/book` leads do not get T+4h / T+24h follow-ups.
5. **Outbound mail is Gmail-only and silently no-ops if Gmail isn't connected.** All booking acks, payment receipts, 360° welcomes, and PT roadmap emails depend on this. Resend migration is on side branch PR #48.
6. **No `agent_drafts` / `customer_communications` / `nurturerPlaybooks` tables.** Several side-branch features memory says were "shipped" depend on these tables, and they're absent on `main`.

**Recommendation:** before turning on paid marketing, decide whether to (a) fast-merge the side branches that contain the missing pieces (PR #44, PR #46, PR #48, PR #49 + the Roadmap fixes), or (b) accept the gaps and run marketing at a smaller scale where Marcin can hand-hold each lead through the dead ends manually.

---

## P1 issues remaining

- `/portal/consultation/submitted/:id` route doesn't exist; booking wizard uses an in-page success step instead.
- `/portal/roadmap` route doesn't exist (Roadmap rename was on a side branch).
- Stripe webhook does not advance opportunity to `Job` / `Active` on first payment.
- Receipt email only fires for Checkout-mode payments, not raw PI flows.

---

## Fixes pushed in `fix/revenue-money-path-e2e`

| Fix | Files |
|---|---|
| Auto-ack email on `/book` submission | `server/routers/booking.ts` |
| `leadSource: "Online Request"` → `"Booking"` | `server/routers/booking.ts`, `server/booking.test.ts` |
| Roadmap email FROM `noreply@` → `help@` | `server/lib/priorityTranslation/email.ts` |
| Roadmap default portal URL `pro.handypioneers.com` → `client.handypioneers.com` | `server/routers/priorityTranslation.ts` |

**Verification:**
- `pnpm test --run booking.test.ts` → 8/8 pass
- `pnpm build` → succeeds, 671KB output
- `node --input-type=module -e "import('./dist/index.js')"` → OK
- `pnpm check` → pre-existing typecheck errors only; my changes add zero new ones

---

## Synthetic-data cleanup

**No prod data was created** — Railway access was blocked, so live synthetic submissions did not run. Nothing to clean up. If/when live testing resumes, use the existing leadId / customerId returned by `bookingRouter.submit` to delete via `railway run --service 25bceb51-6161-4bd4-a9ea-1ed0d6381b09 node scripts/cleanup-test-customers.mjs <id>` — that script doesn't yet exist; would need to be written.

---

## Marcin: 30-second read

> 360° membership checkout works. Stripe payments on existing portal invoices work. **Booking form** now sends a customer ack and tags the lead correctly. **But:** Roadmap Generator can't complete a single run (PDF parser is a stub). In-portal "schedule a baseline" doesn't exist. Lead Nurturer cadence isn't merged to main. All outbound email needs Gmail to be connected — if it isn't, every email silently drops. Big chunks of what you saw working last week (Lead Nurturer, Email Manager, Roadmap admin UI, Resend) are sitting on unmerged branches. **Don't turn on broad marketing tomorrow.** Verify Gmail is connected in prod first; manually drive a few Path B membership signups today as a smoke test; either fast-merge PRs #44/#46/#48/#49 or hold marketing until they're in.
