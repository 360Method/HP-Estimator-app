CREATE TABLE `portalDocuments` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portalCustomerId` int NOT NULL,
	`name` varchar(255) NOT NULL,
	`url` text NOT NULL,
	`fileKey` varchar(512) NOT NULL,
	`mimeType` varchar(128) NOT NULL DEFAULT 'application/octet-stream',
	`jobId` varchar(64),
	`uploadedAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalDocuments_id` PRIMARY KEY(`id`)
);
