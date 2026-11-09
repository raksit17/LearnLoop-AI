-- User-scoped synonym groups and independently scheduled vocabulary words.
CREATE TABLE "VocabularyGroup" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "nameKey" TEXT NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VocabularyGroup_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VocabularyWord" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "word" TEXT NOT NULL,
  "wordKey" TEXT NOT NULL,
  "meaning" TEXT NOT NULL,
  "partOfSpeech" TEXT NOT NULL DEFAULT 'other',
  "pronunciation" TEXT NOT NULL DEFAULT '',
  "example" TEXT NOT NULL DEFAULT '',
  "exampleTranslation" TEXT NOT NULL DEFAULT '',
  "nuance" TEXT NOT NULL DEFAULT '',
  "days" INTEGER NOT NULL DEFAULT 0,
  "dueAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "VocabularyWord_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "VocabularyReview" (
  "id" TEXT NOT NULL,
  "wordId" TEXT NOT NULL,
  "request" TEXT NOT NULL,
  "rating" INTEGER NOT NULL,
  "days" INTEGER NOT NULL,
  "dueAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VocabularyReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VocabularyGroup_userId_nameKey_key" ON "VocabularyGroup"("userId", "nameKey");
CREATE INDEX "VocabularyGroup_userId_idx" ON "VocabularyGroup"("userId");
CREATE UNIQUE INDEX "VocabularyWord_groupId_wordKey_key" ON "VocabularyWord"("groupId", "wordKey");
CREATE INDEX "VocabularyWord_groupId_dueAt_idx" ON "VocabularyWord"("groupId", "dueAt");
CREATE UNIQUE INDEX "VocabularyReview_request_key" ON "VocabularyReview"("request");
CREATE INDEX "VocabularyReview_wordId_createdAt_idx" ON "VocabularyReview"("wordId", "createdAt");
ALTER TABLE "VocabularyGroup" ADD CONSTRAINT "VocabularyGroup_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabularyWord" ADD CONSTRAINT "VocabularyWord_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "VocabularyGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "VocabularyReview" ADD CONSTRAINT "VocabularyReview_wordId_fkey"
  FOREIGN KEY ("wordId") REFERENCES "VocabularyWord"("id") ON DELETE CASCADE ON UPDATE CASCADE;
