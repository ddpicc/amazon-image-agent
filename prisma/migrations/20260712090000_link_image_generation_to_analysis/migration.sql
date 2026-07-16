-- Link image generation requests to the analysis record they belong to.
ALTER TABLE "ImageGenerationRequest" ADD COLUMN "analysisRecordId" TEXT;

ALTER TABLE "ImageGenerationRequest"
  ADD CONSTRAINT "ImageGenerationRequest_analysisRecordId_fkey"
  FOREIGN KEY ("analysisRecordId") REFERENCES "AnalysisRecord"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ImageGenerationRequest_analysisRecordId_idx"
  ON "ImageGenerationRequest"("analysisRecordId");
