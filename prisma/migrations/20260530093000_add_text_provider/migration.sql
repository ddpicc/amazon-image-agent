CREATE TABLE "TextProvider" (
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

    CONSTRAINT "TextProvider_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TextProvider_name_key" ON "TextProvider"("name");
CREATE INDEX "TextProvider_enabled_priority_idx" ON "TextProvider"("enabled", "priority");
