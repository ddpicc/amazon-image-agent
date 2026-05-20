UPDATE "User"
SET "pointsBalance" = "pointsBalance" * 10;

UPDATE "PointsPackage"
SET "points" = "points" * 10;

UPDATE "PointsLedgerEntry"
SET
  "pointsDelta" = "pointsDelta" * 10,
  "balanceAfter" = "balanceAfter" * 10;

UPDATE "RedemptionCode"
SET "points" = "points" * 10;
