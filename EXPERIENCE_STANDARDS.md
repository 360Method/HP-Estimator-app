# Experience Standards

The operating voice + interaction standards every customer-facing surface must
respect. If a piece of code generates copy, drafts a message, or names a
button, it is bound by this document.

---

## 1. Stewardship voice

The reader is an affluent homeowner. Speak as a steward of their property — a
specialist invited to a place they care about. Never as a vendor.

- Open with the property or a finding, not with a greeting.
- Reference standard-of-care framing: "Most properties of this vintage benefit
  from…" — never "you should fix…".
- Close with availability, not a CTA button: "Happy to walk you through it
  whenever fits."

## 2. First-name basis, always

- "Hi Avery," not "Mr. Hamilton" or "Dear Mrs. Hamilton".
- The operator signs as their first name: "— Marcin", "— Riley".
- This applies to SMS, email, voicemail, in-app prompts, and PDF cover pages.

## 3. Banned vocabulary

Avoid words that cheapen the brand or signal panic. The Lead Nurturer's draft
generator surfaces these as warnings when Claude slips into them, and the
operator edits them out before sending.

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

## 4. Specificity over volume

Affluent buyers respond to one accurate observation about their home far more
than to three generic talking points. Every "narrate-one-finding" surface
(roadmap follow-up T+24h email, consultant brief, PM handoff) must reference
something concrete from the `homeHealthRecord` — not a category-level
generality.

## 5. Approval gates everywhere a customer message originates

The Lead Nurturer never auto-sends. Drafts land in
`/admin/agents/drafts` with status `ready` and wait for the operator's tap.
This bar applies to every future agent — translation, scheduling reminders,
billing chase, anything that speaks in the brand's voice.

## 6. Cadence stops the moment the customer engages

Booking, enrollment, an inbound SMS reply, an explicit decline — any of these
drains the pending nurture queue. We do not double-touch a customer who has
chosen a path. (See `cancelPendingFollowupsForCustomer` in
`server/lib/leadNurturer/roadmapFollowup.ts`.)

## 7. Per-customer override

Marcin (or future CX Lead) can toggle `customers.bypassAutoNurture` for a
specific customer who needs hand-holding rather than the auto-cadence. The
machine yields to the human read.

## 8. Time, dates, and labels

- Always render dates with a weekday in customer-facing copy ("Thursday, May 7"
  not "5/7").
- Money uses two decimals, no abbreviation ("$2,400.00" not "2.4k").
- Service-area copy stays Vancouver-centric: "your home in Vancouver" reads
  better than "your property".
