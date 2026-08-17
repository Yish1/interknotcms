-- Keep the original VARCHAR(100) length rule after changing the column to CITEXT.
ALTER TABLE "options"
ADD CONSTRAINT "options_key_length_check"
CHECK (char_length("key") <= 100);
