# MIGRATION_RUNBOOK — MySQL → Postgres (Supabase) cutover

**Phase**: 4 (cutover). Tooling for this runbook lives in:
- `scripts/migrate-mysql-to-supabase.mjs` — bulk loader
- `scripts/verify-mysql-postgres-parity.mjs` — parity verifier

> **Hard rule**: do not start step 1 until the dry-run procedure (bottom of this
> doc) has been executed end-to-end against a non-prod target and verify passes.
> Cutover is the second time these scripts run — never the first.

## 0. Pre-flight (T−24h to T−0)

- [ ] Confirm the latest Railway MySQL snapshot is < 24h old. If not, request
      a fresh snapshot via Railway dashboard → Database → Snapshots.
- [ ] Confirm Supabase project `xyyjkpcfykddsqhyyjjx` is reachable; capture the
      pooler (port 6543) connection string for the cutover and a direct
      (port 5432) connection string for `db:push`.
- [ ] Send downtime announcement to customers/staff. Window: see "Cutover
      duration estimate" below. Pad by 2× for first attempt.
- [ ] Have these env vars ready in a local `.env.cutover` (NEVER committed):
      ```
      MYSQL_SOURCE_URL=mysql://...@railway-host:3306/railway?ssl=true
      POSTGRES_TARGET_URL=postgresql://...@supabase-host:5432/postgres?sslmode=require
      DATABASE_URL=postgresql://...@supabase-pooler:6543/postgres?sslmode=require&pgbouncer=true
      ```
- [ ] Check out the Phase 2 branch locally and run `pnpm install`. Don't push
      anything yet.
- [ ] Run `node scripts/migrate-mysql-to-supabase.mjs --self-test` — should
      print "All N self-test cases passed."

## 1. Pause Railway service (stop new writes)

- [ ] Railway dashboard → Service → Settings → Pause. This stops the web app
      from accepting requests; MySQL stays up so we can read from it.
- [ ] Confirm the public site returns 502/maintenance.
- [ ] Note the exact pause time — this is T0.

## 2. Take a final MySQL snapshot

- [ ] Railway dashboard → MySQL → Snapshots → Create snapshot. Label it
      `cutover-final-<YYYYMMDD>`.
- [ ] Wait until the snapshot status reads "Available". Do NOT proceed until
      this is durable — it's the rollback target.

## 3. Drop & recreate Supabase public schema

> If you are running the very first dry-run against the Supabase project,
> skip this for the dry-run target and use a throwaway DB instead. See
> "Dry-run procedure" below.

- [ ] Open psql against the Supabase DIRECT URL (port 5432):
      ```
      psql "$POSTGRES_TARGET_URL"
      ```
- [ ] Run:
      ```sql
      DROP SCHEMA public CASCADE;
      CREATE SCHEMA public;
      GRANT USAGE ON SCHEMA public TO postgres, anon, authenticated;
      ```
- [ ] `\q` to exit.

## 4. Apply Phase 2 schema to Supabase

The Phase 2 migration is `drizzle/0000_fair_ken_ellis.sql`.

Pick **one** of:

- **A.** From the Phase 2 branch:
      ```
      DATABASE_URL=$POSTGRES_TARGET_URL pnpm db:push
      ```
      (Runs `drizzle-kit generate && drizzle-kit migrate`.)

- **B.** Apply the SQL file directly:
      ```
      psql "$POSTGRES_TARGET_URL" -f drizzle/0000_fair_ken_ellis.sql
      ```

- [ ] Verify: connect with psql and run
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public';`
      You should see ~107 tables.

## 5. Load data: MySQL → Postgres

- [ ] Source the cutover env:
      ```
      set -a; source .env.cutover; set +a
      ```
- [ ] Run the loader with `--truncate` (clean cutover mode):
      ```
      node scripts/migrate-mysql-to-supabase.mjs --truncate 2>&1 | tee cutover-load.log
      ```
- [ ] Watch for `[FAIL]` lines. If any table errors:
      - Note the table name and error message.
      - The transaction for that single table rolls back; other tables already
        loaded are unaffected.
      - Fix the issue (likely a schema-drift quirk; see "Common failure modes"
        below) and re-run with `--only=<failed-table>` (no `--truncate` needed
        for re-run because that table's transaction rolled back, leaving it
        empty).
