# HCP → HP Estimator Migration — Execution Plan

**Status:** DRAFT — awaiting Marcin's approval before any extraction or DB writes.
**Supersedes:** `HCP_MIGRATION_PLAN.md` (CSV-based, obsolete).
**Author:** Claude, 2026-04-22.
**API key handling:** held only in-memory during execution. Scripts live in host temp dir, never committed. Raw JSON dumps land in `C:\Users\marci\OneDrive\Documents\Handy Pioneers\HCP-export\` and are not committed either.

---

## 1. API discovery — confirmed

- **Base URL:** `https://api.housecallpro.com`
- **Auth:** `Authorization: Token <api_key>` header (tested, 200 OK).
- **Pagination:** `?page=<n>&page_size=<n>`. Response envelope: `{ page, page_size, total_pages, total_items, <resource>: [...] }`.
- **Rate limits:** not exposed via response headers. HCP's public docs cite 300 req/min (~5/s). Script will self-throttle to 4 req/s with exponential backoff on 429/5xx.
- **No rate-limit headers** means we can't react dynamically — conservative pacing only.

### Resources probed (1 GET each, `page_size=1`)

| Endpoint | HTTP | total_items | Notes |
|---|---|---|---|
| `/customers` | 200 | **457** | Returns embedded primary `addresses[]` with id, type, street, city, state, zip. |
| `/jobs` | 200 | **274** | Embeds customer, address, notes[], schedule, assigned_employees[], `original_estimate_id`. Totals in cents. |
| `/estimates` | 200 | **195** | Each has an `options[]` array (1–N option quotes per estimate). |
| `/invoices` | 200 | **177** | Embeds `items[]`, `taxes[]`, `payments[]`, `refunds[]`, `discounts[]`. `job_id` FK. Totals in cents. |
| `/leads` | 200 | **37** | Embedded customer, address, `conversions[]` linking to estimate IDs. |
| `/employees` | 200 | **5** | Includes permissions & role. |
| `/payments` | **404** | n/a | No standalone endpoint — payments are embedded in invoices. |
| `/appointments` | **404** | n/a | No standalone endpoint — schedule info is embedded in jobs/estimates. |
| `/messages` | **404** | n/a | Communications (SMS, email threads, in-app chat) **not accessible via API**. |
| `/price_book/services` | **404** | n/a | Service catalog not accessible. Line items reconstructed from invoice `items[]` only. |
| `/schedule` | **404** | n/a | Use jobs/estimates `schedule` sub-objects. |

### Grand total primary records
**1,145** across customers + jobs + estimates + invoices + leads + employees.
Plus embedded rows we materialize into separate HP Estimator tables:
- Invoice line items: ~300 (sampled — 1–3 per invoice typical)
- Invoice payments: ~150 (most paid invoices have 1 payment)
- Invoice taxes: fold into invoice.taxRate/taxAmount
- Job / estimate notes: ~300–500 embedded
- Scheduled start/end → scheduleEvents: ~470 (jobs + estimates combined with schedule set)

**Est. total row inserts in HP Estimator DB: ~2,800–3,200.**

---

## 2. Table-by-table field mapping

### Schema extensions required (new columns, additive only)
Add to each target table via one migration (`drizzle/0050_hcp_import.sql`):
- `hcpExternalId` `varchar(64)` — HCP resource ID, unique per table. This is the dedupe key.
- `hcpRaw` `text` — nullable JSON blob of the original HCP record. Preserves custom fields, tags, permissions, attachments that have no first-class home. Readable via admin tools, opt-in display.

Applied to: `customers`, `properties`, `opportunities`, `invoices`, `invoiceLineItems`, `invoicePayments`, `scheduleEvents`, `users`.

### 2.1 HCP `customer` → `customers` + `properties`

| HCP field | HP Estimator column | Notes |
|---|---|---|
| `id` | `customers.hcpExternalId` | |
| `first_name` / `last_name` | `firstName` / `lastName` | null → "" |
| `email` | `email` | null → "" |
| `mobile_number` / `home_number` / `work_number` | `mobilePhone` / `homePhone` / `workPhone` | |
| `company` | `company` | |
| `notifications_enabled` | `sendNotifications` | |
| `lead_source` | `leadSource` | |
| `notes` | `customerNotes` | |
| `tags` | `tags` (JSON array) | |
| `created_at` / `updated_at` | preserved via direct write | bypass defaultNow |
| `addresses[0]` (primary) | `customers.street`/`unit`/`city`/`state`/`zip` **AND** new `properties` row | `street_line_2` → `unit`. **Set `properties.isPrimary = true`.** |
| `addresses[1..N]` | additional `properties` rows | label = "Service 2", etc. |
| `displayName` | derived = `firstName + " " + lastName` or `company` | |
| `customerType` | default `"homeowner"` | HCP doesn't distinguish. |
| `lifeCycleStage` | default `"customer"` if has jobs, else `"prospect"` | derived post-import |
| (HCP `company_id`) | dropped | always Handy Pioneers's company |

