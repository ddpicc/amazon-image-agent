-- AlterEnum: add QUEUED and PROCESSING to GenerationStatus
ALTER TYPE "GenerationStatus" ADD VALUE IF NOT EXISTS 'QUEUED';
ALTER TYPE "GenerationStatus" ADD VALUE IF NOT EXISTS 'PROCESSING';

-- AlterTable: add queue/worker fields to ImageGenerationRequest
ALTER TABLE "ImageGenerationRequest"
ADD COLUMN IF NOT EXISTS "billingScene" TEXT,
ADD COLUMN IF NOT EXISTS "statusMessage" TEXT,
ADD COLUMN IF NOT EXISTS "requestPayloadJson" JSONB,
ADD COLUMN IF NOT EXISTS "workerJobId" TEXT,
ADD COLUMN IF NOT EXISTS "queuedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "startedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- CreateIndex: index status + createdAt for active-job queries
CREATE INDEX IF NOT EXISTS "ImageGenerationRequest_status_createdAt_idx" ON "ImageGenerationRequest"("status", "createdAt" DESC);
