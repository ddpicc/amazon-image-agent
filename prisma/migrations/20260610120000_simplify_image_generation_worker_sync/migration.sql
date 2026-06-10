ALTER TABLE "ImageGenerationRequest"
ADD COLUMN IF NOT EXISTS "imageUrl" TEXT,
DROP COLUMN IF EXISTS "selectedProviderName",
DROP COLUMN IF EXISTS "selectedProviderBaseUrl",
DROP COLUMN IF EXISTS "selectedProviderModel",
DROP COLUMN IF EXISTS "attemptCount",
DROP COLUMN IF EXISTS "finalUpstreamApiKind",
DROP COLUMN IF EXISTS "responseSnapshotJson";

DROP TABLE IF EXISTS "GeneratedImageAsset";
DROP TABLE IF EXISTS "ImageGenerationAttempt";
