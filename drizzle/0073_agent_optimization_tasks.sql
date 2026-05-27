-- Phase 5 — Agent engine self-optimization. System Integrity hourly cron
-- writes anomaly flags here for Marcin to acknowledge from /admin/agents/control.
-- Boot-time `ensureOptimizationTasksTable` mirrors this DDL idempotently in
-- case drizzle-kit's tracker has drifted from prod (per the project's known
-- migration drift pattern — same defensive ensure as ensurePhoneTables et al).

CREATE TABLE IF NOT EXISTS `agent_optimization_tasks` (
    `id` int AUTO_INCREMENT NOT NULL,
    `agentId` int NOT NULL,
    `seatName` varchar(80) NOT NULL,
    `kind` varchar(40) NOT NULL,
    `title` varchar(255) NOT NULL,
    `details` text,
    `severity` enum('info','warn','critical') NOT NULL DEFAULT 'info',
    `dayKey` varchar(10) NOT NULL,
    `status` enum('open','acknowledged','dismissed','applied') NOT NULL DEFAULT 'open',
    `reviewedByUserId` int,
    `reviewedAt` timestamp NULL,
    `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT `agent_optimization_tasks_id` PRIMARY KEY(`id`),
    CONSTRAINT `agent_optimization_tasks_unique_per_day` UNIQUE(`agentId`, `kind`, `dayKey`)
);
