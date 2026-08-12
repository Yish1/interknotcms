-- Preserve existing rows while replacing internal UUID keys with integer keys.
ALTER TABLE "posts" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "tags" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "post_aliases" ADD COLUMN "id_new" SERIAL;
ALTER TABLE "post_aliases" ADD COLUMN "post_id_new" INTEGER;
ALTER TABLE "post_tags" ADD COLUMN "post_id_new" INTEGER;
ALTER TABLE "post_tags" ADD COLUMN "tag_id_new" INTEGER;

UPDATE "post_aliases" AS aliases
SET "post_id_new" = posts."id_new"
FROM "posts" AS posts
WHERE aliases."post_id" = posts."id";

UPDATE "post_tags" AS post_tags
SET
  "post_id_new" = posts."id_new",
  "tag_id_new" = tags."id_new"
FROM "posts" AS posts, "tags" AS tags
WHERE post_tags."post_id" = posts."id"
  AND post_tags."tag_id" = tags."id";

ALTER TABLE "post_aliases" ALTER COLUMN "post_id_new" SET NOT NULL;
ALTER TABLE "post_tags" ALTER COLUMN "post_id_new" SET NOT NULL;
ALTER TABLE "post_tags" ALTER COLUMN "tag_id_new" SET NOT NULL;

ALTER TABLE "post_aliases" DROP CONSTRAINT "post_aliases_post_id_fkey";
ALTER TABLE "post_tags" DROP CONSTRAINT "post_tags_post_id_fkey";
ALTER TABLE "post_tags" DROP CONSTRAINT "post_tags_tag_id_fkey";
ALTER TABLE "post_aliases" DROP CONSTRAINT "post_aliases_pkey";
ALTER TABLE "post_tags" DROP CONSTRAINT "post_tags_pkey";
ALTER TABLE "posts" DROP CONSTRAINT "posts_pkey";
ALTER TABLE "tags" DROP CONSTRAINT "tags_pkey";

DROP INDEX "post_aliases_post_id_idx";
DROP INDEX "post_tags_tag_id_idx";

ALTER TABLE "post_aliases" DROP COLUMN "id", DROP COLUMN "post_id";
ALTER TABLE "post_tags" DROP COLUMN "post_id", DROP COLUMN "tag_id";
ALTER TABLE "posts" DROP COLUMN "id";
ALTER TABLE "tags" DROP COLUMN "id";

ALTER TABLE "posts" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "tags" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "post_aliases" RENAME COLUMN "id_new" TO "id";
ALTER TABLE "post_aliases" RENAME COLUMN "post_id_new" TO "post_id";
ALTER TABLE "post_tags" RENAME COLUMN "post_id_new" TO "post_id";
ALTER TABLE "post_tags" RENAME COLUMN "tag_id_new" TO "tag_id";

ALTER SEQUENCE "posts_id_new_seq" RENAME TO "posts_id_seq";
ALTER SEQUENCE "tags_id_new_seq" RENAME TO "tags_id_seq";
ALTER SEQUENCE "post_aliases_id_new_seq" RENAME TO "post_aliases_id_seq";

ALTER TABLE "posts" ADD CONSTRAINT "posts_pkey" PRIMARY KEY ("id");
ALTER TABLE "tags" ADD CONSTRAINT "tags_pkey" PRIMARY KEY ("id");
ALTER TABLE "post_aliases" ADD CONSTRAINT "post_aliases_pkey" PRIMARY KEY ("id");
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_pkey" PRIMARY KEY ("post_id", "tag_id");

CREATE INDEX "post_aliases_post_id_idx" ON "post_aliases"("post_id");
CREATE INDEX "post_tags_tag_id_idx" ON "post_tags"("tag_id");

ALTER TABLE "post_aliases" ADD CONSTRAINT "post_aliases_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_post_id_fkey"
  FOREIGN KEY ("post_id") REFERENCES "posts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "post_tags" ADD CONSTRAINT "post_tags_tag_id_fkey"
  FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE;
