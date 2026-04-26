import "dotenv/config";
import express, { type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import multer from "multer";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { appRouter } from "../routers";
import { submitRoadmap } from "../lib/priorityTranslation/orchestrator";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import Stripe from "stripe";
import { handleInboundSms, handleCallStatusUpdate, generateVoiceToken, isTwilioConfigured, downloadAndStoreRecording } from "../twilio";
import twilio from "twilio";
import { exchangeGmailCode, pollInboundEmails, sendOverdueReminderEmail } from "../gmail";
import { getFirstGmailToken, listOpportunities, updateOpportunity } from "../db";
import { addSSEClient, broadcastNewMessage } from "../sse";
import { getPortalInvoiceByStripePaymentIntentId, updatePortalInvoicePaid, getPortalInvoiceByCheckoutSessionId, findPortalCustomerById, getOverdueInvoicesForReminder, markPortalInvoiceReminderSent, getSignOffsEligibleForReviewRequest, getSignOffsEligibleForReviewReminder, markReviewRequestSent, markReviewReminderSent } from "../portalDb";
import { create360MembershipFromWebhook, create360PortfolioMembershipsFromWebhook, releaseDeferredLaborBankCredits } from "../threeSixtyWebhook.ts";
import { sendEmail } from "../gmail";
import { notifyOwner } from "../_core/notification";
import { buildInboundCallTwiml, buildFallbackTwiml, getPhoneSettings } from "../phone";
import { randomUUID } from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import multer from "multer";
import { sdk } from "./sdk";
import { registerAuthRoutes, seedDefaultAdminIfNeeded } from "./auth";

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

function verifyTwilioRequest(req: express.Request, routePath: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) return true;
  const sig = req.headers["x-twilio-signature"] as string | undefined;
  const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
  const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
  const proto = forwardedProto.split(",")[0].trim();
  const host = forwardedHost.split(",")[0].trim();
  const url = `${proto}://${host}${routePath}`;
  try {
    return twilio.validateRequest(authToken, sig ?? "", url, req.body);
  } catch (err) {
    console.warn(`[Twilio] Signature validation threw for ${routePath}:`, err);
    return false;
  }
}

async function ensurePhoneTables() {
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`phoneSettings\` (
      \`id\` int NOT NULL DEFAULT 1,
      \`forwardingMode\` enum('forward_to_number','forward_to_ai','voicemail') NOT NULL DEFAULT 'forward_to_number',
      \`forwardingNumber\` varchar(20) DEFAULT '',
      \`aiServiceNumber\` varchar(20) DEFAULT '',
      \`greeting\` varchar(500) DEFAULT '',
      \`voicemailPrompt\` varchar(600) DEFAULT '',
      \`callRecording\` boolean NOT NULL DEFAULT false,
      \`transcribeVoicemail\` boolean NOT NULL DEFAULT true,
      \`afterHoursEnabled\` boolean NOT NULL DEFAULT false,
      \`businessHoursStart\` varchar(5) DEFAULT '08:00',
      \`businessHoursEnd\` varchar(5) DEFAULT '17:00',
      \`businessDays\` varchar(20) DEFAULT '1,2,3,4,5',
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`phoneSettings_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`INSERT IGNORE INTO \`phoneSettings\` (
      \`id\`, \`forwardingMode\`, \`forwardingNumber\`, \`greeting\`, \`voicemailPrompt\`,
      \`callRecording\`, \`transcribeVoicemail\`, \`afterHoursEnabled\`,
      \`businessHoursStart\`, \`businessHoursEnd\`, \`businessDays\`
    ) VALUES (
      1, 'forward_to_number', '+13602179444',
      'Thank you for calling Handy Pioneers. Please hold while we connect you.',
      'You''ve reached Handy Pioneers. We''re unable to take your call right now. Please leave a message and we''ll return it within one business day.',
      true, true, true, '08:00', '18:00', '1,2,3,4,5'
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`callLogs\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`conversationId\` int NOT NULL,
      \`messageId\` int,
      \`twilioCallSid\` varchar(64),
      \`direction\` enum('inbound','outbound') NOT NULL,
      \`status\` varchar(32) NOT NULL DEFAULT 'answered',
      \`durationSecs\` int NOT NULL DEFAULT 0,
      \`recordingUrl\` text,
      \`recordingAppUrl\` text,
      \`voicemailUrl\` text,
      \`callerPhone\` varchar(32),
      \`startedAt\` timestamp NOT NULL DEFAULT (now()),
      \`endedAt\` timestamp,
      CONSTRAINT \`callLogs_id\` PRIMARY KEY(\`id\`)
    )`);
    console.log("[boot] phoneSettings + callLogs ensured");
  } catch (err) {
    console.warn("[boot] ensurePhoneTables failed (non-fatal):", err);
  }
}

async function ensurePriorityTranslationTables() {
  // Migration 0058 created these for the Roadmap Generator lead magnet but
  // the drizzle tracker diverges from prod (see memory note: migration drift
  // is a known issue), so the tables aren't actually present in production.
  // Create them at boot if missing — same pattern as ensurePhoneTables().
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`portalAccounts\` (
      \`id\` varchar(64) NOT NULL,
      \`email\` varchar(320) NOT NULL,
      \`firstName\` varchar(128) NOT NULL DEFAULT '',
      \`lastName\` varchar(128) NOT NULL DEFAULT '',
      \`phone\` varchar(32) NOT NULL DEFAULT '',
      \`customerId\` varchar(64),
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`lastLoginAt\` timestamp NULL,
      CONSTRAINT \`portalAccounts_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`portalAccounts_email_unique\` UNIQUE(\`email\`)
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS \`portalAccounts_email_idx\` ON \`portalAccounts\` (\`email\`)`).catch(() => null);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS \`portalAccounts_customerId_idx\` ON \`portalAccounts\` (\`customerId\`)`).catch(() => null);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`portalMagicLinks\` (
      \`token\` varchar(128) NOT NULL,
      \`portalAccountId\` varchar(64) NOT NULL,
      \`expiresAt\` timestamp NOT NULL,
      \`consumedAt\` timestamp NULL,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`portalMagicLinks_token\` PRIMARY KEY(\`token\`)
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS \`portalMagicLinks_account_idx\` ON \`portalMagicLinks\` (\`portalAccountId\`)`).catch(() => null);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`portalProperties\` (
      \`id\` varchar(64) NOT NULL,
      \`portalAccountId\` varchar(64) NOT NULL,
      \`street\` varchar(255) NOT NULL DEFAULT '',
      \`unit\` varchar(64) NOT NULL DEFAULT '',
      \`city\` varchar(128) NOT NULL DEFAULT '',
      \`state\` varchar(64) NOT NULL DEFAULT '',
      \`zip\` varchar(10) NOT NULL DEFAULT '',
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`portalProperties_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS \`portalProperties_account_idx\` ON \`portalProperties\` (\`portalAccountId\`)`).catch(() => null);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`portalProperties_account_zip_street_idx\` ON \`portalProperties\`(\`portalAccountId\`, \`street\`, \`zip\`)`).catch(() => null);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`homeHealthRecords\` (
      \`id\` varchar(64) NOT NULL,
      \`propertyId\` varchar(64) NOT NULL,
      \`portalAccountId\` varchar(64) NOT NULL,
      \`findings\` json NOT NULL,
      \`summary\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`homeHealthRecords_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE UNIQUE INDEX IF NOT EXISTS \`homeHealthRecords_property_idx\` ON \`homeHealthRecords\`(\`propertyId\`)`).catch(() => null);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`priorityTranslations\` (
      \`id\` varchar(64) NOT NULL,
      \`portalAccountId\` varchar(64) NOT NULL,
      \`propertyId\` varchar(64) NOT NULL,
      \`homeHealthRecordId\` varchar(64),
      \`pdfStoragePath\` text,
      \`reportUrl\` text,
      \`notes\` text,
      \`status\` varchar(32) NOT NULL DEFAULT 'submitted',
      \`claudeResponse\` json,
      \`outputPdfPath\` text,
      \`deliveredAt\` timestamp NULL,
      \`failureReason\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`priorityTranslations_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS \`priorityTranslations_account_idx\` ON \`priorityTranslations\` (\`portalAccountId\`)`).catch(() => null);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS \`priorityTranslations_property_idx\` ON \`priorityTranslations\` (\`propertyId\`)`).catch(() => null);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS \`priorityTranslations_status_idx\` ON \`priorityTranslations\` (\`status\`)`).catch(() => null);

    console.log("[boot] priorityTranslation tables ensured");
  } catch (err) {
    console.warn("[boot] ensurePriorityTranslationTables failed (non-fatal):", err);
  }
}

