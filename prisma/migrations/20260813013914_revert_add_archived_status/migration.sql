/*
  Warnings:

  - The values [archived] on the enum `post_status` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
UPDATE "posts" SET "status" = 'draft' WHERE "status" = 'archived';
CREATE TYPE "post_status_new" AS ENUM ('draft', 'published');
ALTER TABLE "public"."posts" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "posts" ALTER COLUMN "status" TYPE "post_status_new" USING ("status"::text::"post_status_new");
ALTER TYPE "post_status" RENAME TO "post_status_old";
ALTER TYPE "post_status_new" RENAME TO "post_status";
DROP TYPE "public"."post_status_old";
ALTER TABLE "posts" ALTER COLUMN "status" SET DEFAULT 'draft';
COMMIT;
