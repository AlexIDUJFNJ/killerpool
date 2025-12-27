-- Migration: Fix RLS policies for live sharing
-- This migration consolidates and fixes all game policies for spectator mode
-- Run this in Supabase SQL Editor to enable live sharing

-- ====================================
-- STEP 1: Drop ALL existing game policies to avoid conflicts
-- ====================================

DROP POLICY IF EXISTS "Anyone can create games" ON games;
DROP POLICY IF EXISTS "Anyone can view games by id" ON games;
DROP POLICY IF EXISTS "Anonymous users can manage games" ON games;
DROP POLICY IF EXISTS "Anonymous users can create games" ON games;
DROP POLICY IF EXISTS "Anonymous users can update games" ON games;
DROP POLICY IF EXISTS "Authenticated users can create games" ON games;
DROP POLICY IF EXISTS "Authenticated users can create and update games" ON games;
DROP POLICY IF EXISTS "Users can view their own games" ON games;
DROP POLICY IF EXISTS "Users can view any game" ON games;
DROP POLICY IF EXISTS "Users can update their own games" ON games;
DROP POLICY IF EXISTS "Users can update games" ON games;

-- ====================================
-- STEP 2: Create clean policies for live sharing
-- ====================================

-- SELECT: Anyone can view any game (required for spectator mode)
CREATE POLICY "games_select_all"
    ON games FOR SELECT
    TO anon, authenticated
    USING (true);

-- INSERT: Authenticated users can create games
CREATE POLICY "games_insert_authenticated"
    ON games FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- INSERT: Anonymous users can create games (must have created_by = NULL)
CREATE POLICY "games_insert_anon"
    ON games FOR INSERT
    TO anon
    WITH CHECK (created_by IS NULL);

-- UPDATE: Authenticated users can update their own games or games without owner
CREATE POLICY "games_update_authenticated"
    ON games FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid() OR created_by IS NULL)
    WITH CHECK (true);

-- UPDATE: Anonymous users can update games without owner
CREATE POLICY "games_update_anon"
    ON games FOR UPDATE
    TO anon
    USING (created_by IS NULL)
    WITH CHECK (created_by IS NULL);

-- DELETE: Authenticated users can delete their own games
CREATE POLICY "games_delete_authenticated"
    ON games FOR DELETE
    TO authenticated
    USING (created_by = auth.uid());

-- ====================================
-- STEP 3: Ensure realtime is enabled for games table
-- ====================================

-- Add games table to realtime publication (if not already added)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
        AND tablename = 'games'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE games;
    END IF;
END $$;

-- ====================================
-- STEP 4: Add comments for documentation
-- ====================================

COMMENT ON POLICY "games_select_all" ON games IS 'Allows anyone (including spectators) to view any game';
COMMENT ON POLICY "games_insert_authenticated" ON games IS 'Allows logged-in users to create games';
COMMENT ON POLICY "games_insert_anon" ON games IS 'Allows guest users to create games (created_by must be NULL)';
COMMENT ON POLICY "games_update_authenticated" ON games IS 'Allows logged-in users to update their games or unowned games';
COMMENT ON POLICY "games_update_anon" ON games IS 'Allows guest users to update unowned games';
COMMENT ON POLICY "games_delete_authenticated" ON games IS 'Allows logged-in users to delete their own games';

-- ====================================
-- Verification query (run to check policies)
-- ====================================
-- SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
-- FROM pg_policies WHERE tablename = 'games';
