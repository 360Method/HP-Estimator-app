/**
 * Validates that all 9 HP-360 Stripe price IDs are set in the environment.
 */
import { describe, it, expect } from 'vitest';

const EXPECTED = {
  STRIPE_PRICE_BRONZE_MONTHLY:    'price_1TMAmq5fjArLs8Mw1yh5ebRB',
  STRIPE_PRICE_BRONZE_QUARTERLY:  'price_1TMAms5fjArLs8MwWPJF5lS3',
  STRIPE_PRICE_BRONZE_ANNUAL:     'price_1TMAmv5fjArLs8Mwve4UVP0f',
  STRIPE_PRICE_SILVER_MONTHLY:    'price_1TMAmz5fjArLs8MwFKK1nPpw',
  STRIPE_PRICE_SILVER_QUARTERLY:  'price_1TMAn15fjArLs8MwCZS8Lcmo',
  STRIPE_PRICE_SILVER_ANNUAL:     'price_1TMAn35fjArLs8Mw0mH1Kadt',
  STRIPE_PRICE_GOLD_MONTHLY:      'price_1TMAn85fjArLs8MwaQgT8H6K',
  STRIPE_PRICE_GOLD_QUARTERLY:    'price_1TMAnA5fjArLs8MwbGvRbVvH',
  STRIPE_PRICE_GOLD_ANNUAL:       'price_1TMAnC5fjArLs8MwgCIJg21z',
};

describe('HP-360 Stripe price IDs', () => {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    it(`${key} is set and matches expected value`, () => {
      const actual = process.env[key];
      expect(actual, `${key} is not set in environment`).toBeTruthy();
      expect(actual).toBe(expected);
    });
  }
});
