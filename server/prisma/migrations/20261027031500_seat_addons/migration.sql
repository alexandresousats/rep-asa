-- CreateEnum
CREATE TYPE "BillingPeriod" AS ENUM ('month', 'quarter');

-- AlterTable
ALTER TABLE "WorkspaceSubscription" ADD COLUMN "billingPeriod" "BillingPeriod" NOT NULL DEFAULT 'month',
ADD COLUMN "extraSeats" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "seatPacks" INTEGER NOT NULL DEFAULT 0;
