/**
 * server/passwordReset.ts
 *
 * Self-serve password reset for staff accounts. Flow:
 *   1. requestPasswordReset(email) — generate raw token, store bcrypt hash,
 *      email a /reset-password?token=<raw> link via Resend. Always returns
 *      success regardless of whether the email exists, so callers can't
 *      enumerate accounts.
 *   2. consumePasswordReset(rawToken, newPassword) — find an unexpired,
 *      unused token whose hash matches the raw token, update the staff
 *      user's password, mark the token used. Single-use.
 *
 * Boot-time ensurePasswordResetTokensTable creates the table if drizzle-kit
 * migrate hasn't run yet (matches the pattern used for vendors/scheduling/
 * phone tables).
 */

import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "./db";
import { passwordResetTokens, staffUsers } from "../drizzle/schema";

const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
const TOKEN_BYTES = 32; // 256 bits → 64-char hex

export async function ensurePasswordResetTokensTable(): Promise<void> {
  const db = await getDb();
  if (!db) return;
  try {
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS \`password_reset_tokens\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`staffUserId\` int NOT NULL,
        \`tokenHash\` varchar(255) NOT NULL,
        \`expiresAt\` timestamp NOT NULL,
        \`usedAt\` timestamp NULL,
        \`requestIp\` varchar(64),
        \`createdAt\` timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
        PRIMARY KEY (\`id\`),
        INDEX \`prt_staff_user_idx\` (\`staffUserId\`),
        INDEX \`prt_expires_idx\` (\`expiresAt\`)
      )
    `);
  } catch (err) {
    console.warn("[passwordReset] ensurePasswordResetTokensTable failed", err);
  }
}

function generateRawToken(): string {
  return randomBytes(TOKEN_BYTES).toString("hex");
}

function buildResetUrl(rawToken: string): string {
  const base =
    process.env.APP_URL?.replace(/\/$/, "") ||
    process.env.PORTAL_BASE_URL?.replace(/\/$/, "") ||
    "https://pro.handypioneers.com";
  return `${base}/reset-password?token=${rawToken}`;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function renderResetEmailHtml(args: { name: string; resetUrl: string }): string {
  return `<!doctype html>
<html><body style="font-family: system-ui, -apple-system, sans-serif; color: #1a2d24; background: #faf8f3; padding: 32px; max-width: 560px; margin: 0 auto;">
  <p style="font-size: 10px; letter-spacing: 2px; color: #c8892a; text-transform: uppercase; margin: 0 0 8px;">Handy Pioneers</p>
  <h1 style="font-size: 24px; line-height: 1.3; margin: 0 0 16px;">Reset your password</h1>
  <p style="font-size: 15px; line-height: 1.6;">
    ${escapeHtml(args.name) || "Hello"} — someone (likely you) asked to reset
    the password on your Handy Pioneers staff account. Use the link below to
    choose a new password. The link is valid for 1 hour.
  </p>
  <p style="margin: 28px 0;">
    <a href="${args.resetUrl}"
       style="background: #c8892a; color: #1a2d24; text-decoration: none; padding: 14px 24px; border-radius: 6px; font-weight: bold; letter-spacing: 0.08em; text-transform: uppercase; font-size: 14px;">
      Choose New Password
    </a>
  </p>
  <p style="font-size: 13px; color: #6a6a62; line-height: 1.5;">
    If you did not request this, ignore this email — your password stays the
    same and the link expires on its own.
  </p>
  <hr style="border: 0; border-top: 1px solid #e0dcc8; margin: 32px 0;">
  <p style="font-size: 11px; color: #6a6a62; line-height: 1.5;">
    Questions? <a href="mailto:help@handypioneers.com" style="color: #c8892a;">help@handypioneers.com</a>
  </p>
</body></html>`;
}

function renderResetEmailText(args: { name: string; resetUrl: string }): string {
  return [
    `Reset your password`,
    ``,
    `${args.name || "Hello"} — someone (likely you) asked to reset the password on your Handy Pioneers staff account.`,
    ``,
    `Open this link within 1 hour to choose a new password:`,
    args.resetUrl,
    ``,
    `If you did not request this, ignore this email — your password stays the same.`,
    ``,
    `Questions? help@handypioneers.com`,
  ].join("\n");
}

async function sendResetEmail(toEmail: string, name: string, resetUrl: string): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[passwordReset] RESEND_API_KEY not set — printing reset link to logs instead");
    console.warn(`[passwordReset] Reset link for ${toEmail}: ${resetUrl}`);
    return false;
  }
  const fromAddress =
    process.env.RESEND_FROM_ADDRESS || "Handy Pioneers <noreply@handypioneers.com>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress,
      to: [toEmail],
      subject: "Reset your Handy Pioneers password",
      html: renderResetEmailHtml({ name, resetUrl }),
      text: renderResetEmailText({ name, resetUrl }),
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.warn("[passwordReset] Resend non-OK", res.status, text);
    return false;
  }
  return true;
}

export async function requestPasswordReset(args: {
  email: string;
  requestIp?: string | null;
}): Promise<{ ok: true }> {
  const db = await getDb();
  if (!db) return { ok: true };
  const email = args.email.toLowerCase().trim();

  const [staffUser] = await db
    .select()
    .from(staffUsers)
    .where(eq(staffUsers.email, email))
    .limit(1);

  if (!staffUser) {
    return { ok: true };
  }

  const rawToken = generateRawToken();
  const tokenHash = await bcrypt.hash(rawToken, 10);
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS);

  await db.insert(passwordResetTokens).values({
    staffUserId: staffUser.id,
    tokenHash,
    expiresAt,
    requestIp: args.requestIp ?? null,
  });

  const resetUrl = buildResetUrl(rawToken);
  await sendResetEmail(staffUser.email, staffUser.name ?? staffUser.email, resetUrl);

  return { ok: true };
}

export async function consumePasswordReset(args: {
  rawToken: string;
  newPassword: string;
}): Promise<{ ok: true } | { ok: false; reason: "invalid" | "expired" | "used" | "weak" }> {
  if (args.newPassword.length < 8) {
    return { ok: false, reason: "weak" };
  }
  const db = await getDb();
  if (!db) return { ok: false, reason: "invalid" };

  const candidates = await db
    .select()
    .from(passwordResetTokens)
    .where(
      and(
        isNull(passwordResetTokens.usedAt),
        gt(passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .orderBy(passwordResetTokens.id);

  let match: typeof candidates[number] | null = null;
  for (const row of candidates) {
    if (await bcrypt.compare(args.rawToken, row.tokenHash)) {
      match = row;
      break;
    }
  }

  if (!match) return { ok: false, reason: "invalid" };

  const newHash = await bcrypt.hash(args.newPassword, 12);
  await db
    .update(staffUsers)
    .set({ passwordHash: newHash })
    .where(eq(staffUsers.id, match.staffUserId));

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, match.id));

  return { ok: true };
}
