ALTER TABLE "problems" ADD COLUMN "visibility" varchar(20) DEFAULT 'public' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_problems_visibility" ON "problems" USING btree ("visibility");

