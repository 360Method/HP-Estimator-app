CREATE TABLE `expenses` (
	`id` varchar(64) NOT NULL,
	`userId` int NOT NULL,
	`opportunityId` varchar(64),
	`customerId` varchar(64),
	`vendor` varchar(255),
	`amount` int NOT NULL DEFAULT 0,
	`category` varchar(32) NOT NULL DEFAULT 'other',
	`description` text,
	`receiptUrl` text,
	`date` varchar(16) NOT NULL,
	`qbEntityId` varchar(64),
	`qbSyncedAt` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `expenses_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `qbTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int NOT NULL,
	`accessToken` text NOT NULL,
	`refreshToken` text NOT NULL,
	`realmId` varchar(64) NOT NULL,
	`expiresAt` varchar(32) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `qbTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `qbTokens_userId_unique` UNIQUE(`userId`)
);
--> statement-breakpoint
ALTER TABLE `invoices` ADD `qbEntityId` varchar(64);--> statement-breakpoint
ALTER TABLE `invoices` ADD `qbSyncedAt` varchar(32);