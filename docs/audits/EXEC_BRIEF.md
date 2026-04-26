# HP System Audit — Exec Brief
Date: 2026-04-25

---

## Done (shipped this branch)
- **Roadmap Generator is fixed** — PDF now actually processes and emails
- **PT submit creates CRM lead** — appears in pipeline, nurturer notified
- **Nurturer notified on PT submit** — Marcin pinged immediately on upload
- **Booking source type corrected** — bad string fixed, pipeline events clean
- **Audit docs written** — full gap list at `docs/audits/SYSTEM_AUDIT_2026-04-25.md`

## In Progress (next 2 sprints)
- Customer auto-ack email after any form submit (GAP-F1)
- Schedule router → appointment booked trigger missing (GAP-B1)
- 360° cart abandonment missing nurturer ping (GAP-L1)
- Invoice email to customer with Stripe link (GAP-J2)

## Blocked (needs a decision)
- **PT form** currently only takes a URL to a PDF — no file upload endpoint exists; homeowner must host the PDF first (GAP-R1/L3)
- **Inbound calls** create no CRM record — manual work required after every call (GAP-L2)
- **360° onboarding sequence** — email templates not written yet (GAP-M1)

## Decisions Needed from Marcin
- Who is the "nurturer" right now? — `userRoles` table needs a row with `role='nurturer'` and `isPrimary=true`, otherwise notifications route to no one
- Should inbound calls auto-create leads, or stay manual review?
- PT form: should we add file-upload support or keep URL-only for now?

## Risk Flags
- **Stuck PT rows** — any "processing" rows from before today's fix will never complete; need manual re-trigger or one-time backfill script
- **notifyOwner** uses old Manus webhook URL (`forgeApiUrl`) — verify `FORGE_API_URL` env var is set on Railway or those pings are silent
- **RESEND_API_KEY** must be set on Railway for all email paths to work — confirm in Railway env panel
- **ANTHROPIC_API_KEY** must be set on Railway for Roadmap Generator to call Claude
