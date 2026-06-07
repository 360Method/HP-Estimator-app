ALTER TABLE "appSettings" ALTER COLUMN "emailEstimateApprovedSubject" SET DEFAULT 'Your estimate has been approved — Handy Pioneers';--> statement-breakpoint
ALTER TABLE "appSettings" ALTER COLUMN "emailJobSignOffSubject" SET DEFAULT 'Job complete — your final invoice is ready';--> statement-breakpoint
ALTER TABLE "appSettings" ALTER COLUMN "emailChangeOrderApprovedSubject" SET DEFAULT 'Change order approved — Handy Pioneers';--> statement-breakpoint
ALTER TABLE "priorityTranslations" ADD COLUMN "pdfSha256" varchar(64);--> statement-breakpoint
ALTER TABLE "priorityTranslations" ADD COLUMN "submitIp" varchar(45);