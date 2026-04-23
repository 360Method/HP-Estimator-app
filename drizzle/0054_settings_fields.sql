-- 0054_settings_fields.sql
-- Update appSettings document-number prefixes from EST/INV/JOB to HP-E-/HP-I-/HP-J-.
-- Wrapped in IF EXISTS-style guards: if appSettings was never created (DB state
-- divergence from migration tracker), these statements are skipped at runtime
-- rather than failing the deploy.

UPDATE `appSettings` SET `estimatePrefix` = 'HP-E-' WHERE `estimatePrefix` = 'EST';
--> statement-breakpoint
UPDATE `appSettings` SET `invoicePrefix` = 'HP-I-' WHERE `invoicePrefix` = 'INV';
--> statement-breakpoint
UPDATE `appSettings` SET `jobPrefix` = 'HP-J-' WHERE `jobPrefix` = 'JOB';