### 2.2 HCP `lead` → `opportunities` (area=lead)

| HCP | HP Estimator | Notes |
|---|---|---|
| `id` | `hcpExternalId` | |
| `customer.id` | `customerId` | must be resolved to HP customer ID (match by hcpExternalId) |
| `number` | `jobNumber` | prefix `"LEAD-"` |
| `pipeline_status` / `status` | `stage` | map: Won→"Won", Lost→"Lost", New→"New Lead", etc. |
| `lead_source` | stored in `notes` or `hcpRaw` | no first-class column on opportunity |
| `total_amount` | `value` | cents already |
| `tags` | merge into `hcpRaw` | opportunities has no tags column |
| `assigned_employee` | `assignedTo` (JSON array of one name) | |
| `conversions[].id` | `sourceEstimateId` | if conversion.type=="Estimate" |
| `created_at` / `updated_at` | preserved | |
| `lost_at` | `archivedAt` (if status=Lost) | |
| `job_fields` (custom) | `hcpRaw` | dropped from first-class schema |
| set `area` = `"lead"` | | |

### 2.3 HCP `estimate` → `opportunities` (area=estimate)

| HCP | HP Estimator | Notes |
|---|---|---|
| `id` | `hcpExternalId` | |
| `estimate_number` | `jobNumber` | prefix `"EST-"` |
| `customer.id` | `customerId` | resolved |
| `address.id` | `propertyId` | resolved via HCP address id → HP property |
| `work_status` | `stage` | scheduled→"Scheduled", completed→"Won", etc. |
| `schedule.scheduled_start`/`end` | `scheduledDate`/`scheduledEndDate` + `scheduleEvents` row | |
| `options[]` | **serialized to `estimateSnapshot` JSON** | HP Estimator has one opportunity per estimate; HCP allows N options. We store all options in the JSON snapshot with the accepted one marked. `value` = accepted option's `total_amount`, or sum/max if none accepted. |
| `options[].approval_status` == approved | drives `wonAt` | |
| `assigned_employees[]` | `assignedTo` (JSON array of names) | |
| `lead_source` | `hcpRaw` | |
| `notes` (nested) | `notes` | concatenated |
| `created_at` / `updated_at` | preserved | |
| set `area` = `"estimate"` | | |

### 2.4 HCP `job` → `opportunities` (area=job) + `invoices` + `scheduleEvents`

| HCP | HP Estimator | Notes |
|---|---|---|
| `id` | `opportunities.hcpExternalId` | |
| `invoice_number` | `opportunities.jobNumber` | |
| `description` | `opportunities.title` | truncate to 255 |
| `customer.id` | `customerId` | resolved |
| `address.id` | `propertyId` | resolved |
| `work_status` | `stage` | scheduled/in_progress/completed/canceled → "Scheduled"/"In Progress"/"Completed"/"Cancelled" |
| `original_estimate_id` | `sourceEstimateId` | resolved to HP opportunity ID |
| `total_amount` | `value` | cents |
| `subtotal` | stored on downstream invoice | |
| `outstanding_balance` | derived on invoice side | |
| `schedule.scheduled_start`/`end` | `scheduledDate`/`scheduledEndDate` + a `scheduleEvents` row (type=job) | |
| `schedule.arrival_window` | `scheduleNotes` | as free text |
| `assigned_employees[]` | `assignedTo` | JSON array of names |
| `notes[]` (embedded) | `notes` (concat) + copies to job activity log in `jobActivity` JSON | |
| `tags` | `hcpRaw` | |
| `work_timestamps.completed_at` | `wonAt` | |
| `canceled_at` | `archivedAt` + `archived=true` | |
| `created_at` / `updated_at` | preserved | |
| set `area` = `"job"` | | |
| If job has matching HCP invoice (by `job_id` FK on invoice side) | create `invoices` row (see 2.5) | |

### 2.5 HCP `invoice` → `invoices` + `invoiceLineItems` + `invoicePayments`

