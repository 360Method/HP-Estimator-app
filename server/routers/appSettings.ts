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
  supportEmail: "help@handypioneers.com",
  supportPhone: "(360) 241-5718",
  addressLine1: "Vancouver, WA",
  addressLine2: "",
  defaultTaxBps: 875,
  defaultDepositPct: 50,
  documentFooter: "Handy Pioneers • Vancouver, WA • (360) 241-5718 • help@handypioneers.com • handypioneers.com",
  termsText: "Payment is due within 15 days of invoice date. A 50% deposit is required before work begins. All work is guaranteed for 1 year from completion date. Handy Pioneers is licensed, bonded, and insured in the state of Washington.",
  googleReviewLink: "",
  // Transactional email templates
  emailMagicLinkSubject: "Your Handy Pioneers Customer Portal Login",
  emailMagicLinkBody: "Hi {{customerFirstName}},\n\nHere is your one-click login link for the Handy Pioneers customer portal:\n\n{{magicLink}}\n\nThis link expires in 15 minutes and can only be used once. If you did not request this, you can safely ignore this email.\n\nBest,\nThe Handy Pioneers Team\nhttps://client.handypioneers.com",
  emailEstimateApprovedSubject: "Your estimate has been approved — Handy Pioneers",
  emailEstimateApprovedBody: "Hi {{customerFirstName}},\n\nThank you for approving your estimate! We\'re excited to get started on your project.\n\nHere\'s a summary:\n- Estimate: {{referenceNumber}}\n- Project: {{description}}\n- Total: {{amount}}\n\nYour deposit invoice has been sent to your portal. Once the deposit is received, we\'ll confirm your project start date.\n\nLog in to your portal anytime at: {{portalUrl}}\n\nQuestions? Reply to this email or call us at (360) 241-5718.\n\nBest,\nThe Handy Pioneers Team",
  emailJobSignOffSubject: "Job complete — your final invoice is ready",
  emailJobSignOffBody: "Hi {{customerFirstName}},\n\nThank you for signing off on your project — it was a pleasure working with you!\n\nYour final invoice is now available in your customer portal:\n{{invoiceUrl}}\n\nIf you have any questions about the invoice or the work completed, don\'t hesitate to reach out.\n\nWe\'d also love to hear how we did — a quick Google review means the world to our small team.\n\nBest,\nThe Handy Pioneers Team\n(360) 241-5718 • help@handypioneers.com",
  emailChangeOrderApprovedSubject: "Change order approved — Handy Pioneers",
  emailChangeOrderApprovedBody: "Hi {{customerFirstName}},\n\nYour change order {{referenceNumber}} has been approved. Thank you!\n\nChange order: {{description}}\nAmount: {{amount}}\n\nAn invoice for this change order has been added to your portal:\n{{invoiceUrl}}\n\nIf you have any questions, just reply to this email or call us at (360) 241-5718.\n\nBest,\nThe Handy Pioneers Team",
};

async function getOrCreateAppSettings() {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const rows = await db
    .select()
    .from(appSettings)
    .where(eq(appSettings.id, 1))
    .limit(1);

  if (rows.length > 0) {
    const row = rows[0];
    // Backfill any blank template/contact fields with defaults so the UI is never empty
    const backfill: Partial<typeof DEFAULT_SETTINGS> = {};
    const textFields = [
      'supportEmail', 'supportPhone', 'addressLine1', 'documentFooter', 'termsText',
      'emailMagicLinkSubject', 'emailMagicLinkBody',
      'emailEstimateApprovedSubject', 'emailEstimateApprovedBody',
      'emailJobSignOffSubject', 'emailJobSignOffBody',
      'emailChangeOrderApprovedSubject', 'emailChangeOrderApprovedBody',
    ] as const;
    for (const field of textFields) {
      if (!row[field]) backfill[field] = DEFAULT_SETTINGS[field] as any;
    }
    if (Object.keys(backfill).length > 0) {
      await db.update(appSettings).set({ ...backfill, updatedAt: new Date() }).where(eq(appSettings.id, 1));
      const updated = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
      return updated[0];
    }
    return row;
  }

  await db.insert(appSettings).values(DEFAULT_SETTINGS).onConflictDoUpdate({
    target: appSettings.id,
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
      if (!db) throw new Error("Database not available");
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
