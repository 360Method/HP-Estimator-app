-- 0080_funnel_column.sql
-- Adds the `funnel` column to `onlineRequests`. PR #83 added the column to
-- drizzle/schema.ts but no migration SQL was generated, so prod INSERTs from
-- /api/public/inquiry were silently failing on unknown column.
--
-- Conditional ALTER via INFORMATION_SCHEMA so re-runs and out-of-band manual
-- applies (e.g. a hand-run db:push from a teammate) don't break the migration
-- tracker.

SET @col_exists := (
  SELECT COUNT(*)
  FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'onlineRequests'
    AND COLUMN_NAME = 'funnel'
);
SET @ddl := IF(
  @col_exists = 0,
  'ALTER TABLE `onlineRequests` ADD COLUMN `funnel` varchar(32) DEFAULT ''project''',
  'SELECT 1'
);
PREPARE stmt FROM @ddl;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;
