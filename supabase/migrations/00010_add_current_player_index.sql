-- Add current_player_index column for realtime spectator sync
ALTER TABLE games ADD COLUMN IF NOT EXISTS current_player_index INTEGER DEFAULT 0;

-- Add comment
COMMENT ON COLUMN games.current_player_index IS 'Index of the current player for turn tracking';
