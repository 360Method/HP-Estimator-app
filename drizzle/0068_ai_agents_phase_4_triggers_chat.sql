-- 0068_ai_agents_phase_4_triggers_chat.sql
-- Phase 4: flips agents from manual-only to autonomous 24/7.
--   ai_agent_event_subscriptions  — event → agent fanout (e.g. lead.created → Lead Nurturer)
--   ai_agent_schedules            — cron schedules per agent
--   integrator_chat_conversations — Marcin's chat sessions with the Integrator
--   integrator_chat_messages      — per-message log w/ tool call traces
--
-- Idempotent. Boot-time `ensureAgentPhase4Tables` in server/_core/index.ts
-- re-creates these on prod even if drizzle-kit's tracker has drifted.

CREATE TABLE IF NOT EXISTS `ai_agent_event_subscriptions` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `eventName` varchar(80) NOT NULL,
  `filter` text,
  `enabled` boolean NOT NULL DEFAULT true,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `ai_agent_event_subscriptions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ai_agent_event_subscriptions_event_idx` ON `ai_agent_event_subscriptions` (`eventName`, `enabled`);
--> statement-breakpoint
CREATE INDEX `ai_agent_event_subscriptions_agent_idx` ON `ai_agent_event_subscriptions` (`agentId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `ai_agent_schedules` (
  `id` int AUTO_INCREMENT NOT NULL,
  `agentId` int NOT NULL,
  `cronExpression` varchar(80) NOT NULL,
  `timezone` varchar(64) NOT NULL DEFAULT 'America/Los_Angeles',
  `enabled` boolean NOT NULL DEFAULT true,
  `lastRunAt` timestamp NULL,
  `nextRunAt` timestamp NULL,
  `payload` text,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `ai_agent_schedules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `ai_agent_schedules_agentId_idx` ON `ai_agent_schedules` (`agentId`);
--> statement-breakpoint
CREATE INDEX `ai_agent_schedules_nextRunAt_idx` ON `ai_agent_schedules` (`enabled`, `nextRunAt`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `integrator_chat_conversations` (
  `id` int AUTO_INCREMENT NOT NULL,
  `userId` int NOT NULL,
  `title` varchar(200),
  `lastMessageAt` timestamp NULL,
  `archived` boolean NOT NULL DEFAULT false,
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `integrator_chat_conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `integrator_chat_conversations_userId_idx` ON `integrator_chat_conversations` (`userId`, `archived`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `integrator_chat_messages` (
  `id` int AUTO_INCREMENT NOT NULL,
  `conversationId` int NOT NULL,
  `userId` int NOT NULL,
  `role` enum('user','assistant','tool') NOT NULL,
  `content` text NOT NULL,
  `toolCalls` text,
  `inputTokens` int NOT NULL DEFAULT 0,
  `outputTokens` int NOT NULL DEFAULT 0,
  `costUsd` decimal(10,4) NOT NULL DEFAULT '0.0000',
  `createdAt` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT `integrator_chat_messages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `integrator_chat_messages_conv_idx` ON `integrator_chat_messages` (`conversationId`, `createdAt`);
--> statement-breakpoint
CREATE INDEX `integrator_chat_messages_user_idx` ON `integrator_chat_messages` (`userId`, `createdAt`);
