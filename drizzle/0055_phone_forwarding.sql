-- 0055_phone_forwarding.sql
-- Seed phoneSettings with Marcin's cell as forwarding target + business-hours
-- defaults. Backfill the singleton row if it already exists with blanks.
-- Defensive: if `phoneSettings` table is missing in prod DB (drizzle tracker
-- divergence), skip without erroring. The phone flow already has an
-- env-variable fallback (FORWARD_TO_NUMBER/OWNER_PHONE), so the seed is
-- best-effort.

SET @phoneSettingsExists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'phoneSettings'
);
--> statement-breakpoint
SET @sql = IF(@phoneSettingsExists > 0,
  'UPDATE `phoneSettings` SET `forwardingNumber` = ''+13602179444'' WHERE `id` = 1 AND (`forwardingNumber` IS NULL OR `forwardingNumber` = '''')',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = IF(@phoneSettingsExists > 0,
  'UPDATE `phoneSettings` SET `afterHoursEnabled` = true WHERE `id` = 1 AND `afterHoursEnabled` = false',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
--> statement-breakpoint
SET @sql = IF(@phoneSettingsExists > 0,
  'UPDATE `phoneSettings` SET `businessHoursEnd` = ''18:00'' WHERE `id` = 1 AND `businessHoursEnd` = ''17:00''',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
