ALTER TYPE "PointsLedgerType" ADD VALUE IF NOT EXISTS 'REFERRAL_INVITEE_BONUS';
ALTER TYPE "PointsLedgerType" ADD VALUE IF NOT EXISTS 'REFERRAL_INVITER_REWARD';

ALTER TABLE "User"
ADD COLUMN "referralCode" TEXT,
ADD COLUMN "invitedByUserId" TEXT;

UPDATE "User"
SET "referralCode" = SUBSTRING(MD5("id") FROM 1 FOR 8)
WHERE "referralCode" IS NULL;

ALTER TABLE "User"
ALTER COLUMN "referralCode" SET NOT NULL;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_invitedByUserId_idx" ON "User"("invitedByUserId");

ALTER TABLE "User"
ADD CONSTRAINT "User_invitedByUserId_fkey"
FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL
ON UPDATE CASCADE;
