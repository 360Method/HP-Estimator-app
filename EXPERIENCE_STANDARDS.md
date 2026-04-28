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

---

# Customer-facing voice (Lead Nurturer + every outbound channel)

The above patterns govern Marcin's surfaces. The rules below govern every
piece of copy *the customer* sees — emails, SMS, voicemail scripts, in-app
prompts, PDF cover pages. The Lead Nurturer's draft generator enforces a
banned-word advisory against this list.

## 10. Stewardship voice (customer-facing)

The reader is an affluent homeowner. Speak as a steward of their property —
a specialist invited to a place they care about. Never as a vendor.

- Open with the property or a finding, not with a greeting.
- Reference standard-of-care framing: *"Most properties of this vintage
  benefit from…"* — never *"you should fix…"*.
- Close with availability, not a CTA button: *"Happy to walk you through it
  whenever fits."*

## 11. First-name basis, always

- "Hi Avery," not "Mr. Hamilton" or "Dear Mrs. Hamilton".
- The operator signs as their first name: "— Marcin", "— Riley".
- This applies to SMS, email, voicemail, in-app prompts, and PDF cover pages.

## 12. Banned vocabulary

The Lead Nurturer's draft generator surfaces these as advisory warnings when
Claude slips into them, and the operator edits them out before sending.

```
estimate    free        cheap        affordable
handyman    easy        fix          repair
best        save        discount     limited time
```

Substitutions:

| Avoid              | Prefer                                                              |
| ------------------ | ------------------------------------------------------------------- |
| free estimate      | walkthrough, on-site review                                         |
| fix / repair       | restore, address, attend to                                         |
| cheap / affordable | (drop entirely — speak in absolute terms about value)               |
| handyman           | specialist, craftsperson, project manager                           |
| limited time       | (drop entirely — urgency signals desperation)                       |

## 13. Specificity over volume

Affluent buyers respond to one accurate observation about their home far more
than to three generic talking points. Every "narrate-one-finding" surface
(roadmap follow-up T+24h email, consultant brief, PM handoff) must reference
something concrete from the `homeHealthRecord` — not a category-level
generality.

## 14. Approval gates everywhere a customer message originates

The Lead Nurturer never auto-sends. Drafts land in `/admin/agents/drafts` with
status `ready` and wait for the operator's tap. This bar applies to every
future agent — translation, scheduling reminders, billing chase, anything
that speaks in the brand's voice.

## 15. Cadence stops the moment the customer engages

Booking, enrollment, an inbound SMS reply, an explicit decline — any of these
drains the pending nurture queue. We do not double-touch a customer who has
chosen a path. (See `cancelPendingFollowupsForCustomer` in
`server/lib/leadNurturer/roadmapFollowup.ts`.)

## 16. Per-customer override

Marcin (or future CX Lead) can toggle `customers.bypassAutoNurture` for a
specific customer who needs hand-holding rather than the auto-cadence. The
machine yields to the human read.

## 17. Time, dates, and labels

- Always render dates with a weekday in customer-facing copy ("Thursday, May 7"
  not "5/7").
- Money uses two decimals, no abbreviation ("$2,400.00" not "2.4k").
- Service-area copy stays Vancouver-centric: "your home in Vancouver" reads
  better than "your property".

---

# Customer Portal Surfaces (`client.handypioneers.com`)

These rules govern customer-facing pages. Affluent buyers smell sales
theater immediately — the portal must feel like stewardship, not marketing.

## Voice rules — words we never use

In customer-facing copy, button labels, headings, email templates, or
notifications:

