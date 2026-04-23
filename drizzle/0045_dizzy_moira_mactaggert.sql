CREATE TABLE `appSettings` (
	`id` int NOT NULL DEFAULT 1,
	`companyName` varchar(120) DEFAULT 'Handy Pioneers',
	`logoUrl` varchar(500) DEFAULT '',
	`brandColor` varchar(20) DEFAULT '#1E3A5F',
	`timezone` varchar(60) DEFAULT 'America/Los_Angeles',
	`estimatePrefix` varchar(10) DEFAULT 'EST',
	`invoicePrefix` varchar(10) DEFAULT 'INV',
	`jobPrefix` varchar(10) DEFAULT 'JOB',
	`portalUrl` varchar(300) DEFAULT 'https://client.handypioneers.com',
	`websiteUrl` varchar(300) DEFAULT 'https://handypioneers.com',
	`supportEmail` varchar(320) DEFAULT '',
	`supportPhone` varchar(30) DEFAULT '',
	`addressLine1` varchar(200) DEFAULT '',
	`addressLine2` varchar(200) DEFAULT '',
	`defaultTaxBps` int DEFAULT 875,
	`defaultDepositPct` int DEFAULT 50,
	`documentFooter` text,
	`termsText` text,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `appSettings_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automationRuleLogs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`ruleId` int NOT NULL,
	`trigger` varchar(60) NOT NULL,
	`triggerPayload` text,
	`status` enum('success','failed','skipped') NOT NULL,
	`errorMessage` text,
	`executedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `automationRuleLogs_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `automationRules` (
	`id` int AUTO_INCREMENT NOT NULL,
	`name` varchar(120) NOT NULL,
	`trigger` varchar(60) NOT NULL,
	`conditions` text,
	`actionType` enum('send_sms','send_email','notify_owner','create_note') NOT NULL,
	`actionPayload` text NOT NULL,
	`delayMinutes` int NOT NULL DEFAULT 0,
	`enabled` boolean NOT NULL DEFAULT true,
	`sortOrder` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `automationRules_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `notificationPreferences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`eventKey` varchar(60) NOT NULL,
	`channel` enum('email','sms','in_app') NOT NULL,
	`enabled` boolean NOT NULL DEFAULT true,
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `notificationPreferences_id` PRIMARY KEY(`id`)
);
