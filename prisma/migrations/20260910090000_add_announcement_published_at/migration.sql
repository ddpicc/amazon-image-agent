-- 标记公告首次对用户发布的时间；历史公告视为已发布，便于通知页按时间展示。
ALTER TABLE "Announcement" ADD COLUMN "publishedAt" TIMESTAMP(3);

UPDATE "Announcement" SET "publishedAt" = "createdAt";

-- CreateIndex
CREATE INDEX "Announcement_publishedAt_idx" ON "Announcement"("publishedAt");
