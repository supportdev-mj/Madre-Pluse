-- CreateEnum
CREATE TYPE "BlockerReportStatus" AS ENUM ('OPEN', 'RESOLVED');

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'BLOCKER_REPORTED';
ALTER TYPE "NotificationType" ADD VALUE 'BLOCKER_RESOLVED';

-- CreateTable
CREATE TABLE "task_assignments" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "task_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "task_assignments_taskId_idx" ON "task_assignments"("taskId");

-- CreateIndex
CREATE INDEX "task_assignments_userId_idx" ON "task_assignments"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "task_assignments_taskId_userId_key" ON "task_assignments"("taskId", "userId");

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "task_assignments" ADD CONSTRAINT "task_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: carry every existing single Task.assigneeId over into the new join table
-- before the column is dropped below, so pre-Slice-14 task assignments aren't lost.
INSERT INTO "task_assignments" ("id", "taskId", "userId", "createdAt")
SELECT
    'ta_' || substr(md5(random()::text || clock_timestamp()::text || "id" || "assigneeId"), 1, 22),
    "id",
    "assigneeId",
    CURRENT_TIMESTAMP
FROM "tasks"
WHERE "assigneeId" IS NOT NULL;

-- DropForeignKey
ALTER TABLE "tasks" DROP CONSTRAINT "tasks_assigneeId_fkey";

-- DropIndex
DROP INDEX "tasks_assigneeId_idx";

-- AlterTable
ALTER TABLE "tasks" DROP COLUMN "assigneeId";

-- AlterTable
ALTER TABLE "subtasks" ADD COLUMN     "assigneeId" TEXT;

-- CreateIndex
CREATE INDEX "subtasks_assigneeId_idx" ON "subtasks"("assigneeId");

-- AddForeignKey
ALTER TABLE "subtasks" ADD CONSTRAINT "subtasks_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "blocker_reports" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "reportedById" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "BlockerReportStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedById" TEXT,
    "resolutionNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "blocker_reports_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "blocker_reports_taskId_idx" ON "blocker_reports"("taskId");

-- AddForeignKey
ALTER TABLE "blocker_reports" ADD CONSTRAINT "blocker_reports_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocker_reports" ADD CONSTRAINT "blocker_reports_reportedById_fkey" FOREIGN KEY ("reportedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "blocker_reports" ADD CONSTRAINT "blocker_reports_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
