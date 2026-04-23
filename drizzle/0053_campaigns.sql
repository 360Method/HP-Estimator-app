CREATE TABLE IF NOT EXISTS `campaigns` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(160) NOT NULL,
	`channel` enum('email','sms') NOT NULL DEFAULT 'email',
	`emailTemplateId` int,
	`subjectOverride` varchar(300),
	`smsBody` text,
	`status` enum('draft','scheduled','sending','sent','cancelled') NOT NULL DEFAULT 'draft',
	`scheduledAt` timestamp NULL,
	`sentAt` timestamp NULL,
	`createdBy` varchar(64),
	`recipientCount` int NOT NULL DEFAULT 0,
	`sentCount` int NOT NULL DEFAULT 0,
	`openCount` int NOT NULL DEFAULT 0,
	`clickCount` int NOT NULL DEFAULT 0,
	`bounceCount` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `campaigns_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `campaignRecipients` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`customerId` varchar(64),
	`email` varchar(320),
	`phone` varchar(32),
	`mergeVars` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaignRecipients_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `campaignRecipients_campaign_idx` ON `campaignRecipients` (`campaignId`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `campaignSends` (
	`id` int AUTO_INCREMENT NOT NULL,
	`campaignId` int NOT NULL,
	`recipientId` int NOT NULL,
	`status` enum('pending','sent','delivered','bounced','failed','opened','clicked') NOT NULL DEFAULT 'pending',
	`providerMessageId` varchar(120),
	`openedAt` timestamp NULL,
	`clickedAt` timestamp NULL,
	`bounceReason` varchar(300),
	`errorMessage` text,
	`sentAt` timestamp NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `campaignSends_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE INDEX `campaignSends_campaign_idx` ON `campaignSends` (`campaignId`);
--> statement-breakpoint
CREATE INDEX `campaignSends_recipient_idx` ON `campaignSends` (`recipientId`);
