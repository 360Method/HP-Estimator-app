/**
 * brand.ts — Handy Pioneers / 360° Method design tokens.
 *
 * Single source of truth for the affluent stewardship aesthetic.
 * Every token is intended to be DB-loadable per tenant in the future
 * (Settings → Branding) — keep keys stable and additive.
 *
 * Voice rules live in docs/EXPERIENCE_STANDARDS.md.
 */

export const brandPalette = {
  /** Deep evergreen — primary ink, used for headlines, sidebars, primary actions. */
  ink: '#1a2e1a',
  inkSoft: '#2d4a2d',
  inkHover: '#243c24',

  /** Warm gold — accent for stewardship moments, never on body text at small sizes. */
  gold: '#c8922a',
  goldSoft: '#e2b96a',
  goldDeep: '#a07320',

  /** Cream / parchment — page background. Replaces utilitarian grey-50. */
  cream: '#faf6ef',
  creamSoft: '#f4ede0',
  parchment: '#fdfaf3',

  /** Charcoal scale — body text + secondary surfaces. */
  charcoal: '#1f1d1a',
  charcoalSoft: '#3a3733',
  slate: '#5b574f',
  mist: '#a39f95',

  /** Borders + hairlines — soft warm grey, never cold. */
  hairline: '#e7e1d4',
  border: '#d9d2c1',

  /** Restrained semantic flags — no bright saturated reds/greens. */
  positive: '#3f6b3a',
  positiveBg: '#e9f0e6',
  caution: '#a06a1a',
  cautionBg: '#f7ecd6',
  alert: '#8a3127',
  alertBg: '#f5e2de',
} as const;

export const brandTypography = {
  /** Serif for headlines, hero copy, and stewardship moments. Loaded via Google Fonts in index.css. */
  serif: '"Cormorant Garamond", "Playfair Display", Georgia, serif',
  /** Sans for body, navigation, dashboards. Existing DM Sans keeps app feel familiar. */
  sans: '"DM Sans", system-ui, sans-serif',
  /** Mono for figures and numerical data. */
  mono: '"JetBrains Mono", "SF Mono", Menlo, monospace',
} as const;

/** 8/16/24/40/64 spacing rhythm — match against Tailwind's 2/4/6/10/16. */
export const brandSpacing = {
  xs: '0.5rem',  // 8px
  sm: '1rem',    // 16px
  md: '1.5rem',  // 24px
  lg: '2.5rem',  // 40px
  xl: '4rem',    // 64px
} as const;

export const brandElevation = {
  /** Soft, never harsh. Stewardship feels calm, not snappy. */
  whisper: '0 1px 2px rgba(26, 46, 26, 0.04)',
  rest: '0 2px 8px rgba(26, 46, 26, 0.06)',
  lift: '0 8px 24px rgba(26, 46, 26, 0.08)',
} as const;

/** Mission, used by VisionBanner + the operator's recurring reminder. */
export const brandMission = {
  oneLiner: 'Stewards of the affluent home.',
  context: 'Tenant zero: Vancouver, WA. Path to white-label SaaS.',
  full: 'We are stewards of the affluent home — managing what an owner cares about so they can focus on everything else.',
} as const;

/** Approved phrases — when in doubt, lean on these. */
export const brandPhrases = {
  loading: 'Tending to your records…',
  loadingShort: 'One moment…',
  emptyCustomers: 'Your customer roster awaits its first steward — welcome a homeowner to begin.',
  emptyOpportunities: 'No active opportunities yet. The first conversation begins when one is welcomed in.',
  emptyMessages: 'No messages tonight. The desk is quiet.',
  emptyJobs: 'No jobs in motion right now.',
  emptyEstimates: 'No proposals awaiting reply.',
  emptyActivity: 'The day is calm. Activity will surface here as the team works.',
  errorGeneric: 'This corner needs attention. The Concierge desk has been notified.',
  greetingMorning: 'Good morning',
  greetingAfternoon: 'Good afternoon',
  greetingEvening: 'Good evening',
} as const;

export type BrandPalette = typeof brandPalette;
export type BrandTypography = typeof brandTypography;

/**
 * Time-of-day greeting — used in dashboard hero + portal welcome.
 */
export function greetingForNow(date: Date = new Date()): string {
  const h = date.getHours();
  if (h < 12) return brandPhrases.greetingMorning;
  if (h < 17) return brandPhrases.greetingAfternoon;
  return brandPhrases.greetingEvening;
}