- [ ] On clean exit, the final summary should print `rows written` totaling the
      MySQL row sum. Record the elapsed time in the cutover log.

## 6. Verify parity

- [ ] Run:
      ```
      node scripts/verify-mysql-postgres-parity.mjs 2>&1 | tee cutover-verify.log
      ```
- [ ] Required: exit code 0, summary shows `count mismatches: 0`,
      `row mismatches: 0`, `orphan rows: 0`.
- [ ] **STOP if any mismatch.** Do not proceed to step 7. Diagnose:
      - Count mismatch: usually a load error in step 5; see the load log.
      - Row mismatch: type-coercion bug. Check `pgType` in the verifier output
        and update `coerceValueForPg` in the migrator. Re-run step 5 with
        `--only=<table>` + `--truncate`.
      - Orphan rows: a parent table has rows that didn't make it to PG, or a
        child table references a parent ID that was never in MySQL. Inspect
        the offending FK column on both sides.

## 7. Re-land Phase 2 code on `main`

> Phase 2 PR #85 was reverted. The application code on the deployed branch
> still expects MySQL. We need the Postgres-compatible code live before we
> flip the env var.

- [ ] On GitHub, restore the Phase 2 branch by reverting the revert commit
      (`9fbdc5a Revert "chore(db): convert MySQL → Postgres (Supabase) — Phase 2 code prep"`),
      OR cherry-pick the original commit (`784e1d5`) onto a new branch.
- [ ] Open a PR. Required: do not enable Railway auto-deploy until step 8.
- [ ] Merge. Railway auto-deploy will start building immediately — that's
      expected. The new build will fail to start because `DATABASE_URL` still
      points at MySQL while the code expects Postgres. That's the brief
      window we're about to close in step 8.

## 8. Flip Railway `DATABASE_URL` to Supabase

- [ ] Railway dashboard → Service → Variables → `DATABASE_URL`.
- [ ] Replace the MySQL URL with the Supabase pooler URL (the value of
      `$DATABASE_URL` from `.env.cutover`).
- [ ] Save. Railway will redeploy automatically.

## 9. Unpause & wait for healthy deploy

- [ ] Railway dashboard → Service → Settings → Resume.
- [ ] Watch the deploy log. Look for:
      - Successful start (no schema errors, no driver errors).
      - `/healthz` returning 200 for at least 60 consecutive seconds.
- [ ] If the deploy fails: re-pause the service, flip `DATABASE_URL` back to
      MySQL, redeploy. We are now in rollback (step 11 — abbreviated).

## 10. Smoke tests

Test these flows end-to-end in a browser. **Each must succeed:**

- [ ] `POST /api/public/inquiry` — submit a fake lead via the public booking
      wizard. Confirm a row appears in `onlineRequests`, `customers`, and
      `opportunities`. Confirm a portal magic-link email is sent.
- [ ] `GET /healthz` — returns 200.
- [ ] Portal login flow — request magic link, click it, land on portal home.
      Confirm `portalSessions` row created.
- [ ] Admin login — sign in as Marcin, open Inbox, confirm conversations list
      loads (paginated correctly).
- [ ] Open one existing customer profile, confirm opportunities/invoices load.
- [ ] Voice/SMS: trigger an outbound call from the dialer. Confirm `callLogs`
      and `messages` rows created.

If any smoke test fails: investigate before declaring success. A failure here
is recoverable (we still have the MySQL snapshot and can roll back via
step 11) but the cost of waiting is small.

## 11. 14-day rollback window

- [ ] Keep Railway MySQL plan PAID and snapshots retained for 14 calendar days
      post-cutover. Calendar block this date on the team calendar.
- [ ] Rollback procedure if needed:
      1. Pause the service.
      2. Revert the Phase 2 re-land PR on `main`.
      3. Flip `DATABASE_URL` back to the MySQL URL.
      4. Unpause.
      5. Restore the cutover-final MySQL snapshot (named in step 2) — only
         if data integrity issues are found post-cutover.
