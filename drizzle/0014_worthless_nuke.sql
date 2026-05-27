CREATE TABLE `portalJobSignOffs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`hpOpportunityId` varchar(64) NOT NULL,
	`customerId` int NOT NULL,
	`signatureDataUrl` text NOT NULL,
	`signerName` varchar(255) NOT NULL,
	`signedAt` varchar(32) NOT NULL,
	`workSummary` text,
	`finalInvoiceId` int,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalJobSignOffs_id` PRIMARY KEY(`id`),
	CONSTRAINT `portalJobSignOffs_hpOpportunityId_unique` UNIQUE(`hpOpportunityId`)
);
