-- Migration 0065: Email Manager AI
-- Adds per-staff Gmail token fields, ai_agents seat table, and
-- gmail_message_links for customer-centric email threading.

-- ─── Augment gmailTokens with sync-state + staff link ────────────────────────
ALTER TABLE `gmailTokens`
  ADD COLUMN IF NOT EXISTS `staffUserId`       int            NULL,
  ADD COLUMN IF NOT EXISTS `scopesGranted`     text           NULL,
  ADD COLUMN IF NOT EXISTS `connectedAt`       timestamp      NULL,
  ADD COLUMN IF NOT EXISTS `lastSyncedAt`      timestamp      NULL,
  ADD COLUMN IF NOT EXISTS `lastMessageIdSeen` varchar(128)   NULL;

-- ─── AI Agents (virtual seats) ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS `aiAgents` (
  `id`           int            NOT NULL AUTO_INCREMENT,
  `seatName`     varchar(80)    NOT NULL,
  `department`   varchar(80)    NOT NULL DEFAULT 'integrator_visionary',
  `reportsTo`    varchar(80)    NOT NULL DEFAULT 'Integrator',
  `status`       enum('active','draft_queue','paused') NOT NULL DEFAULT 'draft_queue',
  `systemPrompt` text           NULL,
  `createdAt`    timestamp      NOT NULL DEFAULT (now()),
  `updatedAt`    timestamp      NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `aiAgents_id` PRIMARY KEY (`id`),
  UNIQUE KEY `aiAgents_seatName_uidx` (`seatName`)
);

-- ─── Gmail Message Links (customer-centric email threading) ──────────────────
CREATE TABLE IF NOT EXISTS `gmailMessageLinks` (
  `id`                  int            NOT NULL AUTO_INCREMENT,
  `gmailMessageId`      varchar(128)   NOT NULL,
  `gmailThreadId`       varchar(128)   NULL,
  `staffGmailEmail`     varchar(320)   NOT NULL,
  `customerId`          varchar(64)    NULL,
  `classification`      enum('customer','urgent','promo','spam','personal','lead_inquiry','unclassified') NOT NULL DEFAULT 'unclassified',
  `classificationScore` int            NOT NULL DEFAULT 0,
  `aiDraftReplyId`      int            NULL,
  `gmailDraftId`        varchar(128)   NULL,
  `fromEmail`           varchar(320)   NOT NULL DEFAULT '',
  `fromName`            varchar(255)   NOT NULL DEFAULT '',
  `subject`             varchar(512)   NOT NULL DEFAULT '',
  `bodyPreview`         varchar(500)   NOT NULL DEFAULT '',
  `archived`            tinyint(1)     NOT NULL DEFAULT 0,
  `processedAt`         timestamp      NOT NULL DEFAULT (now()),
  `createdAt`           timestamp      NOT NULL DEFAULT (now()),
  CONSTRAINT `gmailMessageLinks_id` PRIMARY KEY (`id`),
  UNIQUE KEY `gmailMessageLinks_msgId_uidx` (`gmailMessageId`)
);
