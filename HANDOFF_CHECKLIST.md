# Portal Roadmap + Take-Action Funnel — Handoff Checklist

Branch: `feat/portal-roadmap-take-action`

## Surface

- New page: `client.handypioneers.com/portal/roadmap` ("Your 360° Roadmap")
- Linked from PortalLayout sidebar between Home and Appointments.
- One primary contextual CTA per page (variants in
  `portalRoadmap.getCtaContext`).

## Server

| File | Change |
| ---- | ------ |
| `server/routers/portalRoadmap.ts` | NEW — listRoadmaps, shareRoadmap, getCtaContext, listAvailableWindows, bookBaselineWalkthrough |
| `server/routers.ts` | Register `portalRoadmap` sub-router |

The booking mutation wires together:

1. `portalAppointments` row (customer-visible)
2. `opportunities` row (CRM, stage = "Baseline Walkthrough")
3. `scheduleEvents` row (pro-side calendar)
4. `onAppointmentBooked()` lead-routing — Consultant gets the brief
5. Confirmation email via `sendEmail` + downloadable `.ics`
6. `notifyOwner` admin notification

## Client

| File | Change |
| ---- | ------ |
| `client/src/pages/portal/PortalRoadmap.tsx` | NEW — page, PDF preview, funnel modal |
| `client/src/components/PortalLayout.tsx` | Sidebar link added |
| `client/src/App.tsx` | Route registered |

## Voice / experience guardrails

See `EXPERIENCE_STANDARDS.md`.

## Migrations

None. The implementation reuses these existing tables only:

- `priorityTranslations` (Roadmap deliverable, keyed to `portalAccounts.email`)
- `portalCustomers` (logged-in portal session)
- `portalAppointments`, `opportunities`, `scheduleEvents`

The bridge between the Roadmap (priorityTranslation) lifecycle and the main
portal customer is the email address — no new join table needed.

## Manual smoke checklist

- [ ] `/portal/roadmap` loads when logged-in customer has no Roadmap → "Schedule a Baseline Walkthrough" empty state.
- [ ] When customer has 1+ Roadmap → most recent is selected, PDF preview renders.
- [ ] When customer has 2+ Roadmaps → chronological selector shows.
- [ ] Tap "Ready to take action" → modal opens with 4 windows starting 5+ days out, weekdays only.
- [ ] Pick window → step 2 shows pre-filled contact card.
- [ ] Edit a field → save advances to step 3.
- [ ] Optional concern field accepts long text.
- [ ] Confirm → step 4 confirmation, "Add to calendar" downloads `.ics`.
- [ ] Verify in DB:
  - `portalAppointments` row created
  - `opportunities` row created with `stage = "Baseline Walkthrough"`
  - `scheduleEvents` row with `type = "baseline_walkthrough"`
  - `notifications` row for the Consultant role
- [ ] Confirmation email lands in customer inbox with affluent voice + .ics attachment.
- [ ] Admin notification reaches the operator.
- [ ] After booking, CTA on Roadmap page no longer says "Schedule…" if the
      opportunity has advanced.

## CTA variants (manual verification)

| State | Variant | CTA label |
| ----- | ------- | --------- |
| No estimates / no project | `baseline_walkthrough` | Schedule walkthrough |
| Estimate sent or viewed | `approve_estimate` | Review now |
| Estimate approved + opportunity linked | `track_project` | Open project |
| 360° member, no upcoming visits | `schedule_member_visit` | Request a visit |

## Deploy notes

- No new env vars required.
- No drizzle migration to run.
- Build smoke-imports clean.
- Type check: 0 new errors introduced (pre-existing errors are in unrelated
  files: FinancialsPage, automationEngine, leadRouting, etc.).
