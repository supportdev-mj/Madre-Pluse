-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "location" TEXT,
ADD COLUMN     "poc" TEXT,
ADD COLUMN     "website" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "designation" TEXT;
