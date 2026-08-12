/*
  Warnings:

  - A unique constraint covering the columns `[phone]` on the table `users` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "posts" ADD COLUMN     "view_count" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "email_verified_at" TIMESTAMPTZ(3),
ADD COLUMN     "phone" VARCHAR(30),
ADD COLUMN     "phone_verified_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");
