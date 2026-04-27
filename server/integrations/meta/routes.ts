/**
 * Meta integration Express routes (no OAuth flow — system user token).
 *   GET  /api/integrations/meta/verify   — test token validity
 *   GET  /api/integrations/meta/insights — quick insights summary
 */
import { Router } from "express";
import { isMetaConfigured, verifyMetaToken, fetchAdInsights } from "./client";

export const metaRouter = Router();

metaRouter.get("/verify", async (_req, res) => {
  if (!isMetaConfigured()) {
    res.json({ configured: false, valid: false });
    return;
  }
  try {
    const result = await verifyMetaToken();
    res.json({ configured: true, ...result });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ configured: true, valid: false, error: msg });
  }
});

metaRouter.get("/insights", async (_req, res) => {
  if (!isMetaConfigured()) {
    res.status(503).json({ error: "Meta not configured" });
    return;
  }
  try {
    const insights = await fetchAdInsights({ datePreset: "last_30d", limit: 10 });
    res.json({ data: insights });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: msg });
  }
});
