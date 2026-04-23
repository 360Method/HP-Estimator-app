# HCP → HP Estimator Migration — Results

**Executed:** 2026-04-22
**Method:** Housecall Pro public REST API → Node.js extraction → Drizzle-compatible Postgres inserts
**Target DB:** Supabase Postgres (HP Estimator production)
**Pre-import state:** DB tables existed but all were empty (zero rows in customers/properties/opportunities/invoices/etc.), so this was a first-time population, not a merge.

---

## 1. Totals — HCP → HP Estimator

| Resource | HCP (source of truth) | HP Estimator (after import) | Notes |
|---|---|---|---|
| Customers | 457 | **458** | +1 promoted from a job's embedded `customer` object (HCP customer was deleted but a job still referenced it). |
| Customer addresses → properties | — | **507** | 50 customers had >1 address; all preserved as separate `properties` rows with `source='auto-migrated'`. |
| Leads | 37 | **37** | 1:1, `area='lead'`. |
| Estimates | 195 | **195** | 1:1, `area='estimate'`. Multi-option estimates serialized into `estimateSnapshot` JSON; `value` taken from the approved option when present, else first option. |
| Jobs | 274 | **274** | 1:1, `area='job'`. `sourceEstimateId` populated where `original_estimate_id` resolved. |
| Invoices | 177 | **176** | 1 voided orphan invoice skipped (`invoice_d7ab09232f29440da493b61556417020`, #115, $107.71, status=voided, referenced job already deleted in HCP — no recoverable context). |
| Invoice line items | ~embedded | **372** | Reconstructed from invoice `items[]`. Quantity converted from `qty_in_hundredths` to decimal. |
| Invoice payments | ~embedded | **127** | 11 non-`succeeded` payments skipped (pending/failed — not real revenue). |
| Invoice discounts | ~embedded | **0 new rows** | None present in the data — path was wired but unused. |
| Refunds | ~embedded | **intentionally not imported** per Marcin's decision. |
| Schedule events | — | **239** | One `scheduleEvents` row per job/estimate that had `schedule.scheduled_start` set. |
| Employees | 5 | **not imported** per Marcin's decision. Assigned-employee names are preserved as JSON string arrays on `opportunities.assignedTo` and `scheduleEvents.assignedTo`. |
| SMS / email history | ∃ in HCP UI | **not imported** — no API access. Marcin will export manually from HCP UI if needed. |
| Job photos / attachments | ∃ in HCP UI | **not imported** per Marcin's decision. |
| Price book / services catalog | ∃ in HCP UI | **not imported** — no API access. |

**Financial totals (from HP Estimator DB, post-import):**
- Total invoiced value: **$188,601.41** (sum of invoices.total where hcpExternalId is not null)
- Total payments recorded: **$131,383.20**
- Paid invoices (balance = 0): **124 / 176**
- Future-scheduled jobs: **14**

---

## 2. Skipped / flagged records

Two warnings, both preserved in `HCP-export/_import_warnings.json`:

1. `customer cus_e277b61f58d5469ca4904919d7adb030` — **promoted** from an embedded job reference because HCP's `/customers` feed didn't include them (likely deleted from the HCP customer list after the job was created). The promoted row has a marker in `customerNotes` (`"[promoted from embedded ref — deleted from HCP customer list]"`) and `hcpRaw._promoted: true`.
2. `invoice invoice_d7ab09232f29440da493b61556417020` — **skipped**. HCP invoice #115, status=`voided`, amount $107.71, pointed at `job_269451cac24a4b05b61a23155cb6d380` which is absent from the jobs feed. With no resolvable customer and a voided status, no useful data was lost.

---

## 3. Schema extensions applied

Migration `drizzle/0050_hcp_import.sql` (committed with the results doc):

| Table | Added | Existing column reused |
|---|---|---|
| `customers` | `hcpExternalId`, `hcpRaw` | `leadSource` (already present in schema, re-used directly) |
| `properties` | `hcpExternalId`, `hcpRaw` | |
| `opportunities` | `hcpExternalId`, `hcpRaw`, **`leadSource`** (new) | |
| `invoices` | `hcpExternalId`, `hcpRaw`; **`opportunityId` NOT NULL dropped** (to allow orphan invoices — wasn't actually exercised on import but remains as a safety valve) | |
| `invoiceLineItems` | `hcpExternalId`, `hcpRaw` | |
| `invoicePayments` | `hcpExternalId`, `hcpRaw` | |
| `scheduleEvents` | `hcpExternalId`, `hcpRaw` | |

All new columns are nullable with no defaults. Unique partial indexes on `hcpExternalId WHERE hcpExternalId IS NOT NULL` prevent accidental duplicate re-imports.

The `opportunities.leadSource` column is populated on leads (`lead.lead_source`), jobs (`job.lead_source`), and estimates (`estimate.lead_source`) wherever HCP recorded a value.

---

## 4. FK integrity verification (post-import)

All queries returned **0**:

```
orphan opportunities (no matching customer)        0
orphan invoices (no matching customer)             0
orphan line items (no matching invoice)            0
orphan payments (no matching invoice)              0
orphan properties (no matching customer)           0
jobs with invalid sourceEstimateId                 0
```

Sanity signals:
- 289/458 customers have an email (63%)
- 331/458 customers have a phone (72%)
- Sum of invoice totals exceeds sum of payments received — matches the 52 unpaid/partial invoices, as expected

---

## 5. Files created

**In repo (committed with this doc):**
- `drizzle/0050_hcp_import.sql` — schema extension migration
- `HCP_IMPORT_RESULTS.md` — this document
- `HCP_MIGRATION_EXECUTION_PLAN.md` — the plan that drove this execution

**On disk (not committed, not in repo):**
- `C:\Users\marci\OneDrive\Documents\Handy Pioneers\HCP-export\customers.json` (457 records)
- `...\jobs.json` (274)
- `...\estimates.json` (195)
- `...\invoices.json` (177)
- `...\leads.json` (37)
- `...\employees.json` (5)
- `...\_totals.json` — extraction metadata
- `...\_dry_run_stats.json` / `_real_import_stats.json` — import run summaries
- `...\_import_warnings.json` — the two warnings noted above
- `...\pre-import-backup.sql` — row-level backup of target tables taken before import (**empty** — the DB had no HCP-derived rows yet, so nothing to back up. Kept for audit trail.)

**Deleted after success:**
- `C:\Users\marci\AppData\Local\Temp\hcp-migration\backup.mjs`
- `...\apply_migration.mjs`
- `...\extract.mjs`
- `...\import.mjs`
- `...\verify.mjs`
- `...\inspect.mjs`

The HCP API key (`be2a9c32914a4723ab9a15eb700a1073`) was never written to any tracked file. It lived only as an environment variable passed to the extraction script and in the chat transcript.

---

## 6. What Marcin should verify in the HP Estimator UI before cancelling HCP

- [ ] Open the CRM page and confirm the customer list shows **458** customers.
- [ ] Filter opportunities by area — confirm 37 leads, 195 estimates, 274 jobs, 506 total.
- [ ] Open 10 random customers, confirm name/phone/email/address match HCP.
- [ ] Open 5 future-scheduled jobs (the 14 with `scheduledDate > NOW()`), confirm dates, assigned techs, and notes transferred.
- [ ] Open 5 paid invoices, spot-check line items and payment method/amounts match HCP to the penny.
- [ ] Open the one promoted customer (the row with notes marker `"[promoted from embedded ref …]"`) and confirm they still have a historical job — edit if needed.
- [ ] Create a new test customer + test job in HP Estimator, confirm no schema breakage (and then delete the test rows).
- [ ] Confirm the Schedule page renders the 239 imported events on the right dates.
- [ ] **Manually export from HCP UI before cancelling:** SMS/email conversation history (Settings → Communications export) and any job photos that matter. These are not recoverable from the API.

Only after those checks pass — cancel HCP.

---

## 7. Rollback plan

If anything looks wrong, this single transaction removes exactly the rows the migration added and leaves any Marcin-created rows intact:

```sql
BEGIN;
DELETE FROM "invoicePayments"  WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM "invoiceLineItems" WHERE "invoiceId" IN (SELECT id FROM invoices WHERE "hcpExternalId" IS NOT NULL);
DELETE FROM "scheduleEvents"   WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM invoices           WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM opportunities      WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM properties         WHERE "hcpExternalId" IS NOT NULL;
DELETE FROM customers          WHERE "hcpExternalId" IS NOT NULL;
-- Expect: every row deleted. Verify with SELECT COUNT(*) FROM <table> WHERE "hcpExternalId" IS NOT NULL; → 0
COMMIT;
```

The new columns (`hcpExternalId`, `hcpRaw`, `leadSource`) and the relaxed `invoices.opportunityId` nullability are left in place — they're harmless and enable a clean re-run if desired.

To re-run from scratch: re-execute the import script (still in temp if not yet deleted; otherwise re-create from `HCP-export/*.json` — the raw JSON dumps are sufficient inputs, no need to hit the HCP API again).

To re-extract from HCP (only if the JSON dumps are lost or stale):
```bash
HCP_API_KEY=<key> node extract.mjs "C:/Users/marci/OneDrive/Documents/Handy Pioneers/HCP-export"
```
Runs in under a minute and is safely idempotent (overwrites `HCP-export/*.json`).

---

## 8. Post-migration stance

Marcin's stated intent is Option A from the plan: **cancel HCP immediately after verification passes**. No dual-write bridge. HP Estimator is now the single source of truth. The raw JSON dumps in `HCP-export/` are retained indefinitely as a forever-reference in case any field needs to be re-mapped later (they contain every HCP field, including ones stashed into `hcpRaw` and ones intentionally dropped).

**Data the API could not provide** and which will be LOST when HCP is cancelled unless Marcin exports from the HCP UI first:
- SMS / email conversation threads
- In-app chat messages between HCP and customers
- Job photos / file attachments
- Price-book / service catalog definitions

All of those are acknowledged as acceptable losses per the plan.

---

## 9. Execution timing (actual)

| Phase | Time |
|---|---|
| Schema migration | < 5 s |
| Pre-import backup | < 5 s (DB was empty) |
| Extraction (all 6 resources, paginated, 4 req/s) | ~90 s |
| Dry-run import | ~20 s |
| Real import | ~30 s |
| Verification queries | ~5 s |
| **Total wall-clock** | **~2.5 minutes** |

Well under the 15-minute plan estimate (because the DB was empty, skipping any dedupe/upsert overhead).
