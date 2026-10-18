-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('pending', 'active');

-- CreateTable
CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkspaceMember" (
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "access" "AccessLevel" NOT NULL,
    "status" "MemberStatus" NOT NULL DEFAULT 'pending',
    "role" TEXT NOT NULL,
    "owner" BOOLEAN NOT NULL DEFAULT false,
    "invitedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedAt" TIMESTAMP(3),

    CONSTRAINT "WorkspaceMember_pkey" PRIMARY KEY ("workspaceId","userId")
);

-- Keep the current database in one workspace owned by the existing admin.
DO $$
DECLARE
  owner_id TEXT;
  owner_name TEXT;
BEGIN
  SELECT id, name INTO owner_id, owner_name
  FROM "User"
  ORDER BY "master" DESC, CASE WHEN "access" = 'admin' THEN 0 ELSE 1 END, "createdAt" ASC
  LIMIT 1;

  IF owner_id IS NOT NULL THEN
    INSERT INTO "Workspace" ("id", "name", "createdAt")
    VALUES ('ws-legacy', 'Espaço de ' || split_part(owner_name, ' ', 1), CURRENT_TIMESTAMP);

    INSERT INTO "WorkspaceMember" (
      "workspaceId", "userId", "access", "status", "role", "owner", "createdAt", "acceptedAt"
    )
    SELECT
      'ws-legacy',
      u.id,
      u.access,
      'active',
      u.role,
      u.id = owner_id,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    FROM "User" u;
  END IF;
END $$;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Tag" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Thread" ADD COLUMN "workspaceId" TEXT;
ALTER TABLE "Notification" ADD COLUMN "workspaceId" TEXT;

UPDATE "Project" SET "workspaceId" = 'ws-legacy' WHERE "workspaceId" IS NULL AND EXISTS (SELECT 1 FROM "Workspace" WHERE id = 'ws-legacy');
UPDATE "Tag" SET "workspaceId" = 'ws-legacy' WHERE "workspaceId" IS NULL AND EXISTS (SELECT 1 FROM "Workspace" WHERE id = 'ws-legacy');
UPDATE "Thread" SET "workspaceId" = 'ws-legacy' WHERE "workspaceId" IS NULL AND EXISTS (SELECT 1 FROM "Workspace" WHERE id = 'ws-legacy');

ALTER TABLE "Project" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Tag" ALTER COLUMN "workspaceId" SET NOT NULL;
ALTER TABLE "Thread" ALTER COLUMN "workspaceId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE INDEX "Project_workspaceId_idx" ON "Project"("workspaceId");
CREATE INDEX "Tag_workspaceId_idx" ON "Tag"("workspaceId");
CREATE INDEX "Thread_workspaceId_idx" ON "Thread"("workspaceId");

-- AddForeignKey
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceMember" ADD CONSTRAINT "WorkspaceMember_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Project" ADD CONSTRAINT "Project_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Tag" ADD CONSTRAINT "Tag_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Thread" ADD CONSTRAINT "Thread_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;
