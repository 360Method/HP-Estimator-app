-- 0065_agent_drafts.sql
-- Post-Roadmap follow-up nurture sequence — drafts inbox + editable playbooks.
--
-- Tables:
--   agentDrafts     — every queued or generated message a Lead Nurturer agent
--                     produces. Pending rows have scheduledFor in the future
--                     and no body yet; ready rows have body and await operator
--                     approval; sent rows are archived.
--   agentPlaybooks  — operator-editable cadence definitions (key, stepsJson).
--                     The roadmap_followup playbook is seeded by a boot-time
--                     ensureAgentPlaybooks() in server/_core/index.ts.
--
-- Customer-level bypass:
--   customers.bypassAutoNurture — when true, scheduleRoadmapFollowup short-
--                     circuits and the Lead Nurturer agent only acts on
--                     manual triggers.
--
-- Defensive: mirrors 0054/0064 — guards against drizzle tracker divergence
-- from prod DB so re-running the migration is safe on already-patched envs.

CREATE TABLE IF NOT EXISTS `agentDrafts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `customerId` varchar(64) NOT NULL,
  `opportunityId` varchar(64),
  `playbookKey` varchar(64) NOT NULL,
  `stepKey` varchar(64) NOT NULL,
  `channel` varchar(16) NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'pending',
  `scheduledFor` timestamp NOT NULL,
  `subject` varchar(255),
  `body` text,
  `recipientEmail` varchar(320),
  `recipientPhone` varchar(32),
  `contextJson` text,
  `assigneeUserId` int,
  `cancelReason` varchar(64),
  `generatedAt` timestamp NULL,
  `sentAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `agentDrafts_customer_idx` (`customerId`),
  KEY `agentDrafts_status_sched_idx` (`status`, `scheduledFor`),
  KEY `agentDrafts_playbook_idx` (`playbookKey`)
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `agentPlaybooks` (
  `id` int NOT NULL AUTO_INCREMENT,
  `key` varchar(64) NOT NULL,
  `displayName` varchar(255) NOT NULL,
  `description` text,
  `enabled` boolean NOT NULL DEFAULT 1,
  `stepsJson` text NOT NULL,
  `voiceRulesJson` text,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `agentPlaybooks_key_uniq` (`key`)
);
--> statement-breakpoint

-- customers.bypassAutoNurture (defensive add — the boot-time ensure fallback
-- is in server/_core/index.ts so this can be a no-op if the column exists).
SET @customersExists = (
  SELECT COUNT(*) FROM information_schema.tables
  WHERE table_schema = DATABASE() AND table_name = 'customers'
);
--> statement-breakpoint
SET @colExists = (
  SELECT COUNT(*) FROM information_schema.columns
  WHERE table_schema = DATABASE()
    AND table_name = 'customers'
    AND column_name = 'bypassAutoNurture'
);
--> statement-breakpoint
SET @sql = IF(@customersExists > 0 AND @colExists = 0,
  'ALTER TABLE `customers` ADD COLUMN `bypassAutoNurture` boolean NOT NULL DEFAULT 0',
  'DO 0');
--> statement-breakpoint
PREPARE stmt FROM @sql;
--> statement-breakpoint
EXECUTE stmt;
--> statement-breakpoint
DEALLOCATE PREPARE stmt;
