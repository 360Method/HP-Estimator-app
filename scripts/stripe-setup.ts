/**
 * One-time Stripe setup: creates the 9 360° Method membership products + prices.
 *
 * Usage:
 *   STRIPE_SECRET_KEY=sk_live_... pnpm tsx scripts/stripe-setup.ts
 *
 * After running, copy the printed env vars into Railway → Variables.
 * The server reads them as STRIPE_PRICE_360_{TIER}_{CADENCE}.
 */

import Stripe from "stripe";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error("STRIPE_SECRET_KEY is required");
  process.exit(1);
}

const stripe = new Stripe(key, { apiVersion: "2025-03-31.basil" });

const TIERS = [
  {
    id: "bronze",
    name: "360° Method Bronze",
    description: "Essential protection for the proactive homeowner — 2 seasonal visits, annual home scan, step-ladder discounts.",
    prices: {
      monthly:   { amount: 5900,   interval: "month" as const, interval_count: 1 },
      quarterly: { amount: 16900,  interval: "month" as const, interval_count: 3 },
      annual:    { amount: 58800,  interval: "year"  as const, interval_count: 1 },
    },
  },
  {
    id: "silver",
    name: "360° Method Silver",
    description: "Full-season coverage with a $200 labor credit — 4 seasonal visits, annual home scan, higher discounts.",
    prices: {
      monthly:   { amount: 9900,   interval: "month" as const, interval_count: 1 },
      quarterly: { amount: 27900,  interval: "month" as const, interval_count: 3 },
      annual:    { amount: 94800,  interval: "year"  as const, interval_count: 1 },
    },
  },
  {
    id: "gold",
    name: "360° Method Gold",
    description: "Maximum coverage — 4 seasonal visits, $500 labor credit, priority scheduling, highest discounts.",
    prices: {
      monthly:   { amount: 14900,  interval: "month" as const, interval_count: 1 },
      quarterly: { amount: 41900,  interval: "month" as const, interval_count: 3 },
      annual:    { amount: 142800, interval: "year"  as const, interval_count: 1 },
    },
  },
] as const;

type Cadence = "monthly" | "quarterly" | "annual";

async function main() {
  console.log("Creating 360° Method products and prices in Stripe...\n");

  const envLines: string[] = [];

  for (const tier of TIERS) {
    console.log(`→ Creating product: ${tier.name}`);
    const product = await stripe.products.create({
      name: tier.name,
      description: tier.description,
      metadata: { tier: tier.id, program: "360-method" },
    });
    console.log(`  Product ID: ${product.id}`);

    for (const cadence of ["monthly", "quarterly", "annual"] as Cadence[]) {
      const { amount, interval, interval_count } = tier.prices[cadence];
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: amount,
        currency: "usd",
        recurring: { interval, interval_count },
        nickname: `${tier.name} — ${cadence}`,
        metadata: { tier: tier.id, cadence, program: "360-method" },
      });
      const envKey = `STRIPE_PRICE_360_${tier.id.toUpperCase()}_${cadence.toUpperCase()}`;
      console.log(`  ${cadence.padEnd(10)} $${(amount / 100).toFixed(2).padStart(8)}  →  ${price.id}`);
      envLines.push(`${envKey}=${price.id}`);
    }

    console.log();
  }

  console.log("─".repeat(60));
  console.log("Copy these into Railway → Variables (or your .env file):\n");
  for (const line of envLines) {
    console.log(line);
  }
  console.log();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
