# Experience Standards — Handy Pioneers Pro App

This is the operator's daily workspace. The bar is excellence, not adequacy.
The patterns below are the load-bearing decisions; deviating requires a good
reason and a follow-up to update this document.

## 1. The customer is the root entity

Every notification, every banner, every list row that names a person ends up
on **the customer profile**. Opportunities, estimates, jobs, invoices, and
roadmaps are all surfaces inside the profile — never destinations of their
own. Notification rows include `customerId` and link to
`/?section=customer&customer=<id>` (the opportunity ID is appended as a
secondary affordance, never the primary).

This means: if you find yourself building a top-level page for a single
source (Requests, Voicemails, Missed Calls), stop. Add it as a chip in the
Leads inbox or as a section in the customer profile.

## 2. One inbox per role

Marcin operates the entire pipeline. Every incoming lead — regardless of
source — funnels into a single Leads inbox. The chip set tells him *where*
each lead came from; the row order tells him *what's freshest*.

Sources currently funneled in:
- Online Request (`/book` form)
- Roadmap Generator (Priority Translation)
- Inbound Call / Missed Call / Voicemail (Twilio webhooks)
- Membership Intent (360° enrollment)
- Baseline Walkthrough booking
- Manual entry (`New Lead` modal)
- Contact Form / Referral

Adding a new source = adding a row to `deriveSource()` in
`server/routers/leads.ts` and a `SOURCE_META` entry in `LeadsPage.tsx`.
**Do not** spin up a new top-level page for it.

## 3. Persistent surfaces, not ephemeral ones

If something matters, it stays visible until the operator engages with it.
The `NewLeadBanner` (top of every admin page) shows unread `new_lead` and
`new_booking` notifications until the operator opens the lead or explicitly
dismisses it for the session. Toasts are for confirmation of actions the
operator just took, not for important inbound signals.

## 4. Mobile-first means literal phone-first

Marcin operates from his phone. Every operator-facing surface meets:

- **Tap targets ≥ 44 × 44 px.** Use `style={{ minHeight: 44 }}` on buttons
  if Tailwind classes can't get you there.
- **Single column** below `sm` (640 px). Two-column layouts collapse,
  they don't squeeze.
- **Sticky page header** on scroll. The operator should always know where
  they are.
- **Bottom action bar** on the Leads list and customer profile with the
  four primary one-touch ops actions: Email, Call, SMS, Schedule.

## 5. Calm, hierarchical, not tabs-everywhere

The customer profile is the densest surface in the app. We resist the
temptation to fragment it into more tabs. Instead, the **Concierge Brief**
(top of Profile tab) gives a single-glance executive summary that points
the operator at the right tab to dig deeper — header, Roadmap, AI activity,
quick actions, opportunity counts.

When in doubt, choose hierarchy over horizontal tabs.

## 6. Stewardship voice in empty states

Every empty state speaks in the Handy Pioneers voice — never a stock
illustration with "No data" beneath it. Examples:

- Leads inbox empty: *"Your customer roster awaits its first steward.
  Soon, leads from every source — online requests, the Roadmap Generator,
  inbound calls, voicemails, referrals — will gather here for tending."*
- Notifications empty: *"All caught up."* (terse — confirmation, not
  decoration).

## 7. Color discipline

- **Amber** — leads + new arrivals + stewardship cues. The Star icon, the
  banner gradient, the gold "New" pill.
- **Violet** — Roadmap / Priority Translation surfaces.
- **Blue** — portal / customer-side activity (inbox unread, portal logins).
- **Emerald** — AI / agent activity, success confirmations.
- **Red** — only for true urgency (overdue, blocked, broken).

If you reach for red and the situation isn't urgent, you wanted amber.

## 8. Build gates

A change is shippable only after:

1. Type-check clean for the files you touched (`tsc --noEmit`).
2. `pnpm build` succeeds.
3. Server bundle smoke-imports: `node --input-type=module -e
   "import('./dist/index.js').then(()=>console.log('OK'))"`.
4. The relevant box in `HANDOFF_CHECKLIST.md` is checked.

## 9. Removing pages

When a top-level page is being retired (as the Requests page was on
`feat/lead-flow-unified`):

1. Delete the page file.
2. **Keep** the `AppSection` key in the union, marked deprecated, so old
   notifications and bookmarked URLs still type-check.
3. Make the shell redirect from the deprecated section to the new one
   in `Home.tsx`.
4. Update the breadcrumb segment in `MetricsBar.tsx` to render the new
   section's label whenever either key is active.
5. Replace any in-app references to `navigateToTopLevel('<old>')` with
   the new section key.

This pattern preserves the customer's deep-link history without keeping
dead code around.
