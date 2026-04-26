# EXPERIENCE_STANDARDS.md

> The Ritz-Carlton standard, applied to software.
>
> **Customer-facing AND internal admin** must reflect affluent stewardship
> positioning. Every page, every empty state, every email must pass these
> contracts before it ships.

---

## 1. The North Star

We are stewards of the affluent home. Our buyer already pays for
standard-of-care advisors in every other domain (CPA, wealth manager,
trainer). We are the home advisor that rounds out their stack.

The internal operator is also a steward — of the customer relationship,
of the team, and of the brand. The admin app is their concierge desk,
not a CRM ticket queue.

If a screen feels utilitarian, transactional, or "just CRUD," it fails
this standard. Pause and reach for the tokens.

---

## 2. Voice Rules (apply everywhere)

### Approved vocabulary

`standard of care` · `asset` · `steward` · `stewardship` · `consultation` ·
`written scope of work` · `complimentary` · `vetted tradesmen` ·
`skilled tradesmen` · `licensed specialists` · `proactive` ·
`seasonal cadence` · `compound` · `compounds in value` · `concierge desk` ·
`tend` · `welcome them in` · `the day before you`.

### Forbidden vocabulary

`handyman` · `estimate` (use **proposal** in customer copy; "Estimator"
remains the internal product name) · `free` (use **complimentary**) ·
`cheap` · `affordable` · `fix` / `repair` (as primary framing — fine
within technical scope-of-work line items) · `simple` · `easy` · any
superlative ("we are the best", "world-class").

### CTA language patterns

| Don't say | Say |
|---|---|
| Add Customer | Welcome a homeowner |
| Open profile | Open profile *(this is fine — clarity wins)* |
| Send Estimate | Share proposal |
| Free consultation | The first conversation costs nothing |
| Contact Us | Speak with us |
| Schedule | Reserve a visit |
| Upgrade Now | Step into Silver / Step into Gold |

**Rule:** stewardship language must add clarity. If "Welcome them" makes
the action ambiguous in context, default to the clear verb. Never trade
clarity for poetry.

---

## 3. State patterns (every page must implement)

### Empty states

Never blank. Always one short sentence in stewardship voice. Use the
helpers in `client/src/lib/brand.ts` (`brandPhrases.empty*`) when one
fits, or write a new sentence that follows the same cadence.

> ✗ "No customers"
> ✓ "Your customer roster awaits its first steward — welcome a homeowner to begin."

### Loading states

