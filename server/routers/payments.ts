// ============================================================
// payments.ts — tRPC router for Stripe + PayPal payment processing
//
// Procedures:
//   payments.createStripeIntent   — create a PaymentIntent for an invoice amount
//   payments.createPaypalOrder    — create a PayPal order
//   payments.capturePaypalOrder   — capture an approved PayPal order
//   payments.getStripePublishableKey — expose the publishable key to the client
// ============================================================

import Stripe from "stripe";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { TRPCError } from "@trpc/server";

// ── Stripe client (lazy init) ─────────────────────────────────
function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe not configured" });
  return new Stripe(key, { apiVersion: "2025-03-31.basil" });
}

// ── PayPal helpers ────────────────────────────────────────────
async function getPaypalAccessToken(): Promise<string> {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const secret = process.env.PAYPAL_SECRET;
  if (!clientId || !secret) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "PayPal not configured" });

  const base = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";
  const res = await fetch(`${base}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${clientId}:${secret}`).toString("base64")}`,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const err = await res.text();
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal auth failed: ${err}` });
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

// ── Router ────────────────────────────────────────────────────
export const paymentsRouter = router({

  // Return the Stripe publishable key to the frontend
  getStripePublishableKey: publicProcedure.query(() => {
    const key = process.env.VITE_STRIPE_PUBLISHABLE_KEY;
    if (!key) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Stripe publishable key not configured" });
    return { publishableKey: key };
  }),

  // Return whether PayPal is configured
  getPaypalClientId: publicProcedure.query(() => {
    const clientId = process.env.PAYPAL_CLIENT_ID ?? null;
    return { clientId };
  }),

  // Create a Stripe PaymentIntent
  createStripeIntent: publicProcedure
    .input(z.object({
      amountCents: z.number().int().positive(),  // amount in cents
      invoiceId: z.string(),
      invoiceNumber: z.string(),
      customerName: z.string(),
      customerEmail: z.string().optional(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const stripe = getStripe();
      const intent = await stripe.paymentIntents.create({
        amount: input.amountCents,
        currency: "usd",
        description: input.description ?? `Invoice ${input.invoiceNumber}`,
        metadata: {
          invoiceId: input.invoiceId,
          invoiceNumber: input.invoiceNumber,
          customerName: input.customerName,
        },
        ...(input.customerEmail ? { receipt_email: input.customerEmail } : {}),
        automatic_payment_methods: { enabled: true },
      });
      return {
        clientSecret: intent.client_secret!,
        paymentIntentId: intent.id,
      };
    }),

  // Create a PayPal order
  createPaypalOrder: publicProcedure
    .input(z.object({
      amountUsd: z.string(),  // e.g. "250.00"
      invoiceId: z.string(),
      invoiceNumber: z.string(),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const token = await getPaypalAccessToken();
      const base = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";
      const res = await fetch(`${base}/v2/checkout/orders`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          intent: "CAPTURE",
          purchase_units: [{
            reference_id: input.invoiceId,
            description: input.description ?? `Invoice ${input.invoiceNumber}`,
            amount: { currency_code: "USD", value: input.amountUsd },
          }],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal order creation failed: ${err}` });
      }
      const data = (await res.json()) as { id: string };
      return { orderId: data.id };
    }),

  // Capture an approved PayPal order
  capturePaypalOrder: publicProcedure
    .input(z.object({ orderId: z.string() }))
    .mutation(async ({ input }) => {
      const token = await getPaypalAccessToken();
      const base = process.env.PAYPAL_BASE_URL ?? "https://api-m.sandbox.paypal.com";
      const res = await fetch(`${base}/v2/checkout/orders/${input.orderId}/capture`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      if (!res.ok) {
        const err = await res.text();
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `PayPal capture failed: ${err}` });
      }
      const data = (await res.json()) as { id: string; status: string };
      return { orderId: data.id, status: data.status };
    }),
});
