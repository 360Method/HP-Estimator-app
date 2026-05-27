-- Migration 0075: Agent Teams — foundation for the Visionary Console.
-- One agent_teams row per ai_agents department; members, tasks, messages,
-- and inter-team handoffs hang off the team. The Visionary Console at
-- /admin/visionary uses these tables to coordinate cross-department work
-- without depending on the external Dispatch tool.
--
-- No FK constraints (matching the Phase 1 / Phase 4 runtime style — see
-- 0066_ai_agent_runtime_phase_1.sql). Columns referencing ai_agents.id and
-- agent_teams.id are plain ints; integrity is enforced by the application layer.

-- ── agent_teams ───────────────────────────────────────────────────────────────
-- 8 base teams seeded at boot (one per non-integrator department). The
-- integrator team is created lazily if Marcin pins something to it.

CREATE TABLE IF NOT EXISTS `agent_teams` (
  `id`               int          NOT NULL AUTO_INCREMENT,
  `department`       enum(
                       'sales',
                       'operations',
                       'marketing',
                       'finance',
                       'customer_success',
                       'vendor_network',
                       'technology',
                       'strategy',
                       'integrator'
                     ) NOT NULL,
  `name`             varchar(120) NOT NULL,
  `teamLeadSeatId`   int          NULL COMMENT 'FK ai_agents.id; null until Phase 2 populates',
  `purpose`          text         NULL,
  `status`           enum('active','paused') NOT NULL DEFAULT 'active',
  `createdAt`        timestamp    NOT NULL DEFAULT (now()),
  `updatedAt`        timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `agent_teams_id`             PRIMARY KEY (`id`),
  CONSTRAINT `agent_teams_department_uniq` UNIQUE (`department`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

-- ── agent_team_members ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS `agent_team_members` (
  `id`        int       NOT NULL AUTO_INCREMENT,
  `teamId`    int       NOT NULL,
  `seatId`    int       NOT NULL COMMENT 'FK ai_agents.id',
  `role`      enum('frontend','backend','qa','lead') NOT NULL DEFAULT 'backend',
  `joinedAt`  timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `agent_team_members_id`         PRIMARY KEY (`id`),
  CONSTRAINT `agent_team_members_team_seat_uniq` UNIQUE (`teamId`, `seatId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `agent_team_members_seat_idx` ON `agent_team_members` (`seatId`);--> statement-breakpoint

-- ── agent_team_tasks ──────────────────────────────────────────────────────────
-- Customer-centric: when a task involves a customer, customerId is set so
-- the task surfaces inside the customer profile alongside other agent work.

CREATE TABLE IF NOT EXISTS `agent_team_tasks` (
  `id`                   int          NOT NULL AUTO_INCREMENT,
  `teamId`               int          NOT NULL,
  `title`                varchar(255) NOT NULL,
  `description`          text         NULL,
  `status`               enum('open','claimed','in_progress','blocked','done')
                                      NOT NULL DEFAULT 'open',
  `claimedBySeatId`      int          NULL COMMENT 'FK ai_agents.id',
  `ownerFiles`           text         NULL COMMENT 'JSON array of file paths',
  `sourceEventType`      varchar(80)  NULL,
  `sourceEventPayload`   text         NULL COMMENT 'JSON',
  `customerId`           varchar(64)  NULL COMMENT 'FK customers.id when applicable',
  `priority`             enum('low','normal','high') NOT NULL DEFAULT 'normal',
  `dueAt`                timestamp    NULL,
  `completedAt`          timestamp    NULL,
  `notes`                text         NULL COMMENT 'Append-only status update log',
  `createdAt`            timestamp    NOT NULL DEFAULT (now()),
  CONSTRAINT `agent_team_tasks_id` PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `agent_team_tasks_team_status_idx`  ON `agent_team_tasks` (`teamId`, `status`);--> statement-breakpoint
CREATE INDEX `agent_team_tasks_customer_idx`     ON `agent_team_tasks` (`customerId`);--> statement-breakpoint
CREATE INDEX `agent_team_tasks_claimedBy_idx`    ON `agent_team_tasks` (`claimedBySeatId`);--> statement-breakpoint

-- ── agent_team_messages ───────────────────────────────────────────────────────
-- toSeatId NULL = broadcast to whole team. threadId is a self-FK by id; the
-- root message has threadId = NULL.

CREATE TABLE IF NOT EXISTS `agent_team_messages` (
  `id`           int       NOT NULL AUTO_INCREMENT,
  `teamId`       int       NOT NULL,
  `fromSeatId`   int       NOT NULL COMMENT 'FK ai_agents.id',
  `toSeatId`     int       NULL     COMMENT 'FK ai_agents.id, null = broadcast',
  `body`         text      NOT NULL,
  `threadId`     int       NULL,
  `attachments`  text      NULL COMMENT 'JSON',
  `createdAt`    timestamp NOT NULL DEFAULT (now()),
  CONSTRAINT `agent_team_messages_id` PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `agent_team_messages_team_created_idx` ON `agent_team_messages` (`teamId`, `createdAt`);--> statement-breakpoint
CREATE INDEX `agent_team_messages_thread_idx`       ON `agent_team_messages` (`threadId`);--> statement-breakpoint

-- ── agent_team_handoffs ───────────────────────────────────────────────────────
-- Inter-team handoffs explicitly modeled (vs. ai_agent_handoffs which is
-- seat-to-seat). The Integrator brokers these from the Visionary Console.

CREATE TABLE IF NOT EXISTS `agent_team_handoffs` (
  `id`             int          NOT NULL AUTO_INCREMENT,
  `fromTeamId`     int          NOT NULL,
  `toTeamId`       int          NOT NULL,
  `eventType`      varchar(80)  NOT NULL,
  `payload`        text         NULL COMMENT 'JSON',
  `status`         enum('pending','accepted','declined') NOT NULL DEFAULT 'pending',
  `declineReason`  text         NULL,
  `acceptedAt`     timestamp    NULL,
  `declinedAt`     timestamp    NULL,
  `createdAt`      timestamp    NOT NULL DEFAULT (now()),
  CONSTRAINT `agent_team_handoffs_id` PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `agent_team_handoffs_to_status_idx`   ON `agent_team_handoffs` (`toTeamId`, `status`);--> statement-breakpoint
CREATE INDEX `agent_team_handoffs_from_status_idx` ON `agent_team_handoffs` (`fromTeamId`, `status`);