async function ensurePortalContinuityFlag() {
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;
    const [[row]]: any = await db.execute(sql`
      SELECT COUNT(*) AS c FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = 'appSettings'
        AND column_name = 'portalContinuityEnabled'
    `);
    if (row && Number(row.c) === 0) {
      await db.execute(sql`
        ALTER TABLE \`appSettings\`
        ADD COLUMN \`portalContinuityEnabled\` boolean NOT NULL DEFAULT 1
      `);
      console.log("[boot] portalContinuityEnabled column added");
    }
  } catch (err) {
    console.warn("[boot] ensurePortalContinuityFlag failed (non-fatal):", err);
  }
}

async function ensureOAuthIntegrationTables() {
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;
    // Defensive boot-time creates (drizzle tracker may diverge from prod DB)
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`gbpTokens\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`accountId\` varchar(128) NOT NULL,
      \`locationId\` varchar(128),
      \`accessToken\` text NOT NULL,
      \`refreshToken\` text NOT NULL,
      \`expiresAt\` varchar(32) NOT NULL,
      \`connectedAt\` timestamp NOT NULL DEFAULT (now()),
      \`connectedByStaffId\` int,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`gbpTokens_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`metaConnections\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`adAccountId\` varchar(64) NOT NULL,
      \`pageIds\` text,
      \`tokenStatus\` varchar(32) NOT NULL DEFAULT 'active',
      \`lastVerifiedAt\` timestamp,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`metaConnections_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`googleAdsTokens\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`customerId\` varchar(64) NOT NULL,
      \`accessToken\` text NOT NULL,
      \`refreshToken\` text NOT NULL,
      \`expiresAt\` varchar(32) NOT NULL,
      \`connectedAt\` timestamp NOT NULL DEFAULT (now()),
      \`connectedByStaffId\` int,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`googleAdsTokens_id\` PRIMARY KEY(\`id\`)
    )`);
    console.log("[boot] OAuth integration tables ensured");
  } catch (err) {
    console.warn("[boot] ensureOAuthIntegrationTables failed (non-fatal):", err);
  }
}

// Idempotent upgrade: replace `portalMagicLinks.token` with hashed `tokenHash`.
// Runs on every boot. Drizzle-kit can drift from prod, so we don't rely on it.
async function ensureMagicLinkTokenHash() {
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;
    const existsRows = await db.execute(sql`
      SELECT COUNT(*) AS c
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE()
        AND TABLE_NAME = 'portalMagicLinks'
        AND COLUMN_NAME = 'tokenHash'
    `);
    const rows = (existsRows as any)[0] ?? existsRows;
    const count = Number(rows?.[0]?.c ?? rows?.c ?? 0);
    if (count > 0) return;
    console.log("[boot] Upgrading portalMagicLinks -> tokenHash column");
    await db.execute(sql`DELETE FROM \`portalMagicLinks\``);
    await db.execute(sql`ALTER TABLE \`portalMagicLinks\` DROP PRIMARY KEY`);
    await db.execute(sql`ALTER TABLE \`portalMagicLinks\` DROP COLUMN \`token\``);
    await db.execute(sql`ALTER TABLE \`portalMagicLinks\` ADD COLUMN \`tokenHash\` CHAR(64) NOT NULL`);
    await db.execute(sql`ALTER TABLE \`portalMagicLinks\` ADD PRIMARY KEY (\`tokenHash\`)`);
    console.log("[boot] portalMagicLinks upgrade complete");
  } catch (err) {
    console.warn("[boot] ensureMagicLinkTokenHash failed (non-fatal):", err);
  }
}

async function ensureSchedulingTablesBoot() {
  try {
    const { ensureSchedulingTables } = await import("../scheduling");
    await ensureSchedulingTables();
  } catch (err) {
    console.warn("[boot] ensureSchedulingTablesBoot failed (non-fatal):", err);
  }
}

async function ensureAgentPhase4Tables() {
  // Phase 4 (triggers + chat) tables. Drizzle-kit's tracker has drifted from
  // prod a few times — same boot-time idempotent guard the phone tables use.
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`ai_agent_event_subscriptions\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`agentId\` int NOT NULL,
      \`eventName\` varchar(80) NOT NULL,
      \`filter\` text,
      \`enabled\` boolean NOT NULL DEFAULT true,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \`ai_agent_event_subscriptions_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`ai_agent_schedules\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`agentId\` int NOT NULL,
      \`cronExpression\` varchar(80) NOT NULL,
      \`timezone\` varchar(64) NOT NULL DEFAULT 'America/Los_Angeles',
      \`enabled\` boolean NOT NULL DEFAULT true,
      \`lastRunAt\` timestamp NULL,
      \`nextRunAt\` timestamp NULL,
      \`payload\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \`ai_agent_schedules_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`integrator_chat_conversations\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`userId\` int NOT NULL,
      \`title\` varchar(200),
      \`lastMessageAt\` timestamp NULL,
      \`archived\` boolean NOT NULL DEFAULT false,
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      CONSTRAINT \`integrator_chat_conversations_id\` PRIMARY KEY(\`id\`)
    )`);
    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`integrator_chat_messages\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`conversationId\` int NOT NULL,
      \`userId\` int NOT NULL,
      \`role\` enum('user','assistant','tool') NOT NULL,
      \`content\` text NOT NULL,
      \`toolCalls\` text,
      \`inputTokens\` int NOT NULL DEFAULT 0,
      \`outputTokens\` int NOT NULL DEFAULT 0,
      \`costUsd\` decimal(10,4) NOT NULL DEFAULT '0.0000',
      \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT \`integrator_chat_messages_id\` PRIMARY KEY(\`id\`)
    )`);
    console.log("[boot] agent phase-4 tables ensured");
  } catch (err) {
    console.warn("[boot] ensureAgentPhase4Tables failed (non-fatal):", err);
  }
}

