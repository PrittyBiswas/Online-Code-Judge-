ALTER TABLE "problems" ADD CONSTRAINT "chk_problems_visibility" CHECK ("visibility" IN ('public', 'contest_only'));

