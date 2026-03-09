// src/lib/onlineMatch.js
//
// Low-level lobby helpers used by App.vue's online flow.
// Higher-level orchestration (polling loop, state sync, UI) lives in App.vue.
//
// Key improvements over previous version:
//   • quickMatch: filters out your OWN open lobbies so you can never self-join
//   • quickMatch: skips stale lobbies that have prior game data
//   • Lobby expiry checks are consistent (5-min TTL + 90s heartbeat staleness)
//   • createLobby: retries up to 5× on code collision
//   • joinByCode: guards against joining a full / expired / closed lobby
//   • All functions throw descriptive errors on failure

import { requireSupabase } from "./supabase.js";
import { getCurrentPlayerId } from "./auth.js";

// ─── Re-export player-identity helper ────────────────────────────────────────
// Both names are kept for call-site compatibility.
export { getCurrentPlayerId as getGuestId };

// ─── Constants ───────────────────────────────────────────────────────────────
const LOBBY_WAITING_TTL_MS = 5  * 60 * 1000; // 5 min max wait for a guest
const HEARTBEAT_STALE_MS   = 90 * 1000;       // 90 s without a heartbeat → host vanished
const CODE_ALPHABET        = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function makeCode() {
  let s = "";
  for (let i = 0; i < 6; i++)
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  return s;
}

/**
 * Returns true when a lobby should no longer be joinable:
 *   – status = "closed"
 *   – waiting with no guest AND updated more than 5 min ago
 *   – host heartbeat not refreshed in the last 90 s
 */
function isLobbyStale(lobby) {
  if (!lobby) return true;
  const status = String(lobby.status || "").toLowerCase();
  if (status === "closed") return true;

  // Still has an active guest — not stale
  if (lobby.guest_id) return false;

  // Heartbeat check (host may have closed the tab)
  try {
    const hb     = lobby?.state?.meta?.heartbeat || {};
    const hostTs = Number(hb?.host || 0);
    if (hostTs && Date.now() - hostTs > HEARTBEAT_STALE_MS) return true;
  } catch { /* ignore */ }

  // Age check
  const upd = Date.parse(String(lobby.updated_at || lobby.created_at || ""));
  if (Number.isFinite(upd) && Date.now() - upd > LOBBY_WAITING_TTL_MS) return true;

  return false;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Create a new lobby row in pb_lobbies.
 * Retries on code collision (up to 5 attempts).
 */
export async function createLobby({
  lobbyName = "",
  region    = "auto",
  isPrivate = false,
  mode      = "custom",
  extraStateMeta = null,
} = {}) {
  const supabase = requireSupabase();
  const me       = await getCurrentPlayerId();

  const payload = {
    code:        makeCode(),
    status:      "waiting",
    is_private:  !!isPrivate,
    lobby_name:  (lobbyName || "").slice(0, 40) || null,
    region,
    mode:        String(mode || "custom"),
    host_id:     me,
    guest_id:    null,
    host_ready:  false,
    guest_ready: false,
    state:       { meta: { ...(extraStateMeta || {}) }, game: {} },
    version:     1,
  };

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data, error } = await supabase
      .from("pb_lobbies")
      .insert(payload)
      .select()
      .single();

    if (!error) return data;

    // Only retry on duplicate-key / code collision
    const msg = String(error.message || "").toLowerCase();
    if (!msg.includes("duplicate") && !msg.includes("unique")) throw error;

    payload.code = makeCode();
  }
  throw new Error("Failed to create lobby after 5 attempts (code collision).");
}

/**
 * Join a lobby by its 6-character invite code.
 * Handles: already host, already guest, expired, full.
 */
export async function joinByCode(code) {
  const supabase = requireSupabase();
  const me       = await getCurrentPlayerId();

  const c = String(code || "").trim().toUpperCase();
  if (!c) throw new Error("Enter a lobby code.");

  const { data: lobby, error } = await supabase
    .from("pb_lobbies")
    .select("*")
    .eq("code", c)
    .single();

  if (error) throw new Error(`Lobby "${c}" not found.`);

  // Check explicit closure first (gives a specific message) before the generic stale check
  if (lobby.status === "closed") throw new Error("That lobby is closed.");
  if (isLobbyStale(lobby))       throw new Error("That lobby has expired.");

  // Already the host — return immediately without modifying anything
  if (lobby.host_id === me) return { lobby, role: "host" };

  // Already joined as guest (reconnect path)
  if (lobby.guest_id === me) return { lobby, role: "guest" };

  // Lobby is full (someone else holds the guest slot)
  if (lobby.guest_id) throw new Error("That lobby is already full.");

  // Claim the guest slot atomically
  const { data: claimed, error: updErr } = await supabase
    .from("pb_lobbies")
    .update({
      guest_id:   me,
      status:     "waiting",
      updated_at: new Date().toISOString(),
      // Wipe stale session data so ensureOnlineInitialized runs fresh
      state: {
        meta: {
          kind:         lobby?.state?.meta?.kind,
          timerMinutes: lobby?.state?.meta?.timerMinutes,
        },
        game: {},
      },
    })
    .eq("id",       lobby.id)
    .is("guest_id", null)             // guard: only if still empty
    .select()
    .single();

  if (updErr) throw updErr;
  if (!claimed) throw new Error("Someone else just joined that lobby. Try another.");

  return { lobby: claimed, role: "guest" };
}

/**
 * Subscribe to real-time changes for a specific lobby row.
 * Returns an unsubscribe function.
 */
export function subscribeLobby(lobbyId, onChange) {
  const supabase = requireSupabase();

  const channel = supabase
    .channel("pb_lobby_" + lobbyId)
    .on(
      "postgres_changes",
      {
        event:  "*",
        schema: "public",
        table:  "pb_lobbies",
        filter: `id=eq.${lobbyId}`,
      },
      (payload) => {
        if (payload?.new) onChange(payload.new);
      }
    )
    .subscribe();

  return () => {
    try { supabase.removeChannel(channel); } catch { /* ignore */ }
  };
}

/**
 * Patch arbitrary fields on a lobby row.
 * Used for ready-states, metadata, etc.
 */
export async function updateLobby(lobbyId, patch) {
  const supabase = requireSupabase();
  const { data, error } = await supabase
    .from("pb_lobbies")
    .update(patch)
    .eq("id", lobbyId)
    .select()
    .single();
  if (error) throw error;
  return data;
}