async function ensureVendorTablesBoot() {
  try {
    const { ensureVendorTables } = await import("../vendors");
    await ensureVendorTables();
  } catch (err) {
    console.warn("[boot] ensureVendorTablesBoot failed (non-fatal):", err);
  }
}

async function ensurePasswordResetTokensTableBoot() {
  try {
    const { ensurePasswordResetTokensTable } = await import("../passwordReset");
    await ensurePasswordResetTokensTable();
  } catch (err) {
    console.warn("[boot] ensurePasswordResetTokensTableBoot failed (non-fatal):", err);
  }
}

async function ensureCharterTables() {
  try {
    const { getDb } = await import("../db");
    const { sql } = await import("drizzle-orm");
    const db = await getDb();
    if (!db) return;

    // Add charter columns to ai_agents — each ALTER is wrapped so re-runs skip gracefully
    await db.execute(sql`ALTER TABLE \`ai_agents\` ADD COLUMN \`charterLoaded\` boolean NOT NULL DEFAULT false`).catch(() => {});
    await db.execute(sql`ALTER TABLE \`ai_agents\` ADD COLUMN \`kpiCount\` int NOT NULL DEFAULT 0`).catch(() => {});
    await db.execute(sql`ALTER TABLE \`ai_agents\` ADD COLUMN \`playbookCount\` int NOT NULL DEFAULT 0`).catch(() => {});

    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`agentCharters\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`department\` varchar(50) NOT NULL,
      \`markdownContent\` longtext NOT NULL,
      \`version\` int NOT NULL DEFAULT 1,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`updatedByStaffId\` int,
      CONSTRAINT \`agentCharters_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`agentCharters_dept_uniq\` UNIQUE(\`department\`)
    )`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`agentKpis\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`scopeType\` enum('seat','department','company') NOT NULL,
      \`scopeId\` varchar(100) NOT NULL,
      \`key\` varchar(100) NOT NULL,
      \`label\` varchar(200) NOT NULL,
      \`targetMin\` decimal(10,2),
      \`targetMax\` decimal(10,2),
      \`unit\` varchar(20) NOT NULL,
      \`period\` enum('daily','weekly','monthly','quarterly') NOT NULL,
      \`sourceQuery\` text,
      \`createdAt\` timestamp NOT NULL DEFAULT (now()),
      CONSTRAINT \`agentKpis_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`agentKpis_scope_key\` UNIQUE(\`scopeType\`, \`scopeId\`, \`key\`)
    )`);

    await db.execute(sql`CREATE TABLE IF NOT EXISTS \`agentPlaybooks\` (
      \`id\` int AUTO_INCREMENT NOT NULL,
      \`ownerSeatName\` varchar(100) NOT NULL,
      \`ownerDepartment\` varchar(50) NOT NULL,
      \`name\` varchar(200) NOT NULL,
      \`slug\` varchar(200) NOT NULL,
      \`content\` mediumtext NOT NULL,
      \`variables\` text,
      \`category\` varchar(50) NOT NULL,
      \`version\` int NOT NULL DEFAULT 1,
      \`updatedAt\` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
      \`updatedByStaffId\` int,
      CONSTRAINT \`agentPlaybooks_id\` PRIMARY KEY(\`id\`),
      CONSTRAINT \`agentPlaybooks_slug_uniq\` UNIQUE(\`slug\`)
    )`);

    console.log("[boot] ensureCharterTables OK");
  } catch (err) {
    console.warn("[boot] ensureCharterTables failed (non-fatal):", err);
  }
}

