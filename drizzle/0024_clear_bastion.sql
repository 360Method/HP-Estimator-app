CREATE TABLE `invoiceLineItems` (
	`id` varchar(64) NOT NULL,
	`invoiceId` varchar(64) NOT NULL,
	`description` text NOT NULL,
	`qty` double NOT NULL DEFAULT 1,
	`unitPrice` int NOT NULL DEFAULT 0,
	`total` int NOT NULL DEFAULT 0,
	`notes` text,
	`sortOrder` int NOT NULL DEFAULT 0,
	CONSTRAINT `invoiceLineItems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoicePayments` (
	`id` varchar(64) NOT NULL,
	`invoiceId` varchar(64) NOT NULL,
	`method` varchar(32) NOT NULL,
	`amount` int NOT NULL,
	`paidAt` varchar(32) NOT NULL,
	`reference` varchar(255) NOT NULL DEFAULT '',
	`note` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `invoicePayments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `invoices` (
	`id` varchar(64) NOT NULL,
	`type` varchar(16) NOT NULL DEFAULT 'deposit',
	`status` varchar(32) NOT NULL DEFAULT 'draft',
	`invoiceNumber` varchar(64) NOT NULL,
	`customerId` varchar(64) NOT NULL,
	`opportunityId` varchar(64) NOT NULL,
	`sourceEstimateId` varchar(64),
	`subtotal` int NOT NULL DEFAULT 0,
	`taxRate` int NOT NULL DEFAULT 0,
	`taxAmount` int NOT NULL DEFAULT 0,
	`total` int NOT NULL DEFAULT 0,
	`depositPercent` int,
	`amountPaid` int NOT NULL DEFAULT 0,
	`balance` int NOT NULL DEFAULT 0,
	`issuedAt` varchar(32) NOT NULL,
	`dueDate` varchar(32) NOT NULL,
	`paidAt` varchar(32),
	`serviceDate` varchar(32),
	`notes` text,
	`internalNotes` text,
	`paymentTerms` varchar(128),
	`taxLabel` varchar(64),
	`stripePaymentIntentId` varchar(128),
	`stripeClientSecret` text,
	`paypalOrderId` varchar(128),
	`completionSignatureUrl` text,
	`completionSignedBy` varchar(255),
	`completionSignedAt` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `invoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `scheduleEvents` (
	`id` varchar(64) NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'task',
	`title` varchar(255) NOT NULL,
	`start` varchar(32) NOT NULL,
	`end` varchar(32) NOT NULL,
	`allDay` boolean NOT NULL DEFAULT false,
	`opportunityId` varchar(64),
	`customerId` varchar(64),
	`assignedTo` text,
	`notes` text,
	`color` varchar(16),
	`recurrence` text,
	`parentEventId` varchar(64),
	`completed` boolean NOT NULL DEFAULT false,
	`completedAt` varchar(32),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `scheduleEvents_id` PRIMARY KEY(`id`)
);
