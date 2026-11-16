CREATE TABLE IF NOT EXISTS "notifications" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" varchar(50) NOT NULL,
  "title" varchar(255) NOT NULL,
  "message" text NOT NULL,
  "data" jsonb DEFAULT '{}'::jsonb,
  "is_read" boolean NOT NULL DEFAULT false,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "read_at" timestamp with time zone,
  CONSTRAINT "chk_notifications_type" CHECK (
    "type" IN (
      'CONTEST_REGISTERED',
      'CONTEST_APPROACHING',
      'CONTEST_STARTED',
      'CONTEST_SUBMISSION_VERDICT',
      'CONTEST_ENDING_SOON'
    )
  )
);

CREATE INDEX IF NOT EXISTS "idx_notifications_user_unread" ON "notifications" ("user_id", "is_read", "created_at" DESC);
CREATE INDEX IF NOT EXISTS "idx_notifications_user_created" ON "notifications" ("user_id", "created_at" DESC);
