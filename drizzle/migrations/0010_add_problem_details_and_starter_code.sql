ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "input_format" text DEFAULT '';
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "output_format" text DEFAULT '';
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "constraints" text DEFAULT '';
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "examples" jsonb DEFAULT '[]'::jsonb;
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "starter_code" jsonb DEFAULT '{}'::jsonb;
ALTER TABLE "problems" ADD COLUMN IF NOT EXISTS "is_published" boolean DEFAULT true NOT NULL;
