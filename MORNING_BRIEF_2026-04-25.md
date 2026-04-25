# Morning Brief — 2026-04-25

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
