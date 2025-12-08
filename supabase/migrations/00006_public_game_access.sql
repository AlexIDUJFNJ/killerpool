-- Migration: Add public read access for games
-- This allows anyone to view a game by its ID (for sharing game history links)

-- Add policy for anonymous users to read any game by ID
-- This enables the sharing feature where users can share game links
CREATE POLICY "Anyone can view games by id"
    ON games FOR SELECT
    TO anon
    USING (true);

-- Also allow authenticated users to view any game (not just their own)
-- This is needed for sharing between logged-in users
DROP POLICY IF EXISTS "Users can view their own games" ON games;

CREATE POLICY "Users can view any game"
    ON games FOR SELECT
    TO authenticated
    USING (true);

-- Allow anonymous users to create games (for guest users)
CREATE POLICY "Anyone can create games"
    ON games FOR INSERT
    TO anon
    WITH CHECK (created_by IS NULL);
