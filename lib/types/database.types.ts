/**
 * Database Types for Killerpool
 *
 * These types represent the structure of our Supabase database.
 * Update these after running migrations or when schema changes.
 *
 * To auto-generate types from your Supabase project:
 * npx supabase gen types typescript --project-id YOUR_PROJECT_ID > lib/types/database.types.ts
 */

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      player_profiles: {
        Row: {
          id: string
          user_id: string | null
          display_name: string
          avatar_url: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id?: string | null
          display_name: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          user_id?: string | null
          display_name?: string
          avatar_url?: string | null
          created_at?: string
          updated_at?: string
        }
      }
      games: {
        Row: {
          id: string
          created_at: string
          updated_at: string
          status: 'active' | 'completed' | 'abandoned'
          participants: Json // Array of {id, name, avatar, lives, eliminated, userId}
          winner_id: string | null
          ruleset_id: string | null
          history: Json | null // Array of {id, action, playerId, playerName, timestamp, livesBefore, livesAfter}
          created_by: string | null
          current_player_index: number | null
        }
        Insert: {
          id?: string
          created_at?: string
          updated_at?: string
          status?: 'active' | 'completed' | 'abandoned'
          participants: Json
          winner_id?: string | null
          ruleset_id?: string | null
          history?: Json | null
          created_by?: string | null
          current_player_index?: number | null
        }
        Update: {
          id?: string
          created_at?: string
          updated_at?: string
          status?: 'active' | 'completed' | 'abandoned'
          participants?: Json
          winner_id?: string | null
          ruleset_id?: string | null
          history?: Json | null
          created_by?: string | null
          current_player_index?: number | null
        }
      }
      user_achievements: {
        Row: {
          id: string
          user_id: string
          achievement_type: string
          unlocked_at: string
          game_id: string | null
        }
        Insert: {
          id?: string
          user_id: string
          achievement_type: string
          unlocked_at?: string
          game_id?: string | null
        }
        Update: {
          id?: string
          user_id?: string
          achievement_type?: string
          unlocked_at?: string
          game_id?: string | null
        }
      }
      rulesets: {
        Row: {
          id: string
          name: string
          description: string | null
          params: Json // {starting_lives, miss, pot, pot_black, max_lives}
          created_at: string
          is_default: boolean
        }
        Insert: {
          id?: string
          name: string
          description?: string | null
          params: Json
          created_at?: string
          is_default?: boolean
        }
        Update: {
          id?: string
          name?: string
          description?: string | null
          params?: Json
          created_at?: string
          is_default?: boolean
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_leaderboard: {
        Args: { limit_count?: number }
        Returns: {
          player_id: string
          display_name: string
          avatar_url: string | null
          total_games: number
          games_won: number
          games_lost: number
          win_rate: number
          total_actions: number
          total_black_pots: number
          rank: number
        }[]
      }
      check_achievements: {
        Args: { p_user_id: string; p_game_id: string }
        Returns: {
          achievement_type: string
          is_new: boolean
        }[]
      }
    }
    Enums: {
      game_status: 'active' | 'completed' | 'abandoned'
    }
  }
}
