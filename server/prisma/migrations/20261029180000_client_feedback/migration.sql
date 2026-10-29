-- CreateEnum
CREATE TYPE "ClientFeedbackKind" AS ENUM ('approved', 'changes_requested');

-- AlterTable
ALTER TABLE "Task" ADD COLUMN "approvedByClientName" TEXT;

-- CreateTable
CREATE TABLE "ClientFeedback" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "shareLinkId" TEXT,
    "kind" "ClientFeedbackKind" NOT NULL,
    "clientName" TEXT NOT NULL,
    "clientEmail" TEXT,
    "message" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ClientFeedback_taskId_createdAt_idx" ON "ClientFeedback"("taskId", "createdAt");

-- CreateIndex
CREATE INDEX "ClientFeedback_shareLinkId_idx" ON "ClientFeedback"("shareLinkId");

-- AddForeignKey
ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "Task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientFeedback" ADD CONSTRAINT "ClientFeedback_shareLinkId_fkey" FOREIGN KEY ("shareLinkId") REFERENCES "ClientShareLink"("id") ON DELETE SET NULL ON UPDATE CASCADE;
