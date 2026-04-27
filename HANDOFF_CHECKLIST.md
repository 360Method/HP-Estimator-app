# Handoff Checklist

A living list of what every Handy Pioneers system change must satisfy before it
ships. New features get added here; settled ones stay here so the next
Engineer / Operator / Future-Marcin doesn't have to rediscover them.

---

## 1. Customer is the root entity

Every record (opportunity, notification, draft, event) FKs to `customers.id`.
Every UI surface links back to the customer profile. Settings is the single
source of truth for operator config. _(Carry-over from lead-routing handoff.)_

## 2. Three-role pipeline (carry-over)

`nurturer → consultant → project_manager`. Stage transitions reassign ownership
via `server/leadRouting.ts`. Notifications are role-aware.

## 3. Lead Nurturer post-Roadmap follow-up cadence (added 2026-04-27)

When a 360° Roadmap is delivered, the Lead Nurturer queues five touchpoints
(`server/lib/leadNurturer/roadmapFollowup.ts`):

| When     | Channel | Step key                | Intent                                                    |
| -------- | ------- | ----------------------- | --------------------------------------------------------- |
| T+4h     | SMS     | `t_plus_4h_sms`         | Concierge nudge — "Roadmap landed, happy to walk it"      |
| T+24h    | Email   | `t_plus_24h_email`      | Specific finding from their report, standard-of-care      |
| T+72h    | SMS     | `t_plus_72h_sms`        | Light check-in                                            |
| T+7d     | Email   | `t_plus_7d_email_360`   | 360° Method continuity introduction                       |
| T+14d    | (none)  | `t_plus_14d_handoff`    | Stage flip — long-term nurture (newsletter)               |

**Every draft is approval-gated.** Marcin reviews + sends from
`/admin/agents/drafts`. Cadence is editable (no redeploy) at
`/admin/agents/playbooks`.

### Engagement events that cancel pending drafts
- `appointment_scheduled` — `onAppointmentBooked` (Baseline / Consultation)
- `subscription_created` — 360° Stripe webhook
- `customer_replied` — inbound SMS handler in `server/twilio.ts`
- `customer_declined` — operator-set on customer profile (manual)

### Per-customer escape hatch
Set `customers.bypassAutoNurture = true` to silence the auto-cadence for that
customer. The Lead Nurturer only acts on manual triggers.

### Voice rules (enforced advisory)
Banned: `estimate, free, cheap, affordable, handyman, easy, fix, repair, best,
save, discount, limited time`. The draft generator surfaces a warning when
banned terms slip into Claude's output — operator edits before send.

## 4. Boot-time table-ensure pattern (carry-over)

When migration tracker diverges from prod, add an `ensureXxx()` in
`server/_core/index.ts` that runs `CREATE TABLE IF NOT EXISTS` / column adds at
boot. The Lead Nurturer uses `ensureLeadNurturerTables()` for this.

## 5. Smoke-import dist before push

`esbuild --packages=external` masks missing deps. Always:
```
npm run build
node --input-type=module -e "import('./dist/index.js').then(()=>console.log('OK'))"
```

## 6. The nucleus principle

Operator-tunable values live in the database, not code. Examples:
- Automation rules → `server/routers/automationRules.ts`
- Agent playbooks → `server/routers/agentPlaybooks.ts`
- Phone settings → `phoneSettings` table
- Portal continuity flag → `appSettings.portalContinuityEnabled`

A new "knob" goes in DB + admin UI before it goes in code.
