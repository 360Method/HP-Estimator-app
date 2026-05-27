ALTER TABLE `portalEstimates` ADD `taxEnabled` tinyint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `portalEstimates` ADD `taxRateCode` varchar(32) DEFAULT '0603' NOT NULL;--> statement-breakpoint
ALTER TABLE `portalEstimates` ADD `customTaxPct` int DEFAULT 890 NOT NULL;--> statement-breakpoint
ALTER TABLE `portalEstimates` ADD `taxAmount` int DEFAULT 0 NOT NULL;