CREATE TABLE `portalServiceRequests` (
	`id` int AUTO_INCREMENT NOT NULL,
	`customerId` int NOT NULL,
	`description` text NOT NULL,
	`timeline` varchar(32) NOT NULL DEFAULT 'flexible',
	`address` text,
	`status` varchar(32) NOT NULL DEFAULT 'pending',
	`leadId` varchar(64),
	`readAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalServiceRequests_id` PRIMARY KEY(`id`)
);
