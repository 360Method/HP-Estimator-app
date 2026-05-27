CREATE TABLE `portalChangeOrders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`hpOpportunityId` varchar(64) NOT NULL,
	`coNumber` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`scopeOfWork` text,
	`lineItemsJson` text,
	`totalAmount` int NOT NULL DEFAULT 0,
	`status` varchar(32) NOT NULL DEFAULT 'sent',
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`viewedAt` timestamp,
	`approvedAt` timestamp,
	`signatureDataUrl` text,
	`signerName` varchar(255),
	`declinedAt` timestamp,
	`declineReason` text,
	`invoiceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portalChangeOrders_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `portalJobSignOffs` ADD `reviewRequestSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `portalJobSignOffs` ADD `reviewReminderSentAt` timestamp;--> statement-breakpoint
ALTER TABLE `portalJobSignOffs` ADD `skipReviewRequest` boolean DEFAULT false NOT NULL;