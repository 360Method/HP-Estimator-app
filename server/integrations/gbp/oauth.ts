/**
 * Google Business Profile — OAuth 2.0 helpers.
 * Uses standard Google OAuth with the business.manage scope.
 * Tokens are persisted in the gbpTokens table (one row per connection).
 */
import { ENV } from "../../_core/env";
import { getDb } from "../../db";
import { gbpTokens } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GBP_SCOPE = "https://www.googleapis.com/auth/business.manage";

export function buildGbpAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: ENV.gbpClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GBP_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGbpCode(
  code: string,
  redirectUri: string,
  staffId?: number
): Promise<{ accountId: string; accessToken: string; refreshToken: string; expiresAt: string }> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.gbpClientId,
      client_secret: ENV.gbpClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`GBP token exchange failed: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();

  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  const accessToken: string = data.access_token;
  const refreshToken: string = data.refresh_token ?? "";

  // Fetch account ID from the My Business Account Management API
  let accountId = "default";
  try {
    const acctResp = await fetch(
      "https://mybusinessaccountmanagement.googleapis.com/v1/accounts",
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (acctResp.ok) {
      const acctData = await acctResp.json();
      accountId = acctData.accounts?.[0]?.name ?? "default";
    }
  } catch {
    // Non-fatal — accountId defaults to "default"
  }

  await saveGbpTokens({ accountId, accessToken, refreshToken, expiresAt, staffId });
  return { accountId, accessToken, refreshToken, expiresAt };
}

export async function saveGbpTokens(opts: {
  accountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  locationId?: string;
  staffId?: number;
}) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(gbpTokens).limit(1);
  if (existing.length > 0) {
    await db.update(gbpTokens).set({
      accountId: opts.accountId,
      accessToken: opts.accessToken,
      refreshToken: opts.refreshToken,
      expiresAt: opts.expiresAt,
      ...(opts.locationId ? { locationId: opts.locationId } : {}),
      ...(opts.staffId ? { connectedByStaffId: opts.staffId } : {}),
    }).where(eq(gbpTokens.id, existing[0].id));
  } else {
    await db.insert(gbpTokens).values({
      accountId: opts.accountId,
      accessToken: opts.accessToken,
      refreshToken: opts.refreshToken,
      expiresAt: opts.expiresAt,
      locationId: opts.locationId,
      connectedByStaffId: opts.staffId,
    });
  }
}

export async function getGbpTokens() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(gbpTokens).limit(1);
  return rows[0] ?? null;
}

export async function getValidGbpAccessToken(): Promise<{ token: string; accountId: string } | null> {
  const tokens = await getGbpTokens();
  if (!tokens) return null;

  const expiresAt = new Date(tokens.expiresAt);
  if (expiresAt.getTime() - Date.now() > 5 * 60 * 1000) {
    return { token: tokens.accessToken, accountId: tokens.accountId };
  }

  // Refresh
  const newToken = await refreshGbpToken(tokens.refreshToken);
  if (!newToken) return null;

  const newExpiresAt = new Date(Date.now() + (newToken.expires_in ?? 3600) * 1000).toISOString();
  await saveGbpTokens({
    accountId: tokens.accountId,
    accessToken: newToken.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: newExpiresAt,
    locationId: tokens.locationId ?? undefined,
  });
  return { token: newToken.access_token, accountId: tokens.accountId };
}

async function refreshGbpToken(refreshToken: string) {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: ENV.gbpClientId,
      client_secret: ENV.gbpClientSecret,
    }).toString(),
  });
  if (!resp.ok) return null;
  return resp.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function revokeGbpToken(token: string) {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`).catch(() => null);
}
