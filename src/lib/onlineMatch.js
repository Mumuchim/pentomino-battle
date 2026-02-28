// src/lib/onlineMatch.js
import { requireSupabase } from "./supabase.js";
import { getCurrentPlayerId } from "./auth.js";

function uid(prefix = "g") {
  return prefix + "_" + Math.random().toString(16).slice(2) + "_" + Date.now().toString(16);
}


const LOBBY_TTL_MS = 5 * 60 * 1000;
function isLobbyExpiredClient(lobby) {
  if (!lobby) return true;
  if (lobby.status === "closed") return true;
  if (lobby.guest_id) return false;
  const ts = new Date(lobby.updated_at || lobby.created_at || 0).getTime();
  if (!ts) return false;
  return Date.now() - ts > LOBBY_TTL_MS;
}


// ─── Player identity ─────────────────────────────────────────────────────────
// Re-export getCurrentPlayerId as getGuestId for backward compatibility.
// When logged in → returns Supabase auth.uid (stable across devices).
// When guest     → returns a stable localStorage ID (same device only).
export { getCurrentPlayerId as getGuestId };

function makeCode() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export async function createLobby({ lobbyName = "", region = "auto", isPrivate = false } = {}) {
  const supabase = requireSupabase();
  const me = await getCurrentPlayerId();

  const payload = {
    code: makeCode(),
    status: "open",
    is_private: !!isPrivate,
    lobby_name: lobbyName || null,
    region,
    host_id: me,
    guest_id: null,
    host_ready: false,
    guest_ready: false,
    state: null,
    version: 0,
  };

  for (let i = 0; i < 5; i++) {
    const { data, error } = await supabase.from("pb_lobbies").insert(payload).select().single();
    if (!error) return data;
    if (!String(error.message || "").toLowerCase().includes("duplicate")) throw error;
    payload.code = makeCode();
  }
  throw new Error("Failed to create lobby (code collision). Try again.");
}

export async function quickMatch({ region = "auto" } = {}) {
  const supabase = requireSupabase();
  const me = await getCurrentPlayerId();

  // Look for an open public lobby without a guest
  const { data: openList, error: selErr } = await supabase
    .from("pb_lobbies")
    .select("*")
    .eq("status", "open")
    .eq("is_private", false)
    .is("guest_id", null)
    .order("updated_at", { ascending: true })
    .limit(5);

  if (selErr) throw selErr;

  if (openList && openList.length) {
    for (const lobby of openList) {
      if (isLobbyExpiredClient(lobby)) continue;
      // Claim it (only if still empty)
      const { data: claimed, error: updErr } = await supabase
        .from("pb_lobbies")
        .update({ guest_id: me, status: "in_game" })
        .eq("id", lobby.id)
        .is("guest_id", null)
        .select()
        .single();

      if (!updErr && claimed) return { lobby: claimed, role: "guest" };
    }
  }

  // Otherwise create one and wait
  const created = await createLobby({ lobbyName: "", region, isPrivate: false });
  return { lobby: created, role: "host" };
}

export async function joinByCode(code) {
  const supabase = requireSupabase();
  const me = await getCurrentPlayerId();
  const c = String(code || "").trim().toUpperCase();
  if (!c) throw new Error("Enter a lobby code.");

  const { data: lobby, error } = await supabase.from("pb_lobbies").select("*").eq("code", c).single();
  if (error) throw error;

  if (isLobbyExpiredClient(lobby)) throw new Error("Expired lobby.");
  if (lobby.status === "closed") throw new Error("Lobby is closed.");
  if (lobby.host_id === me) return { lobby, role: "host" };

  if (!lobby.guest_id) {
    const { data: claimed, error: updErr } = await supabase
      .from("pb_lobbies")
      .update({ guest_id: me, status: "in_game" })
      .eq("id", lobby.id)
      .is("guest_id", null)
      .select()
      .single();

    if (updErr) throw updErr;
    return { lobby: claimed, role: "guest" };
  }

  if (lobby.guest_id === me) return { lobby, role: "guest" };
  throw new Error("Lobby is full.");
}

export function subscribeLobby(lobbyId, onChange) {
  const supabase = requireSupabase();
  const ch = supabase
    .channel("pb_lobby_" + lobbyId)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "pb_lobbies", filter: `id=eq.${lobbyId}` },
      (payload) => payload?.new && onChange(payload.new)
    )
    .subscribe();

  return () => {
    try {
      supabase.removeChannel(ch);
    } catch {}
  };
}

export async function updateLobby(lobbyId, patch) {
  const supabase = requireSupabase();
  const { data, error } = await supabase.from("pb_lobbies").update(patch).eq("id", lobbyId).select().single();
  if (error) throw error;
  return data;
}