ALTER TABLE `portalServiceRequests` ADD `requestType` varchar(32) DEFAULT 'service_request' NOT NULL;--> statement-breakpoint
ALTER TABLE `portalServiceRequests` ADD `preferredDateRange` varchar(64);