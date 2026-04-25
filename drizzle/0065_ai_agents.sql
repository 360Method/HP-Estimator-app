-- Migration 0065: AI Agent registry — stores all 25+ org seats with their
-- system prompts, tool authorizations, event subscriptions, and cron schedules.
-- Human seats use status='human_only'; AI seats use status='draft_queue' until
-- manually activated by Marcin in the admin UI.

CREATE TABLE IF NOT EXISTS `aiAgents` (
  `id`                    int          NOT NULL AUTO_INCREMENT,
  `name`                  varchar(100) NOT NULL,
  `seatName`              varchar(100) NOT NULL UNIQUE,
  `department`            varchar(50)  NOT NULL,
  `agentType`             enum('ai','human','hybrid') NOT NULL DEFAULT 'ai',
  `status`                enum('active','draft_queue','human_only','inactive') NOT NULL DEFAULT 'draft_queue',
  `systemPrompt`          text,
  `tools`                 text         COMMENT 'JSON array of authorized tool names',
  `hierarchyParentSeat`   varchar(100),
  `eventSubscriptions`    text         COMMENT 'JSON array of event names this seat listens to',
  `schedules`             text         COMMENT 'JSON array of {cron, description} objects',
  `charterLoaded`         boolean      NOT NULL DEFAULT false,
  `kpiCount`              int          NOT NULL DEFAULT 0,
  `playbookCount`         int          NOT NULL DEFAULT 0,
  `createdAt`             timestamp    NOT NULL DEFAULT (now()),
  `updatedAt`             timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aiAgents_id` PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `aiAgents_department_idx` ON `aiAgents` (`department`);--> statement-breakpoint
CREATE INDEX `aiAgents_status_idx`     ON `aiAgents` (`status`);
