# Portal identity model (audit Rec 6 — decision: keep both, bridged by email)

The portal has **two identity stacks** that coexist intentionally. The audit
recommendation to "unify" them was reviewed and the decision is to **leave them
as-is** — they are bridged by email and serve two distinct lifecycles. No
live-data migration. This note documents the bridge so the split is understood,
not mistaken for accidental duplication.

## The two stacks

| Stack | Tables | Used by | Token model |
|---|---|---|---|
| **Legacy / core** | `portalCustomers`, `portalTokens`, `portalSessions` | Estimates, invoices, jobs, the main `/portal/*` experience | Magic-link tokens (`portalTokens`) + cookie sessions (`portalSessions`) |
| **Roadmap / funnel** | `portalAccounts`, `portalMagicLinks`, `portalProperties` | Priority Translation lead magnet + roadmap delivery | Hashed magic links (`portalMagicLinks`) |

## How they bridge

Both key on **email** (`portalCustomers.email` ↔ `portalAccounts.email`). A
person who enrolls via the roadmap funnel and later receives an estimate exists
in both stacks under the same email; the two records are reconciled by email at
the points where the flows meet.

## Why they're kept separate

- The roadmap/funnel lifecycle (anonymous lead → property health record →
  roadmap) is distinct from the customer/estimate/invoice lifecycle, and the
  roadmap stack uses **hashed** tokens (a security improvement worth keeping).
- Merging is an **irreversible data migration** touching estimate/invoice/portal
  auth — high blast radius for low present benefit, since the email bridge works.

## When to revisit

Unify (consolidating onto one stack) only if a concrete problem appears:
duplicate/inconsistent customer records that the email bridge fails to
reconcile, or auth confusion where a user can't see both their roadmap and their
estimates. If that happens, the lower-risk direction is to migrate
`portalAccounts` → `portalCustomers` (the core stack that backs billing), and to
retain `portalMagicLinks`' hashed-token approach for the unified stack.

## Related

- Security note: `portalTokens` (legacy) stores tokens in plaintext while
  `portalMagicLinks` stores them hashed — see `SECURITY_AUDIT.md`. If/when the
  stacks are unified, standardize on hashed tokens.
