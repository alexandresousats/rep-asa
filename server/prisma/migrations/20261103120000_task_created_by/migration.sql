ALTER TABLE "Task" ADD COLUMN "createdById" TEXT;
ALTER TABLE "Task" ADD COLUMN "createdByName" TEXT;

CREATE INDEX "Task_createdById_idx" ON "Task"("createdById");

ALTER TABLE "Task" ADD CONSTRAINT "Task_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