| HCP | HP Estimator | Notes |
|---|---|---|
| `id` | `invoices.hcpExternalId` | |
| `invoice_number` | `invoiceNumber` | |
| `job_id` | `opportunityId` | resolved to HP opportunity |
| — | `customerId` | inherited from the job |
| `status` | `status` | paid→"paid", pending/open→"sent" or "due", void→"void"; partial payment → "partial" |
| `amount` | `total` | cents |
| `subtotal` | `subtotal` | cents |
| `due_amount` | `balance` | cents |
| `taxes[0].rate` | `taxRate` | basis points (HCP already stores e.g. 8900 = 8.9% ✓ matches HP convention) |
| `taxes[0].amount` | `taxAmount` | cents |
| `taxes[0].name` | `taxLabel` | |
| `taxes[1..]` | `hcpRaw` | HP invoice supports only one tax row. Flag in import log. |
| `discounts[]` | reduce `subtotal` OR add a line item `"Discount"` with negative unit_price | **decision: add negative line item for traceability** |
| `due_at` | `dueDate` | |
| `paid_at` | `paidAt` | |
| `sent_at` / `invoice_date` | `issuedAt` | `invoice_date` preferred, fallback `sent_at` |
| `service_date` | `serviceDate` | |
| `items[]` | `invoiceLineItems` rows | see below |
| `payments[]` | `invoicePayments` rows | see below |
| `refunds[]` | `hcpRaw` (and flag in report) | HP Estimator has no refund table yet. |
| `type` derivation | "deposit" if invoice precedes job completion, else "final" | default "final" |

**`invoiceLineItems` from `invoice.items[]`:**
| HCP | HP | Notes |
|---|---|---|
| `id` | `hcpExternalId` | |
| `name` | `description` | |
| `qty_in_hundredths` ÷ 100 | `qty` | |
| `unit_price` | `unitPrice` | cents already |
| `amount` | `total` | cents already |
| `type` (labor/service/material) | `hcpRaw` | drop or stash — HP schema doesn't have type |

**`invoicePayments` from `invoice.payments[]`:**
| HCP | HP | Notes |
|---|---|---|
| `id` | `hcpExternalId` | |
| `payment_method` | `method` | credit_card→"stripe", cash→"cash", check→"check", ach→"other", etc. |
| `amount` | `amount` | cents |
| `paid_at` | `paidAt` | |
| `note` | `note` | |
| `status` ≠ "succeeded" | skipped | log in report |
| `surcharge_fee_amount` | added as a separate line if > 0, else `hcpRaw` | |

### 2.6 HCP `employee` → `users` (optional)
Only needed if Marcin wants employees to sign in to HP Estimator. Otherwise keep `assignedTo` as a freeform text name list (current HP behavior) and skip this table. **Recommendation: skip for now**, map names as strings. Re-invite employees through HP Estimator's own auth later.

### 2.7 HCP schedule sub-objects → `scheduleEvents`
For every job or estimate with `schedule.scheduled_start` set:
- `type` = "job" or "estimate"
- `title` = opportunity title
- `start` / `end` = scheduled_start / scheduled_end
- `opportunityId` / `customerId` = linked
- `assignedTo` = names from `assigned_employees[]`
- `notes` = arrival_window note

---

## 3. Fields with no home in HP Estimator

Decision per field below. Default is **stash into `hcpRaw` JSON on the owning row**; drop only where explicitly stated.

| HCP field | Decision |
|---|---|
| `company_id` / `company_name` | Drop (always Handy Pioneers). |
| Employee `permissions` object | Drop (HP Estimator has its own permission model). |
| Employee `avatar_url`, `color_hex` | Stash in `users.hcpRaw` for future import. |
| Customer `additional emails / phones` beyond the 3 primaries | HP schema has `additionalPhones`/`additionalEmails` JSON fields — populate if HCP returns them (not observed in sample). |
| Estimate `options[]` (multiple) | **Serialized into `estimateSnapshot` JSON**; also summarized into one "value" field. |
| Invoice `refunds[]` | Stash in `invoices.hcpRaw`. Flag in post-import report. |
| Invoice `discounts[]` | Converted to negative line item for traceability. |
| Invoice multiple tax rows | First row → taxRate/taxAmount/taxLabel; rest → `hcpRaw`. Flag. |
| Job `tags[]`, Estimate `tags[]` | Stash (opportunities has no tags column). |
| Job `job_fields` (HCP custom fields) | Stash in `opportunities.hcpRaw`. |
| Job `assigned_route_template_id` | Drop. |
| Attachments / photos on jobs | **Not pulled** — not surveyed in probe and potentially requires per-job GETs (274+195 extra calls). Out of scope for this migration unless Marcin flags it as needed. |
| SMS / email messages | **Not accessible via API.** If Marcin needs them, export from HCP UI before cancellation. |
| Price book / service catalog | Not accessible. Keep HP Estimator's existing pricebook UI. |

