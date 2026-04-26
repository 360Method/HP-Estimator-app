/**
 * GBP OAuth Express routes.
 *   GET /api/integrations/gbp/connect  — start OAuth flow (redirects to Google)
 *   GET /api/integrations/gbp/callback — receive auth code, exchange, redirect back
 */
import { Router } from "express";
import { ENV } from "../../_core/env";
import { buildGbpAuthUrl, exchangeGbpCode } from "./oauth";
import { sdk } from "../../_core/sdk";

export const gbpRouter = Router();

gbpRouter.get("/connect", async (req, res) => {
  if (!ENV.gbpClientId || !ENV.gbpClientSecret) {
    res.status(503).json({ error: "GBP_CLIENT_ID / GBP_CLIENT_SECRET not configured" });
    return;
  }
  // Authenticate the requesting user (admin session required)
  let staffId: number | undefined;
  try {
    const user = await sdk.authenticateRequest(req);
    staffId = (user as any)?.id;
  } catch {
    res.redirect("/?gbp=error&reason=unauthorized");
    return;
  }

  const redirectUri = ENV.gbpRedirectUri || `${req.protocol}://${req.get("host")}/api/integrations/gbp/callback`;
  const state = Buffer.from(JSON.stringify({ staffId, redirectUri })).toString("base64url");
  res.redirect(buildGbpAuthUrl(redirectUri, state));
});

gbpRouter.get("/callback", async (req, res) => {
  const code = req.query.code as string | undefined;
  const rawState = req.query.state as string | undefined;
  const error = req.query.error as string | undefined;

  let origin = "";
  let redirectUri = ENV.gbpRedirectUri || `${req.protocol}://${req.get("host")}/api/integrations/gbp/callback`;
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
    res.redirect(`${origin}/?gbp=error&reason=${encodeURIComponent(error ?? "missing_code")}`);
    return;
  }

  try {
    await exchangeGbpCode(code, redirectUri, staffId);
    res.redirect(`${origin}/?gbp=connected`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[GBP] OAuth callback error:", msg);
    res.redirect(`${origin}/?gbp=error&reason=${encodeURIComponent(msg.slice(0, 100))}`);
  }
});
