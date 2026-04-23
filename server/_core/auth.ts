import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import bcrypt from "bcryptjs";
import type { Express, Request, Response } from "express";
import { getDb } from "../db";
import { staffUsers, users } from "../../drizzle/schema";
import { eq } from "drizzle-orm";
import { getSessionCookieOptions } from "./cookies";
import { sdk } from "./sdk";

export function registerAuthRoutes(app: Express) {
  // POST /api/auth/login — email + password → JWT session cookie
  app.post("/api/auth/login", async (req: Request, res: Response) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      res.status(400).json({ error: "email and password are required" });
      return;
    }

    try {
      const db = await getDb();
      if (!db) {
        res.status(503).json({ error: "Database unavailable" });
        return;
      }

      const [staffUser] = await db
        .select()
        .from(staffUsers)
        .where(eq(staffUsers.email, email.toLowerCase().trim()))
        .limit(1);

      if (!staffUser) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      const valid = await bcrypt.compare(password, staffUser.passwordHash);
      if (!valid) {
        res.status(401).json({ error: "Invalid credentials" });
        return;
      }

      // Use email as openId so the existing users table / auth middleware works
      const openId = staffUser.email;

      // Upsert into the users table so tRPC protectedProcedure can find this user
      await db
        .insert(users)
        .values({
          openId,
          name: staffUser.name ?? staffUser.email,
          email: staffUser.email,
          loginMethod: "email",
          role: staffUser.role === "admin" ? "admin" : "user",
        })
        .onDuplicateKeyUpdate({
          set: {
            name: staffUser.name ?? staffUser.email,
            lastSignedIn: new Date(),
          },
        });

      const sessionToken = await sdk.createSessionToken(openId, {
        name: staffUser.name ?? staffUser.email,
        expiresInMs: ONE_YEAR_MS,
      });

      const cookieOptions = getSessionCookieOptions(req);
      res.cookie(COOKIE_NAME, sessionToken, { ...cookieOptions, maxAge: ONE_YEAR_MS });
      res.json({ success: true, name: staffUser.name, email: staffUser.email, role: staffUser.role });
    } catch (error) {
      console.error("[Auth] Login failed", error);
      res.status(500).json({ error: "Login failed" });
    }
  });

  // POST /api/auth/logout — clear session cookie
  app.post("/api/auth/logout", (req: Request, res: Response) => {
    const cookieOptions = getSessionCookieOptions(req);
    res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    res.json({ success: true });
  });

  // GET /api/auth/me — return current user from JWT
  app.get("/api/auth/me", async (req: Request, res: Response) => {
    try {
      const user = await sdk.authenticateRequest(req);
      res.json({ id: user.id, email: user.email, name: user.name, role: user.role });
    } catch {
      res.status(401).json({ error: "Not authenticated" });
    }
  });
}

// ─── SEED DEFAULT ADMIN ────────────────────────────────────────────────────────
// Called on server startup. Creates the default admin if no staff users exist.
export async function seedDefaultAdminIfNeeded(): Promise<void> {
  try {
    const db = await getDb();
    if (!db) return;

    const existing = await db.select({ id: staffUsers.id }).from(staffUsers).limit(1);
    if (existing.length > 0) return;

    const passwordHash = await bcrypt.hash("HP_Admin_2026!", 12);
    await db.insert(staffUsers).values({
      email: "help@handypioneers.com",
      passwordHash,
      name: "HP Admin",
      role: "admin",
    });
    console.log("[Auth] Default admin user created: help@handypioneers.com");
  } catch (err) {
    console.error("[Auth] Failed to seed default admin:", err);
  }
}
