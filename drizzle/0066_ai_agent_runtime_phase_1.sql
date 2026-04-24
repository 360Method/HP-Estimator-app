-- 0065_ai_agent_runtime_phase_1.sql
-- Phase 1 of the in-app AI agent runtime. Adds six new tables:
--   ai_agents, ai_agent_tools, ai_agent_tasks, ai_agent_runs, ai_agent_handoffs, kpi_metrics
-- No seed data — Phase 3 will populate agents. Hierarchy:
--   Visionary (Marcin) → Integrator AI → 8 Department Heads → sub-agents + humans.
-- isDepartmentHead flag lets the UI filter + layout the Head tier without tree walks.

CREATE TABLE IF NOT EXISTS `ai_agents` (
  `id` int AUTO_INCREMENT NOT NULL,
  `seatName` varchar(80) NOT NULL,
  `department` enum('sales','operations','marketing','finance','customer_success','vendor_network','technology','strategy','integrator') NOT NULL,
  `role` text NOT NULL,
  `systemPrompt` text NOT NULL,
  `model` varchar(40) NOT NULL DEFAULT 'claude-haiku-4-5-20251001',
  `status` enum('draft_queue','autonomous','paused','disabled') NOT NULL DEFAULT 'draft_queue',
  `reportsToSeatId` int,
  `isDepartmentHead` boolean NOT NULL DEFAULT false,
  `costCapDailyUsd` decimal(6,2) NOT NULL DEFAULT '5.00',
  `runLimitDaily` int NOT NULL DEFAULT 200,
  `lastRunAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `ai_agents_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_agent_tools` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `toolKey` varchar(80) NOT NULL,
  `authorized` boolean NOT NULL DEFAULT true,
  `notes` text,
  CONSTRAINT `ai_agent_tools_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_agent_tasks` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `triggerType` enum('event','schedule','manual','delegated') NOT NULL,
  `triggerPayload` text,
  `status` enum('queued','running','awaiting_approval','approved','rejected','completed','failed') NOT NULL DEFAULT 'queued',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `startedAt` timestamp NULL,
  `completedAt` timestamp NULL,
  CONSTRAINT `ai_agent_tasks_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_agent_runs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `taskId` int NOT NULL,
  `agentId` int NOT NULL,
  `input` text,
  `output` text,
  `toolCalls` text,
  `inputTokens` int NOT NULL DEFAULT 0,
  `outputTokens` int NOT NULL DEFAULT 0,
  `costUsd` decimal(10,4) NOT NULL DEFAULT '0.0000',
  `durationMs` int NOT NULL DEFAULT 0,
  `status` enum('success','failed','tool_error','cost_exceeded','timed_out') NOT NULL,
  `errorMessage` text,
  `approvedByUserId` int,
  `approvedAt` timestamp NULL,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `ai_agent_runs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_agent_handoffs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `fromAgentId` int NOT NULL,
  `toAgentId` int NOT NULL,
  `taskId` int NOT NULL,
  `reason` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `ai_agent_handoffs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `kpi_metrics` (
  `id` int AUTO_INCREMENT NOT NULL,
  `scope` enum('seat','department','company') NOT NULL,
  `scopeId` int,
  `scopeKey` varchar(40),
  `key` varchar(80) NOT NULL,
  `value` decimal(14,4) NOT NULL,
  `unit` varchar(20) NOT NULL DEFAULT 'count',
  `period` enum('realtime','daily','weekly','monthly','trailing_30','trailing_90','trailing_365') NOT NULL DEFAULT 'realtime',
  `computedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `sourceTaskId` int,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `kpi_metrics_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ai_agent_tools_agentId_idx` ON `ai_agent_tools` (`agentId`);
--> statement-breakpoint
CREATE INDEX `ai_agent_tasks_agentId_status_idx` ON `ai_agent_tasks` (`agentId`, `status`);
--> statement-breakpoint
CREATE INDEX `ai_agent_runs_agentId_createdAt_idx` ON `ai_agent_runs` (`agentId`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `ai_agent_runs_taskId_idx` ON `ai_agent_runs` (`taskId`);
--> statement-breakpoint
CREATE INDEX `kpi_metrics_scope_key_idx` ON `kpi_metrics` (`scope`, `scopeId`, `scopeKey`, `key`, `computedAt`);
