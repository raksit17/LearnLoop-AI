CREATE TABLE "CodingFile" (
  "id" TEXT PRIMARY KEY, "userId" TEXT NOT NULL REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "exercise" TEXT NOT NULL, "digest" TEXT NOT NULL
);
CREATE UNIQUE INDEX "CodingFile_digest_key" ON "CodingFile"("digest");
CREATE INDEX "CodingFile_userId_exercise_idx" ON "CodingFile"("userId", "exercise");
CREATE TABLE "CodingResult" (
  "id" TEXT PRIMARY KEY, "fileId" TEXT NOT NULL REFERENCES "CodingFile"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "runId" TEXT NOT NULL, "answer" TEXT NOT NULL, "passed" INTEGER NOT NULL, "total" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "CodingResult_fileId_runId_key" ON "CodingResult"("fileId", "runId");
CREATE INDEX "CodingResult_fileId_createdAt_idx" ON "CodingResult"("fileId", "createdAt");
