CREATE TABLE `onlineRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`zip` varchar(10) NOT NULL,
	`serviceType` varchar(64) NOT NULL DEFAULT 'general',
	`description` text,
	`timeline` varchar(32),
	`photoUrls` text,
	`firstName` varchar(128) NOT NULL,
	`lastName` varchar(128) NOT NULL,
	`phone` varchar(32) NOT NULL,
	`email` varchar(320) NOT NULL,
	`street` varchar(255) NOT NULL,
	`unit` varchar(64),
	`city` varchar(128) NOT NULL,
	`state` varchar(64) NOT NULL,
	`smsConsent` boolean NOT NULL DEFAULT false,
	`customerId` varchar(64),
	`leadId` varchar(64),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `onlineRequests_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `serviceZipCodes` (
	`id` int AUTO_INCREMENT NOT NULL,
	`zip` varchar(10) NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `serviceZipCodes_id` PRIMARY KEY(`id`),
	CONSTRAINT `serviceZipCodes_zip_unique` UNIQUE(`zip`)
);
