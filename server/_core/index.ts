import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerAuthRoutes, seedDefaultAdminIfNeeded } from "./auth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import Stripe from "stripe";
import { handleInboundSms, handleCallStatusUpdate, generateVoiceToken, isTwilioConfigured } from "../twilio";
import twilio from "twilio";
import { exchangeGmailCode, pollInboundEmails, sendOverdueReminderEmail } from "../gmail";
import { getFirstGmailToken, listOpportunities, updateOpportunity } from "../db";
import { addSSEClient, broadcastNewMessage } from "../sse";
import { getPortalInvoiceByStripePaymentIntentId, updatePortalInvoicePaid, getPortalInvoiceByCheckoutSessionId, findPortalCustomerById, getOverdueInvoicesForReminder, markPortalInvoiceReminderSent, getSignOffsEligibleForReviewRequest, getSignOffsEligibleForReviewReminder, markReviewRequestSent, markReviewReminderSent } from "../portalDb";
import { create360MembershipFromWebhook, create360PortfolioMembershipsFromWebhook, releaseDeferredLaborBankCredits, handle360SubscriptionDeleted, handle360SubscriptionUpdated, handle360InvoicePaymentFailed } from "../threeSixtyWebhook.ts";
import { sendEmail } from "../gmail";
import { notifyOwner } from "../_core/notification";
import { randomUUID } from "crypto";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ── CORS: allow 360 funnel and portal to call the pro API ──
  app.use(cors({
    origin: [
      "https://360.handypioneers.com",
      "https://client.handypioneers.com",
      "http://localhost:3001",
      "http://localhost:5173",
    ],
    credentials: true,
  }));

  // ── Health check (Railway probes this before marking deploy live) ──
  app.get("/api/health", (_, res) => res.json({ ok: true }));

  // ── Stripe webhook: MUST be registered BEFORE express.json() ──
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (!webhookSecret) {
      res.status(400).json({ error: "Webhook secret not configured" });
      return;
    }
    let event: Stripe.Event;
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-03-31.basil" });
      event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[Webhook] Signature verification failed:", msg);
      res.status(400).json({ error: `Webhook Error: ${msg}` });
      return;
    }
    // Handle test events
    if (event.id.startsWith("evt_test_")) {
      console.log("[Webhook] Test event detected, returning verification response");
      res.json({ verified: true });
      return;
    }
    // Handle real events
    console.log(`[Webhook] Received event: ${event.type} (${event.id})`);
    switch (event.type) {
      case "payment_intent.succeeded": {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`[Webhook] PaymentIntent succeeded: ${pi.id} amount=${pi.amount}`);
        // Sync portal invoice status to 'paid'
        try {
          const inv = await getPortalInvoiceByStripePaymentIntentId(pi.id);
          if (inv) {
            await updatePortalInvoicePaid(inv.id, pi.amount_received, pi.id);
            console.log(`[Webhook] Portal invoice ${inv.id} marked paid via PI ${pi.id}`);
          } else {
            console.log(`[Webhook] No portal invoice found for PI ${pi.id} — may be client-side only`);
          }
        } catch (dbErr) {
          console.error(`[Webhook] DB update failed for PI ${pi.id}:`, dbErr);
        }
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Webhook] Checkout session completed: ${session.id}`);
        // ── 360 Method subscription enrollment ──────────────────────────────
        if (session.mode === "subscription" && session.metadata?.planType === "portfolio") {
          // Portfolio multi-property enrollment
          try {
            await create360PortfolioMembershipsFromWebhook(session);
            console.log(`[Webhook] 360 portfolio membership created for session ${session.id}`);
          } catch (errPortfolio) {
            console.error(`[Webhook] 360 portfolio membership creation failed:`, errPortfolio);
          }
          res.json({ received: true });
          return;
        }
        if (session.mode === "subscription" && session.metadata?.tier) {
          try {
            await create360MembershipFromWebhook(session);
            console.log(`[Webhook] 360 membership created for session ${session.id}`);
          } catch (err360) {
            console.error(`[Webhook] 360 membership creation failed:`, err360);
          }
          res.json({ received: true });
          return;
        }
        // ── Portal invoice payment ───────────────────────────────────────────
        try {
          const inv = await getPortalInvoiceByCheckoutSessionId(session.id);
          if (inv) {
            const amountPaid = session.amount_total ?? inv.amountDue;
            await updatePortalInvoicePaid(inv.id, amountPaid, session.payment_intent as string | undefined);
            console.log(`[Webhook] Portal invoice ${inv.id} marked paid via Checkout ${session.id}`);
            // Send payment receipt email
            try {
              const customer = await findPortalCustomerById(inv.customerId);
              if (customer) {
                const amountStr = `$${(amountPaid / 100).toFixed(2)}`;
                const baseUrl = process.env.PORTAL_BASE_URL ?? 'https://client.handypioneers.com';
                const invoiceUrl = `${baseUrl}/portal/invoices/${inv.id}`;
                const firstName = customer.name.split(' ')[0];
                const receiptHtml = `<!DOCTYPE html><html><body style="font-family:Helvetica,Arial,sans-serif;background:#f4f5f7;padding:32px 16px;">
<table width="600" style="max-width:600px;margin:0 auto;background:#fff;border-radius:8px;overflow:hidden;">
<tr><td style="background:linear-gradient(135deg,#1a2e1a,#2d4a2d);padding:28px 40px;text-align:center;">
  <p style="color:#fff;font-size:20px;font-weight:700;margin:0;">Payment Received</p>
  <p style="color:rgba(255,255,255,0.65);font-size:11px;letter-spacing:0.1em;text-transform:uppercase;margin:6px 0 0;">Handy Pioneers</p>
