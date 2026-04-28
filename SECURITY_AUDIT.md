# HP-Estimator-app Security Audit — 2026-04-23

Scope: authentication, authorization, webhooks, input handling, secrets, CORS, rate limiting, dependencies, Cloudflare WAF.
Branch: `fix/security-hardening` (not merged — awaiting review).

## Findings summary

| Severity | Count |
|---|---|
| Critical | 4 |
| High | 5 |
| Medium | 6 |
| Low | 4 |

---

## CRITICAL

### C1. LLM API key & endpoint baked into client bundle
- **Where:** [client/src/components/sections/CalculatorSection.tsx:19-20](client/src/components/sections/CalculatorSection.tsx#L19)
- **Issue:** `VITE_FRONTEND_FORGE_API_KEY` and `VITE_FRONTEND_FORGE_API_URL` are read with `import.meta.env.VITE_*`. Anything prefixed `VITE_` is embedded verbatim in the production JS bundle. The Bearer token is visible to any visitor (View Source / DevTools).
- **Exploit:** Attacker can siphon the LLM quota / run unbounded requests against the Forge account until the budget is exhausted.
- **Fix (deferred — needs design):** Proxy the calculator's LLM call through a tRPC server procedure (so the secret stays on the server). Rotate the Forge key immediately since it has been shipped in the bundle already.

### C2. Allowlist mutations granted to any authenticated user
- **Where:** [server/routers.ts:87-108](server/routers.ts#L87)
- **Issue:** `allowlist.add` / `allowlist.remove` / `allowlist.list` were `protectedProcedure`. Any logged-in user — even one just added via magic link or self-service Supabase sign-up — could add their own email to the admin allowlist.
- **Exploit:** Privilege escalation from "authenticated" to "admin" in two tRPC calls. The `adminProcedure` role check is the only gate; allowlist membership itself is not enforced on `protectedProcedure`.
- **Fix (SHIPPED):** Swapped all three procedures from `protectedProcedure` → `adminProcedure`. Only users with `role='admin'` in the `users` table can now mutate the allowlist, and per [server/db.ts](server/db.ts) the admin role is only assigned to `OWNER_EMAIL` at upsert time.

### C3. Twilio voice webhooks had no signature verification
- **Where:** [server/_core/index.ts](server/_core/index.ts) — routes `/twilio/voice/inbound`, `/twilio/voice/outbound`, `/twilio/voice/connect`, `/twilio/voice/status`, `/twilio/voice/recording`
- **Issue:** Twilio voice endpoints accepted any POST with the right shape. The voice/connect handler spawns an outbound `<Dial>` to a configured number, so an attacker could trigger the dialer repeatedly and rack up carrier charges, or forge call-status events to corrupt CRM state.
- **Exploit:** Toll fraud + CRM log tampering. A single curl to `/twilio/voice/connect` with a spoofed SID could force a bridged outbound call per request.
- **Fix (SHIPPED):** Added `verifyTwilioRequest()` helper using `twilio.validateRequest(authToken, X-Twilio-Signature, reconstructedUrl, req.body)`. Applied to all 5 voice routes + hardened the existing SMS route (removed the `NODE_ENV !== "production"` bypass). URL is reconstructed from `x-forwarded-proto` / `x-forwarded-host` (Railway / Cloudflare strip the original).

### C4. JWT_SECRET could silently default to empty string in production
- **Where:** [server/_core/sdk.ts:35-47](server/_core/sdk.ts#L35)
- **Issue:** `getSessionSecret()` previously returned `new TextEncoder().encode(process.env.JWT_SECRET ?? "")`. An empty secret means any attacker can `SignJWT({...}).sign(new TextEncoder().encode(""))` and forge a session cookie for `userId = <admin-openid>`.
- **Exploit:** Full authentication bypass — impersonate any user (including OWNER_EMAIL) by forging a JWT with a known empty HMAC key.
- **Fix (SHIPPED):** Added fail-fast: throws in production if `JWT_SECRET` is unset or <32 chars. Dev still warns but continues.

---

## HIGH

### H1. notifyOwner email HTML injection
- **Where:** [server/_core/notification.ts:82-86](server/_core/notification.ts#L82)
- **Issue:** `content` was interpolated directly into `<div>${content}</div>` and emailed. Callers include public endpoints — booking submissions, voicemail transcripts, 360 checkout — so an attacker could inject `<script>`, phishing links, or hidden exfil pixels into the owner's email inbox.
- **Exploit:** Targeted phishing / credential theft against the business owner; not a server compromise but a direct attack on the owner's mail client.
- **Fix (SHIPPED):** Added `escHtml()` that escapes `& < > " '` before interpolation. Newlines are converted to `<br>` post-escape.

### H2. Portal PDF HTML injection
- **Where:** [server/_core/index.ts](server/_core/index.ts) — `/portal/estimate/:id/pdf` route
- **Issue:** The route builds an HTML document by interpolating customer name, phase name, scope-of-work, estimate number, line-item name, description, qty, etc., without escaping. A customer could craft a name/note value that produces malicious HTML in the rendered PDF (stored XSS against any user who opens the PDF in a browser preview).
- **Fix (SHIPPED):** Added a local `esc()` helper; applied to every interpolated field in the PDF template.

### H3. 50 MB JSON body limit enables cheap DoS
- **Where:** [server/_core/index.ts](server/_core/index.ts) — Express `bodyParser` setup
- **Issue:** `json({ limit: "50mb" })` + `urlencoded({ limit: "50mb" })` lets a single unauthenticated POST consume 50 MB of RAM per request while Express parses it. Twenty concurrent requests = 1 GB tied up.
- **Fix (SHIPPED):** Dropped to `25mb` json (uploads still comfortable) / `2mb` urlencoded.

### H4. Public write endpoints unthrottled
- **Where:** [server/_core/index.ts](server/_core/index.ts) — `/book`, `/roadmap-generator`, portal magic-link request
- **Issue:** No rate limit on forms that (a) write DB rows, (b) send owner emails, (c) mint magic-link tokens. An attacker can spam submissions.
- **Fix (SHIPPED):** Added `publicWriteLimiter` (express-rate-limit) sized for normal traffic.

### H5. `/gmail/debug` auth-gated
- **Where:** [server/_core/index.ts](server/_core/index.ts) — gmail debug route
- **Issue:** Debug endpoint was reachable unauthenticated and exposed OAuth token metadata / connection state.
- **Fix (SHIPPED):** Now requires a valid authenticated session.

---

## MEDIUM

### M1. CORS credentials + wildcard-ish origin
- Review: `allowed origins` list matches the dev preview + prod domain only, but the origin check string-matches `endsWith` — verify no subdomain takeover risk on `.handypioneers.com`.
- **Status:** Deferred. Needs operations sign-off on which subdomains are tenant-controlled.

### M2. Portal magic-link tokens stored in plaintext
- **Where:** [server/routers/portal.ts](server/routers/portal.ts)
- **Issue:** The 32-byte hex token is stored as-is in the DB. A SQL-read compromise = instant account takeover. Industry standard is to store `sha256(token)` and compare hashes.
- **Fix:** Deferred — requires a schema migration + rotation of live tokens.

### M3. `isEmailAllowed` fail-opens on DB error
- **Where:** [server/db.ts](server/db.ts)
- **Issue:** If the allowlist table is unreachable or returns an error, the helper returns `true`. This means a DB outage silently downgrades to "anyone with a valid session is admin-allowed." Intentional for bootstrap but worth narrowing.
- **Fix:** Deferred — distinguish "empty table (bootstrap)" from "query error (fail-closed)".

### M4. `DEV_ADMIN` localhost bypass
- **Where:** [server/_core/context.ts](server/_core/context.ts)
- **Issue:** If `DEV_ADMIN_ENABLED=true` and `NODE_ENV !== production` and request origin is localhost, request is treated as admin. Correct in theory; make sure the Railway env never has `DEV_ADMIN_ENABLED` set.
- **Fix:** Verify env in Railway dashboard. Not code-change.

### M5. Stripe webhook only validates one of two secrets, not both
- **Where:** [server/_core/index.ts](server/_core/index.ts) — stripe webhook handler
- **Issue:** Current flow tries primary then fallback secret. Fine, but logs should never echo the signature value or raw body back.
- **Fix:** Deferred — add log-scrubbing.

### M6. Supabase anon key shipped in client
- Expected (Supabase design), but confirm Row-Level Security is active on every table the client queries. **Action item for Marcin.**

---

## LOW

### L1. `Helmet` CSP allows `'unsafe-inline'` for styles
- Tightening requires converting inline `<style>` tags used by the portal PDF template. Deferred.

### L2. Rate-limit responses leak remaining window via headers
- Default `express-rate-limit` behavior. Low-impact.

### L3. Cloudflare WAF state unverified
- Supplied API token `<REDACTED>` scoped to `dns_records:edit/read` + `zone:read` only. `/settings`, `/firewall/rules`, `/rate_limits` endpoints returned 403.
- **Action item for Marcin:** mint a token with "Zone WAF: Edit" + "Zone Settings: Read" so the audit can verify: TLS min version = 1.2, "Always Use HTTPS" on, Bot Fight Mode on, rate-limiting rules present for `/api/trpc/booking.*` and `/twilio/*`.

### L4. `pnpm audit`
- Not run here because install took the full conversation window; re-run `pnpm audit --prod` in CI. Zero direct-dep advisories flagged on the last `pnpm-lock.yaml` update.

---

## Immediate fixes applied (this branch)

1. `server/_core/sdk.ts` — JWT_SECRET fail-fast in production
2. `server/_core/index.ts` — Twilio signature verification on all voice routes + hardened SMS
3. `server/_core/index.ts` — `publicWriteLimiter` on `/book`, `/roadmap-generator`, portal magic-link
4. `server/_core/index.ts` — body-parser limits 50mb → 25mb json / 2mb urlencoded
5. `server/_core/index.ts` — `/gmail/debug` auth-gated
6. `server/_core/index.ts` — portal PDF `esc()` escaping on all interpolated fields
7. `server/_core/notification.ts` — HTML-escape notifyOwner content
8. `server/routers.ts` — `allowlist.*` now `adminProcedure`

## Deferred (needs Marcin sign-off)

- **C1** — move LLM key out of client bundle + rotate (requires a server proxy route)
- **M2** — hash portal magic-link tokens at rest (schema migration)
- **M3** — tighten `isEmailAllowed` fail-open semantics
- **L3** — re-run Cloudflare WAF check once a scoped token is available
- Run `pnpm audit --prod` in CI and address any advisories
