/**
 * Voice-agent HTTP surface. One webhook per provider:
 *   POST /api/voice-agent/:provider/events
 *
 * The platform (Vapi) hits this for mid-call tool calls and the end-of-call
 * report. We authenticate, normalize via the provider's adapter, then either
 * run the requested tools (and answer inline) or log the finished call.
 */
import type { Express, Request, Response } from "express";
import express from "express";
import { ENV } from "../_core/env";
import { vapiAdapter } from "./adapters/vapi";
import { runTool, type ToolContext, VOICE_AGENT_TOOLS } from "./tools";
import { handleCallReport } from "./handler";
import { handleCalendlyEvent } from "./calendlyWebhook";
import type { VoiceAdapter } from "./types";

const ADAPTERS: Record<string, VoiceAdapter> = {
  vapi: vapiAdapter,
};

/** Lightweight readiness report for /api/health and the Settings page. */
export function voiceAgentConfigStatus() {
  const provider = ENV.voiceAgentProvider;
  const webhookSecretSet = provider === "vapi" ? !!ENV.vapiWebhookSecret : false;
  return {
    provider,
    webhookSecretSet,
    ready: webhookSecretSet,
    tools: VOICE_AGENT_TOOLS,
  };
}

export function registerVoiceAgentRoutes(app: Express): void {
  app.post(
    "/api/voice-agent/:provider/events",
    express.json({ limit: "2mb" }),
    async (req: Request, res: Response) => {
      const providerKey = String(req.params.provider || "").toLowerCase();
      const adapter = ADAPTERS[providerKey];
      if (!adapter) {
        return res.status(404).json({ error: `Unknown voice provider "${providerKey}"` });
      }

      if (!adapter.verify(req.headers as Record<string, unknown>, req.body)) {
        console.warn(`[voiceAgent] rejected ${providerKey} webhook — bad or missing secret`);
        return res.status(403).json({ error: "Forbidden" });
      }

      let event;
      try {
        event = adapter.parse(req.body);
      } catch (err) {
        console.error(`[voiceAgent] parse error for ${providerKey}:`, err);
        // Ack so the platform does not enter a retry storm over a bad payload.
        return res.status(200).json({});
      }

      try {
        if (event.kind === "tool-calls") {
          const ctx: ToolContext = { fromNumber: event.fromNumber };
          const results = await Promise.all(event.calls.map((c) => runTool(c, ctx)));
          return res.status(200).json(adapter.formatToolResults(results));
        }
        if (event.kind === "call-report") {
          // Ack right away; log in the background so the platform isn't blocked.
          res.status(200).json({ ok: true });
          handleCallReport(event.report).catch((e) =>
            console.error("[voiceAgent] handleCallReport failed:", e),
          );
          return;
        }
        return res.status(200).json({ ok: true, ignored: event.reason });
      } catch (err) {
        console.error(`[voiceAgent] dispatch error for ${providerKey}:`, err);
        return res.status(200).json({});
      }
    },
  );
  // Calendly webhook: a confirmed booking syncs into the portal.
  app.post("/api/voice-agent/calendly", express.json({ limit: "1mb" }), async (req: Request, res: Response) => {
    const secret = process.env.CALENDLY_WEBHOOK_SECRET;
    if (secret && req.query.s !== secret) {
      console.warn("[calendly] webhook rejected — bad/missing secret");
      return res.status(403).json({ error: "Forbidden" });
    }
    res.status(200).json({ ok: true }); // ack fast
    handleCalendlyEvent(req.body).catch((e) => console.error("[calendly] webhook error:", e));
  });

  console.log("[voiceAgent] routes mounted at /api/voice-agent/:provider/events (+ /calendly)");
}
