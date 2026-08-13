ALTER TABLE "tags"
ADD CONSTRAINT "tags_name_length_check"
CHECK (char_length("name"::text) <= 100);
