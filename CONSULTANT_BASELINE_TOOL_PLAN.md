# Consultant On-Site Baseline Capture Tool — Design Plan

**Status:** PLAN ONLY. No code yet. Needs Marcin sign-off on the open questions at the bottom before build starts.
**Home:** operator app (HP-Estimator-app). Lives alongside the existing Consultant role built in the lead-routing work.
**Target runtime:** mobile browser (iPad + iPhone), installable PWA.

---

## 1. Why this exists

Handy Pioneers Consultants visit customer homes to run a Baseline Walkthrough. Today that is a paper-and-follow-up-email process. We want a phone-first tool that lets the Consultant:

1. Capture findings room-by-room while walking the home.
2. Instantly generate a NOW / SOON / WAIT roadmap the customer can read on the spot.
3. Hand the customer a signed scope of work + collect (or schedule) payment before leaving.
4. Roll everything into the customer's living `homeHealthRecord` so the portal and the operator CRM stay in sync.

If the customer declines, the Consultant flips the visit into a nurture handoff and the roadmap still lives in the customer profile so we can re-engage later.

---

## 2. User flow (operator side)

1. **Dispatch** — Consultant opens the app, sees today's scheduled Baseline visits. Card per visit shows customer name, address, appointment time, and a "Start Walkthrough" CTA. Offline-tolerant: cached on load, writes queue until reconnected.
2. **Findings entry** — Tabbed by room/system, matching the existing living health record categories (Roof, Exterior, HVAC, Plumbing, Electrical, Structure, Interior, Appliances, Safety, etc.). Inside each tab the Consultant can add findings. Per finding:
   - Short description (required)
   - Urgency: `NOW` / `SOON` / `WAIT` (required)
   - Investment range: low / high dollar (optional; defaults from the Priority Translation cost-range table by category so the Consultant is picking a modifier, not typing a number)
   - Notes (markdown-lite)
   - Photos (0-N). Camera-first upload.
3. **Review / preview** — One-tap rollup: counts per urgency bucket, total investment range, PDF preview.
4. **Customer review + signature** — Hand the phone to the customer. They tap through the roadmap and sign.
5. **Conversion decision**
   - **Accept** → flip findings into a scope-of-work estimate, collect signature + payment (on-site or Stripe link).
   - **Decline** → mark visit declined, attach reason, hand off to Nurturer role.
6. **Close-out** — Roadmap PDF emailed to customer + stored in their portal. Opportunity in CRM is updated or created. `homeHealthRecord` is merged with the new findings.

All status transitions already emit customer-centric notifications per the recent lead-routing refactor (ed121bd).

---

## 3. Data model

### New tables

```
baselineWalkthroughs
├── id                 varchar(64) PK
├── customerId         FK → customers.id     (root, per the Settings-as-SoT rule)
├── opportunityId      FK → opportunities.id  nullable — set on sale conversion
├── consultantUserId   FK → users.id         who ran the visit
├── scheduledFor       timestamp
├── startedAt          timestamp NULL
├── completedAt        timestamp NULL
├── status             enum('scheduled','in_progress','customer_review',
│                            'accepted','declined','nurture_handoff','cancelled')
├── signatureUrl       text NULL             customer signature S3 URL
├── signedAt           timestamp NULL
├── totalLowCents      int
├── totalHighCents     int
├── declineReason      text NULL
├── createdAt / updatedAt
└── INDEX (customerId), INDEX (consultantUserId, scheduledFor)

baselineFindings
├── id                 varchar(64) PK
├── walkthroughId      FK → baselineWalkthroughs.id
├── homeHealthRecordId FK → homeHealthRecords.id  set on completion for merge
├── category           varchar(64)           Roof, HVAC, Plumbing, …
├── title              varchar(200)
├── description        text
├── urgency            enum('NOW','SOON','WAIT')
├── investmentLowCents int
├── investmentHighCents int
├── notes              text
├── photoUrls          json                  array of S3 URLs
├── sortOrder          int
└── createdAt / updatedAt
```

### Links to existing schema

- `customers` — root entity, matches the rule in memory (`feedback_customer_is_root`).
- `homeHealthRecords` — on `completedAt`, findings roll up into this table's `findings` JSON so the portal shows ONE unified record per property, whether the source was a Priority Translation upload or a Consultant walkthrough.
- `opportunities` — on `accepted` we either create a new opportunity (area = "estimate") or attach to one the dispatcher pre-wired.
- Existing photo infrastructure (`@aws-sdk/client-s3`) handles uploads. No new storage.
- Existing notification / lead-routing pipeline handles role transitions (see `server/leadRouting.ts`).

---

## 4. UI surfaces

