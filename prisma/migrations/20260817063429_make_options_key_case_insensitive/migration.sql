-- AlterTable
ALTER TABLE "options"
ALTER COLUMN "key" TYPE CITEXT USING "key"::CITEXT;
