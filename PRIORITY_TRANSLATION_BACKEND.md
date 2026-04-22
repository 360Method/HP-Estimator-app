# 360° Priority Translation — Backend Scaffold

**Branch:** `feat/priority-translation-backend`
**Status:** Scaffolded — does NOT build, merge, or deploy from current state.
**Blocker:** `origin/main` is in a broken git state (see below).

This document is the handoff: everything that has been built, everything
that's missing, and the exact steps to get the feature to production.

---

## 1. The broken-git-state blocker

`origin/main` (commit `7872601 feat: field tech PWA + time clock + missed call
auto-SMS`) only contains these files on disk:

```
client/src/App.tsx
client/src/pages/TechDashboard.tsx
client/src/pages/TechJobDetail.tsx
client/src/pages/TechLogin.tsx
drizzle/0002_time_logs.sql
drizzle/schema.ts
server/routers.ts
server/routers/tech.ts
server/twilio.ts
```

However, `server/routers.ts` imports ~25 other router files
(`./routers/payments`, `./routers/estimate`, `./routers/portal`, etc.) that
**exist on the local working copy but were never committed**. A fresh
`git clone` cannot build because every one of those imports fails.

The prior session (branch `claude/affectionate-rubin-b0785f`, commit `5e93a19`)
restored 11 truncated lines of `routers.ts` but did NOT restore the missing
router files. That branch still does not build.

**Resolution required before this feature can deploy:**

1. From the working copy of HP-Estimator-app on the owner's machine, stage
   and commit all the referenced-but-not-committed files on a fresh branch
   (e.g. `fix/restore-truncated-repo`).
2. Verify `npm ci && npm run build` (or pnpm equivalent) completes cleanly
   from a brand-new clone.
3. Merge that branch to `main`.
4. Rebase this branch (`feat/priority-translation-backend`) onto the fixed
   `main`.
5. Wire in the router + schema re-exports (Section 3 below).

Until step 1–3 land, **do not merge this branch to main** and **do not
attempt a Railway deploy**.

---

## 2. What's on this branch

```
drizzle/
├── 0045_priority_translations.sql         Postgres migration: 5 new tables
└── schema.priorityTranslation.ts          Drizzle schema mirroring the SQL

server/
├── routers/
│   └── priorityTranslation.ts             tRPC router: submit / getStatus / process
└── lib/
    └── priorityTranslation/
        ├── costRanges.ts                  Clark County USD range anchors (28 categories)
        ├── prompt.ts                      Claude system prompt (brand voice enforced)
        ├── processor.ts                   Orchestrator: address parse, Claude call, merge
        ├── pdf.ts                         Branded PDF renderer (pdf-lib)
        ├── email.ts                       Resend REST wrapper
        └── portalAccount.ts               Portal account + property + health record +
                                           magic-link helpers (7-day TTL, single-use)
```

### Schema entities (from `0045_priority_translations.sql`)

```
portal_accounts
  └── portal_magic_links (auth tokens)
  └── portal_properties
        └── home_health_records   ← the "living health record" per property
              └── findings[] jsonb  ← merged from all sources
        └── priority_translations  ← one per submitted inspection report
              ↑ linked to home_health_record (so findings roll up)
```

Baseline Assessments (Path B.2) will merge into the **same** `home_health_records`
row for a given property, so the portal has one source of truth per home.

### Voice compliance

All Claude prompts, email templates, and PDF copy have been scrubbed against
the HP brand doc's forbidden vocabulary (handyman, estimate, free, cheap,
affordable, budget, fix, repair-as-primary, simple, easy, best). Run this
before any merge that touches copy in this feature:

```bash
git diff main -- server/lib/priorityTranslation/ server/routers/priorityTranslation.ts \
  | grep -iwE '\b(handyman|estimate|free|cheap|affordable|budget|fix|repair|simple|easy|best)\b'
```

Expected output: nothing.

---

## 3. Wiring checklist (do after git state is fixed)

### 3a. Schema

Append to `drizzle/schema.ts` after the canonical schema is restored:

```ts
export * from "./schema.priorityTranslation";
```

### 3b. Router

Append to `server/routers.ts`:

```ts
import { priorityTranslationRouter } from "./routers/priorityTranslation";
// …inside the appRouter object:
priorityTranslation: priorityTranslationRouter,
```

### 3c. Dependencies

Verify these are in `package.json` (most already are — confirm):

```jsonc
{
  "dependencies": {
    "@anthropic-ai/sdk": "^0.x",   // processor.ts, prompt.ts — CHECK if present
    "pdf-lib": "^1.x",              // pdf.ts — present (used by invoices)
    "drizzle-orm": "^0.x",          // present
    "zod": "^3.x",                  // present
    "pdf-parse": "^1.x"             // ADD — loadReportText() needs it
  }
}
```

`pdf-parse` (or `pdfjs-dist`) is not yet in the repo. It's the last missing
piece for `loadReportText()` in `server/routers/priorityTranslation.ts`.

### 3d. Express multipart intake

The tRPC `submit` procedure expects `pdfStoragePath` or `reportUrl` — it does
NOT handle multipart itself. Add a thin Express middleware above the tRPC
handler that accepts the multipart upload, writes the PDF to the Railway
volume (or R2), and then calls `trpc.priorityTranslation.submit` with the
storage path.

Suggested shape (in `server/index.ts`):

