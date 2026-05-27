-- 0074_agent_drafts_auto_send.sql
-- Bug 1 fix: routine drafts (auto-acks, info-questions, post-approval range
-- delivery) auto-send. Strategic drafts (concierge follow-ups, specific-finding
-- emails, 360° intros, long-term nurture) keep their approval gate.
--
-- The Lead Nurturer worker / projectEstimator immediate-queue paths check this
-- flag after promoting a draft to status='ready'. When true, the draft is
-- dispatched immediately and flipped to status='sent'. When false, it waits in
-- the operator's inbox.
--
-- Defensive: matches the boot-time ensure pattern used for 0054/0064/0065 —
-- the column is added in server/_core/index.ts so prod self-heals on next
-- deploy if drizzle-kit's tracker has drifted.

SET @colExists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'agentDrafts'
    AND column_name = 'draftAutoSend'
);
--> statement-breakpoint
SET @sql = IF(@colExists = 0,
  'ALTER TABLE `agentDrafts` ADD COLUMN `draftAutoSend` boolean NOT NULL DEFAULT 0',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
