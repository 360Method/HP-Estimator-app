-- Migration 0066: Charter runtime tables — stores structured charter content,
-- KPI definitions, and playbook templates so operators can edit agent behavior
-- from the admin UI without touching code (Nucleus pattern).

-- ── agent_charters ────────────────────────────────────────────────────────────
-- One row per department (8 departments + 1 integrator-visionary = 9 rows max).
-- Full markdown content is loaded into each agent's system prompt at runtime
-- (only the relevant seat section, not the full doc).

CREATE TABLE IF NOT EXISTS `agentCharters` (
  `id`               int          NOT NULL AUTO_INCREMENT,
  `department`       varchar(50)  NOT NULL UNIQUE,
  `markdownContent`  longtext     NOT NULL,
  `version`          int          NOT NULL DEFAULT 1,
  `updatedAt`        timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `updatedByStaffId` int,
  CONSTRAINT `agentCharters_id` PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

-- ── agent_kpis ────────────────────────────────────────────────────────────────
-- One row per KPI per seat (or department, or company-level).
-- Seeded from the "KPIs" tables in each charter doc.
-- source_query is optional SQL or formula; NULL means manual tracking.

CREATE TABLE IF NOT EXISTS `agentKpis` (
  `id`          int                                          NOT NULL AUTO_INCREMENT,
  `scopeType`   enum('seat','department','company')          NOT NULL,
  `scopeId`     varchar(100)                                 NOT NULL COMMENT 'seatName or department slug',
  `key`         varchar(100)                                 NOT NULL,
  `label`       varchar(200)                                 NOT NULL,
  `targetMin`   decimal(10,2),
  `targetMax`   decimal(10,2),
  `unit`        varchar(20)                                  NOT NULL COMMENT '%, $, days, count, hours, minutes',
  `period`      enum('daily','weekly','monthly','quarterly') NOT NULL,
  `sourceQuery` text                                         COMMENT 'Optional SQL or formula for automated measurement',
  `createdAt`   timestamp                                    NOT NULL DEFAULT (now()),
  CONSTRAINT `agentKpis_id`          PRIMARY KEY (`id`),
  CONSTRAINT `agentKpis_scope_key`   UNIQUE (`scopeType`, `scopeId`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `agentKpis_scopeId_idx` ON `agentKpis` (`scopeId`);--> statement-breakpoint

-- ── agent_playbooks ───────────────────────────────────────────────────────────
-- Paste-ready templates seeded from each charter's "Initial Playbook Library".
-- Agents fetch these by slug at runtime using playbooks.get(slug).
-- variables is a JSON array of {{placeholder}} names found in content.

CREATE TABLE IF NOT EXISTS `agentPlaybooks` (
  `id`               int          NOT NULL AUTO_INCREMENT,
  `ownerSeatName`    varchar(100) NOT NULL,
  `ownerDepartment`  varchar(50)  NOT NULL,
  `name`             varchar(200) NOT NULL,
  `slug`             varchar(200) NOT NULL UNIQUE,
  `content`          mediumtext   NOT NULL,
  `variables`        text         COMMENT 'JSON array of variable names',
  `category`         varchar(50)  NOT NULL COMMENT 'email, sms, internal-memo, decision-tree',
  `version`          int          NOT NULL DEFAULT 1,
  `updatedAt`        timestamp    NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  `updatedByStaffId` int,
  CONSTRAINT `agentPlaybooks_id` PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;--> statement-breakpoint

CREATE INDEX `agentPlaybooks_seat_idx`       ON `agentPlaybooks` (`ownerSeatName`);--> statement-breakpoint
CREATE INDEX `agentPlaybooks_department_idx` ON `agentPlaybooks` (`ownerDepartment`);
