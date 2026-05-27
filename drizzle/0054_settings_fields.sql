-- 0054_settings_fields.sql
-- Update appSettings document-number prefixes from EST/INV/JOB to HP-E-/HP-I-/HP-J-.
-- Defensive: if `appSettings` table is missing (drizzle tracker divergence in
-- prod DB), skip without erroring. Uses INFORMATION_SCHEMA + PREPARE so the
-- deploy migration step doesn't fail on environments where earlier migrations
-- were recorded but never actually ran.

SET @appSettingsExists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'appSettings'
);
--> statement-breakpoint
SET @sql = IF(@appSettingsExists > 0,
  'UPDATE `appSettings` SET `estimatePrefix` = ''HP-E-'' WHERE `estimatePrefix` = ''EST''',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = IF(@appSettingsExists > 0,
  'UPDATE `appSettings` SET `invoicePrefix` = ''HP-I-'' WHERE `invoicePrefix` = ''INV''',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = IF(@appSettingsExists > 0,
  'UPDATE `appSettings` SET `jobPrefix` = ''HP-J-'' WHERE `jobPrefix` = ''JOB''',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
