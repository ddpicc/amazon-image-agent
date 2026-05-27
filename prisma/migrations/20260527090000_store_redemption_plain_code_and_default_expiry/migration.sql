ALTER TABLE "RedemptionCode"
ADD COLUMN "plainCode" TEXT;

CREATE UNIQUE INDEX "RedemptionCode_plainCode_key" ON "RedemptionCode"("plainCode");
