ALTER TABLE "submissions" ADD COLUMN "contest_id" uuid;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_submissions_contest_problem" ON "submissions" USING btree ("contest_id","problem_id");

