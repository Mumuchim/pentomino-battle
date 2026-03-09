-- =============================================================================
-- Migration: record_match_result RPC + pb_matches RLS
--
-- This migration was MISSING from the project — it is the root cause of match
-- history never being recorded.  The client calls sb.rpc("record_match_result")
-- but the function did not exist in Supabase, causing a silent failure caught
-- by the surrounding try/catch.
--
-- Safe to run multiple times (uses IF NOT EXISTS / OR REPLACE / IF NOT EXISTS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Unique constraint on pb_matches(lobby_id, round_number)
--    Required for the ON CONFLICT DO NOTHING deduplication that the code relies
--    on (both clients call the RPC simultaneously; only the first insert wins).
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pb_matches_lobby_round_unique'
  ) THEN
    ALTER TABLE pb_matches
      ADD CONSTRAINT pb_matches_lobby_round_unique
      UNIQUE (lobby_id, round_number);
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. Row-Level Security on pb_matches
--    Without RLS policies, Supabase's default is to BLOCK all client access
--    when RLS is enabled. We enable RLS and add minimal policies:
--      • SELECT — any authenticated user can read their own matches
--      • INSERT/UPDATE — blocked from the client; handled via SECURITY DEFINER RPC
-- ---------------------------------------------------------------------------
ALTER TABLE pb_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pb_matches_select_own" ON pb_matches;
CREATE POLICY "pb_matches_select_own"
  ON pb_matches
  FOR SELECT
  TO authenticated
  USING (
    auth.uid()::text = player1_id
    OR auth.uid()::text = player2_id
  );

-- Allow anon SELECT too (for public leaderboards / spectate links)
DROP POLICY IF EXISTS "pb_matches_select_anon" ON pb_matches;
CREATE POLICY "pb_matches_select_anon"
  ON pb_matches
  FOR SELECT
  TO anon
  USING (true);

-- ---------------------------------------------------------------------------
-- 3. record_match_result(…) — SECURITY DEFINER so it can bypass RLS on
--    pb_matches and pb_profiles to write as postgres superuser.
--
--    Idempotent: ON CONFLICT (lobby_id, round_number) DO NOTHING ensures
--    only the first of the two simultaneous client calls inserts a row.
--
--    Also updates pb_profiles stats (wins, losses, total_games, win_streak,
--    last_match_at) in the same transaction so they stay in sync.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION record_match_result(
  p_lobby_id      uuid,
  p_round         smallint,
  p_player1_id    text,
  p_player2_id    text,
  p_winner_id     text    DEFAULT NULL,
  p_loser_id      text    DEFAULT NULL,
  p_end_reason    text    DEFAULT 'normal',
  p_duration_sec  integer DEFAULT NULL,
  p_mode          text    DEFAULT 'standard',
  p_player1_picks text[]  DEFAULT '{}',
  p_player2_picks text[]  DEFAULT '{}'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id         uuid;
  v_end_reason text;
BEGIN
  -- Sanitise end_reason against the CHECK constraint vocabulary
  v_end_reason := CASE
    WHEN p_end_reason IN ('normal','timeout','surrender','dodged','abandoned')
      THEN p_end_reason
    ELSE 'normal'
  END;

  -- Insert the match row — silently skip if this lobby+round already exists
  INSERT INTO pb_matches (
    lobby_id,
    round_number,
    player1_id,
    player2_id,
    winner_id,
    loser_id,
    end_reason,
    duration_sec,
    mode,
    player1_picks,
    player2_picks
  )
  VALUES (
    p_lobby_id,
    p_round,
    p_player1_id,
    p_player2_id,
    NULLIF(p_winner_id, ''),
    NULLIF(p_loser_id,  ''),
    v_end_reason,
    p_duration_sec,
    p_mode,
    COALESCE(p_player1_picks, '{}'),
    COALESCE(p_player2_picks, '{}')
  )
  ON CONFLICT (lobby_id, round_number) DO NOTHING
  RETURNING id INTO v_id;

  -- If nothing was inserted (duplicate call), fetch the existing row id
  IF v_id IS NULL THEN
    SELECT id INTO v_id
      FROM pb_matches
     WHERE lobby_id = p_lobby_id
       AND round_number = p_round
     LIMIT 1;
    -- Row already processed — return early without double-counting stats
    RETURN json_build_object('id', v_id, 'inserted', false);
  END IF;

  -- ── Update pb_profiles stats for both players ─────────────────────────────
  -- Only update if their profile row exists (guests who never signed up won't
  -- have a pb_profiles row; the UPSERT is intentionally skipped for them).

  -- Winner
  IF p_winner_id IS NOT NULL AND p_winner_id <> '' THEN
    UPDATE pb_profiles
       SET wins         = wins + 1,
           total_games  = total_games + 1,
           win_streak   = win_streak + 1,
           last_match_at = now(),
           updated_at   = now()
     WHERE id::text = p_winner_id;
  END IF;

  -- Loser
  IF p_loser_id IS NOT NULL AND p_loser_id <> '' THEN
    UPDATE pb_profiles
       SET losses       = losses + 1,
           total_games  = total_games + 1,
           win_streak   = 0,   -- reset streak on loss
           last_match_at = now(),
           updated_at   = now()
     WHERE id::text = p_loser_id;
  END IF;

  -- No-result match (dodged/abandoned with no winner/loser) — still count games
  IF (p_winner_id IS NULL OR p_winner_id = '')
  AND (p_loser_id  IS NULL OR p_loser_id  = '') THEN
    UPDATE pb_profiles
       SET total_games  = total_games + 1,
           last_match_at = now(),
           updated_at   = now()
     WHERE id::text IN (p_player1_id, p_player2_id);
  END IF;

  RETURN json_build_object('id', v_id, 'inserted', true);
END;
$$;

-- Grant execute to both authenticated users and the anon role so the Supabase
-- JS client can call it whether or not the player is signed in.
REVOKE ALL ON FUNCTION record_match_result(uuid,smallint,text,text,text,text,text,integer,text,text[],text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION record_match_result(uuid,smallint,text,text,text,text,text,integer,text,text[],text[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION record_match_result(uuid,smallint,text,text,text,text,text,integer,text,text[],text[]) TO anon;
