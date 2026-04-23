-- 0054_settings_fields.sql
-- Item 6: portal_base_url already lives on appSettings.portalUrl (default 'https://client.handypioneers.com')
-- Item 7: documentFooter + termsText already on appSettings (HTML allowed in-app)
-- Item 8: Update default document-number prefixes to match Manus-era naming (HP-E- / HP-I- / HP-J-)
--         and ensure smsFromName column is populated if blank. All columns already exist.

ALTER TABLE "appSettings" ALTER COLUMN "estimatePrefix" SET DEFAULT 'HP-E-';--> statement-breakpoint
ALTER TABLE "appSettings" ALTER COLUMN "invoicePrefix" SET DEFAULT 'HP-I-';--> statement-breakpoint
ALTER TABLE "appSettings" ALTER COLUMN "jobPrefix" SET DEFAULT 'HP-J-';--> statement-breakpoint

-- Backfill existing singleton row if it still has the old EST/INV/JOB defaults.
UPDATE "appSettings" SET "estimatePrefix" = 'HP-E-' WHERE "estimatePrefix" = 'EST';--> statement-breakpoint
UPDATE "appSettings" SET "invoicePrefix" = 'HP-I-' WHERE "invoicePrefix" = 'INV';--> statement-breakpoint
UPDATE "appSettings" SET "jobPrefix" = 'HP-J-' WHERE "jobPrefix" = 'JOB';
