/**
 * QuickBooks Online integration router.
 * Handles OAuth 2.0 connect/disconnect and entity sync (invoices, expenses, customers).
 * Tokens are stored in the qbTokens table.
 *
 * NOTE: Requires QUICKBOOKS_CLIENT_ID and QUICKBOOKS_CLIENT_SECRET env vars.
 * Set QUICKBOOKS_ENVIRONMENT=production for live data (default: sandbox).
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { qbTokens, invoices, customers, expenses } from "../../drizzle/schema";
import { eq, isNull, and } from "drizzle-orm";

// ─── QB API URLS ─────────────────────────────────────────────────────────────

const QB_AUTH_URL = "https://appcenter.intuit.com/connect/oauth2";
const QB_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";
const QB_REVOKE_URL = "https://developer.api.intuit.com/v2/oauth2/tokens/revoke";
const QB_DISCOVERY_URL = "https://developer.api.intuit.com/v2/oauth2/openid_connect/userinfo";

function qbBaseUrl(env: "sandbox" | "production") {
  return env === "production"
    ? "https://quickbooks.api.intuit.com"
    : "https://sandbox-quickbooks.api.intuit.com";
}

// ─── TOKEN HELPERS ────────────────────────────────────────────────────────────

async function getTokensForUser(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(qbTokens).where(eq(qbTokens.userId, userId)).limit(1);
  return rows[0] ?? null;
}

async function saveTokens(
  userId: number,
  accessToken: string,
  refreshToken: string,
  realmId: string,
  expiresInSeconds: number
) {
  const db = await getDb();
  if (!db) return;
  const expiresAt = new Date(Date.now() + expiresInSeconds * 1000).toISOString();
  const existing = await getTokensForUser(userId);
  if (existing) {
    await db
      .update(qbTokens)
      .set({ accessToken, refreshToken, realmId, expiresAt })
      .where(eq(qbTokens.userId, userId));
  } else {
    await db.insert(qbTokens).values({ userId, accessToken, refreshToken, realmId, expiresAt });
  }
}

async function refreshAccessToken(userId: number): Promise<string | null> {
  const tokens = await getTokensForUser(userId);
  if (!tokens) return null;

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
  });

  const resp = await fetch(QB_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${ENV.qbClientId}:${ENV.qbClientSecret}`).toString("base64")}`,
    },
    body: params.toString(),
  });

  if (!resp.ok) return null;
  const data = await resp.json();
  await saveTokens(userId, data.access_token, data.refresh_token ?? tokens.refreshToken, tokens.realmId, data.expires_in ?? 3600);
  return data.access_token;
}

async function getValidAccessToken(userId: number): Promise<{ token: string; realmId: string } | null> {
  const tokens = await getTokensForUser(userId);
  if (!tokens) return null;

  const expiresAt = new Date(tokens.expiresAt);
  const now = new Date();
  // Refresh if expires within 5 minutes
  if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
    const newToken = await refreshAccessToken(userId);
    if (!newToken) return null;
    return { token: newToken, realmId: tokens.realmId };
  }
  return { token: tokens.accessToken, realmId: tokens.realmId };
}

// ─── QB API CALL HELPER ───────────────────────────────────────────────────────

async function qbApiCall(
  userId: number,
  method: string,
  path: string,
  body?: object
): Promise<{ ok: boolean; data?: any; error?: string }> {
  const auth = await getValidAccessToken(userId);
  if (!auth) return { ok: false, error: "Not connected to QuickBooks" };

  const baseUrl = qbBaseUrl(ENV.qbEnvironment);
  const url = `${baseUrl}/v3/company/${auth.realmId}${path}`;

  const resp = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${auth.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!resp.ok) {
    const text = await resp.text();
    return { ok: false, error: `QB API ${resp.status}: ${text.slice(0, 200)}` };
  }

  const data = await resp.json();
  return { ok: true, data };
}

// ─── ROUTER ──────────────────────────────────────────────────────────────────

export const quickbooksRouter = router({
  /**
   * Returns whether QB is configured (client ID/secret set) and connected (tokens exist).
   */
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const configured = !!(ENV.qbClientId && ENV.qbClientSecret);
    if (!configured) {
      return { configured: false, connected: false, realmId: null, environment: ENV.qbEnvironment };
    }
    const tokens = await getTokensForUser(ctx.user.id);
    return {
      configured: true,
      connected: !!tokens,
      realmId: tokens?.realmId ?? null,
      environment: ENV.qbEnvironment,
      expiresAt: tokens?.expiresAt ?? null,
    };
  }),

  /**
   * Returns the OAuth authorization URL for the user to visit.
   */
  getAuthUrl: protectedProcedure
    .input(z.object({ redirectUri: z.string().url() }))
    .query(({ ctx, input }) => {
      if (!ENV.qbClientId) throw new Error("QUICKBOOKS_CLIENT_ID not configured");
      const state = Buffer.from(JSON.stringify({ userId: ctx.user.id, redirectUri: input.redirectUri })).toString("base64");
      const params = new URLSearchParams({
        client_id: ENV.qbClientId,
        scope: "com.intuit.quickbooks.accounting",
        redirect_uri: input.redirectUri,
        response_type: "code",
        state,
      });
      return { url: `${QB_AUTH_URL}?${params.toString()}` };
    }),

  /**
   * Exchange authorization code for tokens (called after OAuth redirect).
   */
  exchangeCode: protectedProcedure
    .input(z.object({
      code: z.string(),
      realmId: z.string(),
      redirectUri: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!ENV.qbClientId || !ENV.qbClientSecret) {
        throw new Error("QuickBooks credentials not configured");
      }
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: input.redirectUri,
      });
      const resp = await fetch(QB_TOKEN_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(`${ENV.qbClientId}:${ENV.qbClientSecret}`).toString("base64")}`,
        },
        body: params.toString(),
      });
      if (!resp.ok) {
        const text = await resp.text();
        throw new Error(`QB token exchange failed: ${text.slice(0, 200)}`);
      }
      const data = await resp.json();
      await saveTokens(ctx.user.id, data.access_token, data.refresh_token, input.realmId, data.expires_in ?? 3600);
      return { success: true };
    }),

  /**
   * Disconnect from QuickBooks (revoke tokens and delete from DB).
   */
  disconnect: protectedProcedure.mutation(async ({ ctx }) => {
    const tokens = await getTokensForUser(ctx.user.id);
    if (!tokens) return { success: true };

    // Attempt to revoke the refresh token
    try {
      await fetch(QB_REVOKE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Basic ${Buffer.from(`${ENV.qbClientId}:${ENV.qbClientSecret}`).toString("base64")}`,
        },
        body: JSON.stringify({ token: tokens.refreshToken }),
      });
    } catch (_) {
      // Ignore revoke errors — still delete local tokens
    }

    const db = await getDb();
    if (db) await db.delete(qbTokens).where(eq(qbTokens.userId, ctx.user.id));
    return { success: true };
  }),

  /**
   * Sync a single invoice to QuickBooks as an Invoice entity.
   */
  syncInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [inv] = await db
        .select()
        .from(invoices)
        .where(eq(invoices.id, input.invoiceId))
        .limit(1);
      if (!inv) throw new Error("Invoice not found");

      // Build QB Invoice payload (minimal)
      const qbPayload = {
        Line: [
          {
            Amount: (inv.total ?? 0) / 100,
            DetailType: "SalesItemLineDetail",
            SalesItemLineDetail: {
              ItemRef: { value: "1", name: "Services" },
            },
          },
        ],
        CustomerRef: { value: inv.customerId ?? "1" },
        DocNumber: inv.invoiceNumber ?? undefined,
        DueDate: inv.dueDate ?? undefined,
        TotalAmt: (inv.total ?? 0) / 100,
      };

      const result = await qbApiCall(ctx.user.id, "POST", "/invoice", qbPayload);
      if (!result.ok) throw new Error(result.error);

      const qbId = result.data?.Invoice?.Id ?? null;
      if (qbId) {
        await db
          .update(invoices)
          .set({ qbEntityId: qbId, qbSyncedAt: new Date().toISOString() })
          .where(eq(invoices.id, input.invoiceId));
      }
      return { success: true, qbId };
    }),

  /**
   * Sync a single expense to QuickBooks as a Purchase entity.
   */
  syncExpense: protectedProcedure
    .input(z.object({ expenseId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [exp] = await db
        .select()
        .from(expenses)
        .where(and(eq(expenses.id, input.expenseId), eq(expenses.userId, ctx.user.id)))
        .limit(1);
      if (!exp) throw new Error("Expense not found");

      const qbPayload = {
        AccountRef: { value: "1" }, // Default expense account
        PaymentType: "Cash",
        TotalAmt: exp.amount / 100,
        Line: [
          {
            Amount: exp.amount / 100,
            DetailType: "AccountBasedExpenseLineDetail",
            AccountBasedExpenseLineDetail: {
              AccountRef: { value: "1" },
            },
            Description: exp.description ?? exp.category,
          },
        ],
        EntityRef: exp.vendor ? { name: exp.vendor } : undefined,
        TxnDate: exp.date,
        PrivateNote: `Category: ${exp.category}${exp.opportunityId ? ` | Job: ${exp.opportunityId}` : ""}`,
      };

      const result = await qbApiCall(ctx.user.id, "POST", "/purchase", qbPayload);
      if (!result.ok) throw new Error(result.error);

      const qbId = result.data?.Purchase?.Id ?? null;
      if (qbId) {
        await db
          .update(expenses)
          .set({ qbEntityId: qbId, qbSyncedAt: new Date().toISOString() })
          .where(eq(expenses.id, input.expenseId));
      }
      return { success: true, qbId };
    }),

  /**
   * Sync a customer to QuickBooks as a Customer entity.
   */
  syncCustomer: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const [cust] = await db
        .select()
        .from(customers)
        .where(eq(customers.id, input.customerId))
        .limit(1);
      if (!cust) throw new Error("Customer not found");

      const displayName =
        [cust.firstName, cust.lastName].filter(Boolean).join(" ") ||
        cust.displayName ||
        cust.company ||
        cust.id;

      const qbPayload: any = {
        DisplayName: displayName,
        GivenName: cust.firstName ?? undefined,
        FamilyName: cust.lastName ?? undefined,
        CompanyName: cust.company ?? undefined,
        PrimaryEmailAddr: cust.email ? { Address: cust.email } : undefined,
        PrimaryPhone: cust.mobilePhone ? { FreeFormNumber: cust.mobilePhone } : undefined,
      };

      const result = await qbApiCall(ctx.user.id, "POST", "/customer", qbPayload);
      if (!result.ok) throw new Error(result.error);

      const qbId = result.data?.Customer?.Id ?? null;
      if (qbId) {
        await db
          .update(customers)
          .set({ qbCustomerId: qbId })
          .where(eq(customers.id, input.customerId));
      }
      return { success: true, qbId };
    }),

  /**
   * Bulk sync: push all unsynced invoices and expenses to QB.
   */
  bulkSync: protectedProcedure
    .input(z.object({ syncInvoices: z.boolean().default(true), syncExpenses: z.boolean().default(true) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");

      const results = { invoicesSynced: 0, expensesSynced: 0, errors: [] as string[] };

      if (input.syncInvoices) {
        const unsyncedInvoices = await db
          .select({ id: invoices.id })
          .from(invoices)
          .where(isNull(invoices.qbEntityId))
          .limit(50);

        for (const inv of unsyncedInvoices) {
          try {
            const [invData] = await db.select().from(invoices).where(eq(invoices.id, inv.id)).limit(1);
            if (!invData) continue;
            const qbPayload = {
              Line: [{
                Amount: (invData.total ?? 0) / 100,
                DetailType: "SalesItemLineDetail",
                SalesItemLineDetail: { ItemRef: { value: "1", name: "Services" } },
              }],
              CustomerRef: { value: invData.customerId ?? "1" },
              DocNumber: invData.invoiceNumber ?? undefined,
              DueDate: invData.dueDate ?? undefined,
            };
            const res = await qbApiCall(ctx.user.id, "POST", "/invoice", qbPayload);
            if (res.ok) {
              const qbId = res.data?.Invoice?.Id;
              if (qbId) await db.update(invoices).set({ qbEntityId: qbId, qbSyncedAt: new Date().toISOString() }).where(eq(invoices.id, inv.id));
              results.invoicesSynced++;
            } else {
              results.errors.push(`Invoice ${inv.id}: ${res.error}`);
            }
          } catch (e: any) {
            results.errors.push(`Invoice ${inv.id}: ${e.message}`);
          }
        }
      }

      if (input.syncExpenses) {
        const unsyncedExpenses = await db
          .select({ id: expenses.id })
          .from(expenses)
          .where(and(eq(expenses.userId, ctx.user.id), isNull(expenses.qbEntityId)))
          .limit(50);

        for (const exp of unsyncedExpenses) {
          try {
            const [expData] = await db.select().from(expenses).where(eq(expenses.id, exp.id)).limit(1);
            if (!expData) continue;
            const qbPayload = {
              AccountRef: { value: "1" },
              PaymentType: "Cash",
              TotalAmt: expData.amount / 100,
              Line: [{
                Amount: expData.amount / 100,
                DetailType: "AccountBasedExpenseLineDetail",
                AccountBasedExpenseLineDetail: { AccountRef: { value: "1" } },
                Description: expData.description ?? expData.category,
              }],
              TxnDate: expData.date,
            };
            const res = await qbApiCall(ctx.user.id, "POST", "/purchase", qbPayload);
            if (res.ok) {
              const qbId = res.data?.Purchase?.Id;
              if (qbId) await db.update(expenses).set({ qbEntityId: qbId, qbSyncedAt: new Date().toISOString() }).where(eq(expenses.id, exp.id));
              results.expensesSynced++;
            } else {
              results.errors.push(`Expense ${exp.id}: ${res.error}`);
            }
          } catch (e: any) {
            results.errors.push(`Expense ${exp.id}: ${e.message}`);
          }
        }
      }

      return results;
    }),
});
