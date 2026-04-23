-- 0059_repair_phone_tables.sql
-- Repair drizzle tracker divergence in prod: migrations 0041 (phoneSettings)
-- and the earlier callLogs creation were recorded as applied but never
-- actually ran against prod DB. Runtime logs show
-- "Table 'railway.phoneSettings' doesn't exist" on every inbound call's
-- /api/twilio/voice/fallback — callers hear "we're sorry, unable to take
-- your call" instead of voicemail.
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS + INSERT IGNORE so re-running
-- against an already-correct DB is a no-op. The table shape reflects the
-- union of 0041 + 0042 + 0043 (after-hours columns + voicemailPrompt).

CREATE TABLE IF NOT EXISTS `phoneSettings` (
  `id` int NOT NULL DEFAULT 1,
  `forwardingMode` enum('forward_to_number','forward_to_ai','voicemail') NOT NULL DEFAULT 'forward_to_number',
  `forwardingNumber` varchar(20) DEFAULT '',
  `aiServiceNumber` varchar(20) DEFAULT '',
  `greeting` varchar(500) DEFAULT '',
  `voicemailPrompt` varchar(600) DEFAULT '',
  `callRecording` boolean NOT NULL DEFAULT false,
  `transcribeVoicemail` boolean NOT NULL DEFAULT true,
  `afterHoursEnabled` boolean NOT NULL DEFAULT false,
  `businessHoursStart` varchar(5) DEFAULT '08:00',
  `businessHoursEnd` varchar(5) DEFAULT '17:00',
  `businessDays` varchar(20) DEFAULT '1,2,3,4,5',
  `updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT `phoneSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint

INSERT IGNORE INTO `phoneSettings` (
  `id`, `forwardingMode`, `forwardingNumber`, `greeting`, `voicemailPrompt`,
  `callRecording`, `transcribeVoicemail`, `afterHoursEnabled`,
  `businessHoursStart`, `businessHoursEnd`, `businessDays`
) VALUES (
  1,
  'forward_to_number',
  '+13602179444',
  'Thank you for calling Handy Pioneers. Please hold while we connect you.',
  'You''ve reached Handy Pioneers. We''re unable to take your call right now. Please leave a message and we''ll return it within one business day.',
  true,
  true,
  true,
  '08:00',
  '18:00',
  '1,2,3,4,5'
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS `callLogs` (
  `id` int AUTO_INCREMENT NOT NULL,
  `conversationId` int NOT NULL,
  `messageId` int,
  `twilioCallSid` varchar(64),
  `direction` enum('inbound','outbound') NOT NULL,
  `status` varchar(32) NOT NULL DEFAULT 'answered',
  `durationSecs` int NOT NULL DEFAULT 0,
  `recordingUrl` text,
  `recordingAppUrl` text,
  `voicemailUrl` text,
  `callerPhone` varchar(32),
  `startedAt` timestamp NOT NULL DEFAULT (now()),
  `endedAt` timestamp,
  CONSTRAINT `callLogs_id` PRIMARY KEY(`id`)
);
