/*
  Warnings:

  - You are about to drop the column `excerpt` on the `posts` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "posts" DROP COLUMN "excerpt",
ADD COLUMN     "summary" VARCHAR(100);
