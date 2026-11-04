-- CreateTable
CREATE TABLE "ChannelFile" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ChannelFile_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ChannelFile_messageId_idx" ON "ChannelFile"("messageId");

-- AddForeignKey
ALTER TABLE "ChannelFile" ADD CONSTRAINT "ChannelFile_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChannelMessage"("id") ON DELETE CASCADE ON UPDATE CASCADE;
