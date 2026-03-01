// src/lib/replayLogger.js
//
// Lightweight match replay recorder.
//
// Usage (from App.vue):
//   import * as replayLogger from "./lib/replayLogger.js";
//
//   // When a new online match begins (both players present, meta.started_at set):
//   replayLogger.startReplay({ lobbyId, player1Id, player2Id, boardW, boardH,
//                               mode, round, allowFlip });
//
//   // Watch game.lastMove and forward each change:
//   watch(() => game.lastMove, (mv) => { if (mv) replayLogger.recordEvent(mv); });
//
//   // At gameover — after sbRecordMatchResult resolves — call:
//   const replayId = await replayLogger.saveReplay({
//     matchId,           // uuid returned by record_match_result RPC (may be null)
//     winnerId,
//     endReason,
//     finalBoard: game.board,
//     finalPicks:  game.picks,
//   });
//   // replayId can then be passed to update_match_replay_id() to back-link.
//
//   // Clear state for the next round:
//   replayLogger.clearReplay();

// ─── Versioning ──────────────────────────────────────────────────────────────
// Bump this whenever the replay event schema changes so that viewers can
// detect and refuse to play back incompatible logs.
export const CLIENT_VERSION = "1.1.0";

// Max events kept before truncation — guards against runaway logs from very
// long matches or a replay watch() that fires too frequently.
const MAX_EVENTS = 4_000;

// ─── Module-level state (one match at a time per tab) ────────────────────────

/** @type {Array<object>} */
let _events    = [];
let _startedAt = 0;

/** @type {object|null} */
let _meta = null;

// ─── Internal helpers ─────────────────────────────────────────────────────────

/**
 * Validate and sanitise the event log before persisting.
 *
 * Returns { events, corrupted } where:
 *   events    – the (possibly repaired) event array, always safe to JSON-serialise
 *   corrupted – true when repair was needed (written to metadata so operators know)
 *
 * Repairs performed:
 *   1. Truncate to MAX_EVENTS (oldest entries kept, extras dropped from tail).
 *   2. Strip events missing mandatory fields (type, player).
 *   3. Coerce _ts to a finite number.
 *   4. Deep-clone through JSON round-trip to flush any non-serialisable values.
 */
