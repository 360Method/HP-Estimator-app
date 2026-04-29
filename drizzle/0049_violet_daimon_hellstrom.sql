ALTER TABLE `appSettings` ADD `internalLaborRateCents` int DEFAULT 15000;--> statement-breakpoint
ALTER TABLE `appSettings` ADD `defaultMarkupPct` int DEFAULT 20;--> statement-breakpoint
ALTER TABLE `appSettings` ADD `smsFromName` varchar(30) DEFAULT 'HandyPioneers';