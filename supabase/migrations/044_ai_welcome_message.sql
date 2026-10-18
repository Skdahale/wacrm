-- Migration 044: Add welcome_message to ai_configs
-- Stores custom welcome greeting sent immediately when a new chat triggers

ALTER TABLE ai_configs
  ADD COLUMN IF NOT EXISTS welcome_message text DEFAULT NULL;

COMMENT ON COLUMN ai_configs.welcome_message IS
  'Custom welcome greeting sent immediately on the first customer message of a new conversation.';