function validateEvents(raw) {
  let events    = Array.isArray(raw) ? raw : [];
  let corrupted = false;

  // 1. Truncate
  if (events.length > MAX_EVENTS) {
    events    = events.slice(0, MAX_EVENTS);
    corrupted = true;
    console.warn(`[replayLogger] events truncated to ${MAX_EVENTS}`);
  }

  // 2. Filter structurally invalid entries
  const before = events.length;
  events = events.filter((e) => {
    if (!e || typeof e !== "object") return false;
    if (!e.type || !e.player) return false;
    return true;
  });
  if (events.length !== before) corrupted = true;

  // 3. Coerce _ts
  events = events.map((e) => ({
    ...e,
    _ts: Number.isFinite(e._ts) ? e._ts : 0,
  }));

  // 4. JSON round-trip — catches Dates, undefined, circular refs, BigInts etc.
  try {
    events = JSON.parse(JSON.stringify(events));
  } catch (roundTripErr) {
    console.warn("[replayLogger] JSON round-trip failed, clearing events:", roundTripErr?.message);
    events    = [];
    corrupted = true;
  }

  return { events, corrupted };
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Start accumulating events for a new match.
 * Safe to call multiple times — each call resets state completely.
 *
 * @param {{
 *   lobbyId?:    string,
 *   player1Id?:  string,
 *   player2Id?:  string,
 *   boardW?:     number,
 *   boardH?:     number,
 *   mode?:       string,
 *   round?:      number,
 *   allowFlip?:  boolean,
 * }} meta
 */
export function startReplay(meta = {}) {
  _events    = [];
  _startedAt = Date.now();
  _meta      = {
    lobbyId:   meta.lobbyId   || null,
    player1Id: meta.player1Id || null,
    player2Id: meta.player2Id || null,
    boardW:    meta.boardW    ?? 10,
    boardH:    meta.boardH    ?? 6,
    mode:      meta.mode      || "online",
    round:     meta.round     ?? 1,
    allowFlip: meta.allowFlip ?? true,
    startedAt: new Date(_startedAt).toISOString(),
  };
}

/**
 * Record a single move event.
 * Attaches `_ts` (ms since match start) for replay scrubbing.
 *
 * Typically called from: watch(() => game.lastMove, …)
 *
 * The event object mirrors game.lastMove:
 *   { seq, type, player, piece?, x?, y?, rotation?, flipped?, at }
 *
 * @param {object} event
 */
export function recordEvent(event) {
  if (!_meta) return; // replay not started — safe no-op
  if (!event || typeof event !== "object") return;

  // Deduplicate by sequence number so a reactive re-watch doesn't double-log.
  if (
    _events.length > 0 &&
    _events[_events.length - 1].seq === event.seq &&
    event.seq != null
  ) return;

  _events.push({
    ...event,
    // milliseconds since match start — enables client-side replay scrubbing
    _ts: Date.now() - _startedAt,
  });
}

/**
 * Persist the accumulated replay to pb_replay_logs.
 * Returns the new row's uuid on success, or null on failure.
 *
 * Non-fatal: network/auth errors are logged but never thrown so they cannot
 * break the post-game UX.
 *
 * @param {{
 *   matchId?:    string|null,
 *   winnerId?:   string|null,
 *   endReason?:  string,
 *   finalBoard?: any[][],
 *   finalPicks?: { 1: string[], 2: string[] },
 * }} opts
 * @returns {Promise<string|null>}
 */
export async function saveReplay({
  matchId    = null,
  winnerId   = null,
  endReason  = "normal",
  finalBoard = null,
  finalPicks = null,
} = {}) {
  if (!_meta) return null;

  const VALID_REASONS = ["normal","timeout","surrender","dodged","abandoned"];
  const safeReason = VALID_REASONS.includes(endReason) ? endReason : "normal";

  // ── Validate + repair event log before persisting ──────────────────────────
  const { events: safeEvents, corrupted } = validateEvents(_events);

  // ── Safe-clone board / picks (guard against non-serialisable structures) ───
  let safeBoard = null;
  let safePicks = null;
  try { safeBoard = finalBoard ? JSON.parse(JSON.stringify(finalBoard)) : null; } catch { safeBoard = null; }
  try { safePicks = finalPicks ? JSON.parse(JSON.stringify(finalPicks)) : null; } catch { safePicks = null; }

  const payload = {
    match_id:    matchId   || null,
    lobby_id:    _meta.lobbyId,
    player1_id:  _meta.player1Id,
    player2_id:  _meta.player2Id,
    winner_id:   winnerId  || null,
    end_reason:  safeReason,
    events:      safeEvents,
    final_board: safeBoard,
    final_picks: safePicks,
    metadata: {
      boardW:         _meta.boardW,
      boardH:         _meta.boardH,
      mode:           _meta.mode,
      round:          _meta.round,
      allowFlip:      _meta.allowFlip,
      startedAt:      _meta.startedAt,
      eventCount:     safeEvents.length,
      client_version: CLIENT_VERSION,
      ...(corrupted ? { corrupted: true } : {}),
    },
  };

  try {
    const { requireSupabase } = await import("./supabase.js");
    const sb = requireSupabase();

    const { data, error } = await sb
      .from("pb_replay_logs")
      .insert(payload)
      .select("id")
      .single();

    if (error) throw error;

    const replayId = data?.id ?? null;
    console.info("[replayLogger] saved replay", replayId, `(${_events.length} events)`);
    return replayId;
  } catch (e) {
    console.warn("[replayLogger] saveReplay failed:", e?.message ?? e);
    return null;
  }
}

/**
 * Link a just-saved replay row to its pb_matches row via the
 * update_match_replay_id() RPC.  Call this after saveReplay() when you have
 * both IDs.  Non-fatal.
 *
 * @param {string} matchId
 * @param {string} replayId
 */
export async function linkReplayToMatch(matchId, replayId) {
  if (!matchId || !replayId) return;
  try {
    const { requireSupabase } = await import("./supabase.js");
    const sb = requireSupabase();
    await sb.rpc("update_match_replay_id", {
      p_match_id:  matchId,
      p_replay_id: replayId,
    });
  } catch (e) {
    console.warn("[replayLogger] linkReplayToMatch failed:", e?.message ?? e);
  }
}

/**
 * Reset module state.
 * Call at the start of every new round / on leaving the online screen
 * to avoid replays bleeding across matches.
 */
export function clearReplay() {
  _events    = [];
  _startedAt = 0;
  _meta      = null;
}

/**
 * Whether a replay session is currently active.
 * @returns {boolean}
 */
export function isRecording() {
  return _meta !== null;
}

/**
 * Current event count (useful for debug/assertions).
 * @returns {number}
 */
export function eventCount() {
  return _events.length;
}

/**
 * Deep-cloned snapshot of current events + meta.
 * Call BEFORE clearReplay() to capture the final state.
 * @returns {{ events: object[], meta: object } | null}
 */
export function getSnapshot() {
  if (!_meta) return null;
  try {
    return {
      events: JSON.parse(JSON.stringify(_events)),
      meta:   JSON.parse(JSON.stringify(_meta)),
    };
  } catch {
    return { events: [..._events], meta: { ..._meta } };
  }
}
