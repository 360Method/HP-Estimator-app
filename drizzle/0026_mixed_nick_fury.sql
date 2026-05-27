CREATE TABLE `portalReports` (
	`id` int AUTO_INCREMENT NOT NULL,
	`portalCustomerId` int NOT NULL,
	`scanId` int NOT NULL,
	`membershipId` int NOT NULL,
	`hpCustomerId` int NOT NULL,
	`healthScore` int,
	`reportJson` text NOT NULL,
	`pdfUrl` text,
	`sentAt` bigint NOT NULL,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `portalReports_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `threeSixtyPropertySystems` (
	`id` int AUTO_INCREMENT NOT NULL,
	`membershipId` int NOT NULL,
	`customerId` int NOT NULL,
	`systemType` enum('hvac','roof','plumbing','electrical','foundation','exterior_siding','interior','appliances') NOT NULL,
	`brandModel` varchar(255),
	`installYear` int,
	`condition` enum('good','fair','poor','critical') NOT NULL DEFAULT 'good',
	`conditionNotes` text,
	`lastServiceDate` date,
	`nextServiceDate` date,
	`estimatedLifespanYears` int,
	`replacementCostEstimate` decimal(10,2),
	`photoUrls` text,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `threeSixtyPropertySystems_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
ALTER TABLE `threeSixtyChecklist` ADD `systemType` varchar(64);--> statement-breakpoint
ALTER TABLE `threeSixtyChecklist` ADD `cascadeRiskBase` int DEFAULT 3;--> statement-breakpoint
ALTER TABLE `threeSixtyChecklist` ADD `defaultCostLow` decimal(10,2);--> statement-breakpoint
ALTER TABLE `threeSixtyChecklist` ADD `defaultCostHigh` decimal(10,2);--> statement-breakpoint
ALTER TABLE `threeSixtyScans` ADD `healthScore` int;--> statement-breakpoint
ALTER TABLE `threeSixtyScans` ADD `inspectionItemsJson` text;--> statement-breakpoint
ALTER TABLE `threeSixtyScans` ADD `recommendationsJson` text;--> statement-breakpoint
ALTER TABLE `threeSixtyScans` ADD `summary` text;--> statement-breakpoint
ALTER TABLE `threeSixtyScans` ADD `sentToPortalAt` bigint;--> statement-breakpoint
ALTER TABLE `threeSixtyScans` ADD `pdfUrl` text;--> statement-breakpoint
ALTER TABLE `threeSixtyScans` ADD `pdfFileKey` varchar(512);--> statement-breakpoint
ALTER TABLE `threeSixtyScans` ADD `linkedVisitId` int;