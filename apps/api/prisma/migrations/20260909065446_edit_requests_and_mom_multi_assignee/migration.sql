-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.

ALTER TYPE "NotificationType" ADD VALUE 'EDIT_REQUESTED';
ALTER TYPE "NotificationType" ADD VALUE 'EDIT_REQUEST_RESOLVED';

-- CreateEnum
CREATE TYPE "EditRequestStatus" AS ENUM ('OPEN', 'RESOLVED');

-- CreateTable
CREATE TABLE "edit_requests" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "EditRequestStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "edit_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "edit_requests_taskId_idx" ON "edit_requests"("taskId");

ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "edit_requests" ADD CONSTRAINT "edit_requests_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterTable mom_task_candidates: single suggestedAssigneeId -> plural suggestedAssigneeIds
ALTER TABLE "mom_task_candidates" ADD COLUMN "suggestedAssigneeIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Backfill the new array column from the old single-assignee column before dropping it, so no
-- existing MOM candidate silently loses its suggested assignee.
UPDATE "mom_task_candidates" SET "suggestedAssigneeIds" = ARRAY["suggestedAssigneeId"] WHERE "suggestedAssigneeId" IS NOT NULL;

ALTER TABLE "mom_task_candidates" DROP CONSTRAINT "mom_task_candidates_suggestedAssigneeId_fkey";
ALTER TABLE "mom_task_candidates" DROP COLUMN "suggestedAssigneeId";
