# Staging Workflow

The HP-Estimator-app staging service serves both faces of the app on two
subdomains, so portal changes can be verified off-prod the same way staff changes are:

- `staging-pro.handypioneers.com` — staff app (estimator / CRM / admin).
- `staging-client.handypioneers.com` — customer portal (renders portal-only mode;
  `/admin` and `/onboarding` 404 here, same as `client.handypioneers.com`).

Both hostnames point at the one `hp-estimator-staging` service — the SPA build is
shared and decides which face to show by hostname (`client/src/App.tsx`
`PORTAL_HOSTNAMES`). Only the portal hostnames go in `PORTAL_HOSTNAMES`; the staff
domain is anything else pointed at the service.

## Infrastructure

| Piece | Value |
| --- | --- |
| Railway project | `enthusiastic-endurance` (`d3a9ee5b-ac78-4914-8210-45b1417297f4`) |
| Railway env | `production` (`0e57bbed-d422-42c5-9661-c1c931800379`) |
| App service | `hp-estimator-staging` (`3baf5e9c-8bb1-4718-b81e-33fa6ed621a8`) |
| DB service | `MySQL-Staging` (`1ebcffab-00d8-40ae-ac2d-19b652b8cfc6`) |
| Staff domain | `staging-pro.handypioneers.com` → `hp-estimator-staging` |
| Portal domain | `staging-client.handypioneers.com` → `hp-estimator-staging` |
| Branch | `staging` (tracked by the Railway service; autodeploys on push) |

The staging service has its own DATABASE_URL pointing at MySQL-Staging. All other
env vars (Stripe test keys, Resend, Anthropic, Twilio, Google, Cloudinary, PayPal,
QuickBooks) are the same values as prod, so staging talks to the same sandbox APIs.

Set `PORTAL_BASE_URL=https://staging-client.handypioneers.com` on the staging service
so magic-link and booking URLs in emails point at staging, not prod.

### Email safety on staging

Staging runs with `NODE_ENV=production` (Railway env is "production"), so outbound
email can't be gated on `NODE_ENV`. Instead `server/lib/email/resend.ts` keys off the
auto-injected `RAILWAY_SERVICE_NAME` (any service whose name contains "staging" is
treated as safe-mode). In safe mode, any recipient (to/cc/bcc) not already on
`@handypioneers.com` is redirected to `staging-sink@handypioneers.com` and the subject
is prefixed `[STAGING → original@addr]`, so a prod-copied DB can never email a real
customer. Override with `EMAIL_SAFE_MODE=1` (force on) or `EMAIL_SAFE_MODE=0` (force
off). The seed script's PII scrub (`staging+<id>@handypioneers.com`) is a second layer.

## Promote code: staging → main

1. Push a feature branch (or work directly on `staging`):

    ```bash
    git checkout staging
    git pull
    # ...edit...
    git push origin staging
    ```

2. Railway autodeploys to https://staging-pro.handypioneers.com. Watch the build in
   the Railway dashboard.

3. When it looks good, fast-forward main (preferred when staging is strictly ahead):

    ```bash
    git checkout main
    git pull
    git merge --ff-only staging
    git push origin main
    ```

   …or open a PR `staging → main` if you want review.

4. Prod (HP-Estimator-app) autodeploys from `main`.

## Reject staging: reset to main

If a staging experiment turns out badly and you want to abandon it:

```bash
git fetch origin
git checkout staging
git reset --hard origin/main
git push --force-with-lease origin staging
```

Railway redeploys staging from the current main.

## Refresh staging data from prod

```bash
export PROD_DATABASE_URL="mysql://...@<prod-host>:3306/railway"
export STAGING_DATABASE_URL="mysql://...@<staging-host>:3306/railway"
node scripts/seed-staging-from-prod.mjs
```

- Copies 20 customers (random sample) plus their properties, addresses,
  most-recent opportunity, and invoices (line items + payments).
- Scrubs PII: emails → `staging+<id>@handypioneers.com`; phones → fake 503-555
  variants. Addresses kept as-is (public).
- Idempotent: clears the same tables on staging before reseeding.
- Refuses to run if both URLs resolve to the same host.

Grab both URLs from the Railway dashboard:

- Prod DATABASE_URL → `HP-Estimator-app` service → Variables.
- Staging DATABASE_URL → `MySQL-Staging` service → Variables (`MYSQL_PUBLIC_URL`
  if running locally).

Set `SAMPLE_SIZE=50` to pull more customers.

## Known caveats

- **Schema/driver mismatch.** The app's Drizzle schema is declared with `pgTable`
  (Postgres) but `DATABASE_URL` is `mysql://` and existing scripts use
  `mysql2/promise`. This is an ongoing reconciliation (see
  `RECONCILIATION_REPORT.md`). Staging was provisioned with MySQL to match prod.
- **First staging deploy** needs a Railway build. Check
  https://railway.com/project/enthusiastic-endurance for progress if the domain
  404s right after creation.
- **Migrations**: run `pnpm db:push` against `STAGING_DATABASE_URL` the first
  time (or after schema changes) before running the seed script.
