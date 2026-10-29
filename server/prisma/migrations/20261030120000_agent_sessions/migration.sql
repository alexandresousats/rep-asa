-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN     "agentChatSharing" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "WorkspaceMember" ADD COLUMN     "agentChatShared" BOOLEAN;

-- CreateTable
CREATE TABLE "AgentSession" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Nova conversa',
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "AgentSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AgentMessage" (
    "sessionId" TEXT NOT NULL,
    "id" TEXT NOT NULL,
    "seq" SERIAL NOT NULL,
    "authorId" TEXT,
    "data" JSONB NOT NULL,
    "size" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentMessage_pkey" PRIMARY KEY ("sessionId","id")
);

-- CreateTable
CREATE TABLE "AgentFolder" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AgentFolder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentSession_workspaceId_userId_idx" ON "AgentSession"("workspaceId", "userId");

-- CreateIndex
CREATE INDEX "AgentMessage_sessionId_seq_idx" ON "AgentMessage"("sessionId", "seq");

-- CreateIndex
CREATE INDEX "AgentFolder_workspaceId_userId_idx" ON "AgentFolder"("workspaceId", "userId");

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentSession" ADD CONSTRAINT "AgentSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentMessage" ADD CONSTRAINT "AgentMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AgentSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFolder" ADD CONSTRAINT "AgentFolder_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AgentFolder" ADD CONSTRAINT "AgentFolder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

