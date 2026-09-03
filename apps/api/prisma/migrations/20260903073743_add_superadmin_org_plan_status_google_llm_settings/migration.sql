-- CreateEnum
CREATE TYPE "OrganizationPlan" AS ENUM ('FREE', 'PRO', 'ENTERPRISE');

-- CreateEnum
CREATE TYPE "OrganizationStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "plan" "OrganizationPlan" NOT NULL DEFAULT 'FREE',
ADD COLUMN     "status" "OrganizationStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "isSuperAdmin" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "google_integrations" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "googleEmail" TEXT NOT NULL,
    "refreshTokenEncrypted" TEXT NOT NULL,
    "connectedById" TEXT NOT NULL,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "google_integrations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "llm_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "apiKeyEncrypted" TEXT NOT NULL,
    "model" TEXT NOT NULL DEFAULT 'claude-sonnet-5',
    "updatedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "llm_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "google_integrations_orgId_key" ON "google_integrations"("orgId");

-- AddForeignKey
ALTER TABLE "google_integrations" ADD CONSTRAINT "google_integrations_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "google_integrations" ADD CONSTRAINT "google_integrations_connectedById_fkey" FOREIGN KEY ("connectedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "llm_settings" ADD CONSTRAINT "llm_settings_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
