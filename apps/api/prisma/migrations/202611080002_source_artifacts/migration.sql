-- Cache AI reading aids and mind maps by immutable imported source/section.
CREATE TABLE "SourceArtifact" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "section" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SourceArtifact_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SourceArtifact_sourceId_section_kind_key"
ON "SourceArtifact"("sourceId", "section", "kind");

ALTER TABLE "SourceArtifact"
ADD CONSTRAINT "SourceArtifact_sourceId_fkey"
FOREIGN KEY ("sourceId") REFERENCES "Source"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