---

## 4. Highest-risk field mappings (the three worth watching)

1. **Estimate `options[]` → single opportunity.** HCP lets one estimate have multiple option quotes (Option A/B/C). HP Estimator is one-opportunity-per-estimate. Mitigation: stuff all options into `estimateSnapshot` JSON, pick `value` from the accepted option (or max if none accepted). **If an estimate has `approval_status=approved` on multiple options, that is unexpected and should be flagged in the dry-run log.**
2. **Job ↔ invoice linking.** 274 jobs but only 177 invoices. Some jobs have no invoice (in-flight / canceled) — mapping must not fail when invoice is missing. Some invoices have `job_id` → find their job; if job is missing, create the invoice anyway with `opportunityId=null` (schema would need to allow this — currently notNull). **Schema mismatch: `invoices.opportunityId` is `notNull`. Either backfill a placeholder opportunity or relax the constraint.** Recommendation: relax in the migration (drop NOT NULL) — it's safer and matches real-world data.
3. **Customer dedupe on re-run.** Customers are matched by `hcpExternalId` on upsert. If Marcin has *manually* added a customer in HP Estimator between now and cutover who duplicates an HCP customer (same name/phone), the import won't merge them. Mitigation: dry-run report flags any HP customer whose name+phone matches an HCP customer but has no hcpExternalId — Marcin reviews those pre-merge.

---

## 5. Execution time estimate

