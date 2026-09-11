CREATE TYPE "TextProviderRoutingRole" AS ENUM ('AUTO', 'FALLBACK', 'FORCED_FALLBACK');

ALTER TABLE "TextProvider"
ADD COLUMN "routingRole" "TextProviderRoutingRole" NOT NULL DEFAULT 'AUTO';

-- GLM is the designated forced fallback, including providers created before this field existed.
UPDATE "TextProvider"
SET "routingRole" = 'FORCED_FALLBACK'
WHERE LOWER(TRIM("model")) = 'glm-5.3-flash';
