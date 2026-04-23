-- 0050_hcp_import: bridge columns for Housecall Pro migration
-- Adds hcpExternalId (dedupe key) and hcpRaw (stashed original JSON) to tables we import into.
-- Adds leadSource to opportunities.
-- Relaxes invoices.opportunityId NOT NULL to allow orphan HCP invoices (rare).

ALTER TABLE "customers"          ADD COLUMN IF NOT EXISTS "hcpExternalId" varchar(64);
ALTER TABLE "customers"          ADD COLUMN IF NOT EXISTS "hcpRaw" text;
CREATE UNIQUE INDEX IF NOT EXISTS "customers_hcp_ext_idx" ON "customers"("hcpExternalId") WHERE "hcpExternalId" IS NOT NULL;

ALTER TABLE "properties"         ADD COLUMN IF NOT EXISTS "hcpExternalId" varchar(64);
ALTER TABLE "properties"         ADD COLUMN IF NOT EXISTS "hcpRaw" text;
CREATE UNIQUE INDEX IF NOT EXISTS "properties_hcp_ext_idx" ON "properties"("hcpExternalId") WHERE "hcpExternalId" IS NOT NULL;

ALTER TABLE "opportunities"      ADD COLUMN IF NOT EXISTS "hcpExternalId" varchar(64);
ALTER TABLE "opportunities"      ADD COLUMN IF NOT EXISTS "hcpRaw" text;
ALTER TABLE "opportunities"      ADD COLUMN IF NOT EXISTS "leadSource" varchar(128);
CREATE UNIQUE INDEX IF NOT EXISTS "opportunities_hcp_ext_idx" ON "opportunities"("hcpExternalId") WHERE "hcpExternalId" IS NOT NULL;

ALTER TABLE "invoices"           ADD COLUMN IF NOT EXISTS "hcpExternalId" varchar(64);
ALTER TABLE "invoices"           ADD COLUMN IF NOT EXISTS "hcpRaw" text;
CREATE UNIQUE INDEX IF NOT EXISTS "invoices_hcp_ext_idx" ON "invoices"("hcpExternalId") WHERE "hcpExternalId" IS NOT NULL;
ALTER TABLE "invoices" ALTER COLUMN "opportunityId" DROP NOT NULL;

ALTER TABLE "invoiceLineItems"   ADD COLUMN IF NOT EXISTS "hcpExternalId" varchar(64);
ALTER TABLE "invoiceLineItems"   ADD COLUMN IF NOT EXISTS "hcpRaw" text;
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_line_items_hcp_ext_idx" ON "invoiceLineItems"("hcpExternalId") WHERE "hcpExternalId" IS NOT NULL;

ALTER TABLE "invoicePayments"    ADD COLUMN IF NOT EXISTS "hcpExternalId" varchar(64);
ALTER TABLE "invoicePayments"    ADD COLUMN IF NOT EXISTS "hcpRaw" text;
CREATE UNIQUE INDEX IF NOT EXISTS "invoice_payments_hcp_ext_idx" ON "invoicePayments"("hcpExternalId") WHERE "hcpExternalId" IS NOT NULL;

ALTER TABLE "scheduleEvents"     ADD COLUMN IF NOT EXISTS "hcpExternalId" varchar(64);
ALTER TABLE "scheduleEvents"     ADD COLUMN IF NOT EXISTS "hcpRaw" text;
CREATE UNIQUE INDEX IF NOT EXISTS "schedule_events_hcp_ext_idx" ON "scheduleEvents"("hcpExternalId") WHERE "hcpExternalId" IS NOT NULL;
