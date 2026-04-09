CREATE TABLE `snapshotInvoices` (
	`id` varchar(64) NOT NULL,
	`opportunityId` varchar(64),
	`customerId` varchar(64),
	`customerName` varchar(255),
	`status` varchar(32) NOT NULL,
	`total` int NOT NULL DEFAULT 0,
	`amountPaid` int NOT NULL DEFAULT 0,
	`dueDate` varchar(32),
	`issuedAt` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snapshotInvoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `snapshotOpportunities` (
	`id` varchar(64) NOT NULL,
	`area` varchar(16) NOT NULL,
	`stage` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`value` int NOT NULL DEFAULT 0,
	`archived` boolean NOT NULL DEFAULT false,
	`wonAt` varchar(32),
	`sentAt` varchar(32),
	`customerId` varchar(64),
	`customerName` varchar(255),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `snapshotOpportunities_id` PRIMARY KEY(`id`)
);
