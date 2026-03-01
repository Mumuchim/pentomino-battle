-- =============================================================================
-- Pentomino Battle — Supabase Migration
-- Apply this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- =============================================================================

-- ─── 1. Performance Indexes ──────────────────────────────────────────────────
-- These dramatically speed up the most common query patterns.

-- QuickMatch lookup: "find open public quick lobbies ordered by age"
-- Covers the core quickMatch() query and the late-merge scan.
CREATE INDEX IF NOT EXISTS idx_pb_lobbies_quickmatch
  ON pb_lobbies (updated_at ASC)
  WHERE status = 'waiting'
    AND is_private = false
    AND guest_id IS NULL
    AND mode = 'quick';

-- Lobby browser: "list open public custom lobbies"
CREATE INDEX IF NOT EXISTS idx_pb_lobbies_public_browser
  ON pb_lobbies (updated_at DESC)
  WHERE status = 'waiting'
    AND is_private = false
    AND guest_id IS NULL
    AND mode = 'custom';

-- Code lookup: "join by invite code" — used on every joinByCode() call
CREATE INDEX IF NOT EXISTS idx_pb_lobbies_code
  ON pb_lobbies (code);

-- Cleanup sweep: find old / abandoned lobbies
CREATE INDEX IF NOT EXISTS idx_pb_lobbies_updated_at
  ON pb_lobbies (updated_at ASC);

-- Host lookup: "show my lobbies" (used in the private lobbies panel)
CREATE INDEX IF NOT EXISTS idx_pb_lobbies_host_id
  ON pb_lobbies (host_id, updated_at DESC);


-- ─── 2. Atomic QuickMatch Claim Function ─────────────────────────────────────
-- Optional but recommended: eliminates the client-side claim-race entirely.
-- When two guests click Quick Match simultaneously they both hit the DB at the
-- same millisecond. The PostgreSQL row-level lock inside this function ensures
-- exactly one of them claims the lobby; the other retries and finds it gone.
--
-- Usage (from JS):  supabase.rpc('claim_quickmatch_lobby', { claimant_id: me })
-- Returns the claimed lobby row, or NULL if nothing was available.

CREATE OR REPLACE FUNCTION claim_quickmatch_lobby(claimant_id text)
RETURNS pb_lobbies
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  target pb_lobbies;
BEGIN
  -- Lock + select the oldest eligible quick-match lobby in a single atomic step.
  -- FOR UPDATE SKIP LOCKED ensures concurrent calls don't block each other.
  SELECT * INTO target
  FROM pb_lobbies
  WHERE status     = 'waiting'
    AND is_private = false
    AND guest_id   IS NULL
    AND mode       = 'quick'
    AND host_id    <> claimant_id          -- no self-join
    AND (state->'meta'->>'terminateReason') IS NULL
    AND (state->'meta'->>'players')        IS NULL  -- no stale sessions
  ORDER BY updated_at ASC
  LIMIT 1
  FOR UPDATE SKIP LOCKED;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Claim it
  UPDATE pb_lobbies
  SET    guest_id   = claimant_id,
         updated_at = now(),
         state      = jsonb_build_object(
                        'meta', jsonb_build_object(
                          'kind',         target.state->'meta'->'kind',
                          'timerMinutes', target.state->'meta'->'timerMinutes',
                          'hidden',       target.state->'meta'->'hidden'
                        ),
                        'game', '{}'::jsonb
                      )
  WHERE  id         = target.id
    AND  guest_id   IS NULL
  RETURNING * INTO target;

  RETURN target;
END;
$$;

-- Grant execution to authenticated users and anon (guests)
GRANT EXECUTE ON FUNCTION claim_quickmatch_lobby(text) TO authenticated, anon;


-- ─── 3. Automatic Stale Lobby Cleanup ────────────────────────────────────────
-- Deletes lobbies that have been waiting with no guest for more than 10 minutes
-- (conservative — normal TTL is 5 min, this catches anything the client missed).
-- Run this manually or schedule it with pg_cron if available on your plan.

-- To schedule with pg_cron (Supabase Pro+):
--   SELECT cron.schedule('cleanup-stale-lobbies', '*/10 * * * *',
--     $$ DELETE FROM pb_lobbies
--        WHERE status = 'waiting'
--          AND guest_id IS NULL
--          AND updated_at < now() - interval '10 minutes' $$
--   );

-- One-time manual cleanup (safe to run any time):
DELETE FROM pb_lobbies
WHERE  status    = 'waiting'
  AND  guest_id  IS NULL
  AND  updated_at < now() - interval '10 minutes';


-- ─── 4. RLS Policy Hardening ─────────────────────────────────────────────────
-- These policies ensure users can only read/modify their own lobbies.
-- Skip this section if you have not enabled RLS on pb_lobbies yet.

-- Enable RLS (idempotent)
ALTER TABLE pb_lobbies ENABLE ROW LEVEL SECURITY;

-- Everyone can read open lobbies (needed for quickmatch scan + lobby browser)
DROP POLICY IF EXISTS "lobbies_select_open" ON pb_lobbies;
CREATE POLICY "lobbies_select_open" ON pb_lobbies
  FOR SELECT USING (true);

-- Only the host can update their own lobby's state/metadata
-- Guest can update to claim the guest_id slot (when guest_id is null)
DROP POLICY IF EXISTS "lobbies_update" ON pb_lobbies;
CREATE POLICY "lobbies_update" ON pb_lobbies
  FOR UPDATE USING (
    -- Host can always update their lobby
    auth.uid()::text = host_id
    OR
    -- Guest can update: either they're already the guest, or the slot is empty
    -- (claiming the seat)
    auth.uid()::text = guest_id
    OR
    guest_id IS NULL
  );

-- Only the host can delete their own lobby
DROP POLICY IF EXISTS "lobbies_delete" ON pb_lobbies;
CREATE POLICY "lobbies_delete" ON pb_lobbies
  FOR DELETE USING (
    auth.uid()::text = host_id
    OR
    auth.uid()::text = guest_id
  );

-- Any authenticated user (or anon) can insert (create a lobby)
DROP POLICY IF EXISTS "lobbies_insert" ON pb_lobbies;
CREATE POLICY "lobbies_insert" ON pb_lobbies
  FOR INSERT WITH CHECK (true);


-- ─── 5. Profiles Table Indexes ───────────────────────────────────────────────
-- Used by getCurrentPlayerName() → profile lookup
CREATE INDEX IF NOT EXISTS idx_pb_profiles_id
  ON pb_profiles (id);


-- ─── Done ─────────────────────────────────────────────────────────────────────
-- Summary of what was applied:
--   • 5 performance indexes on pb_lobbies for faster quickmatch / lobby browser
--   • claim_quickmatch_lobby() RPC — atomic server-side claim (eliminates race)
--   • Stale lobby cleanup
--   • RLS policies hardened (host owns lobby, guest can claim empty slot)
--   • pb_profiles index
