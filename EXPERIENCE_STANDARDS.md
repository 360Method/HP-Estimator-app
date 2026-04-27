# Experience Standards

The principles every customer-facing surface in `client.handypioneers.com/portal`
must hold to. Affluent buyers smell sales theater immediately — these standards
exist so the portal feels like stewardship instead of marketing.

## Voice rules

**Never use** the following words in copy, button labels, headings, email
templates, or notification bodies:

- `estimate` (it's a "proposal" or "Roadmap")
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
forbidden words appear in customer-supplied text — that's a soft signal so we
can refine copy, not a block. **Never warn on the customer's own words.**

## Stewardship pacing

- Never offer "next available in 2 hours." Affluent customers read that as
  desperate.
- Default appointment offers start **5–10 days out**. Mornings (10am) and
  afternoons (2pm) of business days. Four windows is enough — more becomes
  paralysis.
- Notifications about a customer's appointment go out at **24h before** and
  **1h before**. No marketing follow-ups about the same walkthrough.

## CTA discipline

- The Roadmap page surfaces **one** primary CTA at a time, contextual to where
  the customer is in their journey. No upsell stack below it. No "save 20%"
  banners. No "limited spots" countdowns.
- CTA variants resolved server-side in `portalRoadmap.getCtaContext`:
  - **Default** — Schedule Baseline Walkthrough
  - **Pending estimate** — Approve your proposal
  - **Active project** — Track project status
  - **360° member, no upcoming visit** — Schedule next standard-of-care visit

## Mobile-first

- Tap targets ≥ **44px** (iOS HIG minimum); 48–52px for primary CTAs.
- Modals are **full-width on mobile** with bottom-sheet styling on small
  screens; centered card on tablet/desktop.
- Typography: refined serif (Georgia / Times New Roman) for headlines that
  matter, system sans-serif for body and metadata.
- Forms use a parchment background (`#faf7f0`) and gold focus rings (`#c8922a`).

## Brand tokens

| Token        | Hex       | Use                                              |
| ------------ | --------- | ------------------------------------------------ |
| Forest       | `#1a2e1a` | Headlines, primary buttons, dense surfaces       |
| Gold         | `#c8922a` | Accents, CTA fills, focus rings, brand inflection|
| Parchment    | `#faf7f0` | Form backgrounds, calm cards                     |
| Border-warm  | `#e5e0d3` | All neutral borders on customer-facing surfaces  |

## Confirmation experience

After every customer-initiated booking:

1. In-portal confirmation screen with the date and what to expect next.
2. Affluent-voice email with `.ics` attachment (the customer presses download
   inside the modal).
3. Admin / operator notification (`notifyOwner` + lead-routing assignment to
   the Consultant role).
4. Pre-arrival reminders: 24h and 1h before. **No further comms about that
   same appointment**.

## Things we do not do

- Pop the same modal twice if the customer cancels.
- Send marketing email about a confirmed booking.
- Auto-charge or hold a card during the funnel.
- Show "X people booked this week" social-proof banners.
- Use exclamation marks in stewardship copy. Calm voice, full sentences.
