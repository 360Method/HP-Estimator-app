-- 0055_phone_forwarding.sql
-- Set phoneSettings defaults so new deployments (and the existing singleton)
-- forward business-hours calls to Marcin's cell and route after-hours to voicemail.

ALTER TABLE "phoneSettings" ALTER COLUMN "forwardingNumber" SET DEFAULT '+13602179444';--> statement-breakpoint
ALTER TABLE "phoneSettings" ALTER COLUMN "afterHoursEnabled" SET DEFAULT true;--> statement-breakpoint
ALTER TABLE "phoneSettings" ALTER COLUMN "businessHoursStart" SET DEFAULT '08:00';--> statement-breakpoint
ALTER TABLE "phoneSettings" ALTER COLUMN "businessHoursEnd" SET DEFAULT '18:00';--> statement-breakpoint
ALTER TABLE "phoneSettings" ALTER COLUMN "businessDays" SET DEFAULT '1,2,3,4,5';--> statement-breakpoint

-- Backfill the existing singleton if it was seeded with blanks/old values.
UPDATE "phoneSettings" SET "forwardingNumber" = '+13602179444' WHERE "id" = 1 AND ("forwardingNumber" IS NULL OR "forwardingNumber" = '');--> statement-breakpoint
UPDATE "phoneSettings" SET "afterHoursEnabled" = true WHERE "id" = 1 AND "afterHoursEnabled" = false;--> statement-breakpoint
UPDATE "phoneSettings" SET "businessHoursEnd" = '18:00' WHERE "id" = 1 AND "businessHoursEnd" = '17:00';
