-- Limit the maximum nesting depth of public comments. Existing installations
-- keep an explicitly configured value if one is already present.
INSERT INTO "options" ("key", "value", "updated_at")
VALUES ('max_comment_depth', '50'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
