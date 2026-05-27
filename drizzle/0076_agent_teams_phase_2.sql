-- Migration 0076: Agent Teams — Phase 2 (Visionary Console).
-- Allows multiple sub-teams per department (Sales splits into Lead Nurturer +
-- Project Estimator + Membership Success; Marketing into Content/SEO + Paid Ads
-- + Brand Guardian + Community/Reviews). Adds team-level cost cap.
--
-- Also creates `agent_team_artifacts` — territory-scoped output store so the
-- 3-teammate "own territory / direct messages / parallel start" pattern can
-- enforce who-writes-what. Frontend writes drafts/, Backend writes data/, QA
-- writes audits/.
--
-- Boot guard `ensureAgentTeamTables()` mirrors all of this and is the authoritative
-- runtime path; this migration is for drizzle-kit parity. Production prod-DB state
-- is updated by the boot guard on next deploy.

-- 1. Drop the old single-team-per-department UNIQUE so we can have multiple
--    teams in the same department. Replaced by UNIQUE(department, name).
ALTER TABLE `agent_teams` DROP INDEX `agent_teams_department_uniq`;--> statement-breakpoint
ALTER TABLE `agent_teams` ADD CONSTRAINT `agent_teams_dept_name_uniq` UNIQUE (`department`, `name`);--> statement-breakpoint

-- 2. Per-team daily cost ceiling. Coordinator pauses task assignment when hit.
ALTER TABLE `agent_teams` ADD COLUMN `costCapDailyUsd` DECIMAL(8,2) NOT NULL DEFAULT 5.00;--> statement-breakpoint

-- 3. agent_team_artifacts — territory-scoped output written by team members.
CREATE TABLE IF NOT EXISTS `agent_team_artifacts` (
  `id`             int          NOT NULL AUTO_INCREMENT,
  `taskId`         int          NOT NULL,
  `teamId`         int          NOT NULL,
  `fromSeatId`     int          NOT NULL COMMENT 'FK ai_agents.id of writer',
  `territory`      enum('drafts','data','audits') NOT NULL,
  `key`            varchar(120) NOT NULL COMMENT 'Artifact key, scoped to (taskId, territory)',
  `contentJson`    text         NOT NULL,
  `createdAt`      timestamp    NOT NULL DEFAULT (now()),
  CONSTRAINT `agent_team_artifacts_id` PRIMARY KEY (`id`),
  CONSTRAINT `agent_team_artifacts_task_terr_key_uniq` UNIQUE (`taskId`, `territory`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `agent_team_artifacts_task_idx` ON `agent_team_artifacts` (`taskId`);--> statement-breakpoint
CREATE INDEX `agent_team_artifacts_team_idx` ON `agent_team_artifacts` (`teamId`);--> statement-breakpoint

-- 4. agent_team_violations — audit log when a tool tries to write outside
--    its territory (e.g. backend trying to write into drafts/).
CREATE TABLE IF NOT EXISTS `agent_team_violations` (
  `id`              int          NOT NULL AUTO_INCREMENT,
  `taskId`          int          NULL,
  `teamId`          int          NOT NULL,
  `seatId`          int          NOT NULL COMMENT 'FK ai_agents.id of attempted writer',
  `attemptedRole`   varchar(40)  NOT NULL,
  `attemptedTerritory` varchar(40) NOT NULL,
  `attemptedKey`    varchar(255) NULL,
  `reason`          text         NULL,
  `createdAt`       timestamp    NOT NULL DEFAULT (now()),
  CONSTRAINT `agent_team_violations_id` PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `agent_team_violations_team_idx` ON `agent_team_violations` (`teamId`, `createdAt`);
