-- CreateEnum
CREATE TYPE "MomUploadSource" AS ENUM ('PDF', 'GOOGLE_MEET');

-- AlterTable
ALTER TABLE "mom_uploads" ADD COLUMN     "source" "MomUploadSource" NOT NULL DEFAULT 'PDF',
ADD COLUMN     "sourceMeetingRecordId" TEXT,
ADD COLUMN     "rawTranscript" TEXT,
ALTER COLUMN "storageKey" DROP NOT NULL,
ALTER COLUMN "sizeBytes" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "mom_uploads_sourceMeetingRecordId_key" ON "mom_uploads"("sourceMeetingRecordId");
