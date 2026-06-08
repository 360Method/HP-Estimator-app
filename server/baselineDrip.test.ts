/**
 * Tests for the baseline funnel Step-1 drop-off drip (pure helpers).
 * Covers eligibility filtering, 24h/72h/7d bucket selection, marker dedupe,
 * email suppression, and template rendering.
 */
import { describe, it, expect } from 'vitest';
import {
  BASELINE_SOURCE_MARKER,
  isBaselineStepOneLead,
  pickDripStep,
  isSuppressedEmail,
  buildBaselineDripEmail,
  type BaselineDripLead,
} from './baselineDrip';

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse('2026-06-05T12:00:00Z');

function lead(overrides: Partial<BaselineDripLead> = {}): BaselineDripLead {
  return {
    id: 'lead1',
    stage: 'New Lead',
    archived: false,
    notes: `Source: baseline-funnel-step1\nTimeline: Flexible`,
    createdAt: new Date(NOW - 25 * HOUR).toISOString(),
    customerId: 'cust1',
    ...overrides,
  };
}

describe('isBaselineStepOneLead', () => {
  it('accepts an open New Lead with the step-1 source marker', () => {
    expect(isBaselineStepOneLead(lead())).toBe(true);
  });

  it('rejects a lead whose stage moved past New Lead (human takeover)', () => {
    expect(isBaselineStepOneLead(lead({ stage: 'First Contact' }))).toBe(false);
    expect(isBaselineStepOneLead(lead({ stage: 'Won' }))).toBe(false);
    expect(isBaselineStepOneLead(lead({ stage: 'Cart Abandoned' }))).toBe(false);
  });

  it('rejects archived leads', () => {
    expect(isBaselineStepOneLead(lead({ archived: true }))).toBe(false);
  });

  it('rejects leads from other sources', () => {
    expect(isBaselineStepOneLead(lead({ notes: 'Source: website\nTimeline: ASAP' }))).toBe(false);
    expect(isBaselineStepOneLead(lead({ notes: null }))).toBe(false);
  });

  it('rejects out-of-area waitlist leads (they cannot enroll)', () => {
    const waitlistNotes = `${BASELINE_SOURCE_MARKER}\n\n— Home details (baseline walkthrough) —\nOUT OF AREA — waitlist (ZIP outside the current service area)\nAddress: 1 SW Main St, Portland, OR 97201`;
    expect(isBaselineStepOneLead(lead({ notes: waitlistNotes }))).toBe(false);
  });

  it('marker constant matches what publicInquiry writes', () => {
    expect(BASELINE_SOURCE_MARKER).toBe('Source: baseline-funnel-step1');
  });
});

describe('pickDripStep', () => {
  const at = (hoursOld: number, notes?: string) =>
    pickDripStep(
      lead({ createdAt: new Date(NOW - hoursOld * HOUR).toISOString(), ...(notes !== undefined ? { notes } : {}) }),
      NOW,
    );

  it('sends nothing in the first 24 hours', () => {
    expect(at(0)).toBe(null);
    expect(at(23.9)).toBe(null);
  });

  it('selects email 1 between 24h and 72h', () => {
    expect(at(24)).toBe(1);
    expect(at(71.9)).toBe(1);
  });

  it('selects email 2 between 72h and 7d', () => {
    expect(at(72)).toBe(2);
    expect(at(7 * 24 - 1)).toBe(2);
  });

  it('selects email 3 at 7d and beyond', () => {
    expect(at(7 * 24)).toBe(3);
    expect(at(30 * 24)).toBe(3);
  });

  it('does not resend a step already marked sent', () => {
    expect(at(30, `${BASELINE_SOURCE_MARKER}\n[Baseline-Drip-1 sent]`)).toBe(null);
    expect(at(100, `${BASELINE_SOURCE_MARKER}\n[Baseline-Drip-1 sent]\n[Baseline-Drip-2 sent]`)).toBe(null);
    expect(at(200, `${BASELINE_SOURCE_MARKER}\n[Baseline-Drip-3 sent]`)).toBe(null);
  });

  it('skips ahead if a lead aged past an unsent bucket', () => {
    // 8 days old, nothing sent → goes straight to email 3
    expect(at(8 * 24)).toBe(3);
  });

  it('returns null when createdAt is missing or invalid', () => {
    expect(pickDripStep(lead({ createdAt: undefined }), NOW)).toBe(null);
    expect(pickDripStep(lead({ createdAt: 'not-a-date' }), NOW)).toBe(null);
  });
});

describe('isSuppressedEmail', () => {
  it('suppresses internal/test identities', () => {
    expect(isSuppressedEmail('help@handypioneers.com')).toBe(true);
    expect(isSuppressedEmail('help+360test@handypioneers.com')).toBe(true);
    expect(isSuppressedEmail('HELP@HandyPioneers.com')).toBe(true);
  });

  it('suppresses empty or malformed emails', () => {
    expect(isSuppressedEmail('')).toBe(true);
    expect(isSuppressedEmail('   ')).toBe(true);
    expect(isSuppressedEmail('no-at-sign')).toBe(true);
  });

  it('allows normal customer emails', () => {
    expect(isSuppressedEmail('jane@example.com')).toBe(false);
  });
});

describe('buildBaselineDripEmail', () => {
  it('personalizes with the first name and falls back to "there"', () => {
    expect(buildBaselineDripEmail(1, 'Jane').subject).toContain('Jane');
    expect(buildBaselineDripEmail(1, '  ').subject).toContain('there');
    expect(buildBaselineDripEmail(3, '').subject).toContain('there');
  });

  it('every step links to the membership page and signs off as the team', () => {
    for (const step of [1, 2, 3] as const) {
      const { html } = buildBaselineDripEmail(step, 'Jane');
      expect(html).toContain('https://www.handypioneers.com/membership');
      expect(html).toContain('The Handy Pioneers Team');
    }
  });

  it('never exposes pricing or internal terms', () => {
    for (const step of [1, 2, 3] as const) {
      const { subject, html } = buildBaselineDripEmail(step, 'Jane');
      const text = subject + html;
      expect(text).not.toMatch(/\$\d/);          // no dollar figures
      expect(text.toLowerCase()).not.toContain('margin');
      expect(text.toLowerCase()).not.toContain('markup');
      expect(text.toLowerCase()).not.toContain('sub-contractor');
      expect(text.toLowerCase()).not.toContain('bronze');
      expect(text.toLowerCase()).not.toContain('silver');
      expect(text.toLowerCase()).not.toContain('gold');
    }
  });
});
