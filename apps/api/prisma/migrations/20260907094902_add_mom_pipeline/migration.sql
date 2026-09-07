-- CreateEnum
CREATE TYPE "MomCandidateStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REJECTED');

-- CreateTable
CREATE TABLE "org_ai_settings" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "apiKeyEncrypted" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_ai_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mom_uploads" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "itemsFound" INTEGER NOT NULL,
    "itemsNew" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mom_uploads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mom_task_candidates" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "momUploadId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "suggestedAssigneeName" TEXT,
    "suggestedAssigneeId" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" "TaskPriority" NOT NULL DEFAULT 'MEDIUM',
    "context" TEXT,
    "status" "MomCandidateStatus" NOT NULL DEFAULT 'PENDING',
    "createdTaskId" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mom_task_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "org_ai_settings_orgId_key" ON "org_ai_settings"("orgId");

-- CreateIndex
CREATE INDEX "mom_uploads_orgId_idx" ON "mom_uploads"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "mom_task_candidates_createdTaskId_key" ON "mom_task_candidates"("createdTaskId");

-- CreateIndex
CREATE INDEX "mom_task_candidates_orgId_status_idx" ON "mom_task_candidates"("orgId", "status");

-- CreateIndex
CREATE INDEX "mom_task_candidates_momUploadId_idx" ON "mom_task_candidates"("momUploadId");

-- AddForeignKey
ALTER TABLE "org_ai_settings" ADD CONSTRAINT "org_ai_settings_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "org_ai_settings" ADD CONSTRAINT "org_ai_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_uploads" ADD CONSTRAINT "mom_uploads_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_uploads" ADD CONSTRAINT "mom_uploads_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_task_candidates" ADD CONSTRAINT "mom_task_candidates_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_task_candidates" ADD CONSTRAINT "mom_task_candidates_momUploadId_fkey" FOREIGN KEY ("momUploadId") REFERENCES "mom_uploads"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_task_candidates" ADD CONSTRAINT "mom_task_candidates_suggestedAssigneeId_fkey" FOREIGN KEY ("suggestedAssigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_task_candidates" ADD CONSTRAINT "mom_task_candidates_createdTaskId_fkey" FOREIGN KEY ("createdTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mom_task_candidates" ADD CONSTRAINT "mom_task_candidates_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
