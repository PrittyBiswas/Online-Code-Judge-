-- Forward migration: Add user_profiles table for personal and professional details
CREATE TABLE IF NOT EXISTS "user_profiles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
  "full_name" varchar(100),
  "phone_number" varchar(30),
  "avatar_url" text,
  "avatar_key" varchar(255),
  "bio" text,
  "country" varchar(100),
  "state" varchar(100),
  "city" varchar(100),
  "education" varchar(100),
  "college" varchar(255),
  "degree" varchar(100),
  "skills" text[] DEFAULT '{}'::text[] NOT NULL,
  "github_url" varchar(255),
  "linkedin_url" varchar(255),
  "portfolio_url" varchar(255),
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_user_profiles_user_id" ON "user_profiles" ("user_id");
