UPDATE "tags"
SET "name" = regexp_replace("name", '[^[:alnum:]]', '', 'g')
WHERE "name" !~ '^[[:alnum:]]+$';

ALTER TABLE "tags" ALTER COLUMN "name" TYPE CITEXT;

ALTER TABLE "tags"
ADD CONSTRAINT "tags_name_alphanumeric_check"
CHECK ("name"::text ~ '^[[:alnum:]]+$');
