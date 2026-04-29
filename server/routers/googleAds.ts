/**
 * Google Ads tRPC router.
 * IMPORTANT: Per the design doc submitted to Google, NO mutating API call
 * originates from an agent run. Agents draft only; humans send from /admin/marketing.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getGoogleAdsTokens, getValidGoogleAdsToken, revokeGoogleAdsToken } from "../integrations/google-ads/oauth";
import { fetchCampaigns, fetchPerformance, keywordResearch } from "../integrations/google-ads/client";
import { getDb } from "../db";
import { googleAdsTokens } from "../../drizzle/schema";

export const googleAdsRouter = router({
  getConnectionStatus: protectedProcedure.query(async () => {
    const configured = !!(ENV.googleAdsClientId && ENV.googleAdsClientSecret && ENV.googleAdsDevToken);
    if (!configured) return { configured: false, connected: false, customerId: null, environment: "test" };
    const tokens = await getGoogleAdsTokens();
    return {
      configured: true,
      connected: !!tokens,
      customerId: tokens?.customerId ?? ENV.googleAdsCustomerId ?? null,
      connectedAt: tokens?.connectedAt ?? null,
      // Developer token is still pending Google approval — flag for UI
      devTokenStatus: ENV.googleAdsDevToken ? "pending_approval" : "not_set",
    };
  }),

  disconnect: protectedProcedure.mutation(async () => {
    const tokens = await getGoogleAdsTokens();
    if (!tokens) return { success: true };
    await revokeGoogleAdsToken(tokens.accessToken).catch(() => null);
    const db = await getDb();
    if (db) {
      const { eq } = await import("drizzle-orm");
      await db.delete(googleAdsTokens).where(eq(googleAdsTokens.id, tokens.id));
    }
    return { success: true };
  }),

  // ── Agent tools (draft mode — read only) ─────────────────────────────────
  fetchCampaigns: protectedProcedure
    .input(z.object({ customerId: z.string().optional() }))
    .query(async ({ input }) => {
      const auth = await getValidGoogleAdsToken();
      if (!auth) throw new Error("Google Ads not connected");
      return fetchCampaigns(input.customerId);
    }),

  fetchPerformance: protectedProcedure
    .input(z.object({
      dateRange: z.enum(["LAST_7_DAYS", "LAST_30_DAYS", "LAST_MONTH", "THIS_MONTH"]).default("LAST_30_DAYS"),
      customerId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const auth = await getValidGoogleAdsToken();
      if (!auth) throw new Error("Google Ads not connected");
      return fetchPerformance({ dateRange: input.dateRange, customerId: input.customerId });
    }),

  keywordResearch: protectedProcedure
    .input(z.object({
      seedKeywords: z.array(z.string()).min(1).max(20),
      language: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const auth = await getValidGoogleAdsToken();
      if (!auth) throw new Error("Google Ads not connected");
      return keywordResearch(input);
    }),

  draftAdCreative: protectedProcedure
    .input(z.object({
      campaignGoal: z.string(),
      targetKeywords: z.array(z.string()).optional(),
      landingPage: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // Draft-only — never auto-create ads. Design doc constraint.
      const headlines = [
        "Trusted Home Repair Experts",
        "Handy Pioneers — Written Scope",
        input.campaignGoal,
      ];
      const descriptions = [
        "Licensed & insured. We deliver a written scope of work before any job starts.",
        "Vancouver, WA's trusted handyman team. Free consultation.",
      ];
      return {
        draft: true,
        type: "RESPONSIVE_SEARCH_AD",
        headlines: headlines.slice(0, 15),
        descriptions: descriptions.slice(0, 4),
        finalUrls: [input.landingPage ?? "https://handypioneers.com"],
        keywords: (input.targetKeywords ?? []).map(k => ({ keyword: k, matchType: "BROAD" })),
        note: "Review this draft in /admin/marketing/ads before creating in Google Ads.",
      };
    }),
});
