# Handoff Checklist

A living checklist for shipping operator-facing work. Anything that touches
Marcin's daily workspace must clear every applicable box before it's
considered done.

## Information architecture

- [ ] Every entity has ONE canonical home. No silo pages, no duplicates.
- [ ] Every notification, banner, and link routes to the **customer profile**
      (not directly to an opportunity) when a customer is involved. The
      customer is the root entity.
- [ ] No top-level page exists for a single source. Sources are filters or
      chips inside the canonical inbox, not their own destinations.
      *(Example: the retired Requests page — online bookings now appear as
      Online Request leads inside the unified Leads inbox.)*

## Lead flow specifics

- [ ] Every lead source funnels into `area='lead'` opportunity rows: Online
      Request, Roadmap Generator (Priority Translation), Inbound Call,
      Missed Call, Voicemail, Membership Intent, Baseline Walkthrough,
      Manual, Contact Form, Referral.
- [ ] The Leads tab is the single inbox. Sortable, filterable, mobile-first.
- [ ] New leads (≤ 24h, not yet viewed locally) carry the gold accent.
- [ ] The persistent `NewLeadBanner` shows on EVERY admin page until the
      operator opens the lead or dismisses it for the session.
- [ ] Tapping any lead → customer profile (not opportunity detail).

## Customer profile (Concierge Brief)

- [ ] Profile tab opens with the **Concierge Brief** at the top.
- [ ] Brief includes: header strip (contact + address + lead source +
      customer-since), Roadmap status row, AI activity glance,
      and quick action bar (Email / Call / SMS / Schedule / Estimate).
- [ ] Roadmap section pulls from `priorityTranslations` joined via
      `portalAccounts.customerId`.
- [ ] Quick actions deep-link into the existing tabs (no modal sprawl).

## Mobile

- [ ] All tap targets ≥ 44px on Leads list, customer profile, banners.
- [ ] Sticky page header on scroll for long lists.
- [ ] Mobile bottom action bar (Email / Call / SMS / Schedule) on Leads list.
- [ ] Single-column layouts on screens < 640px.

## Deletion / migration

- [ ] When retiring a top-level page, leave the AppSection key in the union
      with a comment marking it deprecated; the shell redirects to the new
      home. (Old notification deep-links keep working.)
- [ ] No data migration needed when the underlying rows are unchanged —
      the data layer is the source of truth, the page was only a view.

## Build + ship gates

- [ ] `pnpm exec tsc --noEmit` clean for the files you touched.
- [ ] `pnpm build` succeeds.
- [ ] Smoke-import the server bundle: `node --input-type=module -e
      "import('./dist/index.js').then(()=>console.log('OK'))"`.
      *(Required: esbuild --packages=external silently bundles around
      missing deps; only smoke-import catches them.)*
- [ ] `EXPERIENCE_STANDARDS.md` updated when a new pattern lands.