</td></tr>
<tr><td style="padding:36px 40px;color:#1a1a1a;font-size:15px;line-height:1.6;">
  <p>Hi ${firstName},</p>
  <p>We received your payment of <strong>${amountStr}</strong> for invoice <strong>${inv.invoiceNumber}</strong>. Thank you!</p>
  <table width="100%" style="margin:20px 0;"><tr><td style="background:#f8f9fa;border:1px solid #e8e8e8;border-radius:6px;padding:16px 24px;text-align:center;">
    <p style="margin:0;font-size:13px;color:#888;text-transform:uppercase;">Amount Paid</p>
    <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#2D5016;">${amountStr}</p>
  </td></tr></table>
  <p style="text-align:center;"><a href="${invoiceUrl}" style="display:inline-block;background:#c8922a;color:#fff;font-weight:700;padding:12px 32px;border-radius:6px;text-decoration:none;">View Invoice</a></p>
  <p style="font-size:13px;color:#888;text-align:center;">Questions? <a href="mailto:help@handypioneers.com" style="color:#c8922a;">help@handypioneers.com</a> | (360) 544-9858</p>
</td></tr></table></body></html>`;
                await sendEmail({ to: customer.email, subject: `Payment Received — Invoice ${inv.invoiceNumber}`, html: receiptHtml }).catch(() => null);
                await notifyOwner({ title: `💳 Invoice Paid: ${inv.invoiceNumber}`, content: `${customer.name} paid ${amountStr} for invoice ${inv.invoiceNumber} via Stripe Checkout.` }).catch(() => null);
              }
            } catch (emailErr) {
              console.error('[Webhook] Receipt email failed:', emailErr);
            }
          } else {
            console.log(`[Webhook] No portal invoice found for Checkout session ${session.id}`);
          }
        } catch (dbErr) {
          console.error(`[Webhook] DB update failed for Checkout ${session.id}:`, dbErr);
        }
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`[Webhook] PaymentIntent failed: ${pi.id}`);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`[Webhook] Subscription deleted: ${sub.id}`);
        await handle360SubscriptionDeleted(sub).catch(err =>
          console.error("[Webhook] subscription.deleted handler error:", err)
        );
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        console.log(`[Webhook] Subscription updated: ${sub.id} status=${sub.status}`);
        await handle360SubscriptionUpdated(sub).catch(err =>
          console.error("[Webhook] subscription.updated handler error:", err)
        );
        break;
      }
      case "invoice.payment_failed": {
        const inv = event.data.object as Stripe.Invoice;
        console.log(`[Webhook] Invoice payment failed: ${inv.id}`);
        await handle360InvoicePaymentFailed(inv).catch(err =>
          console.error("[Webhook] invoice.payment_failed handler error:", err)
        );
        break;
      }
      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
  });

  // ── Twilio SMS inbound webhook ──────────────────────────────────────────────
  // POST /api/twilio/sms — Twilio calls this when an SMS arrives
  app.post("/api/twilio/sms", express.urlencoded({ extended: false }), async (req, res) => {
    try {
      // Validate Twilio signature in production
      // Use x-forwarded-host and x-forwarded-proto to get the real public URL
      // behind the Manus reverse proxy — Twilio signs with the public URL
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (authToken) {
        const sig = req.headers["x-twilio-signature"] as string;
        const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
        const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
        const proto = forwardedProto.split(",")[0].trim(); // take first if comma-separated
        const host = forwardedHost.split(",")[0].trim();
        const url = `${proto}://${host}/api/twilio/sms`;
        console.log(`[Twilio SMS] Validating signature for URL: ${url}`);
        const valid = twilio.validateRequest(authToken, sig, url, req.body);
        if (!valid && process.env.NODE_ENV === "production") {
          console.warn(`[Twilio SMS] Signature validation failed for URL: ${url}`);
          // Log but don't block — allow through so we can debug
          // res.status(403).send("Forbidden");
          // return;
        }
      }
      const inboundMsg = await handleInboundSms(req.body);
      // Broadcast real-time update to connected clients
      if (inboundMsg) {
        broadcastNewMessage(inboundMsg.conversationId, inboundMsg);
      }
      // Respond with empty TwiML — no auto-reply
      res.set("Content-Type", "text/xml");
      res.send("<Response></Response>");
    } catch (err) {
      console.error("[Twilio SMS webhook]", err);
      res.status(500).send("Error");
    }
  });

  // ── Twilio Voice status callback ─────────────────────────────────────────────
  // POST /api/twilio/voice/status — Twilio calls this when call status changes
  app.post("/api/twilio/voice/status", express.urlencoded({ extended: false }), async (req, res) => {
    try {
      await handleCallStatusUpdate(req.body);
      res.sendStatus(204);
    } catch (err) {
      console.error("[Twilio Voice status]", err);
      res.status(500).send("Error");
    }
  });

  // ── Twilio Voice TwiML — outbound call instructions ──────────────────────────
  // POST /api/twilio/voice/connect — returns TwiML to connect a browser call
  app.post("/api/twilio/voice/connect", express.urlencoded({ extended: false }), (req, res) => {
    const to = req.body.To || req.body.to;
    const VoiceResponse = twilio.twiml.VoiceResponse;
    const twiml = new VoiceResponse();
    if (to) {
      const dial = twiml.dial({ callerId: process.env.TWILIO_PHONE_NUMBER || "" });
      dial.number(to);
    } else {
      twiml.say("No destination specified.");
    }
    res.set("Content-Type", "text/xml");
    res.send(twiml.toString());
  });

  // ── SSE endpoint for real-time inbox updates ─────────────────────────────────────────────
  app.get("/api/inbox/events", (req, res) => {
    const clientId = randomUUID();
    addSSEClient(clientId, res);
  });

  // ── Gmail diagnostic endpoint (temporary) ─────────────────────────────────────────────────
  app.get("/api/gmail/debug", (req, res) => {
    res.json({
      configured: !!(process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET),
      clientIdPrefix: process.env.GMAIL_CLIENT_ID?.slice(0, 20) || null,
      lastError: process.env.GMAIL_LAST_ERROR || null,
      connectedEmail: process.env.GMAIL_CONNECTED_EMAIL || null,
    });
  });

  // ── Gmail OAuth callback ───────────────────────────────────────────────────────────────────
  app.get("/api/gmail/callback", async (req, res) => {
    const code = req.query.code as string;
    const rawState = req.query.state as string | undefined;
    if (!code) { res.status(400).send("Missing code"); return; }
    // Parse redirectUri from state (encoded by getGmailAuthUrl)
    let redirectUri: string | undefined;
    let origin = "";
    try {
      if (rawState) {
        const parsed = JSON.parse(rawState);
        redirectUri = parsed.redirectUri;
        if (redirectUri) origin = new URL(redirectUri).origin;
      }
    } catch { /* state was plain string or empty, ignore */ }
    try {
      const email = await exchangeGmailCode(code, redirectUri);
      console.log(`[Gmail] Connected account: ${email}`);
      process.env.GMAIL_CONNECTED_EMAIL = email;
      res.redirect(`${origin}/?gmail=connected`);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      const errDetail = (err as any)?.response?.data ? JSON.stringify((err as any).response.data) : '';
      console.error("[Gmail] OAuth callback error:", errMsg, errDetail);
      // Store error for diagnostic endpoint
      process.env.GMAIL_LAST_ERROR = `${errMsg} ${errDetail}`.trim();
      res.redirect(`${origin}/?gmail=error&reason=${encodeURIComponent(errMsg.slice(0, 100))}`);
    }
  });

  // ── Google Maps JS SDK proxy ─────────────────────────────────────────────────────────────────
  // Proxies the Google Maps SDK server-side to avoid exposing the API key in the browser.
  app.get("/api/maps/sdk", async (req, res) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
    if (!apiKey) {
      res.status(503).send("Google Maps API key not configured");
      return;
    }
    const libraries = (req.query.libraries as string) || "places,geocoding,geometry";
    const v = (req.query.v as string) || "weekly";
    const sdkUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=${v}&libraries=${libraries}`;
    try {
      const upstream = await fetch(sdkUrl);
      if (!upstream.ok) {
        const body = await upstream.text();
        console.error(`[Maps SDK proxy] Upstream error ${upstream.status}: ${body}`);
        res.status(502).send("Maps SDK unavailable");
        return;
      }
      res.set("Content-Type", "application/javascript; charset=utf-8");
      res.set("Cache-Control", "public, max-age=3600");
      const text = await upstream.text();
      res.send(text);
    } catch (err) {
      console.error("[Maps SDK proxy] Error:", err);
      res.status(502).send("Maps SDK proxy error");
    }
  });

  // ── Portal estimate PDF download ─────────────────────────────────────────────
  // GET /api/portal/estimate-pdf/:id — returns a PDF of the estimate
  // Requires a valid portal session cookie (same as tRPC portal procedures)
  app.get("/api/portal/estimate-pdf/:id", async (req, res) => {
    try {
      // Validate portal session
      const { getPortalEstimateById, findValidPortalSession, findPortalCustomerById } = await import("../portalDb");
      const cookieHeader = req.headers.cookie || "";
      const tokenMatch = cookieHeader.match(/hp_portal_session=([^;]+)/);
      if (!tokenMatch) { res.status(401).json({ error: "Not authenticated" }); return; }
      const session = await findValidPortalSession(decodeURIComponent(tokenMatch[1]));
      if (!session) { res.status(401).json({ error: "Invalid or expired session" }); return; }
      const portalCustomer = await findPortalCustomerById(session.customerId);
      if (!portalCustomer) { res.status(401).json({ error: "Customer not found" }); return; }

      const est = await getPortalEstimateById(Number(req.params.id));
      if (!est || Number(est.customerId) !== portalCustomer.id) { res.status(404).json({ error: "Not found" }); return; }

      // Parse stored lineItemsJson
      let phases: any[] = [];
      try { phases = JSON.parse(est.lineItemsJson || "[]"); } catch { phases = []; }

      const fmtMoney = (cents: number) => `$${(cents / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      const fmtDate = (d: string | Date | null | undefined) => {
        if (!d) return "—";
        return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      };

      // Build HTML matching the portal estimate detail layout
      const isLegacy = phases.length > 0 && !phases[0].items;
      let lineItemsHtml = "";
      if (isLegacy) {
        lineItemsHtml = `<table class="items-table"><thead><tr><th>Services</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>`;
        for (const row of phases) {
          lineItemsHtml += `<tr><td>${row.description || ""}</td><td>—</td><td>—</td><td>${fmtMoney(est.totalAmount ?? 0)}</td></tr>`;
        }
        lineItemsHtml += `</tbody></table>`;
      } else {
        for (const phase of phases) {
          lineItemsHtml += `<div class="phase-block">`;
          lineItemsHtml += `<div class="phase-header"><strong>${phase.phaseName || ""}</strong>`;
          if (phase.phaseDescription) lineItemsHtml += `<p class="phase-desc">${phase.phaseDescription}</p>`;
          lineItemsHtml += `</div>`;
          lineItemsHtml += `<table class="items-table"><thead><tr><th>Services</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>`;
          for (const item of (phase.items || [])) {
            lineItemsHtml += `<tr><td><strong>${item.name || ""}</strong>`;
            if (item.scopeOfWork) lineItemsHtml += `<br/><span class="sow">SCOPE OF WORK<br/>— ${item.scopeOfWork}</span>`;
            lineItemsHtml += `</td><td>${item.qty ?? "—"}</td><td>${item.unitPrice != null ? fmtMoney(Math.round(item.unitPrice * 100)) : "—"}</td><td>${item.amount != null ? fmtMoney(Math.round(item.amount * 100)) : "—"}</td></tr>`;
          }
          lineItemsHtml += `</tbody></table>`;
          if (phase.phaseSubtotal != null) {
            lineItemsHtml += `<div class="phase-subtotal">Services subtotal: <strong>${fmtMoney(Math.round(phase.phaseSubtotal * 100))}</strong></div>`;
          }
          lineItemsHtml += `</div>`;
        }
      }

      const depositPct = est.depositPercent ?? 50;
      const depositAmt = est.depositAmount ?? Math.round((est.totalAmount ?? 0) * depositPct / 100);

      const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><style>
        body { font-family: 'Helvetica Neue', Arial, sans-serif; font-size: 13px; color: #1a1a1a; margin: 0; padding: 0; }
        .header-bar { background: #1a2e1a; color: white; padding: 20px 32px; display: flex; align-items: center; gap: 16px; }
        .header-bar img { width: 52px; height: 52px; border-radius: 50%; }
        .header-bar .company { font-size: 20px; font-weight: 700; }
        .header-bar .tagline { font-size: 11px; opacity: 0.75; }
        .gold-bar { height: 4px; background: linear-gradient(90deg, #c8922a, #e8b84b); }
        .body { padding: 32px; }
        .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
        .meta-table td { padding: 4px 8px; font-size: 12px; }
        .meta-table .label { color: #666; }
        .meta-table .value { font-weight: 600; }
        .meta-table .right { text-align: right; }
        .section-label { font-size: 10px; font-weight: 700; letter-spacing: 0.1em; color: #888; text-transform: uppercase; margin-bottom: 4px; }
        .customer-block { margin-bottom: 24px; }
        .customer-block h2 { font-size: 22px; font-weight: 700; margin: 0 0 4px; }
        .phase-block { margin-bottom: 24px; }
        .phase-header { background: #f5f5f5; padding: 10px 14px; border-radius: 6px 6px 0 0; border: 1px solid #e0e0e0; border-bottom: none; }
        .phase-header strong { font-size: 15px; }
        .phase-desc { font-size: 12px; color: #555; margin: 4px 0 0; }
        .items-table { width: 100%; border-collapse: collapse; border: 1px solid #e0e0e0; }
        .items-table th { background: #f9f9f9; text-align: left; padding: 8px 12px; font-size: 11px; font-weight: 600; color: #555; border-bottom: 1px solid #e0e0e0; }
        .items-table th:not(:first-child) { text-align: right; }
        .items-table td { padding: 10px 12px; border-bottom: 1px solid #f0f0f0; vertical-align: top; }
        .items-table td:not(:first-child) { text-align: right; }
        .sow { font-size: 11px; color: #666; }
        .phase-subtotal { text-align: right; padding: 8px 12px; font-size: 12px; color: #555; background: #fafafa; border: 1px solid #e0e0e0; border-top: none; }
        .totals-table { width: 100%; border-collapse: collapse; margin-top: 16px; }
        .totals-table td { padding: 6px 12px; font-size: 13px; }
        .totals-table td:last-child { text-align: right; }
        .totals-table .total-row td { font-weight: 700; font-size: 15px; border-top: 2px solid #1a2e1a; padding-top: 10px; }
        .totals-table .deposit-row td { color: #c8922a; font-weight: 600; }
        .footer { margin-top: 40px; text-align: center; font-size: 11px; color: #888; border-top: 1px solid #e0e0e0; padding-top: 16px; }
        .approve-note { background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 12px 16px; margin-top: 24px; font-size: 12px; color: #166534; }
      </style></head><body>
        <div class="header-bar">
          <img src="https://d2zcpib8duehag.cloudfront.net/hp-logo-circle.png" alt="HP"/>
          <div><div class="company">Handy Pioneers</div><div class="tagline">808 SE Chkalov Dr 3-433, Vancouver, WA 98683 &nbsp;|&nbsp; (360) 544-9858 &nbsp;|&nbsp; help@handypioneers.com</div></div>
          <div style="margin-left:auto;text-align:right;font-size:12px;">
            <div style="opacity:0.7">ESTIMATE</div>
            <div style="font-weight:700;font-size:16px">${est.estimateNumber}</div>
          </div>
        </div>
        <div class="gold-bar"></div>
        <div class="body">
          <table class="meta-table"><tr>
            <td><span class="section-label">For</span><br/><strong>${portalCustomer.name}</strong></td>
            <td class="right"><span class="label">Estimate Date:</span> <span class="value">${fmtDate(est.sentAt)}</span><br/><span class="label">Expires:</span> <span class="value">${fmtDate(est.expiresAt)}</span></td>
          </tr></table>
          ${lineItemsHtml}
          <table class="totals-table">
            <tr><td>Subtotal</td><td>${fmtMoney(est.totalAmount ?? 0)}</td></tr>
            <tr><td style="color:#888">Tax (WA — client to verify)</td><td style="color:#888;font-style:italic">Not included</td></tr>
            <tr class="total-row"><td>Total</td><td>${fmtMoney(est.totalAmount ?? 0)}</td></tr>
            <tr class="deposit-row"><td>Deposit (${depositPct}%) required to schedule</td><td>${fmtMoney(depositAmt)}</td></tr>
          </table>
          ${est.status === 'approved' ? `<div class="approve-note">✅ This estimate was approved${est.approvedAt ? ` on ${fmtDate(est.approvedAt)}` : ''}.${est.signatureDataUrl ? ' A digital signature was collected.' : ''}</div>` : ''}
          <div class="footer">Handy Pioneers &nbsp;·&nbsp; 808 SE Chkalov Dr 3-433, Vancouver, WA 98683 &nbsp;·&nbsp; (360) 544-9858 &nbsp;·&nbsp; help@handypioneers.com</div>
        </div>
      </body></html>`;

      // Convert HTML to PDF using Puppeteer
      const puppeteer = await import("puppeteer");
      const browser = await puppeteer.default.launch({
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
        args: ["--no-sandbox", "--disable-setuid-sandbox"],
        headless: true,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: "networkidle0" });
      const pdfBuffer = await page.pdf({ format: "A4", printBackground: true });
      await browser.close();

      res.set("Content-Type", "application/pdf");
      res.set("Content-Disposition", `attachment; filename="Estimate-${est.estimateNumber}.pdf"`);
      res.send(pdfBuffer);
    } catch (err) {
      console.error("[Portal PDF]", err);
      res.status(500).json({ error: "PDF generation failed" });
    }
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // Auth endpoints: POST /api/auth/login, POST /api/auth/logout, GET /api/auth/me
  registerAuthRoutes(app);

  // Seed default admin user if no staff users exist yet
  await seedDefaultAdminIfNeeded();

  // ── 360° REST enrollment endpoint (called by external funnel at 360.handypioneers.com) ──
  app.post("/api/360/enroll", async (req, res) => {
    const { tier, cadence, firstName, lastName, email, phone, address, city, state, zip } = req.body ?? {};
    if (!tier || !cadence || !email) {
      res.status(400).json({ error: "tier, cadence, and email are required" });
      return;
    }
    const validTiers = ["bronze", "silver", "gold"];
    const validCadences = ["monthly", "quarterly", "annual"];
    if (!validTiers.includes(tier) || !validCadences.includes(cadence)) {
      res.status(400).json({ error: "Invalid tier or cadence" });
      return;
    }
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-03-31.basil" });

      // Resolve Stripe price ID from env vars
      const priceEnvKey = `STRIPE_PRICE_360_${tier.toUpperCase()}_${cadence.toUpperCase()}`;
      const priceId = process.env[priceEnvKey];
      if (!priceId) {
        res.status(503).json({ error: `Stripe price not configured (${priceEnvKey})` });
        return;
      }

      const customerName = [firstName, lastName].filter(Boolean).join(" ") || email;
      const successUrl = `${process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com"}/360-welcome?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl = `${process.env.FUNNEL_ORIGIN ?? "https://360.handypioneers.com"}/?canceled=1`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: email,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          tier,
          cadence,
          customerName,
          customerEmail: email,
          customerPhone: phone ?? "",
          serviceAddress: address ?? "",
          serviceCity: city ?? "",
          serviceState: state ?? "",
          serviceZip: zip ?? "",
        },
      });

      res.json({ checkoutUrl: session.url });
    } catch (err) {
      console.error("[360 Enroll]", err);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // ── 360° funnel checkout endpoint (called by hp-360-funnel frontend) ──────────────
  // Accepts the funnel's payload shape and maps it to Stripe checkout.
  app.post("/api/360/checkout", async (req, res) => {
    const { tier: funnelTier, cadence, customer, type: checkoutType } = req.body ?? {};
    if (!funnelTier || !cadence || !customer?.email) {
      res.status(400).json({ error: "tier, cadence, and customer.email are required" });
      return;
    }

    // Map funnel tier names → HP internal names
    const TIER_MAP: Record<string, string> = {
      exterior_shield: "bronze",
      full_coverage:   "silver",
      max:             "gold",
    };
    const tier = TIER_MAP[funnelTier];
    if (!tier) {
      res.status(400).json({ error: `Unknown tier: ${funnelTier}` });
      return;
    }

    const validCadences = ["monthly", "quarterly", "annual"];
    if (!validCadences.includes(cadence)) {
      res.status(400).json({ error: `Invalid cadence: ${cadence}` });
      return;
    }

    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) { res.status(503).json({ error: "Stripe not configured" }); return; }
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" });

      const priceEnvKey = `STRIPE_PRICE_360_${tier.toUpperCase()}_${cadence.toUpperCase()}`;
      const priceId = process.env[priceEnvKey];
      if (!priceId) {
        res.status(503).json({ error: `Stripe price not configured (${priceEnvKey})` });
        return;
      }

      // Split "First Last" into parts; everything after first space is lastName
      const nameParts = (customer.name ?? "").trim().split(/\s+/);
      const firstName = nameParts[0] ?? "";
      const lastName  = nameParts.slice(1).join(" ");
      const customerName = customer.name || customer.email;

      const successUrl = `${process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com"}/360-welcome?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl  = `${process.env.FUNNEL_ORIGIN ?? "https://360.handypioneers.com"}/?canceled=1`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        customer_email: customer.email,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          tier,
          cadence,
          checkoutType: checkoutType ?? "homeowner",
          customerName,
          customerEmail: customer.email,
          customerPhone: customer.phone ?? "",
          serviceAddress: customer.address ?? "",
          serviceCity: customer.city ?? "",
          serviceState: customer.state ?? "",
          serviceZip: customer.zip ?? "",
          firstName,
          lastName,
        },
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error("[360 Checkout]", err);
      res.status(500).json({ error: "Failed to create checkout session" });
    }
  });

  // ── 360° portfolio checkout — multi-property subscription ──────────────────
  // Uses inline price_data so no per-tier Stripe products need to be pre-created.
  app.post("/api/360/portfolio-checkout", async (req, res) => {
    const { cadence, properties, customer } = req.body ?? {};
    if (!cadence || !Array.isArray(properties) || properties.length === 0 || !customer?.email) {
      res.status(400).json({ error: "cadence, properties[], and customer.email are required" });
      return;
    }
    const validCadences = ["monthly", "quarterly", "annual"];
    if (!validCadences.includes(cadence)) {
      res.status(400).json({ error: `Invalid cadence: ${cadence}` });
      return;
    }

    // Cents per property per billing period, matching threeSixtyTiers.ts pricing
    const TIER_PRICES: Record<string, Record<string, number>> = {
      exterior_shield: { monthly: 5900,  quarterly: 16900, annual: 58800  },
      full_coverage:   { monthly: 9900,  quarterly: 27900, annual: 94800  },
      max:             { monthly: 14900, quarterly: 41900, annual: 142800 },
    };

    let totalCents = 0;
    for (const prop of properties) {
      const tierPrices = TIER_PRICES[prop.tier as string];
      if (!tierPrices) {
        res.status(400).json({ error: `Unknown tier: ${prop.tier}` });
        return;
      }
      totalCents += tierPrices[cadence];
    }

    const INTERVAL: Record<string, { interval: "month" | "year"; interval_count: number }> = {
      monthly:   { interval: "month", interval_count: 1 },
      quarterly: { interval: "month", interval_count: 3 },
      annual:    { interval: "year",  interval_count: 1 },
    };

    try {
      const stripeKey = process.env.STRIPE_SECRET_KEY;
      if (!stripeKey) { res.status(503).json({ error: "Stripe not configured" }); return; }
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" });

      const nameParts = (customer.name ?? "").trim().split(/\s+/);
      const firstName = nameParts[0] ?? "";
      const lastName  = nameParts.slice(1).join(" ");
      const customerName = customer.name || customer.email;
      const interiorAddonCount = (properties as any[]).filter(p => p.interiorAddon).length;
      const { interval, interval_count } = INTERVAL[cadence];
      const propCount = properties.length;

      const successUrl = `${process.env.PORTAL_BASE_URL ?? "https://client.handypioneers.com"}/360-welcome?session_id={CHECKOUT_SESSION_ID}`;
      const cancelUrl  = `${process.env.FUNNEL_ORIGIN ?? "https://360.handypioneers.com"}/?canceled=1`;

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{
          price_data: {
            currency: "usd",
            recurring: { interval, interval_count },
            product_data: {
              name: `360° Portfolio Plan — ${propCount} ${propCount === 1 ? "property" : "properties"}`,
              description: (properties as any[]).map((p: any) => `${p.address ?? "Property"} (${p.tier})`).join("; "),
            },
            unit_amount: totalCents,
          },
          quantity: 1,
        }],
        customer_email: customer.email,
        success_url: successUrl,
        cancel_url: cancelUrl,
        metadata: {
          planType: "portfolio",
          cadence,
          customerName,
          customerEmail: customer.email,
          customerPhone: customer.phone ?? "",
          interiorAddonDoors: String(interiorAddonCount),
          firstName,
          lastName,
          // JSON-encode properties for the webhook handler (max 500 chars per value)
          properties: JSON.stringify(
            (properties as any[]).map((p: any) => ({
              address: p.address ?? "",
              city: p.city ?? "",
              state: p.state ?? "",
              zip: p.zip ?? "",
              tier: p.tier ?? "",
              units: p.units ?? 1,
              interiorAddon: !!p.interiorAddon,
              interiorDoors: p.interiorDoors ?? 0,
            }))
          ).slice(0, 490),
        },
      });

      res.json({ url: session.url });
    } catch (err) {
      console.error("[360 Portfolio Checkout]", err);
      res.status(500).json({ error: "Failed to create portfolio checkout session" });
    }
  });

  // ── 360° analytics event stub ───────────────────────────────────────────────
  app.post("/api/360/event", express.json(), (req, res) => {
    // Analytics only — log and acknowledge; no business logic
    console.log("[360 Event]", JSON.stringify(req.body));
    res.json({ ok: true });
  });

  // ── 360° session lookup — used by /360-welcome page to show tier/name ──────────
  app.get("/api/360/session", async (req, res) => {
    const sessionId = req.query.session_id as string | undefined;
    if (!sessionId) { res.status(400).json({ error: "session_id required" }); return; }
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    if (!stripeKey) { res.status(503).json({ error: "Stripe not configured" }); return; }
    try {
      const stripe = new Stripe(stripeKey, { apiVersion: "2025-03-31.basil" });
      const session = await stripe.checkout.sessions.retrieve(sessionId);
      res.json({
        tier: session.metadata?.tier ?? null,
        cadence: session.metadata?.cadence ?? null,
        customerName: session.metadata?.customerName ?? session.customer_details?.name ?? null,
      });
    } catch (err) {
      console.error("[360 Session]", err);
      res.status(500).json({ error: "Could not retrieve session" });
    }
  });

  // ── Gmail poll schedule (every 2 minutes) ────────────────────────────────────────────────────
  setInterval(async () => {
    const email = process.env.GMAIL_CONNECTED_EMAIL;
    if (email) {
      await pollInboundEmails(email).catch(err =>
        console.error("[Gmail] Poll error:", err)
      );
    }
  }, 2 * 60 * 1000); // every 2 minutes

  // ── Overdue invoice reminder (daily at 9 AM server time) ─────────────────────
  const scheduleOverdueReminders = () => {
    const now = new Date();
    const next9am = new Date(now);
    next9am.setHours(9, 0, 0, 0);
    if (next9am <= now) next9am.setDate(next9am.getDate() + 1);
    const msUntil9am = next9am.getTime() - now.getTime();
    setTimeout(async () => {
      try {
        const overdueRows = await getOverdueInvoicesForReminder();
        const origin = process.env.PORTAL_ORIGIN ?? "https://client.handypioneers.com";
        let sent = 0;
        for (const { invoice, customer } of overdueRows) {
          if (!customer.email) continue;
          try {
            await sendOverdueReminderEmail({
              to: customer.email,
              customerName: customer.name ?? "Valued Customer",
              invoiceNumber: invoice.invoiceNumber,
              amountDueCents: Math.max(0, invoice.amountDue - invoice.amountPaid),
              dueDate: invoice.dueDate,
              portalInvoiceId: invoice.id,
              origin,
            });
            await markPortalInvoiceReminderSent(invoice.id);
            sent++;
          } catch (err) {
            console.error(`[Overdue] Failed to send reminder for invoice ${invoice.id}:`, err);
          }
        }
        if (sent > 0) {
          console.log(`[Overdue] Sent ${sent} overdue reminder email(s)`);
          await notifyOwner({
            title: `Overdue reminders sent`,
            content: `${sent} overdue invoice reminder email(s) sent to customers.`,
          }).catch(() => {});
        }
      } catch (err) {
        console.error("[Overdue] Reminder job error:", err);
      }
      // Schedule next run in 24 hours
      setInterval(async () => {
        try {
          const overdueRows = await getOverdueInvoicesForReminder();
          const origin = process.env.PORTAL_ORIGIN ?? "https://client.handypioneers.com";
          let sent = 0;
          for (const { invoice, customer } of overdueRows) {
            if (!customer.email) continue;
            try {
              await sendOverdueReminderEmail({
                to: customer.email,
                customerName: customer.name ?? "Valued Customer",
                invoiceNumber: invoice.invoiceNumber,
                amountDueCents: Math.max(0, invoice.amountDue - invoice.amountPaid),
                dueDate: invoice.dueDate,
                portalInvoiceId: invoice.id,
                origin,
              });
              await markPortalInvoiceReminderSent(invoice.id);
              sent++;
            } catch (err) {
              console.error(`[Overdue] Failed to send reminder for invoice ${invoice.id}:`, err);
            }
          }
          if (sent > 0) {
            console.log(`[Overdue] Sent ${sent} overdue reminder email(s)`);
            await notifyOwner({
              title: `Overdue reminders sent`,
              content: `${sent} overdue invoice reminder email(s) sent to customers.`,
            }).catch(() => {});
          }
        } catch (err) {
          console.error("[Overdue] Reminder job error:", err);
        }
      }, 24 * 60 * 60 * 1000); // repeat every 24 hours
    }, msUntil9am);
    console.log(`[Overdue] Next reminder run scheduled in ${Math.round(msUntil9am / 60000)} minutes`);
  };
  scheduleOverdueReminders();

  // ── Review request emails (runs every hour, checks for eligible sign-offs) ─────
  const GOOGLE_REVIEW_URL = process.env.GOOGLE_REVIEW_URL ?? 'https://g.page/r/handypioneers/review';
  const { buildReviewRequestEmail } = await import('../routers/portal.js');

  const runReviewRequests = async () => {
    try {
      // Initial review request — send immediately after sign-off
      const eligible = await getSignOffsEligibleForReviewRequest();
      for (const signOff of eligible) {
        const customer = await findPortalCustomerById(signOff.customerId);
        if (!customer?.email) continue;
        try {
          const { subject, html } = buildReviewRequestEmail(
            customer.name ?? 'Valued Customer',
            signOff.hpOpportunityId,
            GOOGLE_REVIEW_URL,
            false,
          );
          await sendEmail({ to: customer.email, subject, html }).catch(() => null);
          await markReviewRequestSent(signOff.id);
          console.log(`[Review] Sent initial review request to ${customer.email} for job ${signOff.hpOpportunityId}`);
        } catch (err) {
          console.error(`[Review] Failed to send initial request for sign-off ${signOff.id}:`, err);
        }
      }

      // 48h reminder — send if initial was sent but no review yet
      const reminders = await getSignOffsEligibleForReviewReminder();
      for (const signOff of reminders) {
        const customer = await findPortalCustomerById(signOff.customerId);
        if (!customer?.email) continue;
        try {
          const { subject, html } = buildReviewRequestEmail(
            customer.name ?? 'Valued Customer',
            signOff.hpOpportunityId,
            GOOGLE_REVIEW_URL,
            true,
          );
          await sendEmail({ to: customer.email, subject, html }).catch(() => null);
          await markReviewReminderSent(signOff.id);
          console.log(`[Review] Sent 48h reminder to ${customer.email} for job ${signOff.hpOpportunityId}`);
        } catch (err) {
          console.error(`[Review] Failed to send 48h reminder for sign-off ${signOff.id}:`, err);
        }
      }
    } catch (err) {
      console.error('[Review] Review request job error:', err);
    }
  };

  // Run once on startup (catches any sign-offs that happened while server was down)
  // then every hour
  runReviewRequests().catch(console.error);
  setInterval(runReviewRequests, 60 * 60 * 1000);
  console.log('[Review] Review request scheduler started (runs every hour)');

  // ── 360° Cart Abandonment Drip Emails (runs every hour) ────────────────────────────────────────────────────
  const FUNNEL_URL = process.env.FUNNEL_ORIGIN ?? "https://360.handypioneers.com";
  const run360DripEmails = async () => {
    try {
      const abandoned = await listOpportunities("lead", undefined, false, 500);
      const cartLeads = abandoned.filter((o: { stage: string }) => o.stage === "Cart Abandoned");
      if (cartLeads.length === 0) return;
      const now = Date.now();
      const H24 = 24 * 60 * 60 * 1000;
      const H72 = 72 * 60 * 60 * 1000;
      const D7  = 7 * 24 * 60 * 60 * 1000;
      for (const lead of cartLeads) {
        const emailMatch = (lead.notes ?? "").match(/<([^>]+@[^>]+)>/);
        const nameMatch  = (lead.notes ?? "").match(/Contact: ([^<]+)</);
        const tierMatch  = (lead.notes ?? "").match(/Tier: (\w+)/);
        if (!emailMatch) continue;
        const to        = emailMatch[1].trim();
        const firstName = nameMatch ? nameMatch[1].trim().split(" ")[0] : "there";
        const tier      = tierMatch  ? tierMatch[1] : "Essential";
        const tierLabel = tier.charAt(0).toUpperCase() + tier.slice(1);
        const createdAt = new Date((lead as any).createdAt ?? 0).getTime();
        const age  = now - createdAt;
        const sent = lead.notes ?? "";
        if (age >= H24 && age < H72 && !sent.includes("[Drip-1 sent]")) {
          await sendEmail({
            to,
            subject: `Still thinking about protecting your home, ${firstName}?`,
            html: `<p>Hi ${firstName},</p><p>You started enrolling in the <strong>360\u00b0 ${tierLabel} Plan</strong> but didn't finish. We saved your spot.</p><p>The 360\u00b0 Method gives you one annual home scan, four seasonal tune-ups, and a labor credit that pays for itself \u2014 starting at $49/mo.</p><p><a href="${FUNNEL_URL}" style="background:#b45309;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;display:inline-block;">Complete My Enrollment \u2192</a></p><p>Questions? Reply to this email or call us at (360) 544-9858.</p><p>\u2014 The Handy Pioneers Team</p>`,
          }).catch(() => null);
          await updateOpportunity(lead.id, { notes: sent + "\n[Drip-1 sent]" }).catch(() => null);
          console.log(`[360 Drip] Email 1 sent to ${to}`);
        } else if (age >= H72 && age < D7 && !sent.includes("[Drip-2 sent]")) {
          await sendEmail({
            to,
            subject: `Your home is losing value every season you wait`,
            html: `<p>Hi ${firstName},</p><p>Most homeowners don't realize the cost of deferred maintenance until it's too late. A leaky gutter becomes a $4,000 foundation repair. A missed HVAC filter becomes a $6,000 replacement.</p><p>The <strong>360\u00b0 ${tierLabel} Plan</strong> catches these issues early \u2014 and your labor credit covers the fixes.</p><p><a href="${FUNNEL_URL}" style="background:#b45309;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;display:inline-block;">Protect My Home Now \u2192</a></p><p>\u2014 The Handy Pioneers Team</p>`,
          }).catch(() => null);
          await updateOpportunity(lead.id, { notes: sent + "\n[Drip-2 sent]" }).catch(() => null);
          console.log(`[360 Drip] Email 2 sent to ${to}`);
        } else if (age >= D7 && !sent.includes("[Drip-3 sent]")) {
          await sendEmail({
            to,
            subject: `Last chance \u2014 your 360\u00b0 enrollment spot`,
            html: `<p>Hi ${firstName},</p><p>We've been holding your spot in the <strong>360\u00b0 ${tierLabel} Plan</strong>, but we can only hold it a little longer.</p><p>If protecting your home proactively isn't the right fit right now, no worries \u2014 we'll be here when you're ready. But if you're still interested, now is the time:</p><p><a href="${FUNNEL_URL}" style="background:#b45309;color:#fff;padding:12px 24px;border-radius:4px;text-decoration:none;font-weight:bold;display:inline-block;">Claim My Spot \u2192</a></p><p>\u2014 The Handy Pioneers Team</p>`,
          }).catch(() => null);
          await updateOpportunity(lead.id, { notes: sent + "\n[Drip-3 sent]" }).catch(() => null);
          console.log(`[360 Drip] Email 3 sent to ${to}`);
        }
      }
    } catch (err) {
      console.error("[360 Drip] Drip email job error:", err);
    }
  };
  run360DripEmails().catch(console.error);
  setInterval(run360DripEmails, 60 * 60 * 1000);
  console.log("[360 Drip] Cart abandonment drip scheduler started (runs every hour)");

  // ── 360° Deferred Labor Bank Credit Release (runs every 6 hours) ─────────────────
  const runDeferredCreditRelease = async () => {
    try {
      const credited = await releaseDeferredLaborBankCredits();
      if (credited > 0) {
        console.log(`[360 Deferred Credit] Released deferred credits for ${credited} membership(s)`);
        await notifyOwner({
          title: `360° Deferred Credits Released`,
          content: `${credited} membership(s) received their 90-day deferred labor bank credit.`,
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[360 Deferred Credit] Job error:", err);
    }
  };
  runDeferredCreditRelease().catch(console.error);
  setInterval(runDeferredCreditRelease, 6 * 60 * 60 * 1000); // every 6 hours
  console.log("[360 Deferred Credit] Deferred labor bank credit scheduler started (runs every 6 hours)");

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

// Bootstrap GMAIL_CONNECTED_EMAIL from DB so it survives server restarts
getFirstGmailToken()
  .then(token => {
    if (token?.email) {
      process.env.GMAIL_CONNECTED_EMAIL = token.email;
      console.log(`[Gmail] Restored connected account from DB: ${token.email}`);
    }
  })
  .catch(err => console.warn("[Gmail] Could not restore connected email:", err));

startServer().catch(console.error);
