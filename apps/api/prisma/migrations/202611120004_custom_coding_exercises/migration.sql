CREATE TABLE "CodingExercise" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "topicId" TEXT,
    "title" TEXT NOT NULL,
    "prompt" TEXT NOT NULL,
    "hint" TEXT NOT NULL DEFAULT '',
    "example" TEXT NOT NULL DEFAULT '',
    "skill" TEXT NOT NULL DEFAULT 'custom',
    "level" INTEGER NOT NULL DEFAULT 1,
    "cases" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "CodingExercise_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "CodingExercise_userId_topicId_idx" ON "CodingExercise"("userId","topicId");
ALTER TABLE "CodingExercise" ADD CONSTRAINT "CodingExercise_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingExercise" ADD CONSTRAINT "CodingExercise_topicId_fkey" FOREIGN KEY ("topicId") REFERENCES "Topic"("id") ON DELETE SET NULL ON UPDATE CASCADE;
