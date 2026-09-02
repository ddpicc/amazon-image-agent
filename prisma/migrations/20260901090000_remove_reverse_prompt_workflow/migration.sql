-- Remove reverse-prompt workflow: delete audit records, then shrink the enum.
-- Postgres cannot ALTER TYPE ... DROP VALUE, so rebuild the type via rename + swap.
-- (attempts cascade automatically; analysis/image-request links are SetNull)
DELETE FROM "AiOperation" WHERE "kind" IN ('REVERSE_PROMPT_ANALYZE', 'REVERSE_PROMPT_REFINE');

ALTER TYPE "AiOperationKind" RENAME TO "AiOperationKind_old";
CREATE TYPE "AiOperationKind" AS ENUM ('ANALYSIS', 'IMAGE_GENERATION');
ALTER TABLE "AiOperation" ALTER COLUMN "kind" TYPE "AiOperationKind" USING "kind"::text::"AiOperationKind";
DROP TYPE "AiOperationKind_old";
