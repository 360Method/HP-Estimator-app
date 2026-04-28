# Security Vulnerability Baseline — 2026-04-25

Source: `pnpm audit` (Snyk GitHub Actions token is CI-only; local audit produces
equivalent findings). 1,101 total dependencies scanned.

## Summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High | 18 |
| Moderate | 39 |
| Low | 1 |
| **Total** | **58** |

No criticals. Priority: fix the 2 production-reachable highs first.

---

## Top 10 by Priority

### P1 — Production-reachable, fix immediately

**1. `drizzle-orm` ^0.44.5 → HIGH**
SQL injection via improperly escaped SQL identifiers.
- **Risk:** HIGH — this is our production ORM; identifiers constructed from user
  input (e.g. dynamic column names) could allow injection.
- **Fix:** `pnpm update drizzle-orm` → 0.45.2+
- **Effort:** 15 min (check for `sql` template literal usage with dynamic identifiers)
- **Blocked by:** Drizzle-kit version compatibility — bump both together.

**2. `axios` ^1.12.0 → HIGH**
DoS via `__proto__` key in `mergeConfig`.
- **Risk:** MEDIUM — axios is used in server-side integration clients (GBP, Meta, Google Ads).
  A crafted response from an external API could cause a DoS.
- **Fix:** `pnpm update axios` → 1.13.5+
- **Effort:** 5 min (drop-in upgrade, no API changes)

**3. `path-to-regexp` (transitive via express) → HIGH**
ReDoS via multiple route parameters.
- **Risk:** MEDIUM — Express uses this for route matching. A crafted URL with
  malicious path params could block the event loop.
- **Fix:** Express 5.x bundles a patched version. Or: `pnpm add path-to-regexp@0.1.13`
  as a direct dep to override the transitive version.
- **Effort:** 30 min (test all API routes after upgrade)

### P2 — Build tools only, not reachable in production

**4. `pnpm` 10.x → HIGH (3 issues)**
Lifecycle script bypass, lockfile integrity bypass, command injection.
- **Risk:** LOW for production — affects local dev and CI pipelines only.
- **Fix:** Upgrade pnpm itself: `npm install -g pnpm@latest` + update `engines.pnpm` in package.json.
  Also update nixpacks.toml pnpm version to 10.27.0+.
- **Effort:** 15 min

**5. `tar` (transitive, build toolchain) → HIGH (6 issues)**
Multiple path traversal / symlink poisoning vulnerabilities.
- **Risk:** LOW — only triggered when extracting untrusted tarballs (e.g., npm install).
  Not reachable from production server.
- **Fix:** Transitive; resolved by upgrading the packages that depend on `tar`.
  Most resolve when pnpm and build toolchain are updated.
- **Effort:** Bundled with P2 pnpm upgrade.

**6. `rollup` (transitive via vite) → HIGH**
Arbitrary file write via path traversal.
- **Risk:** LOW — build tool only, not in production bundle.
- **Fix:** `pnpm update vite` → 7.3.2+ (bundles patched rollup).
- **Effort:** 10 min (vite upgrade may require config check)

**7-8. `vite` → HIGH (2 issues)**
Dev server `server.fs.deny` bypass and WebSocket arbitrary file read.
- **Risk:** ZERO in production — vite dev server never runs in prod.
- **Fix:** `pnpm update vite` → 7.3.2+ (same as rollup fix above).
- **Effort:** Bundled with rollup fix.

**9-10. `lodash` / `lodash-es` (transitive) → HIGH**
Code injection via `_.template` imports key names.
- **Risk:** LOW — only if lodash template is called with user-controlled key names.
  Not directly used in server code (transitive dep of other packages).
- **Fix:** `pnpm update lodash lodash-es`. If transitive, may require forcing version.
- **Effort:** 20 min

---

## Fix Priority Order

| Priority | Package | Fix | Est. Time | Blocks Deploy? |
|----------|---------|-----|-----------|----------------|
| 1 | `drizzle-orm` → 0.45.2 | `pnpm update drizzle-orm drizzle-kit` | 15 min | No |
| 2 | `axios` → 1.13.5 | `pnpm update axios` | 5 min | No |
| 3 | `path-to-regexp` → 0.1.13 | `pnpm add path-to-regexp@latest` | 30 min | No |
| 4 | `vite` + `rollup` | `pnpm update vite` | 10 min | No |
| 5 | `pnpm` → 10.27.0 | Upgrade pnpm globally + nixpacks.toml | 15 min | No |
| 6 | `tar` | Resolves with pnpm + vite upgrades | 0 min | No |
| 7 | `lodash` | `pnpm update lodash lodash-es` | 20 min | No |

**Total estimated effort: ~2 hours** for all 18 highs.

Moderate findings (39) are primarily additional vite dev-server and esbuild issues
that are also build-only. Not recommended for immediate action.

---

## Action for Marcin

1. Review P1 items — `drizzle-orm` and `axios` are direct production deps worth
   upgrading this week.
2. After upgrading drizzle-orm, run `pnpm check` and `pnpm test` to confirm
   no breaking changes.
3. Once `continue-on-error: true` is removed from the Snyk CI job, these
   findings will gate PRs on high/critical until fixed.