- [ ] After 14 clean days: archive Railway MySQL (snapshot to S3, then delete
      the Railway DB plan).

---

## Cutover duration estimate

**TBD pending dry-run.** Row counts will be captured during the dry-run
described below. The migrator targets < 30 minutes for production volumes;
add 10 min for `--truncate` + sequence resets, 5 min for `db:push`, 5 min for
verify, 10 min smoke testing → ballpark **~60 min total downtime**, gated on
dry-run measurement.

## Common failure modes

| Failure                              | Likely cause                                | Fix                                                                                  |
| ------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------ |
| `invalid input syntax for boolean`   | MySQL TINYINT(1) returned as int            | Should be auto-coerced; if not, verify pg column type in `information_schema.columns` |
| `invalid input syntax for json`      | MySQL TEXT column holding malformed JSON    | Inspect the row; if data is salvageable, clean it pre-load; else add migrator hook   |
| `value too long for varchar(N)`      | MySQL allowed longer strings than PG schema | Widen the PG column with `ALTER TABLE` before re-running                             |
| `duplicate key value violates ...`   | Re-run without `--truncate` after partial   | Re-run with `--truncate --only=<table>`                                              |
| `relation "<table>" does not exist`  | `db:push` didn't apply the migration        | Reapply step 4; verify all 107 tables present                                        |
| Verify: count mismatch               | A batch silently errored under load         | Check load log for that table; re-run `--only=<table> --truncate`                    |
| Verify: row mismatch on `json` col   | Coercion difference                         | Inspect the diff; if structural, fix `valuesEqual` JSON parsing; if data, widen      |

---

## Dry-run procedure (run before scheduling cutover)

The runbook above must be exercised against a non-prod target at least once.
The dry-run uncovers schema drift, coercion bugs, and gives a wall-clock
estimate for the real cutover window.

### Setup

Pick one of:

- **Option A — Local docker Postgres** (fastest, recommended):
  ```
  docker run -d --name hp-cutover-dryrun \
    -e POSTGRES_PASSWORD=dryrun \
    -e POSTGRES_DB=postgres \
    -p 55432:5432 \
    postgres:16
  ```
  `POSTGRES_TARGET_URL=postgresql://postgres:dryrun@localhost:55432/postgres`

- **Option B — Throwaway Supabase project** (closest to prod):
  Create a NEW Supabase project (not `xyyjkpcfykddsqhyyjjx`). Free tier is
  fine; we delete it after the dry-run. Use its connection string.

For the MySQL source, do NOT use the live Railway URL. Two safer choices:
- Restore the latest Railway snapshot into a separate Railway DB instance
  (Railway → Snapshots → "Restore to new database"). Use that URL.
- Or load a `mysqldump` of the snapshot into a local docker MySQL.

### Run

1. Apply the Phase 2 schema to the dry-run target:
   ```
   DATABASE_URL=$POSTGRES_TARGET_URL pnpm db:push
   ```

2. Run the loader with `--dry-run` first to print row counts without writing:
   ```
   node scripts/migrate-mysql-to-supabase.mjs --dry-run
   ```
   Capture the printed row counts — this is the input to the cutover
   duration estimate.

3. Run the loader for real:
   ```
   time node scripts/migrate-mysql-to-supabase.mjs --truncate 2>&1 | tee dryrun-load.log
   ```
   Capture wall-clock time. Multiply by 1.25 to get a safety-padded cutover
   estimate.

4. Run the verifier:
   ```
   node scripts/verify-mysql-postgres-parity.mjs 2>&1 | tee dryrun-verify.log
   ```

5. Triage every mismatch in `dryrun-verify.log`. Common patterns are listed
   above; fix in the migrator, re-run steps 3–4 until verify is green.

6. Update this runbook's "Cutover duration estimate" section with the
   measured wall-clock + 25% pad.

### Teardown

- Drop the dryrun docker container, or delete the throwaway Supabase project.
- Delete `dryrun-load.log` / `dryrun-verify.log` after archiving the metrics
  to the cutover plan doc — these logs may contain row contents.