async function startServer() {
  await ensurePhoneTables();
  await ensurePortalContinuityFlag();
  await ensurePriorityTranslationTables();
  await ensureOAuthIntegrationTables();
  await ensureMagicLinkTokenHash();
  await ensureSchedulingTablesBoot();
  await ensureAgentPhase4Tables();
  await ensureVendorTablesBoot();
  await ensurePasswordResetTokensTableBoot();
  await ensureCharterTables();
  const app = express();
  const server = createServer(app);

  // ── Security headers (Helmet) ──
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'", "https://maps.googleapis.com", "https://js.stripe.com", "https://www.googletagmanager.com"],
        frameSrc: ["https://js.stripe.com", "https://hooks.stripe.com"],
        connectSrc: ["'self'", "https://api.stripe.com", "https://maps.googleapis.com", "https://www.google-analytics.com", "https://analytics.google.com", "https://region1.google-analytics.com"],
        imgSrc: ["'self'", "data:", "blob:", "https:", "http:"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
      },
    },
    crossOriginEmbedderPolicy: false,
  }));

  // ── Rate limiting ──
  const globalLimiter = rateLimit({ windowMs: 60 * 1000, max: 100, standardHeaders: true, legacyHeaders: false });
  const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 5, message: "Too many login attempts, try again later" });
  // Tight limiter for public, unauthenticated POST surfaces that write to DB/Stripe/email.
  const publicWriteLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests, please try again later" },
  });
  app.use("/api/", globalLimiter);
  app.use("/api/oauth/", authLimiter);
  app.use("/api/360/event", publicWriteLimiter);
  app.use("/api/360/checkout", publicWriteLimiter);
  app.use("/api/360/portfolio-checkout", publicWriteLimiter);

  // ── CORS: allow 360 funnel, portal, and the public marketing site ──
  // handypioneers.com / www.handypioneers.com host the Roadmap Generator form,
  // which posts the multipart PDF upload to /api/roadmap-generator/submit here.
  const allowedOrigins = [
    "https://360.handypioneers.com",
    "https://client.handypioneers.com",
    "https://handypioneers.com",
    "https://www.handypioneers.com",
    "https://staging.handypioneers.com",
    "https://staging-pro.handypioneers.com",
  ];
  if (process.env.NODE_ENV === "development") {
    allowedOrigins.push("http://localhost:3001", "http://localhost:5173");
  }
  app.use(cors({
    origin: allowedOrigins,
    credentials: true,
  }));

  // ── Stripe webhook: MUST be registered BEFORE express.json() ──
  app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), async (req, res) => {
    const sig = req.headers["stripe-signature"] as string;
    const primarySecret = process.env.STRIPE_WEBHOOK_SECRET;
    const fallbackSecret = process.env.STRIPE_WEBHOOK_SECRET_FALLBACK;
    if (!primarySecret) {
      res.status(400).json({ error: "Webhook secret not configured" });
      return;
    }
    let event!: Stripe.Event;
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: "2025-03-31.basil" });
    // Try primary secret first, then fallback (supports dual-endpoint setup)
    let verified = false;
    for (const secret of [primarySecret, fallbackSecret].filter(Boolean) as string[]) {
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, secret);
        verified = true;
        break;
      } catch {
        // try next secret
      }
    }
    if (!verified) {
      console.error("[Webhook] Signature verification failed with all configured secrets");
      res.status(400).json({ error: "Webhook signature verification failed" });
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
        let portalInvoiceId: string | null = null;
        try {
          const inv = await getPortalInvoiceByStripePaymentIntentId(pi.id);
          if (inv) {
            await updatePortalInvoicePaid(inv.id, pi.amount_received, pi.id);
            portalInvoiceId = inv.id;
            console.log(`[Webhook] Portal invoice ${inv.id} marked paid via PI ${pi.id}`);
          } else {
            console.log(`[Webhook] No portal invoice found for PI ${pi.id} — may be client-side only`);
          }
        } catch (dbErr) {
          console.error(`[Webhook] DB update failed for PI ${pi.id}:`, dbErr);
        }
        // Phase 4 agent trigger: payment.received fans out to Cash Flow,
        // Bookkeeping, Onboarding (membership initial), and any future listeners.
        try {
          const { emitAgentEvent } = await import("../lib/agentRuntime/triggerBus");
          emitAgentEvent("payment.received", {
            paymentIntentId: pi.id,
            amountCents: pi.amount_received ?? pi.amount,
            currency: pi.currency,
            invoiceId: portalInvoiceId,
            invoiceNumber: pi.metadata?.invoiceNumber ?? null,
            customerName: pi.metadata?.customerName ?? null,
            source: "stripe",
          }).catch(() => null);
        } catch (emitErr) {
          console.warn("[Webhook] payment.received emit failed:", emitErr);
        }
        break;
      }
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        console.log(`[Webhook] Checkout session completed: ${session.id}`);
        // ── 360 Method subscription enrollment ──────────────────────────────
        if (session.mode === "subscription" && (session.metadata?.planType === "portfolio" || session.metadata?.tier)) {
          const customerEmail = session.metadata?.customerEmail ?? session.customer_email ?? null;
          // Cancel cart abandonment drip: archive the Cart Abandoned lead for this email
          if (customerEmail) {
            try {
              const { listOpportunities: listOps, updateOpportunity: updateOpp } = await import("../db");
              const leads = await listOps("lead", undefined, false, 500);
              const abandoned = leads.filter((o: any) => o.stage === "Cart Abandoned" && (o.notes ?? "").includes(`<${customerEmail.toLowerCase()}>`) );
              for (const lead of abandoned) {
                await updateOpp(lead.id, { archived: true, notes: (lead.notes ?? "") + "\n[Drip cancelled — checkout completed]" }).catch(() => null);
              }
              if (abandoned.length > 0) console.log(`[Webhook] Cancelled ${abandoned.length} cart abandonment lead(s) for ${customerEmail}`);
            } catch (dripErr) {
              console.error("[Webhook] Drip cancellation error:", dripErr);
            }
          }
          if (session.metadata?.planType === "portfolio") {
            try {
              await create360PortfolioMembershipsFromWebhook(session);
              console.log(`[Webhook] 360 portfolio membership created for session ${session.id}`);
            } catch (errPortfolio) {
              console.error(`[Webhook] 360 portfolio membership creation failed:`, errPortfolio);
            }
          } else {
            try {
              await create360MembershipFromWebhook(session);
              console.log(`[Webhook] 360 membership created for session ${session.id}`);
            } catch (err360) {
              console.error(`[Webhook] 360 membership creation failed:`, err360);
            }
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
      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }
    res.json({ received: true });
  });

  // ── Twilio SMS inbound webhook ──────────────────────────────────────────────
  // POST /api/twilio/sms — Twilio calls this when an SMS arrives
  app.post("/api/twilio/sms", express.urlencoded({ extended: false }), async (req, res) => {
    try {
      if (!verifyTwilioRequest(req, "/api/twilio/sms")) {
        console.warn("[Twilio SMS] Signature validation failed");
        res.status(403).send("Forbidden");
        return;
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
      if (!verifyTwilioRequest(req, "/api/twilio/voice/status")) {
        console.warn("[Twilio Voice status] Signature validation failed");
        res.status(403).send("Forbidden");
        return;
      }
      await handleCallStatusUpdate(req.body);
      res.sendStatus(204);
    } catch (err) {
      console.error("[Twilio Voice status]", err);
      res.status(500).send("Error");
    }
  });

  // ── Twilio Voice TwiML — outbound call instructions ──────────────────────────
  // POST /api/twilio/voice/connect — returns TwiML to connect a browser call
  // SECURITY: signature check is CRITICAL here — this route lets Twilio dial
  // an arbitrary number. Without verification, an attacker can spoof-POST to
  // initiate calls to premium-rate destinations on our account.
  app.post("/api/twilio/voice/connect", express.urlencoded({ extended: false }), (req, res) => {
    if (!verifyTwilioRequest(req, "/api/twilio/voice/connect")) {
      console.warn("[Twilio Voice connect] Signature validation failed — blocking call dial-out");
      res.status(403).send("Forbidden");
      return;
    }
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

  // ── Twilio Voice — inbound call routing ──────────────────────────────────────
  // POST /api/twilio/voice/inbound — Twilio calls this for every inbound call
  app.post("/api/twilio/voice/inbound", express.urlencoded({ extended: false }), async (req, res) => {
    try {
      if (!verifyTwilioRequest(req, "/api/twilio/voice/inbound")) {
        console.warn("[Twilio Voice inbound] Signature validation failed");
        res.status(403).send("Forbidden");
        return;
      }
      const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
      const proto = forwardedProto.split(",")[0].trim();
      const host = forwardedHost.split(",")[0].trim();
      const callbackBaseUrl = `${proto}://${host}`;
      const twimlXml = await buildInboundCallTwiml(callbackBaseUrl);
      res.set("Content-Type", "text/xml");
      res.send(twimlXml);
    } catch (err) {
      console.error("[Twilio Voice inbound]", err);
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twiml2 = new VoiceResponse();
      twiml2.say("We're sorry, we're unable to take your call right now. Please try again later.");
      res.set("Content-Type", "text/xml");
      res.send(twiml2.toString());
    }
  });

  // ── Twilio Voice — stage-2 fallback (cell didn't answer) ─────────────────
  app.post("/api/twilio/voice/fallback", express.urlencoded({ extended: false }), async (req, res) => {
    try {
      if (!verifyTwilioRequest(req, "/api/twilio/voice/fallback")) {
        console.warn("[Twilio Voice fallback] Signature validation failed");
        res.status(403).send("Forbidden");
        return;
      }
      const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
      const proto = forwardedProto.split(",")[0].trim();
      const host = forwardedHost.split(",")[0].trim();
      const callbackBaseUrl = `${proto}://${host}`;
      const dialCallStatus = req.body.DialCallStatus as string | undefined;
      console.log(`[Voice Fallback] DialCallStatus=${dialCallStatus}`);
      if (dialCallStatus === "completed") {
        res.set("Content-Type", "text/xml");
        res.send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response></Response>");
        return;
      }
      const settings = await getPhoneSettings();
      const twimlXml = buildFallbackTwiml(settings, callbackBaseUrl, false);
      res.set("Content-Type", "text/xml");
      res.send(twimlXml);
    } catch (err) {
      console.error("[Voice Fallback] Error — using env-only voicemail fallback:", err);
      const forwardedProto = (req.headers["x-forwarded-proto"] as string) || req.protocol;
      const forwardedHost = (req.headers["x-forwarded-host"] as string) || req.get("host") || "localhost";
      const proto = forwardedProto.split(",")[0].trim();
      const host = forwardedHost.split(",")[0].trim();
      const callbackBaseUrl = `${proto}://${host}`;
      const VoiceResponse = twilio.twiml.VoiceResponse;
      const twiml2 = new VoiceResponse();
      twiml2.say(
        { voice: "Polly.Joanna" },
        "You've reached Handy Pioneers. We're unable to take your call right now. Please leave a message and we'll return it within one business day.",
      );
      twiml2.record({
        maxLength: 120,
        transcribe: true,
        transcribeCallback: `${callbackBaseUrl}/api/twilio/voice/voicemail`,
        action: `${callbackBaseUrl}/api/twilio/voice/voicemail`,
        playBeep: true,
      });
      twiml2.say({ voice: "Polly.Joanna" }, "Thank you. Goodbye.");
      res.set("Content-Type", "text/xml");
      res.send(twiml2.toString());
    }
  });

  // ── Twilio Voice — voicemail recording callback ────────────────────────────
  app.post("/api/twilio/voice/voicemail", express.urlencoded({ extended: false }), async (req, res) => {
    try {
      if (!verifyTwilioRequest(req, "/api/twilio/voice/voicemail")) {
        console.warn("[Twilio Voice voicemail] Signature validation failed");
        res.status(403).send("Forbidden");
        return;
      }
      const { CallSid, From, To, RecordingUrl, TranscriptionText, RecordingDuration } = req.body;
      const callerNumber = From || "Unknown";
      const durationSecs = RecordingDuration ? parseInt(RecordingDuration, 10) : 0;
      const duration = durationSecs ? `${durationSecs}s` : "unknown duration";
      const transcription = TranscriptionText ? `\n\nTranscription: ${TranscriptionText}` : "";

      if (CallSid) {
        await handleCallStatusUpdate({
          CallSid,
          From: From || "",
          To: To || "",
          CallStatus: "completed",
          CallDuration: RecordingDuration || "0",
          Direction: "inbound",
          RecordingUrl: RecordingUrl || undefined,
        }).catch(dbErr => console.warn("[Voicemail DB persist] Failed:", dbErr));
        if (RecordingUrl) {
          downloadAndStoreRecording(RecordingUrl, CallSid)
            .then(async appUrl => {
              if (!appUrl) return;
              const { getCallLogByTwilioSid, updateCallLog } = await import("../db");
              const log = await getCallLogByTwilioSid(CallSid).catch(() => null);
              if (log?.id) await updateCallLog(log.id, { recordingUrl: appUrl }).catch(console.warn);
            })
            .catch(console.warn);
        }
        // Voicemail always signals a fresh lead for the Nurturer — regardless of
        // whether Twilio reports the call as "answered" (the voicemail recording
        // is what was answered, not a live conversation).
        try {
          const { findOrCreateCustomerFromCall } = await import("../db");
          const { createNotification, findDefaultUserForRole } = await import("../leadRouting");
          const { customer } = await findOrCreateCustomerFromCall(From || callerNumber).catch(() => ({ customer: null }));
          const userId = await findDefaultUserForRole('nurturer');
          await createNotification({
            userId,
            role: 'nurturer',
            eventType: 'voicemail',
            title: `New voicemail from ${customer?.displayName ?? callerNumber}`,
            body: `${duration} voicemail${TranscriptionText ? `: "${TranscriptionText.slice(0, 140)}"` : '.'} Call back today.`,
            linkUrl: `/?section=inbox`,
            customerId: customer?.id,
            priority: 'high',
          });
          // Phase 4 trigger: voicemail.received fans out to Lead Nurturer AI.
          const { emitAgentEvent } = await import("../lib/agentRuntime/triggerBus");
          emitAgentEvent("voicemail.received", {
            customerId: customer?.id ?? null,
            customerName: customer?.displayName ?? callerNumber,
            callerNumber,
            durationSecs,
            transcription: TranscriptionText ?? "",
            recordingUrl: RecordingUrl ?? null,
          }).catch(() => null);
        } catch (notifyErr) {
          console.warn("[Voicemail nurturer notify] Failed:", notifyErr);
        }
      }

      await notifyOwner({
        title: `New Voicemail from ${callerNumber}`,
        content: `Voicemail received from ${callerNumber} (${duration}).${transcription}${RecordingUrl ? `\n\nRecording: ${RecordingUrl}` : ""}`,
      });
      if (process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_ACCOUNT_SID && process.env.OWNER_PHONE && process.env.TWILIO_PHONE_NUMBER) {
        try {
          const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
          await twilioClient.messages.create({
            to: process.env.OWNER_PHONE,
            from: process.env.TWILIO_PHONE_NUMBER,
            body: `New voicemail from ${callerNumber} (${duration}).${TranscriptionText ? ` "${TranscriptionText.slice(0, 100)}"` : ""}`,
          });
        } catch (smsErr) {
          console.warn("[Voicemail SMS notify] Failed:", smsErr);
        }
      }
      res.sendStatus(204);
    } catch (err) {
      console.error("[Twilio Voice voicemail]", err);
      res.sendStatus(204);
    }
  });

  // ── Twilio Recording Proxy ─────────────────────────────────────────────────
  app.get("/api/twilio/recording/:sid", async (req, res) => {
    try {
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      if (!accountSid || !authToken) {
        res.status(503).json({ error: "Twilio not configured" });
        return;
      }
      const recordingSid = req.params.sid;
      if (!/^RE[0-9a-f]{32}$/i.test(recordingSid)) {
        res.status(400).json({ error: "Invalid recording SID" });
        return;
      }
      const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Recordings/${recordingSid}.mp3`;
      const upstream = await fetch(twilioUrl, {
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        },
      });
      if (!upstream.ok) {
        res.status(upstream.status).json({ error: "Recording not found" });
        return;
      }
      res.set("Content-Type", "audio/mpeg");
      res.set("Cache-Control", "private, max-age=3600");
      if (upstream.body) {
        const { Readable } = await import("stream");
        Readable.fromWeb(upstream.body as any).pipe(res);
      } else {
        const buf = Buffer.from(await upstream.arrayBuffer());
        res.send(buf);
      }
    } catch (err) {
      console.error("[Recording Proxy]", err);
      res.status(500).json({ error: "Proxy error" });
    }
  });

  // ── SSE endpoint for real-time inbox updates (auth-gated) ────────────────────
  app.get("/api/inbox/events", async (req, res) => {
    try {
      await sdk.authenticateRequest(req);
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    const clientId = randomUUID();
    addSSEClient(clientId, res);
  });

  // ── Gmail diagnostic endpoint (admin only) ─────────────────────────────────────
  app.get("/api/gmail/debug", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (user.role !== "admin") {
        res.status(403).json({ error: "Admin access required" });
        return;
      }
    } catch {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
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

  // ── QBO OAuth callback ────────────────────────────────────────────────────────
  // Registered in Intuit: /api/quickbooks/callback
  // Legacy alias also kept for any bookmarked URLs
  const qboCallbackHandler = async (req: express.Request, res: express.Response) => {
    const code = req.query.code as string | undefined;
    const rawState = req.query.state as string | undefined;
    const realmId = req.query.realmId as string | undefined;
    if (!code || !realmId) { res.status(400).send("Missing code or realmId"); return; }

    let userId: number | undefined;
    let redirectUri = process.env.QUICKBOOKS_REDIRECT_URI || `${req.protocol}://${req.hostname}/api/quickbooks/callback`;
    let returnTo = "/settings/integrations";
    try {
      if (rawState) {
        const parsed = JSON.parse(Buffer.from(rawState, "base64").toString());
        userId = parsed.userId;
        if (parsed.redirectUri) redirectUri = parsed.redirectUri;
        if (parsed.returnTo) returnTo = parsed.returnTo;
      }
    } catch { /* malformed state — proceed without userId */ }

    if (!userId) { res.redirect(`${returnTo}?qb=error&reason=invalid_state`); return; }

    const clientId = process.env.QUICKBOOKS_CLIENT_ID;
    const clientSecret = process.env.QUICKBOOKS_CLIENT_SECRET;
    if (!clientId || !clientSecret) { res.redirect(`${returnTo}?qb=error&reason=not_configured`); return; }

    try {
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
      });
      const tokenResp = await fetch("https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        },
        body: params.toString(),
      });
      if (!tokenResp.ok) {
        const errText = await tokenResp.text();
        console.error("[QBO callback] token exchange failed:", errText);
        res.redirect(`${returnTo}?qb=error&reason=${encodeURIComponent(errText.slice(0, 100))}`);
        return;
      }
      const tokenData = await tokenResp.json() as { access_token: string; refresh_token: string; expires_in?: number };
      const expiresAt = new Date(Date.now() + (tokenData.expires_in ?? 3600) * 1000).toISOString();

      const { getDb } = await import("../db.js");
      const { qbTokens } = await import("../../drizzle/schema.js");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (db) {
        const existing = await db.select({ id: qbTokens.id }).from(qbTokens).where(eq(qbTokens.userId, userId)).limit(1);
        if (existing[0]) {
          await db.update(qbTokens).set({ accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, realmId, expiresAt }).where(eq(qbTokens.userId, userId));
        } else {
          await db.insert(qbTokens).values({ userId, accessToken: tokenData.access_token, refreshToken: tokenData.refresh_token, realmId, expiresAt });
        }
      }
      console.log(`[QBO] Connected for userId ${userId}, realmId ${realmId}`);
      res.redirect(`${returnTo}?qb=connected`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[QBO callback] error:", msg);
      res.redirect(`${returnTo}?qb=error&reason=${encodeURIComponent(msg.slice(0, 100))}`);
    }
  };
  app.get("/api/quickbooks/callback", qboCallbackHandler);
  app.get("/api/integrations/qbo/callback", qboCallbackHandler);

  // ── GBP OAuth routes ─────────────────────────────────────────────────────────
  const { gbpRouter: gbpOAuthRouter } = await import("../integrations/gbp/routes.js");
  app.use("/api/integrations/gbp", gbpOAuthRouter);

  // ── Meta integration routes ───────────────────────────────────────────────────
  const { metaRouter: metaExpressRouter } = await import("../integrations/meta/routes.js");
  app.use("/api/integrations/meta", metaExpressRouter);

  // ── Google Ads OAuth routes ───────────────────────────────────────────────────
  const { googleAdsRouter: googleAdsOAuthRouter } = await import("../integrations/google-ads/routes.js");
  app.use("/api/integrations/google-ads", googleAdsOAuthRouter);

  // ── Integration health endpoint ───────────────────────────────────────────────
  app.get("/api/health", async (_req, res) => {
    try {
      const { getGbpTokens } = await import("../integrations/gbp/oauth.js");
      const { getGoogleAdsTokens } = await import("../integrations/google-ads/oauth.js");
      const [gbpTokenRow, gadsTokenRow] = await Promise.all([
        getGbpTokens().catch(() => null),
        getGoogleAdsTokens().catch(() => null),
      ]);
      const e = process.env;
      res.json({
        ok: true,
        integrations: {
          gbp: {
            configured: !!(e.GBP_CLIENT_ID && e.GBP_CLIENT_SECRET),
            connected: !!gbpTokenRow,
          },
          meta: {
            configured: !!(e.META_SYSTEM_USER_TOKEN && e.META_AD_ACCOUNT_ID),
            connected: !!(e.META_SYSTEM_USER_TOKEN && e.META_AD_ACCOUNT_ID),
          },
          googleAds: {
            configured: !!(e.GOOGLE_ADS_CLIENT_ID && e.GOOGLE_ADS_DEVELOPER_TOKEN),
            connected: !!gadsTokenRow,
          },
          quickbooks: {
            configured: !!(e.QUICKBOOKS_CLIENT_ID && e.QUICKBOOKS_CLIENT_SECRET),
            connected: false,
          },
        },
      });
    } catch {
      res.json({ ok: true });
    }
  });

  // ── Google Maps JS SDK redirect ──────────────────────────────────────────────
  // Redirects to the Google Maps JS API directly with our API key.
  app.get("/api/maps/sdk", (req, res) => {
    const apiKey = process.env.GOOGLE_MAPS_API_KEY || "";
    const libraries = (req.query.libraries as string) || "places,geocoding,geometry";
    const v = (req.query.v as string) || "weekly";
    const sdkUrl = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&v=${v}&libraries=${libraries}`;
    res.redirect(302, sdkUrl);
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
      const esc = (v: unknown): string => String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

      // Build HTML matching the portal estimate detail layout
      const isLegacy = phases.length > 0 && !phases[0].items;
      let lineItemsHtml = "";
      if (isLegacy) {
        lineItemsHtml = `<table class="items-table"><thead><tr><th>Services</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>`;
        for (const row of phases) {
          lineItemsHtml += `<tr><td>${esc(row.description)}</td><td>—</td><td>—</td><td>${fmtMoney(est.totalAmount ?? 0)}</td></tr>`;
        }
        lineItemsHtml += `</tbody></table>`;
      } else {
        for (const phase of phases) {
          lineItemsHtml += `<div class="phase-block">`;
          lineItemsHtml += `<div class="phase-header"><strong>${esc(phase.phaseName)}</strong>`;
          if (phase.phaseDescription) lineItemsHtml += `<p class="phase-desc">${esc(phase.phaseDescription)}</p>`;
          lineItemsHtml += `</div>`;
          lineItemsHtml += `<table class="items-table"><thead><tr><th>Services</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead><tbody>`;
          for (const item of (phase.items || [])) {
            lineItemsHtml += `<tr><td><strong>${esc(item.name)}</strong>`;
            if (item.scopeOfWork) lineItemsHtml += `<br/><span class="sow">SCOPE OF WORK<br/>— ${esc(item.scopeOfWork)}</span>`;
            lineItemsHtml += `</td><td>${esc(item.qty ?? "—")}</td><td>${item.unitPrice != null ? fmtMoney(Math.round(item.unitPrice * 100)) : "—"}</td><td>${item.amount != null ? fmtMoney(Math.round(item.amount * 100)) : "—"}</td></tr>`;
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
            <div style="font-weight:700;font-size:16px">${esc(est.estimateNumber)}</div>
          </div>
        </div>
        <div class="gold-bar"></div>
        <div class="body">
          <table class="meta-table"><tr>
            <td><span class="section-label">For</span><br/><strong>${esc(portalCustomer.name)}</strong></td>
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

      // Return HTML directly as a printable page (client uses browser print-to-PDF)
      res.set("Content-Type", "text/html; charset=utf-8");
      res.set("Content-Disposition", `inline; filename="Estimate-${est.estimateNumber}.html"`);
      res.send(html);
    } catch (err) {
      console.error("[Portal PDF]", err);
      res.status(500).json({ error: "PDF generation failed" });
    }
  });

  // Body parsers. File uploads route through uploadsRouter which caps at 16 MB
  // after base64 decode; JSON wire payload only ~33% larger, so 25 MB is
  // ample headroom without handing 50 MB of free buffer to every caller.
  app.use(express.json({ limit: "25mb" }));
  app.use(express.urlencoded({ limit: "2mb", extended: true }));

  // ── Staff admin auth: /api/auth/login, /api/auth/logout, /api/auth/me ─────
  app.use("/api/auth/login", authLimiter);
  registerAuthRoutes(app);
  seedDefaultAdminIfNeeded().catch(err => console.error("[Auth] seed failed:", err));
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
  const runOverdueReminders = async () => {
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
  };
  const scheduleOverdueReminders = () => {
    const now = new Date();
    const next9am = new Date(now);
    next9am.setHours(9, 0, 0, 0);
    if (next9am <= now) next9am.setDate(next9am.getDate() + 1);
    const msUntil9am = next9am.getTime() - now.getTime();
    setTimeout(() => {
      runOverdueReminders().catch(console.error);
      setInterval(() => runOverdueReminders().catch(console.error), 24 * 60 * 60 * 1000);
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
        const tier      = tierMatch  ? tierMatch[1] : "Bronze";
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

  // ── Auto-archive Lost leads after 90 days (runs daily at 3 AM) ─────────────
  const LOST_ARCHIVE_DAYS = 90;
  const runLostLeadAutoArchive = async () => {
    try {
      const leads = await listOpportunities("lead", undefined, false, 2000);
      const cutoff = Date.now() - LOST_ARCHIVE_DAYS * 24 * 60 * 60 * 1000;
      let archived = 0;
      for (const lead of leads) {
        if (lead.stage !== "Lost") continue;
        const updatedTs = new Date((lead as any).updatedAt ?? (lead as any).createdAt ?? 0).getTime();
        if (updatedTs && updatedTs < cutoff) {
          await updateOpportunity(lead.id, {
            archived: true,
            archivedAt: new Date().toISOString(),
          }).catch(() => null);
          archived++;
        }
      }
      if (archived > 0) {
        console.log(`[AutoArchive] Auto-archived ${archived} Lost lead(s) (>= ${LOST_ARCHIVE_DAYS}d stale)`);
      }
    } catch (err) {
      console.error("[AutoArchive] Lost-lead job error:", err);
    }
  };
  const scheduleLostLeadAutoArchive = () => {
    const now = new Date();
    const next3am = new Date(now);
    next3am.setHours(3, 0, 0, 0);
    if (next3am <= now) next3am.setDate(next3am.getDate() + 1);
    const msUntil3am = next3am.getTime() - now.getTime();
    setTimeout(() => {
      runLostLeadAutoArchive().catch(console.error);
      setInterval(() => runLostLeadAutoArchive().catch(console.error), 24 * 60 * 60 * 1000);
    }, msUntil3am);
    console.log(`[AutoArchive] Next Lost-lead sweep scheduled in ${Math.round(msUntil3am / 60000)} minutes`);
  };
  scheduleLostLeadAutoArchive();

  // ── 360° Funnel REST endpoints (called from https://360.handypioneers.com) ──

  // POST /api/360/checkout — creates a Stripe Checkout session for 360 enrollment
  app.post("/api/360/checkout", express.json(), async (req, res) => {
    try {
      const caller = appRouter.createCaller({ req, res, user: null } as any);
      const result = await caller.threeSixty.checkout.createSession(req.body);
      res.json(result);
    } catch (err: any) {
      console.error("[360 REST] /api/360/checkout error:", err?.message ?? err);
      res.status(err?.code === "BAD_REQUEST" ? 400 : 500).json({
        error: err?.message ?? "Failed to create checkout session",
      });
    }
  });

  // POST /api/360/portfolio-checkout — creates a Stripe Checkout session for portfolio enrollment
  app.post("/api/360/portfolio-checkout", express.json(), async (req, res) => {
    try {
      const caller = appRouter.createCaller({ req, res, user: null } as any);
      const result = await caller.threeSixty.portfolioCheckout.createSession(req.body);
      res.json(result);
    } catch (err: any) {
      console.error("[360 REST] /api/360/portfolio-checkout error:", err?.message ?? err);
      res.status(err?.code === "BAD_REQUEST" ? 400 : 500).json({
        error: err?.message ?? "Failed to create checkout session",
      });
    }
  });

  // POST /api/360/event — analytics event tracking + cart abandonment capture from funnel
  app.post("/api/360/event", express.json(), async (req, res) => {
    const { event, type, data } = req.body ?? {};
    if (!event || !type || !data) {
      res.status(400).json({ ok: false, error: "Missing event, type, or data" });
      return;
    }
    // Async handlers — fire and forget so frontend gets instant 200
    setImmediate(async () => {
      if (event === "checkout_started") {
        try {
          const { findCustomerByEmail, createCustomer, createOpportunity } = await import("../db");
          const { nanoid } = await import("nanoid");
          const { customerName, customerEmail, customerPhone, tier, cadence, serviceAddress, serviceCity, serviceState, serviceZip, properties } = data;
          if (!customerEmail) return;
          let customer = await findCustomerByEmail(customerEmail);
          if (!customer) {
            const nameParts = (customerName ?? "").trim().split(" ");
            customer = await createCustomer({
              id: nanoid(),
              firstName: nameParts[0] ?? "",
              lastName: nameParts.slice(1).join(" ") || "",
              displayName: (customerName ?? "").trim(),
              email: customerEmail.toLowerCase().trim(),
              mobilePhone: customerPhone || "",
              street: serviceAddress || "",
              city: serviceCity || "",
              state: serviceState || "",
              zip: serviceZip || "",
              customerType: "homeowner",
              leadSource: type === "portfolio" ? "360 Portfolio Funnel" : "360 Funnel",
              customerNotes: type === "portfolio"
                ? `Initiated 360\u00b0 Portfolio checkout (${cadence}). Did not complete payment. Portfolio: ${(properties ?? []).length} properties.`
                : `Initiated 360\u00b0 checkout (${tier} ${cadence}). Did not complete payment.`,
              sendNotifications: true,
              tags: "[]",
            });
          }
          const propCount = (properties ?? []).length;
          const title = type === "portfolio"
            ? `360\u00b0 Portfolio Plan (${cadence}) \u2014 ${propCount} propert${propCount === 1 ? "y" : "ies"} \u2014 Abandoned`
            : `360\u00b0 ${(tier ?? "").charAt(0).toUpperCase() + (tier ?? "").slice(1)} Plan (${cadence}) \u2014 Abandoned`;
          await createOpportunity({
            id: nanoid(),
            customerId: customer.id,
            area: "lead",
            stage: "Cart Abandoned",
            title,
            notes: [
              type === "portfolio" ? `Cadence: ${cadence} | Properties: ${propCount}` : `Tier: ${tier} | Cadence: ${cadence}`,
              `Contact: ${customerName} <${customerEmail}>${customerPhone ? ` | ${customerPhone}` : ""}`,
              `Source: 360\u00b0 Funnel \u2014 cart abandonment capture`,
            ].join("\n"),
            archived: false,
          });
          console.log(`[360 Gateway] checkout_started captured for ${customerEmail}`);
        } catch (err) {
          console.error("[360 Gateway] checkout_started handler error:", err);
        }
      }
    });
    res.json({ ok: true });
  });

  // ── Roadmap Generator / Priority Translation: multipart PDF intake ──
  // Inspection report PDFs can legitimately run 50-80 MB (Spectora exports
  // with embedded photos). Limit is 100 MB to keep a buffer without letting
  // arbitrary huge payloads through. Returns 202 immediately; Claude + PDF
  // render + Resend email run in the background via submitRoadmap() so the
  // homeowner's browser doesn't hang for 30–60s. Processing failures land in
  // priorityTranslations.failureReason and trigger an internal email to help@.
  // Alias /api/priority-translation/submit kept so legacy email links work.
  const ROADMAP_UPLOAD_MAX_BYTES = 100 * 1024 * 1024;
  const roadmapUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: ROADMAP_UPLOAD_MAX_BYTES, files: 1 },
    fileFilter: (_req, file, cb) => {
      const isPdf = file.mimetype === "application/pdf" || /\.pdf$/i.test(file.originalname);
      if (!isPdf) return cb(new Error("Only PDF uploads are accepted"));
      cb(null, true);
    },
  });

  async function handleRoadmapSubmit(req: express.Request, res: express.Response) {
    try {
      const fields = (req.body ?? {}) as Record<string, string>;
      const file = (req as any).file as Express.Multer.File | undefined;

      const required = ["firstName", "lastName", "email", "phone", "propertyAddress"] as const;
      for (const k of required) {
        if (!fields[k] || fields[k].trim().length === 0) {
          res.status(400).json({ error: `Missing required field: ${k}` });
          return;
        }
      }
      if (!file && !fields.reportUrl) {
        res.status(400).json({ error: "Provide a PDF upload or reportUrl" });
        return;
      }

      const result = await submitRoadmap({
        firstName: fields.firstName,
        lastName: fields.lastName,
        email: fields.email,
        phone: fields.phone,
        propertyAddress: fields.propertyAddress,
        notes: fields.notes,
        pdfBuffer: file?.buffer,
        pdfOriginalName: file?.originalname,
        reportUrl: fields.reportUrl,
      });

      // Phase 4 agent trigger: a Roadmap Generator submission is a hot inbound
      // lead. Fans out to whichever agent subscribes (default: Lead Nurturer).
      try {
        const { emitAgentEvent } = await import("../lib/agentRuntime/triggerBus");
        emitAgentEvent("roadmap_generator.submitted", {
          firstName: fields.firstName,
          lastName: fields.lastName,
          email: fields.email,
          phone: fields.phone,
          propertyAddress: fields.propertyAddress,
          notes: fields.notes,
          source: fields.source || "roadmap_generator",
          submissionId: result.id,
        }).catch(() => null);
      } catch (emitErr) {
        console.warn("[Roadmap Generator] event emit failed:", emitErr);
      }

      res.status(202).json({
        ok: true,
        id: result.id,
        status: result.status,
        message: "Submission received. Your 360° Priority Roadmap will arrive by email within a few minutes.",
      });
    } catch (err: any) {
      if (err?.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "File too large — max 100MB" });
        return;
      }
      console.error("[Roadmap Generator] submit error:", err?.message ?? err);
      const status = err?.code === "BAD_REQUEST" ? 400 : err?.code === "FORBIDDEN" ? 403 : 500;
      res.status(status).json({ error: err?.message ?? "Submit failed" });
    }
  }

  app.post("/api/roadmap-generator/submit", roadmapUpload.single("report_pdf"), handleRoadmapSubmit);
  // Alias for the earlier endpoint name used by the marketing frontend.
  app.post("/api/priority-translation/submit", roadmapUpload.single("report_pdf"), handleRoadmapSubmit);

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

  // ── AI agent runtime (Phase 1) ──
  // Scheduler polls for queued tasks assigned to autonomous agents.
  // KPI cron aggregates seat → department daily and department → company weekly.
  // Hierarchy audit logs any Integrator/Head/sub-agent parentage violations.
  try {
    const { startScheduler } = await import("../lib/agentRuntime/scheduler");
    const { startKpiCron } = await import("../lib/agentRuntime/kpiRollup");
    const { auditRoster } = await import("../lib/agentRuntime/hierarchy");
    const { getDb } = await import("../db");
    const { aiAgents } = await import("../../drizzle/schema");
    // Phase 2: register all 15 tool wrappers. Import for side-effects.
    await import("../lib/agentRuntime/phase2Tools");
    startScheduler();
    startKpiCron();
    const db = await getDb();
    if (db) {
      const roster = await db.select().from(aiAgents);
      const violations = auditRoster(roster);
      if (violations.length > 0) {
        console.warn(
          `[boot] ai_agents hierarchy audit: ${violations.length} violation(s):`,
          violations.map((v) => `#${v.agentId}: ${v.v.code} — ${v.v.message}`)
        );
      }
    }
    console.log("[boot] agent runtime scheduler + KPI cron started");
  } catch (err) {
    console.warn("[boot] agent runtime failed to start (non-fatal):", err);
  }
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
