-- HCP import schema extensions for MySQL (prod)
-- Mirrors the Postgres-side migration that shipped with commit 59a5c28, but targets MySQL/Railway.
-- All columns nullable; unique indexes on hcpExternalId WHERE NOT NULL prevent dup re-imports.

ALTER TABLE customers ADD COLUMN hcpExternalId VARCHAR(64) NULL;
ALTER TABLE customers ADD COLUMN hcpRaw TEXT NULL;
ALTER TABLE customers ADD UNIQUE KEY ux_customers_hcp (hcpExternalId);

ALTER TABLE properties ADD COLUMN hcpExternalId VARCHAR(64) NULL;
ALTER TABLE properties ADD COLUMN hcpRaw TEXT NULL;
ALTER TABLE properties ADD UNIQUE KEY ux_properties_hcp (hcpExternalId);

ALTER TABLE opportunities ADD COLUMN hcpExternalId VARCHAR(64) NULL;
ALTER TABLE opportunities ADD COLUMN hcpRaw TEXT NULL;
ALTER TABLE opportunities ADD COLUMN leadSource VARCHAR(64) NULL;
ALTER TABLE opportunities ADD UNIQUE KEY ux_opportunities_hcp (hcpExternalId);

ALTER TABLE invoices ADD COLUMN hcpExternalId VARCHAR(64) NULL;
ALTER TABLE invoices ADD COLUMN hcpRaw TEXT NULL;
ALTER TABLE invoices MODIFY opportunityId VARCHAR(64) NULL;
ALTER TABLE invoices ADD UNIQUE KEY ux_invoices_hcp (hcpExternalId);

ALTER TABLE invoiceLineItems ADD COLUMN hcpExternalId VARCHAR(64) NULL;
ALTER TABLE invoiceLineItems ADD COLUMN hcpRaw TEXT NULL;

ALTER TABLE invoicePayments ADD COLUMN hcpExternalId VARCHAR(64) NULL;
ALTER TABLE invoicePayments ADD COLUMN hcpRaw TEXT NULL;

ALTER TABLE scheduleEvents ADD COLUMN hcpExternalId VARCHAR(64) NULL;
ALTER TABLE scheduleEvents ADD COLUMN hcpRaw TEXT NULL;
