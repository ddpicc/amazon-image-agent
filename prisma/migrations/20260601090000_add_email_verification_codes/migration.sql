CREATE TABLE "EmailVerificationCode" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailVerificationCode_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "EmailVerificationCode_email_createdAt_idx" ON "EmailVerificationCode"("email", "createdAt" DESC);
CREATE INDEX "EmailVerificationCode_email_expiresAt_idx" ON "EmailVerificationCode"("email", "expiresAt");
CREATE INDEX "EmailVerificationCode_email_consumedAt_idx" ON "EmailVerificationCode"("email", "consumedAt");