```ts
import multer from "multer";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

app.post("/api/priority-translation/submit", upload.single("report_pdf"), async (req, res) => {
  let storagePath: string | undefined;
  if (req.file) {
    const id = randomUUID();
    storagePath = `priority-translations/${id}.pdf`;
    await writeToVolume(storagePath, req.file.buffer); // Railway volume helper
  }
  const result = await trpcCaller.priorityTranslation.submit({
    ...req.body,
    pdfStoragePath: storagePath,
  });
  res.json(result);
});
```

### 3e. Environment variables (Railway)

| Var                    | Purpose                                                                            | Required |
| ---------------------- | ---------------------------------------------------------------------------------- | :------: |
| `ANTHROPIC_API_KEY`    | Claude call in `processor.ts`                                                      |    ✅    |
| `RESEND_API_KEY`       | Email delivery in `email.ts`                                                       |    ✅    |
| `INTERNAL_WORKER_KEY`  | Shared secret gating the `process` tRPC procedure                                  |    ✅    |
| `PORTAL_BASE_URL`      | Base URL for magic-link emails (default `https://pro.handypioneers.com`)           |    ⚠️    |
| `UPLOAD_VOLUME_PATH`   | Railway volume mount path for PDF storage (e.g. `/data/uploads`)                   |    ✅    |
| `INTAKE_CC_ADDRESSES`  | Comma-separated BCC list for `sendPriorityTranslationReady` (defaults to `sales@`) |    ⚠️    |

### 3f. Queue + worker

The current `submit` flips status to `processing` inline. For production,
either:

- **Option A** (minimum viable): call `priorityTranslation.process` directly
  from `submit` in `setImmediate()` or a `setTimeout(0)`. Fine for low volume.
- **Option B** (proper): push the translation id to BullMQ / a Railway worker
  queue. Consumer calls `trpc.priorityTranslation.process({ id, workerKey })`.

Either is fine for launch. Flag `// TODO: enqueue` in the router marks where
to swap.

### 3g. Nurture sequence

Inside `submit`, after the insert there is a placeholder for:
`TODO: enqueue Path B nurture Sequence 2`. That depends on the (currently
missing from main) `server/automationEngine.ts`. Trigger once git is restored.

### 3h. CORS

`https://handypioneers.com` and the Railway preview origin must be on the
CORS allowlist on the HP-Estimator-app Express wrapper for the frontend's
POST to succeed cross-domain.

### 3i. Frontend endpoint switch

The manus frontend currently posts to its own Express fallback at
`/api/priority-translation/submit`. Once this backend ships, change
`SUBMIT_ENDPOINT` in
`client/src/pages/PriorityTranslation.tsx` to
`https://pro.handypioneers.com/api/priority-translation/submit`.

---

## 4. Test plan

### Unit (per module — add once `vitest` is wired)

- `processor.parseAddress` — parses "123 Main St, Vancouver, WA 98660"
- `processor.extractJson` — handles fenced + unfenced Claude output
- `processor.mergeFindings` — dedupes by `(source, source_id, category)`
- `portalAccount.findOrCreatePortalAccount` — idempotent on duplicate email
- `portalAccount.issueMagicLink` + `consumeMagicLink` — happy path, expiry,
  double-consume rejection
- `pdf.renderPriorityTranslationPdf` — snapshot of byte length + first page
  text for a fixture `claudeResponse`

### Integration

- `POST /api/priority-translation/submit` with a real Spectora sample PDF →
  assert `portal_accounts`, `portal_properties`, `home_health_records`, and
  `priority_translations` rows created, status = `processing`.
- Run `process` with a stubbed Claude response → assert PDF file written,
  email sent (use Resend test mode), status = `completed`, `delivered_at` set.

### End-to-end smoke

1. Submit form on `handypioneers.com/priority-translation` with PDF.
2. Check `priority_translations` table for the submitted row.
3. Receive email at test inbox; verify PDF attachment parses cleanly.
4. Click magic link → land in portal as authenticated user.
5. Re-submit with the SAME email + address → confirm existing portal account
   and property are reused; new translation appended to health record.

---

## 5. What's explicitly NOT done

| Item                                     | Why deferred                                              |
| ---------------------------------------- | --------------------------------------------------------- |
| `loadReportText` PDF extraction          | `pdf-parse` not yet added as a dep                        |
| Railway volume / R2 storage wrapper      | Pending decision on storage backend                       |
| Queue consumer (BullMQ or similar)       | Inline processing is fine for launch-week volume          |
| Path B nurture Sequence 2 enqueue        | `automationEngine.ts` is part of the broken git state     |
| Portal UI routes (`/portal/*`)           | Separate build; this branch is backend only               |
| Moving prompt + cost ranges to CMS       | Flagged TODO — see nucleus roadmap                        |
| `customers` table linkage                | Happens when portal user enrolls in 360° membership       |

---

## 6. Commit trail on this branch

```
a0c2730 feat(priority-translation): add tRPC router with submit/getStatus/process
[next] feat(priority-translation): add PDF renderer, Resend email, portal-account helpers
0e69c62 feat(priority-translation): add cost range table + Claude system prompt
7852596 feat(priority-translation): add Drizzle schema for portal + health record + translation tables
6698ff8 feat(priority-translation): add migration for portal, property, health record, translation tables
```

(`git log main..HEAD --oneline` on the branch.)
