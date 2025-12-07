-- ====================================
-- Killerpool Database Schema
-- Migration: 00004_fix_uuid_min_issue
-- Description: Fix UUID MIN() issue - remove duplicates properly using DISTINCT ON
-- ====================================

-- Remove any duplicate user_id entries in player_profiles
-- (keep the oldest one based on created_at)
-- This fixes the issue where MIN(id) doesn't work with UUID types

DELETE FROM player_profiles
WHERE id NOT IN (
    SELECT DISTINCT ON (user_id) id
    FROM player_profiles
    ORDER BY user_id, created_at ASC
);

-- Ensure UNIQUE constraint exists on user_id
-- (this may already exist from previous migration, so we use IF NOT EXISTS pattern)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'player_profiles_user_id_key'
    ) THEN
        ALTER TABLE player_profiles
        ADD CONSTRAINT player_profiles_user_id_key UNIQUE (user_id);
    END IF;
END $$;

-- ====================================
-- COMMENTS
-- ====================================

COMMENT ON CONSTRAINT player_profiles_user_id_key ON player_profiles IS
'Ensures each user can have only one profile (required for proper upsert functionality)';
