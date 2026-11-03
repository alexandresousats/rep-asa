ALTER TABLE "ChannelMessage" ADD COLUMN "replyToId" TEXT;

CREATE INDEX "ChannelMessage_replyToId_idx" ON "ChannelMessage"("replyToId");

ALTER TABLE "ChannelMessage" ADD CONSTRAINT "ChannelMessage_replyToId_fkey" FOREIGN KEY ("replyToId") REFERENCES "ChannelMessage"("id") ON DELETE SET NULL ON UPDATE CASCADE;
