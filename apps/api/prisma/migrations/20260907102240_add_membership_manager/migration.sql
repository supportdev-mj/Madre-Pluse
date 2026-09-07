-- AlterTable
ALTER TABLE "memberships" ADD COLUMN     "managerId" TEXT;

-- CreateIndex
CREATE INDEX "memberships_managerId_idx" ON "memberships"("managerId");

-- AddForeignKey
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_managerId_fkey" FOREIGN KEY ("managerId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;
