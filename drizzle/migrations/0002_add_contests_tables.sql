CREATE TABLE "contest_participants" (
	"contest_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pk_contest_participants" PRIMARY KEY("contest_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "contest_problems" (
	"contest_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"problem_order" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "pk_contest_problems" PRIMARY KEY("contest_id","problem_id"),
	CONSTRAINT "chk_contest_problems_order" CHECK ("contest_problems"."problem_order" > 0)
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"freeze_minutes" integer DEFAULT 60 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chk_contests_times" CHECK ("contests"."start_time" < "contests"."end_time"),
	CONSTRAINT "chk_contests_freeze_minutes" CHECK ("contests"."freeze_minutes" >= 0)
);
--> statement-breakpoint
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_participants" ADD CONSTRAINT "contest_participants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contest_participants_user_id" ON "contest_participants" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_contest_participants_contest_id" ON "contest_participants" USING btree ("contest_id");--> statement-breakpoint
CREATE INDEX "idx_contest_problems_order" ON "contest_problems" USING btree ("contest_id","problem_order");--> statement-breakpoint
CREATE INDEX "idx_contest_problems_problem_id" ON "contest_problems" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "idx_contests_times" ON "contests" USING btree ("start_time","end_time");--> statement-breakpoint
CREATE INDEX "idx_contests_created_by" ON "contests" USING btree ("created_by");