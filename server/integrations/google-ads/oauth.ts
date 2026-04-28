/**
 * Google Ads — OAuth 2.0 helpers.
 * Uses the adwords scope; tokens stored in googleAdsTokens table (one row).
 */
import { ENV } from "../../_core/env";
import { getDb } from "../../db";
import { googleAdsTokens } from "../../../drizzle/schema";
import { eq } from "drizzle-orm";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GADS_SCOPE = "https://www.googleapis.com/auth/adwords";

export function buildGoogleAdsAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: ENV.googleAdsClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GADS_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${params.toString()}`;
}

export async function exchangeGoogleAdsCode(
  code: string,
  redirectUri: string,
  staffId?: number
): Promise<{ customerId: string; accessToken: string; refreshToken: string; expiresAt: string }> {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: ENV.googleAdsClientId,
      client_secret: ENV.googleAdsClientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }).toString(),
  });
  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`Google Ads token exchange failed: ${text.slice(0, 200)}`);
  }
  const data = await resp.json();
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString();
  const customerId = ENV.googleAdsCustomerId || "unknown";

  await saveGoogleAdsTokens({
    customerId,
    accessToken: data.access_token,
    refreshToken: data.refresh_token ?? "",
    expiresAt,
    staffId,
  });

  return { customerId, accessToken: data.access_token, refreshToken: data.refresh_token ?? "", expiresAt };
}

export async function saveGoogleAdsTokens(opts: {
  customerId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  staffId?: number;
}) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(googleAdsTokens).limit(1);
  if (existing.length > 0) {
    await db.update(googleAdsTokens).set({
      customerId: opts.customerId,
      accessToken: opts.accessToken,
      refreshToken: opts.refreshToken,
      expiresAt: opts.expiresAt,
      ...(opts.staffId ? { connectedByStaffId: opts.staffId } : {}),
    }).where(eq(googleAdsTokens.id, existing[0].id));
  } else {
    await db.insert(googleAdsTokens).values({
      customerId: opts.customerId,
      accessToken: opts.accessToken,
      refreshToken: opts.refreshToken,
      expiresAt: opts.expiresAt,
      connectedByStaffId: opts.staffId,
    });
  }
}

export async function getGoogleAdsTokens() {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(googleAdsTokens).limit(1);
  return rows[0] ?? null;
}

export async function getValidGoogleAdsToken(): Promise<{ token: string; customerId: string } | null> {
  const tokens = await getGoogleAdsTokens();
  if (!tokens) return null;

  if (new Date(tokens.expiresAt).getTime() - Date.now() > 5 * 60 * 1000) {
    return { token: tokens.accessToken, customerId: tokens.customerId };
  }

  const refreshed = await refreshGoogleAdsToken(tokens.refreshToken);
  if (!refreshed) return null;

  const newExpiresAt = new Date(Date.now() + (refreshed.expires_in ?? 3600) * 1000).toISOString();
  await saveGoogleAdsTokens({
    customerId: tokens.customerId,
    accessToken: refreshed.access_token,
    refreshToken: tokens.refreshToken,
    expiresAt: newExpiresAt,
  });
  return { token: refreshed.access_token, customerId: tokens.customerId };
}

async function refreshGoogleAdsToken(refreshToken: string) {
  const resp = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: ENV.googleAdsClientId,
      client_secret: ENV.googleAdsClientSecret,
    }).toString(),
  });
  if (!resp.ok) return null;
  return resp.json() as Promise<{ access_token: string; expires_in: number }>;
}

export async function revokeGoogleAdsToken(token: string) {
  await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`).catch(() => null);
}
