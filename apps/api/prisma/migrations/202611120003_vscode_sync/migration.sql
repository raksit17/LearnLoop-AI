ALTER TABLE "CodingResult" ADD COLUMN "reports" JSONB NOT NULL DEFAULT '[]';

CREATE TABLE "CodingPairing" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodingPairing_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "CodingDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "digest" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'VS Code',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CodingDevice_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CodingPairing_digest_key" ON "CodingPairing"("digest");
CREATE INDEX "CodingPairing_userId_idx" ON "CodingPairing"("userId");
CREATE UNIQUE INDEX "CodingDevice_digest_key" ON "CodingDevice"("digest");
CREATE INDEX "CodingDevice_userId_idx" ON "CodingDevice"("userId");
ALTER TABLE "CodingPairing" ADD CONSTRAINT "CodingPairing_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CodingDevice" ADD CONSTRAINT "CodingDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
