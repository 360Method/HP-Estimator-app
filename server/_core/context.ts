import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

const DEV_ADMIN: User = {
  id: 0,
  openId: "local-dev-admin",
  name: "Local Admin",
  email: process.env.LOCAL_ADMIN_EMAIL ?? "admin@handypioneers.com",
  role: "admin",
  loginMethod: "local",
  createdAt: new Date(),
  updatedAt: new Date(),
  lastSignedIn: new Date(),
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  // Dev admin bypass — requires both NODE_ENV=development AND explicit opt-in + localhost
  if (
    process.env.NODE_ENV === "development" &&
    process.env.DEV_ADMIN_ENABLED === "true" &&
    (opts.req.hostname === "localhost" || opts.req.hostname === "127.0.0.1")
  ) {
    if (!process.env._DEV_ADMIN_WARNED) {
      console.warn("[Auth] DEV_ADMIN_ENABLED=true — all requests get admin access. Do NOT use in production.");
      process.env._DEV_ADMIN_WARNED = "1";
    }
    return { req: opts.req, res: opts.res, user: DEV_ADMIN };
  }

  let user: User | null = null;

  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch {
    user = null;
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
