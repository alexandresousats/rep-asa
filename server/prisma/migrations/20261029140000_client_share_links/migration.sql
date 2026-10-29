-- CreateEnum
CREATE TYPE "ShareVisibility" AS ENUM ('public', 'private');

-- CreateTable
CREATE TABLE "ClientShareLink" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "lastAccessAt" TIMESTAMP(3),
    "accessCount" INTEGER NOT NULL DEFAULT 0,
    "visibility" "ShareVisibility" NOT NULL DEFAULT 'public',
    "pinHash" TEXT,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ClientShareLink_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ClientShareLink_tokenHash_key" ON "ClientShareLink"("tokenHash");

-- CreateIndex
CREATE INDEX "ClientShareLink_projectId_idx" ON "ClientShareLink"("projectId");

-- CreateIndex
CREATE INDEX "ClientShareLink_workspaceId_idx" ON "ClientShareLink"("workspaceId");

-- AddForeignKey
ALTER TABLE "ClientShareLink" ADD CONSTRAINT "ClientShareLink_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientShareLink" ADD CONSTRAINT "ClientShareLink_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientShareLink" ADD CONSTRAINT "ClientShareLink_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
