-- 0064_portal_continuity_flag.sql
-- Adds `portalContinuityEnabled` boolean (default 1) to appSettings.
-- Powers the portal continuity surfaces (project-complete nudge, estimate tier hint,
-- invoice compounding-value module, scheduling baseline add-on, home-health widget).
-- Set to 0 to globally disable all continuity surfaces without a redeploy.
--
-- Defensive: mirrors 0054's pattern — if appSettings is missing or the column
-- already exists (drizzle tracker divergence vs. actual prod DB), skip silently.

SET @appSettingsExists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'appSettings'
);
--> statement-breakpoint
SET @colExists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'appSettings'
    AND column_name = 'portalContinuityEnabled'
);
--> statement-breakpoint
SET @sql = IF(@appSettingsExists > 0 AND @colExists = 0,
  'ALTER TABLE `appSettings` ADD COLUMN `portalContinuityEnabled` boolean NOT NULL DEFAULT 1',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
