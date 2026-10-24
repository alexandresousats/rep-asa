-- AlterTable
ALTER TABLE "User" ADD COLUMN "firstName" TEXT;
ALTER TABLE "User" ADD COLUMN "lastName" TEXT NOT NULL DEFAULT '';

-- Backfill from legacy full name
UPDATE "User"
SET
  "firstName" = CASE
    WHEN position(' ' in trim("name")) > 0 THEN split_part(trim("name"), ' ', 1)
    ELSE trim("name")
  END,
  "lastName" = CASE
    WHEN position(' ' in trim("name")) > 0 THEN trim(substring(trim("name") from position(' ' in trim("name")) + 1))
    ELSE ''
  END
WHERE "firstName" IS NULL;

ALTER TABLE "User" ALTER COLUMN "firstName" SET NOT NULL;
