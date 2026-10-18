-- ============================================================
-- 043_ai_gemini_provider.sql — Support Google Gemini as an AI provider
--
-- Widens the provider CHECK constraints on `ai_configs` and
-- `ai_usage_log` to allow 'gemini' alongside 'openai' and 'anthropic'.
--
-- Idempotent — safe to run multiple times.
-- ============================================================

-- 1. ai_configs table: update provider CHECK constraint
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT c.conname
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
    WHERE c.conrelid = 'ai_configs'::regclass
      AND c.contype = 'c'
      AND a.attname = 'provider'
  ) LOOP
    EXECUTE 'ALTER TABLE ai_configs DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
  END LOOP;

  ALTER TABLE ai_configs
    ADD CONSTRAINT ai_configs_provider_check
    CHECK (provider IN ('openai', 'anthropic', 'gemini'));
END $$;

-- 2. ai_usage_log table: update provider CHECK constraint
DO $$
DECLARE
  r RECORD;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'ai_usage_log') THEN
    FOR r IN (
      SELECT c.conname
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.conrelid = 'ai_usage_log'::regclass
        AND c.contype = 'c'
        AND a.attname = 'provider'
    ) LOOP
      EXECUTE 'ALTER TABLE ai_usage_log DROP CONSTRAINT IF EXISTS ' || quote_ident(r.conname);
    END LOOP;

    ALTER TABLE ai_usage_log
      ADD CONSTRAINT ai_usage_log_provider_check
      CHECK (provider IN ('openai', 'anthropic', 'gemini'));
  END IF;
END $$;
