/**
 * server/lib/priorityTranslation/portalAccount.ts
 *
 * Auto-provisions a portal account for a Priority Translation submission,
 * issues a passwordless magic-link token (7-day expiry, single-use), and
 * builds the URL the homeowner will click.
 *
 * MySQL port: insert-then-select pattern (no pg .returning()).
 */

import { randomBytes, randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import type { MySql2Database } from "drizzle-orm/mysql2";
import {
  portalAccounts,
  portalMagicLinks,
  portalProperties,
  homeHealthRecords,
  type DbPortalAccount,
  type DbPortalProperty,
  type DbHomeHealthRecord,
} from "../../../drizzle/schema.priorityTranslation";

const MAGIC_LINK_TTL_DAYS = 7;

export type DbLike = MySql2Database<any>;

export async function findOrCreatePortalAccount(
  db: DbLike,
  args: { email: string; firstName: string; lastName: string; phone: string }
): Promise<DbPortalAccount> {
  const email = args.email.trim().toLowerCase();
  const existing = await db.select().from(portalAccounts).where(eq(portalAccounts.email, email)).limit(1);
  if (existing[0]) return existing[0];

  const id = `pa_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await db
    .insert(portalAccounts)
    .values({ id, email, firstName: args.firstName, lastName: args.lastName, phone: args.phone });
  const [created] = await db.select().from(portalAccounts).where(eq(portalAccounts.id, id)).limit(1);
  return created;
}

export async function findOrCreatePortalProperty(
  db: DbLike,
  args: { portalAccountId: string; street: string; city: string; state: string; zip: string; unit?: string }
): Promise<DbPortalProperty> {
  const existing = await db
    .select()
    .from(portalProperties)
    .where(
      and(
        eq(portalProperties.portalAccountId, args.portalAccountId),
        eq(portalProperties.street, args.street),
        eq(portalProperties.zip, args.zip)
      )
    )
    .limit(1);
  if (existing[0]) return existing[0];

  const id = `pp_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await db
    .insert(portalProperties)
    .values({
      id,
      portalAccountId: args.portalAccountId,
      street: args.street,
      unit: args.unit ?? "",
      city: args.city,
      state: args.state,
      zip: args.zip,
    });
  const [created] = await db.select().from(portalProperties).where(eq(portalProperties.id, id)).limit(1);
  return created;
}

export async function findOrCreateHealthRecord(
  db: DbLike,
  args: { portalAccountId: string; propertyId: string }
): Promise<DbHomeHealthRecord> {
  const existing = await db
    .select()
    .from(homeHealthRecords)
    .where(eq(homeHealthRecords.propertyId, args.propertyId))
    .limit(1);
  if (existing[0]) return existing[0];

  const id = `hhr_${randomUUID().replace(/-/g, "").slice(0, 20)}`;
  await db
    .insert(homeHealthRecords)
    .values({
      id,
      propertyId: args.propertyId,
      portalAccountId: args.portalAccountId,
      findings: [],
    });
  const [created] = await db.select().from(homeHealthRecords).where(eq(homeHealthRecords.id, id)).limit(1);
  return created;
}

// ─── Magic links ────────────────────────────────────────────────────────────
export async function issueMagicLink(
  db: DbLike,
  args: { portalAccountId: string; portalBaseUrl: string }
): Promise<{ token: string; url: string; expiresAt: Date }> {
  const token = randomBytes(48).toString("base64url");
  const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_DAYS * 24 * 3600 * 1000);

  await db.insert(portalMagicLinks).values({
    token,
    portalAccountId: args.portalAccountId,
    expiresAt,
  });

  const base = args.portalBaseUrl.replace(/\/+$/, "");
  const url = `${base}/portal/authenticate?token=${encodeURIComponent(token)}`;
  return { token, url, expiresAt };
}

export async function consumeMagicLink(
  db: DbLike,
  token: string
): Promise<DbPortalAccount | null> {
  const row = await db
    .select()
    .from(portalMagicLinks)
    .where(eq(portalMagicLinks.token, token))
    .limit(1);
  const link = row[0];
  if (!link) return null;
  if (link.consumedAt) return null;
  if (link.expiresAt.getTime() < Date.now()) return null;

  await db
    .update(portalMagicLinks)
    .set({ consumedAt: new Date() })
    .where(eq(portalMagicLinks.token, token));

  const account = await db
    .select()
    .from(portalAccounts)
    .where(eq(portalAccounts.id, link.portalAccountId))
    .limit(1);
  if (account[0]) {
    await db
      .update(portalAccounts)
      .set({ lastLoginAt: new Date() })
      .where(eq(portalAccounts.id, link.portalAccountId));
  }
  return account[0] ?? null;
}
