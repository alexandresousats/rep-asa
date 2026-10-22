-- AlterEnum
ALTER TYPE "AccessLevel" ADD VALUE IF NOT EXISTS 'cliente';

-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "ApprovalStatus" AS ENUM ('none', 'pending', 'approved', 'changes_requested');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "isDemand" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "demandFormat" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "referenceUrls" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'none';
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvalFeedback" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvedAt" TEXT;
ALTER TABLE "Task" ADD COLUMN IF NOT EXISTS "approvedById" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Task_approvalStatus_idx" ON "Task"("approvalStatus");

-- AddForeignKey
DO $$ BEGIN
    ALTER TABLE "Task" ADD CONSTRAINT "Task_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
