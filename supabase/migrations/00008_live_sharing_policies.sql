-- Migration: Enable live sharing for spectator mode
-- This ensures anonymous users can read games and authenticated users can create/update games for sharing

-- Drop potentially conflicting policies
DROP POLICY IF EXISTS "Anyone can create games" ON games;

-- Allow anyone (including anonymous) to read any game
-- This is needed for spectators to view shared games
DROP POLICY IF EXISTS "Anyone can view games by id" ON games;
CREATE POLICY "Anyone can view games by id"
    ON games FOR SELECT
    TO anon, authenticated
    USING (true);

-- Allow authenticated users to create and update games
DROP POLICY IF EXISTS "Authenticated users can create games" ON games;
CREATE POLICY "Authenticated users can create and update games"
    ON games FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- Allow authenticated users to update their own games or games with no owner
DROP POLICY IF EXISTS "Users can update their own games" ON games;
CREATE POLICY "Users can update games"
    ON games FOR UPDATE
    TO authenticated
    USING (created_by = auth.uid() OR created_by IS NULL)
    WITH CHECK (true);

-- Allow anonymous users to create games (for guest mode)
CREATE POLICY "Anonymous users can create games"
    ON games FOR INSERT
    TO anon
    WITH CHECK (created_by IS NULL);

-- Allow anonymous users to update games they created (created_by IS NULL)
DROP POLICY IF EXISTS "Anonymous users can manage games" ON games;
CREATE POLICY "Anonymous users can update games"
    ON games FOR UPDATE
    TO anon
    USING (created_by IS NULL)
    WITH CHECK (created_by IS NULL);

-- Enable realtime for games table (required for spectator mode)
-- Note: This requires enabling realtime in Supabase dashboard for the 'games' table
-- Go to Database -> Replication -> Enable for 'games' table

COMMENT ON POLICY "Anyone can view games by id" ON games IS 'Allows spectators to view any game via shared link';
COMMENT ON POLICY "Anonymous users can create games" ON games IS 'Allows guest users to create games';
COMMENT ON POLICY "Anonymous users can update games" ON games IS 'Allows guest users to update their own games';
