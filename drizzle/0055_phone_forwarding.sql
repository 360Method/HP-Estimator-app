-- 0055_phone_forwarding.sql
-- Seed phoneSettings with Marcin's cell as forwarding target + business-hours
-- defaults. Backfill the singleton row if it already exists with blanks.

UPDATE `phoneSettings` SET `forwardingNumber` = '+13602179444'
  WHERE `id` = 1 AND (`forwardingNumber` IS NULL OR `forwardingNumber` = '');
--> statement-breakpoint
UPDATE `phoneSettings` SET `afterHoursEnabled` = true
  WHERE `id` = 1 AND `afterHoursEnabled` = false;
--> statement-breakpoint
UPDATE `phoneSettings` SET `businessHoursEnd` = '18:00'
  WHERE `id` = 1 AND `businessHoursEnd` = '17:00';
