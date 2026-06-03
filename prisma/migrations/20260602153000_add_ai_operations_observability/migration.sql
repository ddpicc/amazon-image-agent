-- CreateEnum
CREATE TYPE "AiOperationKind" AS ENUM ('ANALYSIS', 'IMAGE_GENERATION', 'REVERSE_PROMPT_ANALYZE', 'REVERSE_PROMPT_REFINE');

-- CreateEnum
CREATE TYPE "AiProviderType" AS ENUM ('TEXT', 'IMAGE');

-- AlterTable
ALTER TABLE "AnalysisRecord"
ADD COLUMN "operationId" TEXT,
ADD COLUMN "requestSnapshotJson" JSONB,
ADD COLUMN "responseSnapshotJson" JSONB,
ADD COLUMN "completedAt" TIMESTAMP(3),
ADD COLUMN "durationMs" INTEGER;

-- AlterTable
ALTER TABLE "ImageGenerationRequest"
ADD COLUMN "operationId" TEXT,
ADD COLUMN "finalPrompt" TEXT,
ADD COLUMN "referenceImagesJson" JSONB,
ADD COLUMN "requestSnapshotJson" JSONB,
ADD COLUMN "responseSnapshotJson" JSONB;

-- AlterTable
ALTER TABLE "ImageGenerationAttempt"
ADD COLUMN "operationAttemptId" TEXT,
ADD COLUMN "requestSnapshotJson" JSONB,
ADD COLUMN "responseSnapshotJson" JSONB;

-- AlterTable
ALTER TABLE "GeneratedImageAsset"
ADD COLUMN "operationId" TEXT,
ADD COLUMN "upstreamSourceUrl" TEXT;

-- CreateTable
CREATE TABLE "AiOperation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "AiOperationKind" NOT NULL,
    "sourcePage" TEXT,
    "entryPoint" TEXT,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "inputSummaryJson" JSONB,
    "outputSummaryJson" JSONB,
    "requestSnapshotJson" JSONB,
    "responseSnapshotJson" JSONB,
    "finalPrompt" TEXT,
    "errorMessage" TEXT,
    "pointsLedgerEntryId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AiOperationAttempt" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "providerType" "AiProviderType" NOT NULL,
    "providerId" TEXT,
    "providerName" TEXT,
    "baseUrl" TEXT,
    "model" TEXT,
    "attemptIndex" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "upstreamApiKind" "UpstreamApiKind" NOT NULL DEFAULT 'UNKNOWN',
    "requestSnapshotJson" JSONB,
    "responseSnapshotJson" JSONB,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiOperationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AnalysisRecord_operationId_key" ON "AnalysisRecord"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenerationRequest_operationId_key" ON "ImageGenerationRequest"("operationId");

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenerationAttempt_operationAttemptId_key" ON "ImageGenerationAttempt"("operationAttemptId");

-- CreateIndex
CREATE INDEX "GeneratedImageAsset_operationId_idx" ON "GeneratedImageAsset"("operationId");

-- CreateIndex
CREATE INDEX "AiOperation_userId_createdAt_idx" ON "AiOperation"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiOperation_kind_createdAt_idx" ON "AiOperation"("kind", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiOperation_status_createdAt_idx" ON "AiOperation"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "AiOperationAttempt_operationId_attemptIndex_idx" ON "AiOperationAttempt"("operationId", "attemptIndex");

-- CreateIndex
CREATE INDEX "AiOperationAttempt_status_createdAt_idx" ON "AiOperationAttempt"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "AnalysisRecord"
ADD CONSTRAINT "AnalysisRecord_operationId_fkey"
FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationRequest"
ADD CONSTRAINT "ImageGenerationRequest_operationId_fkey"
FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationAttempt"
ADD CONSTRAINT "ImageGenerationAttempt_operationAttemptId_fkey"
FOREIGN KEY ("operationAttemptId") REFERENCES "AiOperationAttempt"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImageAsset"
ADD CONSTRAINT "GeneratedImageAsset_operationId_fkey"
FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperation"
ADD CONSTRAINT "AiOperation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AiOperationAttempt"
ADD CONSTRAINT "AiOperationAttempt_operationId_fkey"
FOREIGN KEY ("operationId") REFERENCES "AiOperation"("id") ON DELETE CASCADE ON UPDATE CASCADE;