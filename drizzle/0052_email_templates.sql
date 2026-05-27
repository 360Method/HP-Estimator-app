CREATE TABLE IF NOT EXISTS `emailTemplates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`tenantId` int NOT NULL DEFAULT 1,
	`key` varchar(80) NOT NULL,
	`name` varchar(160) NOT NULL DEFAULT '',
	`subject` varchar(300) NOT NULL DEFAULT '',
	`preheader` varchar(300) DEFAULT '',
	`html` text NOT NULL,
	`text` text,
	`mergeTagSchema` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `emailTemplates_id` PRIMARY KEY(`id`),
	CONSTRAINT `emailTemplates_tenant_key_unique` UNIQUE(`tenantId`, `key`)
);
--> statement-breakpoint
CREATE INDEX `emailTemplates_key_idx` ON `emailTemplates` (`key`);