- `estimate` (we deliver "proposals" or "Roadmaps")
- `free` (we offer; we don't give away)
- `cheap`
- `affordable`
- `handyman`
- `easy`
- `fix`
- `repair` (use "address," "tend to," "restore")
- `best`
- `save`
- `discount`
- `limited time`

The `assertVoice()` helper in `server/routers/portalRoadmap.ts` warns when
forbidden words appear in operator copy — **never** in the customer's own
words (priority concern field is theirs and may use these naturally).

## Stewardship pacing

- Never offer "next available in 2 hours."
- Default appointment offers start **5–10 days out**, weekdays only.
  Mornings (10am) and afternoons (2pm). Four windows is the cap.
- Pre-arrival reminders: 24h before, 1h before. **No marketing follow-ups
  about the same walkthrough.**

## CTA discipline on the Roadmap page

Single primary CTA, server-resolved by `portalRoadmap.getCtaContext`:

| Customer state                              | Variant                  | Label                |
| ------------------------------------------- | ------------------------ | -------------------- |
| Default (no estimate, no project)           | `baseline_walkthrough`   | Schedule walkthrough |
| Estimate sent or viewed                     | `approve_estimate`       | Review now           |
| Estimate approved + linked HP opportunity   | `track_project`          | Open project         |
| 360° member with no upcoming visit          | `schedule_member_visit`  | Request a visit      |

No upsell stack below it. No "save 20%" banners. No countdowns.

## Brand tokens (portal-side)

| Token        | Hex       | Use                                              |
| ------------ | --------- | ------------------------------------------------ |
| Forest       | `#1a2e1a` | Headlines, primary buttons, dense surfaces       |
| Gold         | `#c8922a` | Accents, CTA fills, focus rings, brand inflection|
| Parchment    | `#faf7f0` | Form backgrounds, calm cards                     |
| Border-warm  | `#e5e0d3` | All neutral borders on customer-facing surfaces  |

## Confirmation flow

After every customer-initiated booking:

1. In-portal confirmation screen with date and what to expect next.
2. Stewardship-voice email with `.ics` attachment (download from the
   confirmation modal).
3. Admin notification (`notifyOwner` + lead-routing assignment).
4. Pre-arrival reminders only — no further marketing about that booking.

## Things we do not do on customer surfaces

- Pop the same modal twice if the customer cancels.
- Send marketing email about a confirmed booking.
- Auto-charge or hold a card during the funnel.
- Show "X people booked this week" social-proof banners.
- Use exclamation marks in stewardship copy.

---

# Book Consultation pipeline standards

These rules apply to any one-off project intake (the `/book` form) and the AI estimator that follows it.

## 18. Pricing presentation — always a range, never a point

- Show `low — high` (the customer's investment range, ±25% discovery buffer baked in).
- Never use "starting at" pricing.
- Never expose internal margin, markup multipliers, or the $100/$150 hourly rates.
- Always show what's included AND what's not included.

## 19. Two-path CTA on every project page

When an estimate is delivered, the portal page offers two equally-welcomed paths:
1. **Proceed with this project** — opens the in-portal scheduling funnel for project commencement.
2. **Request a walkthrough first** — opens scheduling for an in-person scope confirmation.

Either is "the right answer." Never pressure the customer into Proceed; never bury the walkthrough option.

## 20. Cadence pauses on engagement

The Project Estimator's cadence (T+4h..T+10d) cancels automatically on any of:
- `appointment.scheduled` (customer booked the walkthrough or project)
- `customer.replied` (inbound SMS or email)
- `subscription.created` (joined 360° Method)
- `estimate.approved` (clicked Proceed)
- `customer.declined` (operator-set)

Pause is triggered via `pauseCadenceForCustomer()` which flips matching `agentDrafts` rows to `cancelled` with the reason recorded.

## 21. Confidence gate

Every estimate ships through one of three paths:
- **High confidence** → status `delivered`, customer sees range immediately, concierge_estimate_ready draft queues for approval.
- **Medium confidence** → status `needs_review`, Marcin notified via `notifyOwner`. Customer sees "your range is being finalized" copy until Marcin approves.
- **Low confidence** → status `needs_info`, `missing_info_questions` queue as a Nurturer draft addressed to the customer. Customer sees "your Concierge will be in touch shortly" copy.

Customer never sees a sub-floor estimate; `enforceMarginFloor()` validates server-side regardless of what Claude returned.

## 22. Margin discipline (matches the hp-estimate-builder-v1 skill)

- Internal labor $150/hr is **post-markup** — never apply additional markup.
- Subcontractor labor: $100/hr cost × 1.5× default markup (lands at $150 customer rate by design).
- Materials: cost × 1.5× default markup.
- Whole-job margin floor enforced AFTER summing: ≥ 30% on $2k+ hard cost, ≥ 40% under $2k.
- Customer-facing range = customer total × [0.75, 1.25].

If a touchpoint surfaces pricing that violates these rules, rewrite.

## 23. The Visionary Console is the cockpit

`/admin/visionary` is Marcin's operating cockpit. From there he gives the
Integrator a directive; the Integrator routes work to the right team via
`agentTeams_assignTask` and broadcasts context via `agentTeams_broadcast`.

Rules:
- **Streaming, not blocking.** Long Integrator turns must stream so Marcin
  can read along and steer mid-thought. The chat input stays usable while
  text is streaming so the next directive can queue.
- **Tool calls are visible.** Every tool the Integrator runs surfaces inline
  in the chat with input + output. No hidden side effects. If a tool
  requires approval, the bubble says so and links to `/admin/ai-agents/tasks`.
- **Customer-centric tasks.** When the Integrator creates a team task that
  involves a specific customer, the `customerId` is set so the task surfaces
  inside the customer profile alongside drafts and other agent work. This
  rule applies to every new agent surface that produces work on a customer.
- **Mobile is the primary viewport.** Marcin operates from his phone; the
  console must be excellent at 390 px. Single column, sticky compose with
  `env(safe-area-inset-bottom)`, action queue collapses into a bottom drawer.
- **Cost on the surface.** Every assistant turn shows token + dollar cost so
  Marcin can see runtime spend without leaving the cockpit. The left pane
  shows 24h department-by-department spend.
- **The 8 teams are the org chart.** Members are seats from `/admin/ai-agents`;
  team configuration lives in `/admin/agents/teams`. Adding a department-level
  surface that bypasses these teams is a smell — surface it through the team.

The cockpit replaces the "tied to Dispatch as the owner/Visionary"
constraint; we host the entire coordination layer inside HP Estimator.
