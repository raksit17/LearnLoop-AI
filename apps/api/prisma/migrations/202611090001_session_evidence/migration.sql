ALTER TABLE "StudySession"
ADD COLUMN "evidence" JSONB NOT NULL DEFAULT '[]'::jsonb;
