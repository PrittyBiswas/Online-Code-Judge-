CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" varchar(255) NOT NULL,
	"slug" varchar(255) NOT NULL,
	"statement" text NOT NULL,
	"difficulty" varchar(20) DEFAULT 'medium' NOT NULL,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"time_limit_ms" integer DEFAULT 2000 NOT NULL,
	"memory_limit_mb" integer DEFAULT 128 NOT NULL,
	"sample_input" text DEFAULT '' NOT NULL,
	"sample_expected_output" text DEFAULT '' NOT NULL,
	"setter_id" uuid NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"code" text NOT NULL,
	"language" varchar(20) DEFAULT 'javascript' NOT NULL,
	"status" varchar(20) DEFAULT 'QUEUED' NOT NULL,
	"verdict" varchar(30),
	"execution_time_ms" integer,
	"memory_used_kb" integer,
	"failed_test_index" integer,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"input_key" varchar(255) NOT NULL,
	"expected_output_key" varchar(255) NOT NULL,
	"is_hidden" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_problem_test_index" UNIQUE("problem_id","index")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"role" varchar(20) DEFAULT 'user' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_username_unique" UNIQUE("username"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "problems" ADD CONSTRAINT "problems_setter_id_users_id_fk" FOREIGN KEY ("setter_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_problems_slug" ON "problems" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_problems_difficulty" ON "problems" USING btree ("difficulty");--> statement-breakpoint
CREATE INDEX "idx_problems_setter_id" ON "problems" USING btree ("setter_id");--> statement-breakpoint
CREATE INDEX "idx_problems_created_at_id" ON "problems" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "idx_submissions_user_cursor" ON "submissions" USING btree ("user_id","created_at","id");--> statement-breakpoint
CREATE INDEX "idx_submissions_problem_status" ON "submissions" USING btree ("problem_id","status");--> statement-breakpoint
CREATE INDEX "idx_submissions_status" ON "submissions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_test_cases_problem_id" ON "test_cases" USING btree ("problem_id","index");--> statement-breakpoint
CREATE INDEX "idx_users_username" ON "users" USING btree ("username");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");