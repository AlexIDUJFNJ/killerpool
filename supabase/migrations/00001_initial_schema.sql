-- ====================================
-- Killerpool Database Schema
-- Migration: 00001_initial_schema
-- Description: Initial database setup with tables for player profiles, games, and rulesets
-- ====================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ====================================
-- ENUMS
-- ====================================

-- Game status enum
CREATE TYPE game_status AS ENUM ('active', 'completed', 'abandoned');

-- ====================================
-- TABLES
-- ====================================

-- Player Profiles
-- Stores player information (linked to Supabase Auth users or anonymous)
CREATE TABLE IF NOT EXISTS player_profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Constraints
    CONSTRAINT display_name_length CHECK (char_length(display_name) >= 1 AND char_length(display_name) <= 50)
);

-- Create index on user_id for faster lookups
CREATE INDEX IF NOT EXISTS idx_player_profiles_user_id ON player_profiles(user_id);

-- Rulesets
-- Defines game rules (starting lives, point values, etc.)
CREATE TABLE IF NOT EXISTS rulesets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    params JSONB NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_default BOOLEAN NOT NULL DEFAULT FALSE,

    -- Constraints
    CONSTRAINT name_length CHECK (char_length(name) >= 1 AND char_length(name) <= 100),
    CONSTRAINT valid_params CHECK (
        params ? 'starting_lives' AND
        params ? 'miss' AND
        params ? 'pot' AND
        params ? 'pot_black'
    )
);

-- Create index for default ruleset lookups
CREATE INDEX IF NOT EXISTS idx_rulesets_is_default ON rulesets(is_default) WHERE is_default = TRUE;

-- Games
-- Stores game sessions and their state
CREATE TABLE IF NOT EXISTS games (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    status game_status NOT NULL DEFAULT 'active',
    participants JSONB NOT NULL,
    winner_id UUID,
    ruleset_id UUID REFERENCES rulesets(id) ON DELETE SET NULL,
    history JSONB DEFAULT '[]'::jsonb,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,

    -- Constraints
    CONSTRAINT valid_participants CHECK (jsonb_array_length(participants) >= 2),
    CONSTRAINT valid_history CHECK (jsonb_typeof(history) = 'array')
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_games_created_by ON games(created_by);
CREATE INDEX IF NOT EXISTS idx_games_status ON games(status);
CREATE INDEX IF NOT EXISTS idx_games_created_at ON games(created_at DESC);

-- ====================================
-- ROW LEVEL SECURITY (RLS)
-- ====================================

-- Enable RLS on all tables
ALTER TABLE player_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rulesets ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;

-- Player Profiles Policies
-- Users can read all profiles
CREATE POLICY "Public profiles are viewable by everyone"
    ON player_profiles FOR SELECT
    USING (true);

-- Users can insert their own profile
CREATE POLICY "Users can insert their own profile"
    ON player_profiles FOR INSERT
    WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON player_profiles FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Users can delete their own profile
CREATE POLICY "Users can delete their own profile"
    ON player_profiles FOR DELETE
    USING (auth.uid() = user_id);

-- Rulesets Policies
-- Everyone can read rulesets
CREATE POLICY "Rulesets are viewable by everyone"
    ON rulesets FOR SELECT
    USING (true);

-- Only authenticated users can create custom rulesets (optional - can be restricted to admins)
CREATE POLICY "Authenticated users can create rulesets"
    ON rulesets FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Games Policies
-- Users can view games they created or participated in
CREATE POLICY "Users can view their own games"
    ON games FOR SELECT
    USING (
        auth.uid() = created_by
        OR
        auth.uid()::text = ANY(
            SELECT jsonb_array_elements_text(participants -> 'user_id')
        )
    );

-- Users can create games
CREATE POLICY "Authenticated users can create games"
    ON games FOR INSERT
    TO authenticated
    WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Users can update games they created
CREATE POLICY "Users can update their own games"
    ON games FOR UPDATE
    USING (auth.uid() = created_by OR created_by IS NULL)
    WITH CHECK (auth.uid() = created_by OR created_by IS NULL);

-- Anonymous users can view and update games (for offline/guest mode)
-- Note: This is permissive - tighten in production if needed
CREATE POLICY "Anonymous users can manage games"
    ON games FOR ALL
    TO anon
    USING (true)
    WITH CHECK (true);

-- ====================================
-- FUNCTIONS & TRIGGERS
-- ====================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger for player_profiles
CREATE TRIGGER update_player_profiles_updated_at
    BEFORE UPDATE ON player_profiles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for games
CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ====================================
-- DEFAULT DATA
-- ====================================

-- Insert default "Classic Killer Pool" ruleset
INSERT INTO rulesets (name, description, params, is_default)
VALUES (
    'Classic Killer Pool',
    'Traditional killer pool rules: 3 starting lives, -1 for MISS, 0 for POT, +1 for POT BLACK',
    '{
        "starting_lives": 3,
        "miss": -1,
        "pot": 0,
        "pot_black": 1,
        "max_lives": 10
    }'::jsonb,
    true
)
ON CONFLICT DO NOTHING;

-- ====================================
-- COMMENTS
-- ====================================

COMMENT ON TABLE player_profiles IS 'Stores player profiles, linked to auth.users or anonymous';
COMMENT ON TABLE rulesets IS 'Defines game rulesets with customizable parameters';
COMMENT ON TABLE games IS 'Stores game sessions with participants, history, and status';

COMMENT ON COLUMN games.participants IS 'JSONB array of players: [{id, name, avatar, lives, eliminated, user_id}]';
COMMENT ON COLUMN games.history IS 'JSONB array of game actions: [{action, player_id, timestamp, lives_before, lives_after}]';
