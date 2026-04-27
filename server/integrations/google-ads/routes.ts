/**
 * Google Ads OAuth Express routes.
 *   GET /api/integrations/google-ads/connect  — start OAuth flow
 *   GET /api/integrations/google-ads/callback — receive auth code, exchange
 */
import { Router } from "express";
import { ENV } from "../../_core/env";
import { buildGoogleAdsAuthUrl, exchangeGoogleAdsCode } from "./oauth";
import { sdk } from "../../_core/sdk";

export const googleAdsRouter = Router();

googleAdsRouter.get("/connect", async (req, res) => {
  if (!ENV.googleAdsClientId || !ENV.googleAdsClientSecret) {
    res.status(503).json({ error: "GOOGLE_ADS_CLIENT_ID / GOOGLE_ADS_CLIENT_SECRET not configured" });
    return;
  }
  let staffId: number | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    staffId = (user as any)?.id;
  } catch {
    res.redirect("/?googleAds=error&reason=unauthorized");
    return;
  }

  const redirectUri = ENV.googleAdsRedirectUri || `${req.protocol}://${req.get("host")}/api/integrations/google-ads/callback`;
  const state = Buffer.from(JSON.stringify({ staffId, redirectUri })).toString("base64url");
  res.redirect(buildGoogleAdsAuthUrl(redirectUri, state));
});

googleAdsRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const rawState = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  let origin = "";
  let redirectUri = ENV.googleAdsRedirectUri || `${req.protocol}://${req.get("host")}/api/integrations/google-ads/callback`;
  let staffId: number | undefined;

  try {
    if (rawState) {
      const parsed = JSON.parse(Buffer.from(rawState, "base64url").toString());
      staffId = parsed.staffId;
      if (parsed.redirectUri) {
        redirectUri = parsed.redirectUri;
        origin = new URL(redirectUri).origin;
      }
    }
  } catch { /* ignore */ }

  if (error || !code) {
    res.redirect(`${origin}/?googleAds=error&reason=${encodeURIComponent(error ?? "missing_code")}`);
    return;
  }

  try {
    await exchangeGoogleAdsCode(code, redirectUri, staffId);
    res.redirect(`${origin}/?googleAds=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[Google Ads] OAuth callback error:", msg);
    res.redirect(`${origin}/?googleAds=error&reason=${encodeURIComponent(msg.slice(0, 100))}`);
  }
});
