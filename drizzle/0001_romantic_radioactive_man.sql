CREATE TABLE `callLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`messageId` int,
	`twilioCallSid` varchar(64),
	`direction` enum('inbound','outbound') NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'answered',
	`durationSecs` int NOT NULL DEFAULT 0,
	`recordingUrl` text,
	`voicemailUrl` text,
	`callerPhone` varchar(32),
	`startedAt` timestamp NOT NULL DEFAULT (now()),
	`endedAt` timestamp,
	CONSTRAINT `callLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` varchar(64),
	`contactName` varchar(255),
	`contactPhone` varchar(32),
	`contactEmail` varchar(320),
	`channels` varchar(64) NOT NULL DEFAULT 'note',
	`lastMessageAt` timestamp NOT NULL DEFAULT (now()),
	`lastMessagePreview` varchar(255),
	`unreadCount` int NOT NULL DEFAULT 0,
	`twilioConversationSid` varchar(64),
	`gmailThreadId` varchar(128),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `conversations_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `gmailTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`email` varchar(320) NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`expiresAt` bigint,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `gmailTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `gmailTokens_email_unique` UNIQUE(`email`)
);
--> statement-breakpoint
CREATE TABLE `messages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`conversationId` int NOT NULL,
	`channel` enum('sms','email','call','note') NOT NULL,
	`direction` enum('inbound','outbound') NOT NULL,
	`body` text,
	`subject` varchar(512),
	`status` varchar(32) NOT NULL DEFAULT 'sent',
	`twilioSid` varchar(64),
	`gmailMessageId` varchar(128),
	`attachmentUrl` text,
	`attachmentMime` varchar(128),
	`isInternal` boolean NOT NULL DEFAULT false,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`readAt` timestamp,
	`sentByUserId` int,
	CONSTRAINT `messages_id` PRIMARY KEY(`id`)
);
