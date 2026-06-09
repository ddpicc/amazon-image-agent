-- Drop foreign keys that tied image generation records to local image providers.
ALTER TABLE "ImageGenerationRequest" DROP CONSTRAINT IF EXISTS "ImageGenerationRequest_selectedProviderId_fkey";
ALTER TABLE "ImageGenerationAttempt" DROP CONSTRAINT IF EXISTS "ImageGenerationAttempt_providerId_fkey";

-- Drop indexes for removed local image provider columns.
DROP INDEX IF EXISTS "ImageGenerationRequest_selectedProviderId_idx";
DROP INDEX IF EXISTS "ImageGenerationAttempt_providerId_idx";

-- Remove local image provider relation columns from image generation records.
ALTER TABLE "ImageGenerationRequest" DROP COLUMN IF EXISTS "selectedProviderId";
ALTER TABLE "ImageGenerationAttempt" DROP COLUMN IF EXISTS "providerId";

-- Drop the unused local image provider table.
DROP INDEX IF EXISTS "ImageProvider_enabled_priority_idx";
DROP INDEX IF EXISTS "ImageProvider_name_key";
DROP TABLE IF EXISTS "ImageProvider";