| Route | Purpose |
|---|---|
| `/consultant` | Today's scheduled Baseline visits + past-7-day history |
| `/consultant/baseline/:id` | Capture form, tabbed by category, offline-tolerant |
| `/consultant/baseline/:id/review` | Preview summary + NOW/SOON/WAIT rollup |
| `/consultant/baseline/:id/sign` | Customer signature + accept/decline decision |
| `/consultant/baseline/:id/convert` | Findings → scope of work conversion, payment capture |

Shell: existing operator app shell. Consultant role already exists (see `d5a3333`), so routing is just a sub-section rather than a new shell.

---

## 5. PWA / offline

- Service worker with stale-while-revalidate for the visit list, network-first for writes.
- IndexedDB queue for findings POSTs + photo uploads while offline. Flushed on `online` event.
- The baseline capture page must not block on the network for finding creation — everything is local-first, then synced.
- Existing repo already ships a service worker (`client/public/` per earlier audit) so we extend rather than add.

---

## 6. Payment

**Default path:** Stripe Checkout link. Consultant generates a link, customer taps it on their own phone, pays. Fewer moving parts, no hardware, works everywhere we travel.

**Optional path (phase 2):** Stripe Terminal with a BBPOS WisePOS E reader. Better customer experience for on-site close; adds hardware logistics. Decision flagged in the open questions.

---

## 7. Integration with what is already built

- **Lead routing** — Consultant role already exists in the schema + routers (`d5a3333`). New tables FK to `users.id` with that role; no new role required.
- **Customer-centric notifications** — all status transitions route through the existing customer-profile timeline.
- **Human-in-loop review** — the Priority Translation / Roadmap Generator flow has a Claude draft → Marcin review → publish checkpoint. The Consultant path BYPASSES this because the Consultant is authoring findings directly, not Claude. No review queue.
- **Portal / 360° Membership continuity** — accepted baselines surface in the customer portal the same way Priority Translations do (via the Path A → Path B continuity surface shipped in `2610795`).

---

## 8. Estimated build

**40-60 hrs.** Breakdown:

| Chunk | Hours |
|---|---|
| Schema + migration + drizzle types | 3 |
| tRPC router (CRUD on walkthroughs + findings, finalize, sign, convert) | 8 |
| Mobile capture form (tabs, per-finding dialog, photo upload) | 14 |
| Offline queue (service worker + IndexedDB sync) | 8 |
| Signature canvas + PDF render (reuses `pdf-lib` setup from invoices) | 4 |
| Conversion screen + payment link generation | 6 |
| Integration into CRM opportunity + homeHealthRecord merge | 5 |
| Tests (vitest + Playwright for mobile flows) | 6 |

---

## 9. Dependencies to add (none, probably)

- `signature_pad` — already in package.json.
- `@aws-sdk/client-s3` — already used for photos.
- `pdf-lib` — already used by the Priority Translation renderer.
- `stripe` — already used for checkout sessions.
- Stripe Terminal SDK — ONLY if we go the hardware route.
- No new queue, no new storage, no new auth.

---

## 10. Reference patterns from the homeowner app (`360Method/360-method-app`)

Cloned to `~/hp-360-method-ref` (Clerk + Supabase + React/Vite). Do NOT copy wholesale — homeowner UX ≠ operator UX, auth stack is Clerk/Supabase ≠ our Jose/MySQL, data model overlaps only partially. But these are concrete patterns to model after:

### 10.1 Category list — reuse the SYSTEM_METADATA registry

`src/components/baseline/systemMetadata.jsx` has a full registry of 14+ home systems with:
- `emoji` (visual tab marker)
- `color` (token)
- `whereToFind` / `visualCues` (Consultant hint copy)
- `quickTip` (risk framing — "Small roof leak = $20K-40K disaster")

**Action:** lift the category list + copy verbatim into the operator tool so the Consultant sees the exact same labels the homeowner already sees in their portal. Category names become shared canonical strings.

### 10.2 Walkthrough route ordering — reuse `PhysicalWalkthroughWizard` zones

`src/components/baseline/PhysicalWalkthroughWizard.jsx` encodes an optimized physical walk:

1. Mechanical/Utility Room (HVAC, Plumbing, Electrical, Water/Sewer)
2. Basement / Crawlspace
3. Interior Living Spaces
4. …exterior, roof, landscaping

Copy the route ordering + the explanatory `why` text. A Consultant walking a home should see the same "start in the mechanical room — 70% of emergencies live here" framing.

### 10.3 Quick-start kit — copy the `QUICK_START_SYSTEMS` prioritization

`BaselineWizard.jsx` defines a 4-system quick-start (HVAC / Water Heater / Roof / Electrical) with "why" framing per system. For a 15-minute Consultant visit this is the MVP surface.

### 10.4 Cascade risk scoring — reuse `CascadeEstimator` constants

`src/components/shared/CascadeEstimator.jsx` has per-system `baseRisk` + `costMultiplier` tables and a `SEVERITY_MULTIPLIER` map. Use this to auto-populate "if deferred, likely cost in N months" alongside each finding on the customer-facing PDF.

