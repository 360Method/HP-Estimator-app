-- 0065_portal_native_replies.sql
-- Adds reply-token attribution columns to `messages` so inbound Gmail replies
-- and portal-native replies can route back to the right opportunity, plus a
-- new `orphanEmails` table for inbound emails whose sender doesn't match a
-- customer and which carry no reply-token (operator manually attributes them
-- from /admin/orphan-emails).
--
-- Defensive: matches 0064's pattern. drizzle tracker may diverge from prod DB
-- (per memory note), so add columns / create table only if missing.

SET @msgExists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'messages'
);
--> statement-breakpoint
SET @replyTokenExists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'replyToken'
);
--> statement-breakpoint
SET @sql1 = IF(@msgExists > 0 AND @replyTokenExists = 0,
  'ALTER TABLE `messages` ADD COLUMN `replyToken` varchar(64) NULL',
  'DO 0');
--> statement-breakpoint
PREPARE s1 FROM @sql1;
--> statement-breakpoint
EXECUTE s1;
--> statement-breakpoint
DEALLOCATE PREPARE s1;
--> statement-breakpoint
SET @oppIdExists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'opportunityId'
);
--> statement-breakpoint
SET @sql2 = IF(@msgExists > 0 AND @oppIdExists = 0,
  'ALTER TABLE `messages` ADD COLUMN `opportunityId` varchar(64) NULL',
  'DO 0');
--> statement-breakpoint
PREPARE s2 FROM @sql2;
--> statement-breakpoint
EXECUTE s2;
--> statement-breakpoint
DEALLOCATE PREPARE s2;
--> statement-breakpoint
SET @portalReplyExists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'isPortalReply'
);
--> statement-breakpoint
SET @sql3 = IF(@msgExists > 0 AND @portalReplyExists = 0,
  'ALTER TABLE `messages` ADD COLUMN `isPortalReply` boolean NOT NULL DEFAULT 0',
  'DO 0');
--> statement-breakpoint
PREPARE s3 FROM @sql3;
--> statement-breakpoint
EXECUTE s3;
--> statement-breakpoint
DEALLOCATE PREPARE s3;
--> statement-breakpoint
SET @threadRootExists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'messages' AND column_name = 'threadRootId'
);
--> statement-breakpoint
SET @sql4 = IF(@msgExists > 0 AND @threadRootExists = 0,
  'ALTER TABLE `messages` ADD COLUMN `threadRootId` int NULL',
  'DO 0');
--> statement-breakpoint
PREPARE s4 FROM @sql4;
--> statement-breakpoint
EXECUTE s4;
--> statement-breakpoint
DEALLOCATE PREPARE s4;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `orphanEmails` (
  `id` int AUTO_INCREMENT NOT NULL,
  `gmailMessageId` varchar(128) NOT NULL,
  `gmailThreadId` varchar(128),
  `fromEmail` varchar(320) NOT NULL,
  `fromName` varchar(255),
  `subject` varchar(512),
  `body` text,
  `resolvedAt` timestamp NULL,
  `resolvedCustomerId` varchar(64),
  `receivedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `orphanEmails_id` PRIMARY KEY(`id`),
  CONSTRAINT `orphanEmails_gmailMessageId_unique` UNIQUE(`gmailMessageId`)
);
