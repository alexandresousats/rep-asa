-- CreateEnum
CREATE TYPE "ShareLinkEventKind" AS ENUM ('view', 'unlock_ok', 'unlock_fail', 'unlock_blocked');

-- CreateTable
CREATE TABLE "ShareLinkEvent" (
    "id" TEXT NOT NULL,
    "linkId" TEXT NOT NULL,
    "kind" "ShareLinkEventKind" NOT NULL,
    "ipHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ShareLinkEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ShareLinkEvent_linkId_kind_createdAt_idx" ON "ShareLinkEvent"("linkId", "kind", "createdAt");

-- CreateIndex
CREATE INDEX "ShareLinkEvent_linkId_ipHash_createdAt_idx" ON "ShareLinkEvent"("linkId", "ipHash", "createdAt");

-- AddForeignKey
ALTER TABLE "ShareLinkEvent" ADD CONSTRAINT "ShareLinkEvent_linkId_fkey" FOREIGN KEY ("linkId") REFERENCES "ClientShareLink"("id") ON DELETE CASCADE ON UPDATE CASCADE;
