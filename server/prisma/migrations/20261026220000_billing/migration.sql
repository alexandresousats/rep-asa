-- CreateEnum
CREATE TYPE "BillingStatus" AS ENUM ('pending', 'active', 'past_due', 'on_hold', 'paused', 'cancelled', 'failed', 'expired');

-- CreateTable
CREATE TABLE "WorkspaceSubscription" (
    "workspaceId" TEXT NOT NULL,
    "payerUserId" TEXT,
    "dodoCustomerId" TEXT,
    "dodoSubscriptionId" TEXT,
    "productId" TEXT,
    "status" "BillingStatus" NOT NULL DEFAULT 'pending',
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "currentPeriodEnd" TIMESTAMP(3),
    "sourceUpdatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkspaceSubscription_pkey" PRIMARY KEY ("workspaceId")
);

-- CreateTable
CREATE TABLE "WebhookDelivery" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebhookDelivery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BillingCheckout" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingCheckout_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "WorkspaceSubscription_dodoSubscriptionId_key" ON "WorkspaceSubscription"("dodoSubscriptionId");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_dodoCustomerId_idx" ON "WorkspaceSubscription"("dodoCustomerId");

-- CreateIndex
CREATE INDEX "WorkspaceSubscription_payerUserId_idx" ON "WorkspaceSubscription"("payerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "BillingCheckout_sessionId_key" ON "BillingCheckout"("sessionId");

-- CreateIndex
CREATE INDEX "BillingCheckout_workspaceId_idx" ON "BillingCheckout"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkspaceSubscription" ADD CONSTRAINT "WorkspaceSubscription_payerUserId_fkey" FOREIGN KEY ("payerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
