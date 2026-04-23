/**
 * Tests for 360° member step-ladder discount logic
 * Validates calcMemberDiscount across all three tiers and bracket boundaries.
 */
import { describe, it, expect } from 'vitest';
import { calcMemberDiscount, TIER_DEFINITIONS } from '../shared/threeSixtyTiers';

describe('calcMemberDiscount', () => {
  // ── Bronze ──────────────────────────────────────────────────────
  describe('bronze tier', () => {
    it('returns 0 for $0 job', () => {
      expect(calcMemberDiscount('bronze', 0)).toBe(0);
    });

    it('applies correct rate on first bracket ($500 job)', () => {
      const brackets = TIER_DEFINITIONS.bronze.discountBrackets;
      const firstRate = brackets[0].rate;
      // $500 = 50000 cents
      const result = calcMemberDiscount('bronze', 50000);
      expect(result).toBe(Math.round(50000 * firstRate));
    });

    it('applies step-ladder correctly across bracket boundary', () => {
      // Bronze: first bracket ceiling is typically $2,000 (200000 cents)
      // Test a job that spans two brackets
      const result = calcMemberDiscount('bronze', 500000); // $5,000
      expect(result).toBeGreaterThan(0);
      expect(result).toBeLessThan(500000); // discount < 100%
    });
  });

  // ── Silver ──────────────────────────────────────────────────────
  describe('silver tier', () => {
    it('returns higher discount than bronze for same job amount', () => {
      const jobCents = 300000; // $3,000
      const bronzeDiscount = calcMemberDiscount('bronze', jobCents);
      const silverDiscount = calcMemberDiscount('silver', jobCents);
      expect(silverDiscount).toBeGreaterThanOrEqual(bronzeDiscount);
    });

    it('discount is non-negative for any job size', () => {
      [0, 100000, 500000, 2000000, 10000000].forEach(cents => {
        expect(calcMemberDiscount('silver', cents)).toBeGreaterThanOrEqual(0);
      });
    });
  });

  // ── Gold ────────────────────────────────────────────────────────
  describe('gold tier', () => {
    it('returns higher discount than silver for same job amount', () => {
      const jobCents = 500000; // $5,000
      const silverDiscount = calcMemberDiscount('silver', jobCents);
      const goldDiscount = calcMemberDiscount('gold', jobCents);
      expect(goldDiscount).toBeGreaterThanOrEqual(silverDiscount);
    });

    it('matches example from JSDoc: gold $15,000 job → $1,125 discount', () => {
      // From the JSDoc: calcMemberDiscount("gold", 1500000) => 112500
      const result = calcMemberDiscount('gold', 1500000);
      expect(result).toBe(112500);
    });

    it('discount is always less than job total', () => {
      const jobCents = 1000000; // $10,000
      const discount = calcMemberDiscount('gold', jobCents);
      expect(discount).toBeLessThan(jobCents);
    });
  });

  // ── Tier ordering ───────────────────────────────────────────────
  describe('tier ordering invariant', () => {
    it('gold >= silver >= bronze for any job size', () => {
      [50000, 200000, 500000, 1500000, 5000000].forEach(cents => {
        const bronze = calcMemberDiscount('bronze', cents);
        const silver = calcMemberDiscount('silver', cents);
        const gold = calcMemberDiscount('gold', cents);
        expect(silver).toBeGreaterThanOrEqual(bronze);
        expect(gold).toBeGreaterThanOrEqual(silver);
      });
    });
  });
});
