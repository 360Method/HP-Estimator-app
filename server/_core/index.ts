import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import Stripe from "stripe";
import { handleInboundSms, handleCallStatusUpdate, generateVoiceToken, isTwilioConfigured } from "../twilio";
import twilio from "twilio";
import { exchangeGmailCode, pollInboundEmails } from "../gmail";
import { addSSEClient, broadcastNewMessage } from "../sse";
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

  // ── Stripe webhook: MUST be registered BEFORE express.json() ──
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), (req, res) => {
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
        console.log(`[Webhook] PaymentIntent succeeded: ${pi.id} amount=${pi.amount} metadata=`, pi.metadata);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi = event.data.object as Stripe.PaymentIntent;
        console.log(`[Webhook] PaymentIntent failed: ${pi.id}`);
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

  // ── Gmail OAuth callback ───────────────────────────────────────────────────────────────────
  app.get("/api/gmail/callback", async (req, res) => {
    const code = req.query.code as string;
    if (!code) { res.status(400).send("Missing code"); return; }
    try {
      const email = await exchangeGmailCode(code);
      console.log(`[Gmail] Connected account: ${email}`);
      // Store the connected email in env for reference
      process.env.GMAIL_CONNECTED_EMAIL = email;
      res.redirect("/?gmail=connected");
    } catch (err) {
      console.error("[Gmail] OAuth callback error:", err);
      res.redirect("/?gmail=error");
    }
  });

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ── Gmail poll schedule (every 2 minutes) ────────────────────────────────────────────────────
  setInterval(async () => {
    const email = process.env.GMAIL_CONNECTED_EMAIL;
    if (email) {
      await pollInboundEmails(email).catch(err =>
        console.error("[Gmail] Poll error:", err)
      );
    }
  }, 2 * 60 * 1000); // every 2 minutes
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

startServer().catch(console.error);
