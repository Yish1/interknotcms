-- Comments require approval by default. Existing installations keep an
-- explicitly configured value if one is already present.
INSERT INTO "options" ("key", "value", "updated_at")
VALUES ('comment_review_required', 'true'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
