-- =============================================================================
-- Pentomino Battle — Full Database Migration v2
-- Run this in: Supabase Dashboard → SQL Editor → New query
--
-- What this does:
--   1. Creates pb_matches — permanent record of every finished game
--   2. Trigger that auto-updates wins/losses in pb_profiles on match insert
--   3. record_match_result() RPC — idempotent, safe to call from both clients
--   4. claim_quickmatch_lobby() RPC — atomic quickmatch claim (no race)
--   5. cleanup_stale_lobbies() — scheduled or manual lobby garbage collection
--   6. v_leaderboard view — ready-made leaderboard query
--   7. All indexes
--   8. RLS policies
--
-- NOTE ON DRAWS: Draws are impossible in Pentomino Battle. Players draft
-- different pieces, and turns alternate — so there is always exactly one
-- player who cannot move first. The 'draws' column in pb_profiles is kept
-- for schema compatibility but will always remain 0. The trigger below has
-- no draw branch.
--
-- SAFE TO RE-RUN — everything uses IF NOT EXISTS / OR REPLACE / DROP IF EXISTS
-- =============================================================================


-- ─────────────────────────────────────────────────────────────────────────────
-- 0. EXTENSIONS
-- ─────────────────────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ─────────────────────────────────────────────────────────────────────────────
-- 1. pb_matches  ─  permanent match history
-- ─────────────────────────────────────────────────────────────────────────────
-- Every completed online game writes one row here.
-- Draws are not possible in Pentomino Battle, so winner_id is NULL only when
-- the match ended without a real game being played (dodged / abandoned).
CREATE TABLE IF NOT EXISTS pb_matches (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Which lobby hosted this game (nullable: old lobbies may be deleted)
  lobby_id      uuid,

  -- Round within the lobby (1 = first game, 2 = rematch, …)
  -- (lobby_id, round_number) is unique so both clients can call
  -- record_match_result() — only the first INSERT wins.
  round_number  int2        NOT NULL DEFAULT 1,

  -- Player IDs (auth.uid or guest localStorage ID)
  player1_id    text        NOT NULL,
  player2_id    text        NOT NULL,

  -- Outcome — winner_id/loser_id are NULL only for dodged/abandoned matches
  -- (draws cannot occur in this game)
  winner_id     text,
  loser_id      text,

  end_reason    text        NOT NULL DEFAULT 'normal',
                -- 'normal'    – winner ran out of opponent's moves
                -- 'timeout'   – battle clock hit zero
                -- 'surrender' – player gave up
                -- 'dodged'    – player didn't draft in time (no real game played)
                -- 'abandoned' – opponent disconnected mid-game

  duration_sec  int4,                  -- wall-clock seconds from match start to end
  mode          text        NOT NULL DEFAULT 'online',

  created_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT pb_matches_lobby_round_unique UNIQUE (lobby_id, round_number)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pb_matches_player1
  ON pb_matches (player1_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pb_matches_player2
  ON pb_matches (player2_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pb_matches_winner
  ON pb_matches (winner_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_pb_matches_created_at
  ON pb_matches (created_at DESC);

-- RLS: anyone can read match history; writes only via the RPC (SECURITY DEFINER)
ALTER TABLE pb_matches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "matches_select"      ON pb_matches;
CREATE POLICY "matches_select" ON pb_matches FOR SELECT USING (true);

DROP POLICY IF EXISTS "matches_insert_deny" ON pb_matches;
CREATE POLICY "matches_insert_deny" ON pb_matches FOR INSERT WITH CHECK (false);

DROP POLICY IF EXISTS "matches_update_deny" ON pb_matches;
CREATE POLICY "matches_update_deny" ON pb_matches FOR UPDATE USING (false);

DROP POLICY IF EXISTS "matches_delete_deny" ON pb_matches;
CREATE POLICY "matches_delete_deny" ON pb_matches FOR DELETE USING (false);


-- ─────────────────────────────────────────────────────────────────────────────
-- 2. pb_profiles additions
-- ─────────────────────────────────────────────────────────────────────────────
-- wins / losses / draws already exist in your schema.
-- draws will always be 0 — kept only for UI/schema compatibility.
ALTER TABLE pb_profiles
  ADD COLUMN IF NOT EXISTS total_games   int4        NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_match_at timestamptz;

-- Backfill total_games for existing rows (wins + losses; draws is always 0)
UPDATE pb_profiles
SET    total_games = wins + losses
WHERE  total_games = 0
  AND  (wins > 0 OR losses > 0);

CREATE INDEX IF NOT EXISTS idx_pb_profiles_wins
  ON pb_profiles (wins DESC);

CREATE INDEX IF NOT EXISTS idx_pb_profiles_total_games
  ON pb_profiles (total_games DESC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Trigger: auto-update pb_profiles when a match is recorded
-- ─────────────────────────────────────────────────────────────────────────────
-- Draws are NOT handled here because they cannot occur in Pentomino Battle.
-- The only cases are:
--   A) winner_id IS NOT NULL  → normal result (one winner, one loser)
--   B) winner_id IS NULL + end_reason = 'dodged'    → no game played; no stat change
--   C) winner_id IS NULL + end_reason = 'abandoned' → counts as a game played
--      (loser_id is the abandoner; victim gets +1 win)

CREATE OR REPLACE FUNCTION pb_on_match_recorded()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN

  IF NEW.winner_id IS NOT NULL AND NEW.loser_id IS NOT NULL THEN
    -- ── Case A: clean result ──────────────────────────────────────────────
    INSERT INTO pb_profiles (id, wins, losses, total_games, updated_at, last_match_at)
      VALUES (NEW.winner_id, 1, 0, 1, now(), now())
      ON CONFLICT (id) DO UPDATE
        SET wins          = pb_profiles.wins + 1,
            total_games   = pb_profiles.total_games + 1,
            last_match_at = now(),
            updated_at    = now();

    INSERT INTO pb_profiles (id, wins, losses, total_games, updated_at, last_match_at)
      VALUES (NEW.loser_id, 0, 1, 1, now(), now())
      ON CONFLICT (id) DO UPDATE
        SET losses        = pb_profiles.losses + 1,
            total_games   = pb_profiles.total_games + 1,
            last_match_at = now(),
            updated_at    = now();

  ELSIF NEW.winner_id IS NULL AND NEW.end_reason = 'abandoned' THEN
    -- ── Case C: opponent abandoned ────────────────────────────────────────
    -- The abandoner (loser_id) gets a loss; the victim (the other player) gets a win.
    -- Both get +1 total_games because a real game was in progress.
    DECLARE
      victim_id text;
    BEGIN
      victim_id := CASE
        WHEN NEW.loser_id = NEW.player1_id THEN NEW.player2_id
        ELSE NEW.player1_id
      END;

      -- Victim earns a win
      INSERT INTO pb_profiles (id, wins, losses, total_games, updated_at, last_match_at)
        VALUES (victim_id, 1, 0, 1, now(), now())
        ON CONFLICT (id) DO UPDATE
          SET wins          = pb_profiles.wins + 1,
              total_games   = pb_profiles.total_games + 1,
              last_match_at = now(),
              updated_at    = now();

      -- Abandoner earns a loss
      INSERT INTO pb_profiles (id, wins, losses, total_games, updated_at, last_match_at)
        VALUES (NEW.loser_id, 0, 1, 1, now(), now())
        ON CONFLICT (id) DO UPDATE
          SET losses        = pb_profiles.losses + 1,
              total_games   = pb_profiles.total_games + 1,
              last_match_at = now(),
              updated_at    = now();
    END;

  END IF;
  -- Case B ('dodged'): neither player's stats change — no real game was played.

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pb_match_recorded ON pb_matches;
CREATE TRIGGER trg_pb_match_recorded
  AFTER INSERT ON pb_matches
  FOR EACH ROW
  EXECUTE FUNCTION pb_on_match_recorded();


-- ─────────────────────────────────────────────────────────────────────────────
-- 4. record_match_result()  ─  idempotent RPC called from both game clients
-- ─────────────────────────────────────────────────────────────────────────────
-- Both players call this at game-over. UNIQUE(lobby_id, round_number) ensures
-- only the first INSERT lands and the trigger fires exactly once.
--
-- JS usage:
--   await supabase.rpc('record_match_result', {
--     p_lobby_id:     lobbyId,           // uuid
--     p_round:        roundNumber,       // int (1, 2, 3 …)
--     p_player1_id:   player1UserId,     // text
--     p_player2_id:   player2UserId,     // text
--     p_winner_id:    winnerUserId,      // text | null (null = dodged/abandoned)
--     p_loser_id:     loserUserId,       // text | null
--     p_end_reason:   'normal',          // 'normal'|'timeout'|'surrender'|'dodged'|'abandoned'
--     p_duration_sec: 240,               // int | null
--     p_mode:         'online',
--   })

CREATE OR REPLACE FUNCTION record_match_result(
  p_lobby_id     uuid,
  p_round        int,
  p_player1_id   text,
  p_player2_id   text,
  p_winner_id    text    DEFAULT NULL,
  p_loser_id     text    DEFAULT NULL,
  p_end_reason   text    DEFAULT 'normal',
  p_duration_sec int     DEFAULT NULL,
  p_mode         text    DEFAULT 'online'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO pb_matches (
    lobby_id, round_number,
    player1_id, player2_id,
    winner_id, loser_id,
    end_reason, duration_sec, mode
  ) VALUES (
    p_lobby_id, p_round,
    p_player1_id, p_player2_id,
    p_winner_id, p_loser_id,
    p_end_reason, p_duration_sec, p_mode
  )
  ON CONFLICT (lobby_id, round_number) DO NOTHING;
  -- Conflict = already recorded by the other client. Silently skip.
END;
$$;

GRANT EXECUTE ON FUNCTION record_match_result(uuid, int, text, text, text, text, text, int, text)
  TO authenticated, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 5. claim_quickmatch_lobby()  ─  atomic quickmatch claim
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION claim_quickmatch_lobby(claimant_id text)
RETURNS pb_lobbies
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target pb_lobbies;
BEGIN
  SELECT * INTO target
  FROM pb_lobbies
  WHERE status     = 'waiting'
    AND is_private = false
    AND guest_id   IS NULL
    AND mode       = 'quick'
    AND host_id    <> claimant_id
    AND (state -> 'meta' ->> 'terminateReason') IS NULL
    AND (state -> 'meta' ->> 'players')         IS NULL
    AND updated_at > now() - interval '5 minutes'
  ORDER BY updated_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  UPDATE pb_lobbies
  SET    guest_id   = claimant_id,
         updated_at = now(),
         state      = jsonb_build_object(
                        'meta', jsonb_build_object(
                          'kind',         target.state -> 'meta' -> 'kind',
                          'timerMinutes', target.state -> 'meta' -> 'timerMinutes',
                          'hidden',       target.state -> 'meta' -> 'hidden'
                        ),
                        'game', '{}'::jsonb
                      )
  WHERE  id       = target.id
    AND  guest_id IS NULL
  RETURNING * INTO target;

  RETURN target;
END;
$$;

GRANT EXECUTE ON FUNCTION claim_quickmatch_lobby(text) TO authenticated, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 6. cleanup_stale_lobbies()  ─  lobby garbage collection
-- ─────────────────────────────────────────────────────────────────────────────
-- Schedule with pg_cron (Supabase Pro):
--   SELECT cron.schedule(
--     'pb-cleanup-lobbies', '*/15 * * * *',
--     $$ SELECT cleanup_stale_lobbies() $$
--   );

CREATE OR REPLACE FUNCTION cleanup_stale_lobbies()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count int;
BEGIN
  WITH deleted AS (
    DELETE FROM pb_lobbies
    WHERE
      (status = 'waiting' AND guest_id IS NULL AND updated_at < now() - interval '10 minutes')
      OR (status IN ('playing', 'waiting')     AND updated_at < now() - interval '3 hours')
      OR (status = 'closed'                    AND updated_at < now() - interval '1 hour')
    RETURNING id
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION cleanup_stale_lobbies() TO authenticated, anon;


-- ─────────────────────────────────────────────────────────────────────────────
-- 7. v_leaderboard  ─  pre-built leaderboard view
-- ─────────────────────────────────────────────────────────────────────────────
-- Draws column is included for schema consistency but will always be 0.
-- Win rate is computed from total_games (wins + losses only).
DROP VIEW IF EXISTS v_leaderboard;
CREATE VIEW v_leaderboard AS
SELECT
  p.id,
  p.username,
  p.display_name,
  p.avatar_url,
  p.wins,
  p.losses,
  p.total_games,
  p.last_match_at,
  CASE
    WHEN p.total_games > 0
    THEN round((p.wins::numeric / p.total_games) * 100, 1)
    ELSE 0
  END AS win_rate_pct,
  ROW_NUMBER() OVER (
    ORDER BY p.wins DESC,
             (CASE WHEN p.total_games > 0 THEN p.wins::float / p.total_games ELSE 0 END) DESC,
             p.total_games DESC
  ) AS rank
FROM pb_profiles p
WHERE p.total_games > 0
ORDER BY rank;


-- ─────────────────────────────────────────────────────────────────────────────
-- 8. pb_lobbies indexes
-- ─────────────────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pb_lobbies_quickmatch
  ON pb_lobbies (updated_at ASC)
  WHERE status = 'waiting' AND is_private = false AND guest_id IS NULL AND mode = 'quick';

CREATE INDEX IF NOT EXISTS idx_pb_lobbies_public_browser
  ON pb_lobbies (updated_at DESC)
  WHERE status = 'waiting' AND is_private = false AND guest_id IS NULL AND mode = 'custom';

CREATE INDEX IF NOT EXISTS idx_pb_lobbies_code
  ON pb_lobbies (code);

CREATE INDEX IF NOT EXISTS idx_pb_lobbies_host_id
  ON pb_lobbies (host_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_pb_lobbies_status_updated
  ON pb_lobbies (status, updated_at ASC);


-- ─────────────────────────────────────────────────────────────────────────────
-- 9. RLS policies
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE pb_lobbies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lobbies_select_open" ON pb_lobbies;
CREATE POLICY "lobbies_select_open" ON pb_lobbies FOR SELECT USING (true);

DROP POLICY IF EXISTS "lobbies_update" ON pb_lobbies;
CREATE POLICY "lobbies_update" ON pb_lobbies FOR UPDATE USING (
  auth.uid()::text = host_id
  OR auth.uid()::text = guest_id
  OR guest_id IS NULL
);

DROP POLICY IF EXISTS "lobbies_delete" ON pb_lobbies;
CREATE POLICY "lobbies_delete" ON pb_lobbies FOR DELETE USING (
  auth.uid()::text = host_id
  OR auth.uid()::text = guest_id
);

DROP POLICY IF EXISTS "lobbies_insert" ON pb_lobbies;
CREATE POLICY "lobbies_insert" ON pb_lobbies FOR INSERT WITH CHECK (true);

ALTER TABLE pb_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "profiles_select" ON pb_profiles;
CREATE POLICY "profiles_select" ON pb_profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "profiles_update" ON pb_profiles;
CREATE POLICY "profiles_update" ON pb_profiles FOR UPDATE USING (auth.uid() = id);


-- ─────────────────────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────────────────────
