-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN', 'USER');

-- CreateEnum
CREATE TYPE "AnalysisStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "GenerationStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "AttemptStatus" AS ENUM ('STARTED', 'SUCCEEDED', 'FAILED');

-- CreateEnum
CREATE TYPE "SourcePage" AS ENUM ('AMAZON', 'PLAYGROUND');

-- CreateEnum
CREATE TYPE "UpstreamApiKind" AS ENUM ('UNKNOWN', 'IMAGES_EDIT', 'IMAGES_GENERATE');

-- CreateEnum
CREATE TYPE "PointsPackageStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "PointsLedgerType" AS ENUM ('REDEEM_CODE', 'PAYMENT_RECHARGE', 'GENERATION_DEBIT', 'GENERATION_REFUND', 'ADMIN_ADJUSTMENT');

-- CreateEnum
CREATE TYPE "RedemptionCodeStatus" AS ENUM ('ACTIVE', 'REDEEMED', 'DISABLED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "PaymentOrderStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'CANCELLED', 'REFUNDED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'USER',
    "pointsBalance" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AnalysisRecord" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "productName" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "targetAudience" TEXT NOT NULL,
    "referenceImageCount" INTEGER NOT NULL DEFAULT 0,
    "referenceImagesJson" JSONB,
    "status" "AnalysisStatus" NOT NULL DEFAULT 'STARTED',
    "productSummary" TEXT,
    "analysisJson" JSONB,
    "promptPlanJson" JSONB,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AnalysisRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageProvider" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "vendor" TEXT NOT NULL,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 100,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "apiKeyCiphertext" TEXT NOT NULL,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGenerationRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sourcePage" "SourcePage" NOT NULL,
    "entryApi" TEXT NOT NULL,
    "selectedProviderId" TEXT,
    "selectedProviderName" TEXT,
    "selectedProviderBaseUrl" TEXT,
    "selectedProviderModel" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "finalUpstreamApiKind" "UpstreamApiKind" NOT NULL DEFAULT 'UNKNOWN',
    "status" "GenerationStatus" NOT NULL DEFAULT 'STARTED',
    "durationMs" INTEGER,
    "prompt" TEXT NOT NULL,
    "revisedPrompt" TEXT,
    "imageType" TEXT,
    "aspectRatio" TEXT,
    "size" TEXT,
    "referenceImageCount" INTEGER NOT NULL DEFAULT 0,
    "errorMessage" TEXT,
    "pointsLedgerEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageGenerationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageGenerationAttempt" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "providerId" TEXT,
    "baseUrl" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "attemptIndex" INTEGER NOT NULL,
    "status" "AttemptStatus" NOT NULL DEFAULT 'STARTED',
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "upstreamApiKind" "UpstreamApiKind" NOT NULL DEFAULT 'UNKNOWN',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ImageGenerationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GeneratedImageAsset" (
    "id" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "cosUrl" TEXT NOT NULL,
    "cosKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GeneratedImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsPackage" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "points" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "displayOrder" INTEGER NOT NULL DEFAULT 0,
    "status" "PointsPackageStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PointsPackage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PointsLedgerEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" "PointsLedgerType" NOT NULL,
    "pointsDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "referenceType" TEXT,
    "referenceId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PointsLedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RedemptionCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "packageId" TEXT,
    "points" INTEGER NOT NULL,
    "status" "RedemptionCodeStatus" NOT NULL DEFAULT 'ACTIVE',
    "batchId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "redeemedAt" TIMESTAMP(3),
    "redeemedByUserId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RedemptionCode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentOrder" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "outTradeNo" TEXT,
    "status" "PaymentOrderStatus" NOT NULL DEFAULT 'PENDING',
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'CNY',
    "payType" TEXT,
    "provider" TEXT,
    "providerOrderId" TEXT,
    "payUrl" TEXT NOT NULL DEFAULT '',
    "payUrl2" TEXT NOT NULL DEFAULT '',
    "qrcodeUrl" TEXT NOT NULL DEFAULT '',
    "qrcodeImg" TEXT NOT NULL DEFAULT '',
    "metadata" JSONB,
    "notifyPayload" JSONB,
    "paidAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PaymentOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

-- CreateIndex
CREATE INDEX "AnalysisRecord_userId_createdAt_idx" ON "AnalysisRecord"("userId", "createdAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "ImageProvider_name_key" ON "ImageProvider"("name");

-- CreateIndex
CREATE INDEX "ImageProvider_enabled_priority_idx" ON "ImageProvider"("enabled", "priority");

-- CreateIndex
CREATE UNIQUE INDEX "ImageGenerationRequest_pointsLedgerEntryId_key" ON "ImageGenerationRequest"("pointsLedgerEntryId");

-- CreateIndex
CREATE INDEX "ImageGenerationRequest_userId_createdAt_idx" ON "ImageGenerationRequest"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ImageGenerationRequest_selectedProviderId_idx" ON "ImageGenerationRequest"("selectedProviderId");

-- CreateIndex
CREATE INDEX "ImageGenerationAttempt_requestId_attemptIndex_idx" ON "ImageGenerationAttempt"("requestId", "attemptIndex");

-- CreateIndex
CREATE INDEX "ImageGenerationAttempt_providerId_idx" ON "ImageGenerationAttempt"("providerId");

-- CreateIndex
CREATE INDEX "GeneratedImageAsset_requestId_idx" ON "GeneratedImageAsset"("requestId");

-- CreateIndex
CREATE UNIQUE INDEX "PointsPackage_name_key" ON "PointsPackage"("name");

-- CreateIndex
CREATE INDEX "PointsPackage_status_displayOrder_idx" ON "PointsPackage"("status", "displayOrder");

-- CreateIndex
CREATE UNIQUE INDEX "PointsLedgerEntry_idempotencyKey_key" ON "PointsLedgerEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_userId_createdAt_idx" ON "PointsLedgerEntry"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PointsLedgerEntry_referenceType_referenceId_idx" ON "PointsLedgerEntry"("referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionCode_codeHash_key" ON "RedemptionCode"("codeHash");

-- CreateIndex
CREATE INDEX "RedemptionCode_status_createdAt_idx" ON "RedemptionCode"("status", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "RedemptionCode_batchId_idx" ON "RedemptionCode"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_outTradeNo_key" ON "PaymentOrder"("outTradeNo");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentOrder_providerOrderId_key" ON "PaymentOrder"("providerOrderId");

-- CreateIndex
CREATE INDEX "PaymentOrder_userId_createdAt_idx" ON "PaymentOrder"("userId", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "PaymentOrder_status_createdAt_idx" ON "PaymentOrder"("status", "createdAt" DESC);

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalysisRecord" ADD CONSTRAINT "AnalysisRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationRequest" ADD CONSTRAINT "ImageGenerationRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationRequest" ADD CONSTRAINT "ImageGenerationRequest_selectedProviderId_fkey" FOREIGN KEY ("selectedProviderId") REFERENCES "ImageProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationRequest" ADD CONSTRAINT "ImageGenerationRequest_pointsLedgerEntryId_fkey" FOREIGN KEY ("pointsLedgerEntryId") REFERENCES "PointsLedgerEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationAttempt" ADD CONSTRAINT "ImageGenerationAttempt_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ImageGenerationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ImageGenerationAttempt" ADD CONSTRAINT "ImageGenerationAttempt_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ImageProvider"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GeneratedImageAsset" ADD CONSTRAINT "GeneratedImageAsset_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "ImageGenerationRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PointsLedgerEntry" ADD CONSTRAINT "PointsLedgerEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionCode" ADD CONSTRAINT "RedemptionCode_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PointsPackage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionCode" ADD CONSTRAINT "RedemptionCode_redeemedByUserId_fkey" FOREIGN KEY ("redeemedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionCode" ADD CONSTRAINT "RedemptionCode_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentOrder" ADD CONSTRAINT "PaymentOrder_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "PointsPackage"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
