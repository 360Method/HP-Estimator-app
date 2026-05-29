CREATE TABLE "scorecardMetrics" (
	"id" varchar(64) PRIMARY KEY NOT NULL,
	"weekStart" varchar(16) NOT NULL,
	"metricKey" varchar(64) NOT NULL,
	"value" double precision,
	"target" double precision,
	"status" varchar(16),
	"ownerRole" varchar(32),
	"notes" text,
	"computedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "scorecardMetrics_week_key_uidx" ON "scorecardMetrics" USING btree ("weekStart","metricKey");