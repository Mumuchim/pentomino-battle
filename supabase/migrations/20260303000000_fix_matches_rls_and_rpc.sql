-- =============================================================================
-- FIX: pb_matches recording (run this in the Supabase SQL Editor)
-- Safe to run multiple times.
--
-- ROOT CAUSES FIXED:
--   A) Pre-existing "deny" RLS policies blocked every INSERT on pb_matches
--   B) Pre-existing trigger pb_on_match_recorded() had a type mismatch:
--      winner_id/loser_id are TEXT but it tried to INSERT into
--      pb_profiles.id which is UUID — crashing every INSERT silently
--   C) record_match_result() RPC did not exist at all
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Drop ALL existing RLS policies on pb_matches and start clean
-- ---------------------------------------------------------------------------
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE tablename = 'pb_matches'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON pb_matches', pol.policyname);
  END LOOP;
END;
$$;

ALTER TABLE pb_matches ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pb_matches_select_own"
  ON pb_matches FOR SELECT TO authenticated
  USING (auth.uid()::text = player1_id OR auth.uid()::text = player2_id);

CREATE POLICY "pb_matches_select_anon"
  ON pb_matches FOR SELECT TO anon
  USING (true);


-- ---------------------------------------------------------------------------
-- 2. Unique constraint for ON CONFLICT deduplication
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'pb_matches_lobby_round_unique'
       AND conrelid = 'pb_matches'::regclass
  ) THEN
    ALTER TABLE pb_matches
      ADD CONSTRAINT pb_matches_lobby_round_unique UNIQUE (lobby_id, round_number);
  END IF;
END;
$$;


-- ---------------------------------------------------------------------------
-- 3. Fix the broken pb_on_match_recorded() trigger
--    winner_id/loser_id are text; pb_profiles.id is uuid — must cast.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION pb_on_match_recorded()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.winner_id IS NOT NULL AND NEW.winner_id <> '' THEN
    INSERT INTO pb_profiles (id, wins, losses, total_games, win_streak, updated_at, last_match_at)
    VALUES (NEW.winner_id::uuid, 1, 0, 1, 1, now(), now())
    ON CONFLICT (id) DO UPDATE
      SET wins          = pb_profiles.wins + 1,
          total_games   = pb_profiles.total_games + 1,
          win_streak    = pb_profiles.win_streak + 1,
          last_match_at = now(),
          updated_at    = now();
  END IF;

  IF NEW.loser_id IS NOT NULL AND NEW.loser_id <> '' THEN
    INSERT INTO pb_profiles (id, wins, losses, total_games, win_streak, updated_at, last_match_at)
    VALUES (NEW.loser_id::uuid, 0, 1, 1, 0, now(), now())
    ON CONFLICT (id) DO UPDATE
      SET losses        = pb_profiles.losses + 1,
          total_games   = pb_profiles.total_games + 1,
          win_streak    = 0,
          last_match_at = now(),
          updated_at    = now();
  END IF;

  IF (NEW.winner_id IS NULL OR NEW.winner_id = '')
 AND (NEW.loser_id  IS NULL OR NEW.loser_id  = '') THEN
    UPDATE pb_profiles
       SET total_games = total_games + 1, last_match_at = now(), updated_at = now()
     WHERE id::text IN (NEW.player1_id, NEW.player2_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pb_on_match_recorded ON pb_matches;
CREATE TRIGGER pb_on_match_recorded
  AFTER INSERT ON pb_matches
  FOR EACH ROW EXECUTE FUNCTION pb_on_match_recorded();


-- ---------------------------------------------------------------------------
-- 4. Create record_match_result() RPC
--    SECURITY DEFINER bypasses all RLS. Profile stats handled by trigger.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS record_match_result(uuid,smallint,text,text,text,text,text,integer,text,text[],text[]);
DROP FUNCTION IF EXISTS record_match_result(uuid,integer,text,text,text,text,text,integer,text,text[],text[]);

CREATE FUNCTION record_match_result(
  p_lobby_id      uuid,
  p_round         integer,
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
  v_end_reason := CASE
    WHEN p_end_reason IN ('normal','timeout','surrender','dodged','abandoned') THEN p_end_reason
    ELSE 'normal'
  END;

  INSERT INTO pb_matches (
    lobby_id, round_number, player1_id, player2_id,
    winner_id, loser_id, end_reason, duration_sec, mode,
    player1_picks, player2_picks
  )
  VALUES (
    p_lobby_id, p_round::smallint, p_player1_id, p_player2_id,
    NULLIF(p_winner_id, ''), NULLIF(p_loser_id, ''),
    v_end_reason, p_duration_sec, p_mode,
    COALESCE(p_player1_picks, '{}'), COALESCE(p_player2_picks, '{}')
  )
  ON CONFLICT (lobby_id, round_number) DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM pb_matches
     WHERE lobby_id = p_lobby_id AND round_number = p_round::smallint LIMIT 1;
    RETURN json_build_object('id', v_id, 'inserted', false);
  END IF;

  RETURN json_build_object('id', v_id, 'inserted', true);
END;
$$;

REVOKE ALL ON FUNCTION record_match_result(uuid,integer,text,text,text,text,text,integer,text,text[],text[]) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION record_match_result(uuid,integer,text,text,text,text,text,integer,text,text[],text[]) TO authenticated;
GRANT  EXECUTE ON FUNCTION record_match_result(uuid,integer,text,text,text,text,text,integer,text,text[],text[]) TO anon;


-- ---------------------------------------------------------------------------
-- 5. Self-test — NULL winner/loser so trigger skips uuid cast on fake IDs
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_result     json;
  v_fake_lobby uuid := '00000000-0000-0000-0000-000000000001';
  v_fake_p1    text := '00000000-0000-0000-0000-000000000002';
  v_fake_p2    text := '00000000-0000-0000-0000-000000000003';
BEGIN
  DELETE FROM pb_matches WHERE lobby_id = v_fake_lobby;

  SELECT record_match_result(
    v_fake_lobby, 1, v_fake_p1, v_fake_p2,
    NULL, NULL, 'normal', 60, 'standard',
    ARRAY['T','L'], ARRAY['F','Y']
  ) INTO v_result;

  IF (v_result->>'inserted')::boolean IS NOT TRUE THEN
    RAISE EXCEPTION 'Self-test FAILED: %', v_result;
  END IF;

  DELETE FROM pb_matches WHERE lobby_id = v_fake_lobby;
  RAISE NOTICE 'Self-test PASSED - record_match_result is working correctly.';
END;
$$;
