/**
 * Validates that all HP-360 and Portfolio Stripe price IDs are set in the environment.
 * Updated to match stripe_price_ids.json from the Stripe test sandbox.
 */
import { describe, it, expect } from 'vitest';
const EXPECTED = {
  // 360° membership tiers (Bronze / Silver / Gold)
  STRIPE_PRICE_BRONZE_MONTHLY:    'price_1TMN6u5fjArLs8MwqLRrS1vh',
  STRIPE_PRICE_BRONZE_QUARTERLY:  'price_1TMN6w5fjArLs8MwuHo4bGrh',
  STRIPE_PRICE_BRONZE_ANNUAL:     'price_1TMN6y5fjArLs8MwLSDfgRwZ',
  STRIPE_PRICE_SILVER_MONTHLY:    'price_1TMN715fjArLs8Mw7HFPeP0D',
  STRIPE_PRICE_SILVER_QUARTERLY:  'price_1TMN725fjArLs8Mw4acPJnBV',
  STRIPE_PRICE_SILVER_ANNUAL:     'price_1TMN745fjArLs8Mwm65FF7O4',
  STRIPE_PRICE_GOLD_MONTHLY:      'price_1TMN775fjArLs8MwGpsoIP6W',
  STRIPE_PRICE_GOLD_QUARTERLY:    'price_1TMN785fjArLs8Mwh4APqyQY',
  STRIPE_PRICE_GOLD_ANNUAL:       'price_1TMN7A5fjArLs8MwkwMu5429',
  // Portfolio tiers
  STRIPE_PRICE_PORTFOLIO_EXTERIOR_MONTHLY:   'price_1TMN7D5fjArLs8MwPUFPlnBb',
  STRIPE_PRICE_PORTFOLIO_EXTERIOR_QUARTERLY: 'price_1TMN7F5fjArLs8MwkOoysjsr',
  STRIPE_PRICE_PORTFOLIO_EXTERIOR_ANNUAL:    'price_1TMN7G5fjArLs8MwzYBATyU6',
  STRIPE_PRICE_PORTFOLIO_FULL_MONTHLY:       'price_1TMN7J5fjArLs8MwdDaVCm2x',
  STRIPE_PRICE_PORTFOLIO_FULL_QUARTERLY:     'price_1TMN7L5fjArLs8MwjnDMf9A6',
  STRIPE_PRICE_PORTFOLIO_FULL_ANNUAL:        'price_1TMN7N5fjArLs8MwiE5OfTmx',
  STRIPE_PRICE_PORTFOLIO_MAX_MONTHLY:        'price_1TMN7Q5fjArLs8Mw5iYaqbSt',
  STRIPE_PRICE_PORTFOLIO_MAX_QUARTERLY:      'price_1TMN7R5fjArLs8MwQkj1IZDQ',
  STRIPE_PRICE_PORTFOLIO_MAX_ANNUAL:         'price_1TMN7T5fjArLs8MwgcPLjkrU',
  // Interior add-on (annual per door)
  STRIPE_PRICE_INTERIOR_ADDON_ANNUAL_PER_DOOR: 'price_1TMN7X5fjArLs8MwjNe3h1oN',
  // Turnover — member
  STRIPE_PRICE_TURNOVER_STUDIO_MEMBER:   'price_1TMN7b5fjArLs8MwnHSgonnB',
  STRIPE_PRICE_TURNOVER_2BD1BA_MEMBER:   'price_1TMN7d5fjArLs8Mw4x6gU1qn',
  STRIPE_PRICE_TURNOVER_2BD2BA_MEMBER:   'price_1TMN7f5fjArLs8MwbLiKInYj',
  STRIPE_PRICE_TURNOVER_3BD2BA_MEMBER:   'price_1TMN7h5fjArLs8MwNlczUnoY',
  STRIPE_PRICE_TURNOVER_4BD_MEMBER:      'price_1TMN7j5fjArLs8MwBQAx9jIT',
  // Turnover — non-member
  STRIPE_PRICE_TURNOVER_STUDIO_NONMEMBER:   'price_1TMN7l5fjArLs8Mw7vmQTkYR',
  STRIPE_PRICE_TURNOVER_2BD1BA_NONMEMBER:   'price_1TMN7n5fjArLs8MwXBcbZ61F',
  STRIPE_PRICE_TURNOVER_2BD2BA_NONMEMBER:   'price_1TMN7p5fjArLs8MwEHeq2SrL',
  STRIPE_PRICE_TURNOVER_3BD2BA_NONMEMBER:   'price_1TMN7r5fjArLs8Mw2c4tEkG0',
  STRIPE_PRICE_TURNOVER_4BD_NONMEMBER:      'price_1TMN7t5fjArLs8MwUf98RVd4',
};
describe('HP-360 & Portfolio Stripe price IDs', () => {
  for (const [key, expected] of Object.entries(EXPECTED)) {
    it(`${key} is set and matches expected value`, () => {
      const actual = process.env[key];
      expect(actual, `${key} is not set in environment`).toBeTruthy();
      expect(actual).toBe(expected);
    });
  }
});
