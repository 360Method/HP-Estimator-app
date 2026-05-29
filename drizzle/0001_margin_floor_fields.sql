ALTER TABLE "pipelineEvents" ALTER COLUMN "triggeredBy" SET DATA TYPE varchar(64);--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "hardCostCents" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "grossMarginBps" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "minGmBps" integer;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "isSmallJob" boolean;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "belowFloor" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "opportunities" ADD COLUMN "marginAuditedAt" varchar(32);