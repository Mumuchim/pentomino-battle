-- =============================================================================
-- Migration: Replay Logging
-- Adds pb_replay_logs and links it to pb_matches via replay_id.
-- Safe to run multiple times (uses IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. pb_replay_logs
--    One row per completed match. Stores every ordered move event plus the
--    final board snapshot so a match can be fully reconstructed client-side.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS pb_replay_logs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Link back to the authoritative match record (nullable in case the match
  -- row hasn't been written yet or the match was local/offline).
  match_id     uuid        REFERENCES pb_matches(id) ON DELETE SET NULL,

  -- Denormalised for fast lookup without always joining pb_matches.
  lobby_id     uuid,
  player1_id   text        NOT NULL,
  player2_id   text        NOT NULL,
  winner_id    text,
  end_reason   text        NOT NULL DEFAULT 'normal',
  -- CHECK keeps the vocabulary consistent with pb_matches.
  CONSTRAINT pb_replay_end_reason_check
    CHECK (end_reason IN ('normal','timeout','surrender','dodged','abandoned')),

  -- Ordered array of move-event objects:
  -- { seq, type, player, piece?, x?, y?, rotation?, flipped?, at, _ts }
  -- _ts = milliseconds elapsed since match start (for replay scrubbing)
  events       jsonb       NOT NULL DEFAULT '[]'::jsonb,

  -- Board state at gameover: 2-D array matching boardW × boardH.
  -- Each cell is null | { player: 1|2, pieceKey: "T" }
  final_board  jsonb,

  -- Draft picks per player: { "1": ["T","L",...], "2": ["F","Y",...] }
  final_picks  jsonb,

  -- Misc metadata: boardW, boardH, mode, round, allowFlip, startedAt, etc.
  metadata     jsonb,

  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Index for looking up replays by match or lobby
CREATE INDEX IF NOT EXISTS idx_pb_replay_logs_match_id
  ON pb_replay_logs (match_id)
  WHERE match_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pb_replay_logs_lobby_id
  ON pb_replay_logs (lobby_id)
  WHERE lobby_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pb_replay_logs_player1
  ON pb_replay_logs (player1_id);

CREATE INDEX IF NOT EXISTS idx_pb_replay_logs_player2
  ON pb_replay_logs (player2_id);

-- ---------------------------------------------------------------------------
-- 2. pb_matches — add replay_id back-reference
--    Nullable: set after the replay row is inserted.
-- ---------------------------------------------------------------------------
ALTER TABLE pb_matches
  ADD COLUMN IF NOT EXISTS replay_id uuid
    REFERENCES pb_replay_logs(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pb_matches_replay_id
  ON pb_matches (replay_id)
  WHERE replay_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Row-Level Security
--    • Any authenticated user can INSERT their own replay rows.
--    • Anyone can SELECT (replays are public data).
--    • Nobody updates or deletes replay rows from the client.
-- ---------------------------------------------------------------------------
ALTER TABLE pb_replay_logs ENABLE ROW LEVEL SECURITY;

-- Drop then recreate so this file is idempotent.
DROP POLICY IF EXISTS "pb_replay_logs_insert" ON pb_replay_logs;
DROP POLICY IF EXISTS "pb_replay_logs_select" ON pb_replay_logs;

-- INSERT: authenticated users can create replays where they are a participant.
CREATE POLICY "pb_replay_logs_insert"
  ON pb_replay_logs
  FOR INSERT
  TO authenticated
  WITH CHECK (
    auth.uid()::text = player1_id
    OR auth.uid()::text = player2_id
  );

-- SELECT: public read (leaderboards, spectating, share links).
CREATE POLICY "pb_replay_logs_select"
  ON pb_replay_logs
  FOR SELECT
  USING (true);

-- ---------------------------------------------------------------------------
-- 4. update_match_replay_id(match_id, replay_id)
--    Called by the client (host only) after saving a replay row to link the
--    two records together.  Uses SECURITY DEFINER so RLS on pb_matches won't
--    block the update even when the caller only owns a participant role.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_match_replay_id(
  p_match_id  uuid,
  p_replay_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE pb_matches
     SET replay_id = p_replay_id
   WHERE id = p_match_id
     AND replay_id IS NULL;   -- idempotent: don't overwrite if already set
END;
$$;

-- Grant EXECUTE to authenticated users (host calls this after match end).
REVOKE ALL ON FUNCTION update_match_replay_id(uuid, uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION update_match_replay_id(uuid, uuid) TO authenticated;
