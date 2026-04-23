CREATE TABLE `portalAppointments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`title` varchar(255) NOT NULL,
	`type` varchar(64) NOT NULL DEFAULT 'job',
	`scheduledAt` timestamp NOT NULL,
	`scheduledEndAt` timestamp,
	`address` text,
	`techName` varchar(255),
	`status` varchar(32) NOT NULL DEFAULT 'scheduled',
	`notes` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portalAppointments_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portalCustomers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hpCustomerId` varchar(64),
	`name` varchar(255) NOT NULL,
	`email` varchar(320) NOT NULL,
	`phone` varchar(32),
	`address` text,
	`stripeCustomerId` varchar(64),
	`referralCode` varchar(32),
	`referredBy` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portalCustomers_id` PRIMARY KEY(`id`),
	CONSTRAINT `portalCustomers_hpCustomerId_unique` UNIQUE(`hpCustomerId`),
	CONSTRAINT `portalCustomers_email_unique` UNIQUE(`email`),
	CONSTRAINT `portalCustomers_referralCode_unique` UNIQUE(`referralCode`)
);
--> statement-breakpoint
CREATE TABLE `portalEstimates` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`estimateNumber` varchar(64) NOT NULL,
	`title` varchar(255) NOT NULL,
	`status` varchar(32) NOT NULL DEFAULT 'sent',
	`totalAmount` int NOT NULL DEFAULT 0,
	`depositAmount` int NOT NULL DEFAULT 0,
	`depositPercent` int NOT NULL DEFAULT 50,
	`lineItemsJson` text,
	`scopeOfWork` text,
	`expiresAt` timestamp,
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`viewedAt` timestamp,
	`approvedAt` timestamp,
	`signatureDataUrl` text,
	`signerName` varchar(255),
	`declinedAt` timestamp,
	`declineReason` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portalEstimates_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portalGallery` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`jobId` varchar(64),
	`jobTitle` varchar(255),
	`imageUrl` text NOT NULL,
	`caption` varchar(512),
	`phase` varchar(32) NOT NULL DEFAULT 'after',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalGallery_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portalInvoices` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`estimateId` int,
	`invoiceNumber` varchar(64) NOT NULL,
	`type` varchar(32) NOT NULL DEFAULT 'final',
	`status` varchar(32) NOT NULL DEFAULT 'sent',
	`amountDue` int NOT NULL DEFAULT 0,
	`amountPaid` int NOT NULL DEFAULT 0,
	`tipAmount` int NOT NULL DEFAULT 0,
	`dueDate` timestamp,
	`stripePaymentIntentId` varchar(64),
	`paidAt` timestamp,
	`lineItemsJson` text,
	`jobTitle` varchar(255),
	`sentAt` timestamp NOT NULL DEFAULT (now()),
	`viewedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `portalInvoices_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portalMessages` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`senderRole` enum('customer','hp_team') NOT NULL,
	`senderName` varchar(255),
	`body` text NOT NULL,
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalMessages_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portalReferrals` (
	`id` int AUTO_INCREMENT NOT NULL,
	`referrerId` int NOT NULL,
	`referredEmail` varchar(320) NOT NULL,
	`referredCustomerId` int,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`rewardAmount` int NOT NULL DEFAULT 0,
	`rewardedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalReferrals_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `portalSessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`sessionToken` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalSessions_id` PRIMARY KEY(`id`),
	CONSTRAINT `portalSessions_sessionToken_unique` UNIQUE(`sessionToken`)
);
--> statement-breakpoint
CREATE TABLE `portalTokens` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`token` varchar(128) NOT NULL,
	`expiresAt` timestamp NOT NULL,
	`usedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalTokens_id` PRIMARY KEY(`id`),
	CONSTRAINT `portalTokens_token_unique` UNIQUE(`token`)
);
