-- Run once per database, before any tenant schema is created.
-- citext is used for case-insensitive external keys and emails.
-- gen_random_uuid() is built into PostgreSQL 13+ and needs no extension.
CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;
