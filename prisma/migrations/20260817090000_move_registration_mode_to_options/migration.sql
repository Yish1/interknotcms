-- Registration defaults to administrator-only. Existing installations keep an
-- explicitly configured database value if one is already present.
INSERT INTO "options" ("key", "value", "updated_at")
VALUES ('registration_mode', '"ADMIN_ONLY"'::jsonb, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
