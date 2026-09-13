-- Reduce routing to two explicit roles: normal primary providers and fallback providers.
ALTER TYPE "TextProviderRoutingRole" RENAME TO "TextProviderRoutingRole_old";

CREATE TYPE "TextProviderRoutingRole" AS ENUM ('AUTO', 'FALLBACK');

ALTER TABLE "TextProvider"
ALTER COLUMN "routingRole" DROP DEFAULT;

ALTER TABLE "TextProvider"
ALTER COLUMN "routingRole" TYPE "TextProviderRoutingRole"
USING CASE
  WHEN "routingRole"::text = 'FORCED_FALLBACK' THEN 'FALLBACK'::text::"TextProviderRoutingRole"
  ELSE "routingRole"::text::"TextProviderRoutingRole"
END;

ALTER TABLE "TextProvider"
ALTER COLUMN "routingRole" SET DEFAULT 'AUTO';

DROP TYPE "TextProviderRoutingRole_old";