### 10.5 Seasonal scheduling — pull `seasonalHelpers.jsx` verbatim

`src/components/schedule/seasonalHelpers.jsx` parses windows like `"September-November"`, `"Spring"`, `"Every 3 months"` into concrete date predicates. The operator tool will schedule SOON/WAIT work into seasonal windows — same logic should apply.

### 10.6 Priority vocabulary — TRANSLATION NEEDED

Homeowner app uses `Emergency | High | Medium | Low` (see `AddToCartDialog.jsx`, `EditCartItemDialog.jsx`, `maintenance_tasks.priority`).
Operator tool will use `NOW | SOON | WAIT` per Marcin's spec.

**Decision needed (flagged in questions below):** either unify to one vocabulary or ship a deterministic mapping:
```
NOW  ↔ Emergency + High
SOON ↔ Medium
WAIT ↔ Low
```
If we map, the homeowner portal can display either bucket, and a finding created in the operator tool renders cleanly in the homeowner app.

### 10.7 Photo analysis prompts — reuse AI_PROMPTS

`SystemFormDialog.jsx` has per-system Claude prompt templates that decode brand / model / serial / year from data-plate photos. If we want the Consultant tool to auto-fill equipment metadata from a photo, these prompts are already tuned.

---

## 11. Shared code — monorepo vs duplicate

| Should be shared | Should stay per-app |
|---|---|
| Category canonical names + slugs | React components (different stacks — TS+tRPC vs JSX+Supabase) |
| Priority bucket mapping (NOW/SOON/WAIT ↔ Emergency/High/Medium/Low) | Auth wiring |
| Cascade risk data tables | Capture form UX |
| Seasonal window parser | Dashboard views |
| Brand voice / copy rules | Marketing pages |

**Recommendation:** extract a tiny `@handy-pioneers/shared-taxonomy` package that contains:
- the category list (names, slugs, colors, emojis)
- the NOW/SOON/WAIT bucket map
- the cascade risk data
- the seasonal window parser

This package is published to both repos (via a git submodule or a private npm publish). Nothing more. Avoid a full monorepo rewrite — the two apps have diverged far enough on stack that a shared React component layer would fight both codebases.

**Defer** the shared-package work until AFTER the operator tool MVP ships. Copy the constants for v1, extract once they have proven stable in both apps.

---

## 12. Decisions Marcin already made (for consistency)

Pulled from the reference app — the operator tool should match these defaults so homeowner + operator see the same world:

- **Category names** — use the exact strings from `systemMetadata.jsx` ("HVAC System", "Plumbing System", "Roof System", …). Do NOT rename to "Roof" / "Plumbing".
- **Condition vocabulary** — homeowner baseline uses `Good | Fair | Poor` for system condition. If we want a condition field alongside urgency, use the same 3 values.
- **Risk framing copy** — the "Small roof leak = $20K-40K disaster" style quick-tips are Marcin's voice. Reuse verbatim.
- **Walkthrough order** — mechanical room first. Locked in.
- **Photo UX** — camera-first, multi-shot, data-plate close-up prompted.

---

## 13. Open questions for Marcin

These block the build. None are blocking the plan itself.

1. **Payment capture** — Stripe Checkout link (customer pays on their phone) or Stripe Terminal hardware? Default to Checkout link unless you want hardware logistics.
2. **Signature capture** — finger-drawn canvas (`signature_pad`, already in deps) or typed-name legal agreement? Canvas is higher-friction but legally stronger.
3. **Minimum viable v1** — can we ship without photos, as a text-only capture tool, and add photo upload in v2? (Would shave ~8-10 hours off the estimate.)
4. **NOW auto-opportunity** — when the Consultant flags a finding NOW, should that auto-create an opportunity with `area=estimate` immediately, or wait until the customer accepts the full roadmap?
5. **Homeowner/operator vocabulary** — pick one:
   - (a) Operator uses NOW/SOON/WAIT natively, we map to Emergency/High/Medium/Low on sync.
   - (b) Both apps adopt NOW/SOON/WAIT; retrofit the homeowner app.
   - (c) Both apps adopt Emergency/High/Medium/Low; drop NOW/SOON/WAIT branding.
6. **Shared-taxonomy package** — timing preference? Build-time constant duplication for MVP (my recommendation), or carve out the package upfront?

---

## 14. Out of scope (for v1)

- Multi-Consultant dispatching / route optimization (a single Consultant per visit is fine).
- Recurring-visit scheduling from the Consultant tool (Settings already manages this).
- Contractor sub-dispatch from findings (lives in the PM role, already shipped).
- Direct integration with Stripe Terminal hardware (phase 2).
- On-device PDF signing (we render server-side; customer signs on device; signature is an image).

---

*End of plan.*
