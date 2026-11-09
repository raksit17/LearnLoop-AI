CREATE TABLE "GoalCategory" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GoalCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "GoalCategory_userId_key_key" ON "GoalCategory"("userId", "key");
CREATE INDEX "GoalCategory_userId_idx" ON "GoalCategory"("userId");
ALTER TABLE "GoalCategory" ADD CONSTRAINT "GoalCategory_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