Never bare "Loading…". Use `brandPhrases.loading` ("Tending to your
records…") or a context-specific equivalent. Render in italic serif at
muted slate color.

### Error states

Recover with grace. Never dump raw error messages at the user. Default:

> "This corner needs attention. The Concierge desk has been notified."

Behind the scenes, log the technical error and route it to the operator.
Never let the customer see a stack trace.

---

## 4. Design tokens — single source of truth

All tokens live in **`client/src/lib/brand.ts`** and are mirrored as CSS
custom properties in `client/src/index.css` under the `:root` block
prefixed `--hp-*`. Both are intended to be DB-loadable per tenant from a
future Settings → Branding page.

### Color (use the variables, never the hex)

| Token | CSS var | Use |
|---|---|---|
| `ink` | `--hp-ink` | Headlines, sidebar, primary action |
| `gold` | `--hp-gold` | Accent rules, stewardship moments |
| `cream` | `--hp-cream` | Page background — replaces grey-50 |
| `parchment` | `--hp-parchment` | Card body backgrounds |
| `charcoal` | `--hp-charcoal` | Body text |
| `slate` | `--hp-slate` | Secondary text |
| `hairline` | `--hp-hairline` | Soft borders |
| `positive`/`caution`/`alert` | `--hp-positive…` | Restrained semantic flags |

**Never** introduce new hard-coded blues, greens, or greys. If you need
a new shade, propose adding a token first.

### Typography

| Class | Where |
|---|---|
| `.hp-headline` / `.hp-serif` | Hero copy, section titles, stewardship moments |
| Default body | DM Sans 14–15px, charcoal |
| `.mono` | Numbers, figures |
| `.hp-eyebrow` | Tiny gold uppercase label above headline |

Serif (Cormorant Garamond) is loaded once via `@import` in `index.css` —
do not re-import.

### Spacing

8 / 16 / 24 / 40 / 64. Maps to Tailwind `2 / 4 / 6 / 10 / 16`. Use these
values; resist `5`, `7`, `9` ad-hoc spacing.

### Elevation

`--hp-elev-whisper` / `--hp-elev-rest` / `--hp-elev-lift`. Soft, never
harsh. We are calm; we are not snappy.

### Component shortcuts

`.hp-card-warm` · `.hp-button-ink` · `.hp-button-gold` · `.hp-vision-banner`.

---

## 5. Accessibility & mobile

- **Tap targets:** 44px minimum (use `min-h-11` or hp-button utilities).
- **Contrast:** ink-on-cream and white-on-ink both pass AAA. Never use
  gold on white for body text — use `gold-deep` or fall back to charcoal.
- **Mobile-first:** every page must be designed for the iPhone breakpoint
  before the desktop one.
- **Focus rings:** visible by default. Do not strip outlines without
  replacing them.

---

## 6. Customer-centric rule (already in CLAUDE.md, restated)

The customer profile is the central canvas. Every notification, every
opportunity, every invoice must link back to it. Internal admin pages are
filtered views *into* the customer profile — never standalone islands.

The customer profile view itself should feel like a **concierge brief**:
calm single-column flow, recent activity, current opportunities, last
contact, owner notes — all in one quiet scroll. Not a tab maze.

---

## 7. Email standards

Use `wrapEmailHtml({...})` from `server/_core/emailShell.ts` for all
new transactional emails. It handles:

- Cream/parchment ground with white card
- Ink header bar with serif wordmark + gold "The 360° Method" eyebrow
- Gold hairline rule between header and body
- Serif headline option, eyebrow option, CTA button option
- Stewardship-voiced footer and contact lines

Subject lines: hospitality, never marketing. "Your proposal is ready"
not "OPEN: Your free estimate inside!!!".

Plain-text fallback: pass the HTML through `htmlToPlainText()` for the
`text/plain` MIME part.

---

## 8. The Concierge Desk concept

The **inbox** is the most important internal page in the entire app.
Every AI-drafted reply, every customer message, every routed lead lands
there. It must feel like a concierge desk:

- Drafts read like notes from a thoughtful colleague, not a chatbot
- Approve / refine / send actions are confident and large
- Attribution is honest (AI-drafted → human-sent)
- Empty inbox reads "The desk is quiet" — never "0 unread"

This is in scope for the next pass — the foundation tokens shipped here
make it possible.

---

## 9. The vision banner pattern

Operator-facing only. Sits at the top of the admin home, dismissable
per session. Reminds the operator of the standard before they begin
their work. Implementation: `client/src/components/VisionBanner.tsx`.

Quote rotation (weekly) is a P1 follow-up — for now the banner shows
the one-liner mission only.

---

## 10. Pre-merge checklist

Before opening a PR that touches user-facing surfaces:

- [ ] No hex colors hard-coded — only `var(--hp-*)` or token imports
- [ ] No forbidden vocabulary in customer-facing copy
- [ ] Empty states implemented in stewardship voice
- [ ] Loading state uses italic serif "Tending…" pattern
- [ ] Errors surface gracefully, never stack traces
- [ ] Tap targets ≥ 44px
- [ ] New email paths use `wrapEmailHtml`
- [ ] Mobile breakpoint reviewed
- [ ] If a new token is needed, added to `brand.ts` *and* `index.css`

---

## 11. P1 follow-ups (not in this pass)

- Migrate legacy email shells in `server/routers/{estimate,gmail,portal}.ts`
  and `server/threeSixtyWebhook.ts` to `wrapEmailHtml`.
- Customer profile (`CustomerSection.tsx`) — concierge brief redesign.
- Inbox page — concierge desk treatment + AI-draft visual language.
- Settings → Branding page — make tokens DB-editable per tenant.
- Vision banner: rotate weekly quote from BRAND_TONALITY_AND_DIRECTION.md.
- 360° member portal home: hero + concierge intro polish.
- Roadmap confirmation page: tighten to design system.
- Status badge palette audit (estimates / invoices / appointments) —
  unify on the restrained semantic flags.
