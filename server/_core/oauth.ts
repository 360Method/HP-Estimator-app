import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import type { Express, Request, Response } from "express";
import * as db from "../db";
import { getSessionCookieOptions } from "./cookies";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export function registerOAuthRoutes(app: Express) {
  // Supabase Auth callback — exchanges code for session
  app.get("/api/oauth/callback", async (req: Request, res: Response) => {
    const code = req.query.code as string;
    if (!code) {
      res.status(400).json({ error: "code is required" });
      return;
    }

    try {
      // Exchange the auth code for a Supabase session
      const { data, error } = await supabase.auth.exchangeCodeForSession(code);
      if (error || !data.user) {
        res.status(400).json({ error: error?.message || "Auth failed" });
        return;
      }

      const supaUser = data.user;

      // Upsert user in our DB (use openId field to store Supabase user ID)
      await db.upsertUser({
        openId: supaUser.id,
        name: supaUser.user_metadata?.full_name || supaUser.user_metadata?.name || null,
        email: supaUser.email ?? null,
        loginMethod: supaUser.app_metadata?.provider ?? null,
        lastSignedIn: new Date(),
      });

      // Create our own session JWT
      const { sdk } = await import("./sdk");
      const sessionToken = await sdk.createSessionToken(supaUser.id, {
        name: supaUser.user_metadata?.full_name || "",
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.redirect(302, "/");
    } catch (error) {
      console.error("[OAuth] Callback failed", error);
      res.status(500).json({ error: "OAuth callback failed" });
    }
  });
}
