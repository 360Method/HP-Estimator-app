import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { appSettings } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

const DEFAULT_SETTINGS = {
  id: 1,
  companyName: "Handy Pioneers",
  logoUrl: "",
  brandColor: "#1E3A5F",
  timezone: "America/Los_Angeles",
  estimatePrefix: "EST",
  invoicePrefix: "INV",
  jobPrefix: "JOB",
  portalUrl: "https://client.handypioneers.com",
  websiteUrl: "https://handypioneers.com",
  supportEmail: "",
  supportPhone: "",
  addressLine1: "",
  addressLine2: "",
  defaultTaxBps: 875,
  defaultDepositPct: 50,
  documentFooter: "",
  termsText: "",
  googleReviewLink: "",
  // Transactional email templates
  emailEstimateApprovedSubject: "Your estimate has been approved — Handy Pioneers",
  emailEstimateApprovedBody: "",
  emailJobSignOffSubject: "Job complete — your final invoice is ready",
  emailJobSignOffBody: "",
  emailChangeOrderApprovedSubject: "Change order approved — Handy Pioneers",
  emailChangeOrderApprovedBody: "",
  emailMagicLinkSubject: "Your Handy Pioneers Customer Portal Login",
  emailMagicLinkBody: "",
};

async function getOrCreateAppSettings() {
  const db = await getDb();
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  if (rows.length > 0) return rows[0];
  await db.insert(appSettings).values(DEFAULT_SETTINGS).onDuplicateKeyUpdate({
    set: { updatedAt: new Date() },
  });
  const fresh = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);
  return fresh[0];
}

export const appSettingsRouter = router({
  getSettings: protectedProcedure.query(async () => {
    return getOrCreateAppSettings();
  }),

  updateSettings: protectedProcedure
    .input(
      z.object({
        companyName: z.string().max(120).optional(),
        logoUrl: z.string().max(500).optional(),
        brandColor: z.string().max(20).optional(),
        timezone: z.string().max(60).optional(),
        estimatePrefix: z.string().max(10).optional(),
        invoicePrefix: z.string().max(10).optional(),
        jobPrefix: z.string().max(10).optional(),
        portalUrl: z.string().max(300).optional(),
        websiteUrl: z.string().max(300).optional(),
        supportEmail: z.string().max(320).optional(),
        supportPhone: z.string().max(30).optional(),
        addressLine1: z.string().max(200).optional(),
        addressLine2: z.string().max(200).optional(),
        defaultTaxBps: z.number().int().min(0).max(10000).optional(),
        defaultDepositPct: z.number().int().min(0).max(100).optional(),
        documentFooter: z.string().optional(),
        termsText: z.string().optional(),
        googleReviewLink: z.string().max(500).optional(),
        // Transactional email templates
        emailEstimateApprovedSubject: z.string().max(300).optional(),
        emailEstimateApprovedBody: z.string().optional(),
        emailJobSignOffSubject: z.string().max(300).optional(),
        emailJobSignOffBody: z.string().optional(),
        emailChangeOrderApprovedSubject: z.string().max(300).optional(),
        emailChangeOrderApprovedBody: z.string().optional(),
        emailMagicLinkSubject: z.string().max(300).optional(),
        emailMagicLinkBody: z.string().optional(),
      })
    )
    .mutation(async ({ input }) => {
      const db = await getDb();
      // Ensure row exists first
      await getOrCreateAppSettings();
      await db
        .update(appSettings)
        .set({ ...input, updatedAt: new Date() })
        .where(eq(appSettings.id, 1));
      return getOrCreateAppSettings();
    }),

  /** Public getter for server-side use (e.g. portal email templates) */
  getSettingsPublic: protectedProcedure.query(async () => {
    return getOrCreateAppSettings();
  }),
});

/** Server-side helper — fetch settings without tRPC context */
export { getOrCreateAppSettings };
