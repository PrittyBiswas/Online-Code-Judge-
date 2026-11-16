-- Forward migration: Add idempotency_key, unique constraint, and CONTEST_ENDED check to notifications table
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "idempotency_key" varchar(255);

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "chk_notifications_type";
ALTER TABLE "notifications" ADD CONSTRAINT "chk_notifications_type" CHECK (
  "type" IN (
    'CONTEST_REGISTERED',
    'CONTEST_APPROACHING',
    'CONTEST_STARTED',
    'CONTEST_SUBMISSION_VERDICT',
    'CONTEST_ENDING_SOON',
    'CONTEST_ENDED'
  )
);

ALTER TABLE "notifications" DROP CONSTRAINT IF EXISTS "uq_notifications_user_idempotency";
ALTER TABLE "notifications" ADD CONSTRAINT "uq_notifications_user_idempotency" UNIQUE ("user_id", "idempotency_key");

CREATE INDEX IF NOT EXISTS "idx_notifications_user_idempotency" ON "notifications" ("user_id", "idempotency_key");
