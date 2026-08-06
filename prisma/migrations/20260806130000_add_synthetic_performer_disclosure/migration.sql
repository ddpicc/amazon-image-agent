-- Store whether an Amazon image download must carry the synthetic-performer disclosure.
ALTER TABLE "ImageGenerationRequest"
ADD COLUMN IF NOT EXISTS "containsSyntheticPerformer" BOOLEAN NOT NULL DEFAULT false;
