ALTER TABLE "ImageGenerationRequest"
ADD COLUMN "model" TEXT,
ADD COLUMN "billingCost" INTEGER;

CREATE TABLE "ImageModelConfig" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "displayOrder" INTEGER NOT NULL DEFAULT 100,
    "standardCost" INTEGER NOT NULL DEFAULT 100,
    "aplusCost" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageModelConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageModelConfig_model_key" ON "ImageModelConfig"("model");
CREATE INDEX "ImageModelConfig_enabled_displayOrder_idx" ON "ImageModelConfig"("enabled", "displayOrder");

INSERT INTO "ImageModelConfig" (
    "id",
    "model",
    "displayName",
    "description",
    "enabled",
    "isDefault",
    "displayOrder",
    "standardCost",
    "aplusCost",
    "updatedAt"
)
VALUES
    (
        'image_model_gpt_image_2_5_flare',
        'gpt-image-2.5-flare',
        'GPT Image 2.5 Flare',
        '支持 Amazon 图组、A+ 与自由生成。',
        true,
        true,
        10,
        100,
        100,
        CURRENT_TIMESTAMP
    ),
    (
        'image_model_gemini_3_1_flash_image',
        'gemini-3.1-flash-image',
        'Gemini 3.1 Flash Image',
        '支持 Amazon 图组、A+ 与自由生成。',
        true,
        false,
        20,
        100,
        100,
        CURRENT_TIMESTAMP
    );