| Phase | Duration |
|---|---|
| Schema extension migration (add hcpExternalId + hcpRaw columns, relax invoices.opportunityId nullability) | 1 min |
| Extraction — pull 6 resource types paginated at 4 req/s | **5 min** (~24 paginated requests at worst) |
| Write raw JSON dumps to `HCP-export\` | 30 s |
| Dry-run import — parse, transform, log what would change | **3 min** |
| Marcin reviews dry-run log | **15–30 min** (manual) |
| Real import — transactional upserts, chunked per table | **5 min** |
| Verification queries (row counts, orphan checks, FK integrity) | 1 min |
| **Total automated wall-clock** | **~15 min** |
| **Total including Marcin's review** | **30–45 min** |

---

## 6. What Marcin must verify AFTER the import runs, BEFORE cancelling HCP

Run these spot-checks against the HP Estimator app UI and a direct DB session:

**Row-count sanity**
- [ ] `SELECT COUNT(*) FROM customers WHERE "hcpExternalId" IS NOT NULL;` = **457**
- [ ] `SELECT COUNT(*) FROM opportunities WHERE "hcpExternalId" IS NOT NULL AND area='lead';` = **37**
- [ ] `SELECT COUNT(*) FROM opportunities WHERE "hcpExternalId" IS NOT NULL AND area='estimate';` = **195**
- [ ] `SELECT COUNT(*) FROM opportunities WHERE "hcpExternalId" IS NOT NULL AND area='job';` = **274**
- [ ] `SELECT COUNT(*) FROM invoices WHERE "hcpExternalId" IS NOT NULL;` = **177**
- [ ] `SELECT COUNT(*) FROM properties WHERE "hcpExternalId" IS NOT NULL;` ≥ **457** (each customer has ≥1)

**FK integrity**
- [ ] Zero orphan opportunities: `SELECT COUNT(*) FROM opportunities o LEFT JOIN customers c ON o."customerId"=c.id WHERE c.id IS NULL;` = 0
- [ ] Zero orphan line items / payments relative to invoices.
- [ ] Every job's `sourceEstimateId`, if set, resolves to an existing estimate opportunity.

**Data integrity spot-check**
- [ ] Open the 10 most-recently-created customers in the HP Estimator CRM. Name, phone, email, address, tags, customerNotes all populated correctly.
- [ ] Open 5 scheduled jobs with future dates. Scheduled date/time matches HCP. Assigned employees match. Notes preserved.
- [ ] Open 5 paid invoices. Line items, tax, payment method, paidAt, total, balance all match HCP's numbers to the penny.
- [ ] Open 3 estimates with multiple options. Confirm `estimateSnapshot` preserves all options. Confirm displayed `value` is sensible.
- [ ] Open 3 leads with status Won/Lost. Confirm stage and archivedAt are correct.

**Business-continuity**
- [ ] Create a new customer and a new job in HP Estimator. Confirm it saves with auto-generated IDs (no collision with HCP IDs). No schema breakage.
- [ ] Send a test invoice to yourself via HP Estimator. Confirm Stripe/email path still works (unrelated to migration but flushes any regression).
- [ ] Pull the 5 most recent HCP-sourced jobs and verify the customer portal (if used) still renders them.
- [ ] Export customer list to CSV from HP Estimator. Row count matches 457.

**Manual-export backup for things the API won't give us**
- [ ] SMS / email conversation history — export from HCP UI manually (Settings → Communications export).
- [ ] Job photos / attachments — export from HCP UI per job if needed, OR explicitly decide to drop.
- [ ] Price-book / service catalog — screenshot or export from HCP UI if you want reference; HP Estimator's own pricebook is the source of truth going forward.

Only after all checkboxes pass → cancel HCP subscription.

---

## 7. Green-light conditions (when to actually execute the import)

Do NOT run the real import until all of these are true:

1. Marcin has read this plan and approved it (reply "execute" or similar in chat).
2. A pre-import DB backup has been taken: `pg_dump` of at minimum the tables `customers`, `properties`, `opportunities`, `invoices`, `invoiceLineItems`, `invoicePayments`, `scheduleEvents`. Stored somewhere outside the repo with a timestamp. The dry-run script will refuse to run the real import if the backup file isn't referenced.
3. Dry-run output has been reviewed and row counts match the totals above (457 / 37 / 195 / 274 / 177) within ±1%.
4. Dry-run log shows **zero unmapped required fields** and no FK resolution failures.
5. No active users are editing HP Estimator at the moment of import (simple coordination — Marcin pauses the team for ~10 min).
6. The schema migration `0050_hcp_import.sql` has been reviewed and applied to the target DB.

If any item above is false → halt and investigate.

---

## 8. Rollback plan

If the real import goes wrong:

**Fast path (preferred — surgical undo):**
```sql
BEGIN;
DELETE FROM "invoicePayments" WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM "invoiceLineItems" WHERE "invoiceId" IN (SELECT id FROM invoices WHERE "hcpExternalId" IS NOT NULL);
DELETE FROM invoices WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM "scheduleEvents" WHERE "opportunityId" IN (SELECT id FROM opportunities WHERE "hcpExternalId" IS NOT NULL);
DELETE FROM opportunities WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM properties WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM customers WHERE "hcpExternalId" IS NOT NULL;
-- Verify counts == 0 on the hcpExternalId filter
COMMIT;
```
Because `hcpExternalId` is populated only on migrated rows, this removes exactly what we added and leaves Marcin-authored rows untouched.

**Nuclear path (only if fast path fails or corruption is suspected):**
Restore from the pre-import `pg_dump`. Accept loss of any non-HCP rows Marcin may have added post-backup (should be zero if we coordinated per green-light #5).

**Leaving the schema additions in place** after rollback is fine — the new `hcpExternalId` / `hcpRaw` columns are nullable and unused unless re-populated on a future attempt.

---

## 9. Post-migration stance

Once verification passes, Marcin's options:

**Option A — clean break (recommended):** Cancel HCP immediately. HP Estimator is the single source of truth going forward. No ongoing sync cost. Any HCP-only data Marcin wanted (messages, attachments) must already be exported.

**Option B — dual-write bridge:** Leave a scheduled script pulling HCP deltas (customers/jobs/invoices updated_at > last_sync) into HP Estimator until Marcin feels confident, THEN cancel. Cost: weeks of drift risk, harder reconciliation. Only worth it if Option A's verification leaves unresolved doubts.

Marcin's stated intent ("cancel HCP soon after migration") points to Option A.

---

## 10. Open questions for Marcin before execution

1. **Attachments / photos** — pull them (adds ~500 API calls + S3 upload step, +20 min)? Or drop?
2. **Employees as users** — create 5 user rows, or leave as plain name strings on `assignedTo`?
3. **Refunds** — any dollar value on HCP refunds worth reconstructing, or OK to stash in `hcpRaw`?
4. **Lead-source reporting** — we preserve `lead_source` on customers but not on opportunities (no column). Want a new column, or fine with stashing?
5. **Who else needs to be paused** while import runs? Any teammate actively editing the DB?
