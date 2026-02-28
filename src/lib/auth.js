// src/lib/auth.js
//
// Central auth module for Pentomino Battle.
// All sign-up / sign-in / sign-out logic lives here so the rest of the app
// never needs to touch supabase.auth directly.
//
// Usage:
//   import { signUp, signIn, signOut, getSession, getCurrentPlayerId,
//            getCurrentPlayerName, onAuthChange } from "@/lib/auth.js";

import { supabase } from "./supabase.js";

// ─────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────

/** Returns the Supabase session (or null if not logged in / no Supabase). */
async function _getSession() {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

// ─────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────

/**
 * Create a new account with email + password.
 * Optionally pass a `username` which gets stored in pb_profiles.
 *
 * Returns: { user, session, error }
 * On success error is null; on failure user/session are null.
 */
export async function signUp(email, password, username = "") {
  if (!supabase) return { user: null, session: null, error: new Error("Supabase not configured.") };

  const { data, error } = await supabase.auth.signUp({
    email: email.trim().toLowerCase(),
    password,
    options: {
      // These values are written into auth.users.raw_user_meta_data
      // and the DB trigger copies them into pb_profiles automatically.
      data: {
        username: (username || "").trim() || null,
        display_name: (username || "").trim() || null,
      },
    },
  });

  if (error) return { user: null, session: null, error };

  return {
    user: data.user,
    session: data.session,
    error: null,
  };
}

/**
 * Sign in with email + password.
 *
 * Returns: { user, session, error }
 */
export async function signIn(email, password) {
  if (!supabase) return { user: null, session: null, error: new Error("Supabase not configured.") };

  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });

  if (error) return { user: null, session: null, error };

  return {
    user: data.user,
    session: data.session,
    error: null,
  };
}

/**
 * Sign out the current user.
 * Returns: { error } — error is null on success.
 */
export async function signOut() {
  if (!supabase) return { error: null };
  const { error } = await supabase.auth.signOut();
  return { error };
}

/**
 * Returns the current Supabase Session object, or null if not logged in.
 */
export async function getSession() {
  return _getSession();
}

/**
 * Returns the current auth User object, or null.
 */
export async function getUser() {
  const session = await _getSession();
  return session?.user ?? null;
}

/**
 * Returns the player ID to use for lobbies:
 *   - If logged in  → Supabase auth.uid  (stable across devices)
 *   - If guest      → localStorage guest ID (stable on this browser)
 *
 * This is the single source of truth for host_id / guest_id in pb_lobbies.
 */
export async function getCurrentPlayerId() {
  const session = await _getSession();
  if (session?.user?.id) return session.user.id;

  // Fallback: anonymous guest ID (same logic as before)
  const key = "pb_guest_id";
  let id = localStorage.getItem(key);
  if (!id) {
    id = (crypto?.randomUUID?.() ?? `g_${Math.random().toString(16).slice(2)}_${Date.now()}`);
    localStorage.setItem(key, id);
  }
  return id;
}

/**
 * Returns the display name to show in the UI:
 *   - Logged-in user → username from pb_profiles (if available), else email prefix
 *   - Guest          → stable GUEST-XXXX name from localStorage
 */
export async function getCurrentPlayerName() {
  const session = await _getSession();

  if (session?.user) {
    // Try profile username first
    if (supabase) {
      const { data: profile } = await supabase
        .from("pb_profiles")
        .select("username, display_name")
        .eq("id", session.user.id)
        .single();

      if (profile?.display_name) return profile.display_name;
      if (profile?.username)     return profile.username;
    }

    // Fallback: derive from email
    const email = session.user.email ?? "";
    return email.split("@")[0].toUpperCase().slice(0, 16) || "PLAYER";
  }

  // Guest path
  const key = "pb_guest_name";
  let name = localStorage.getItem(key);
  if (!name) {
    const idKey = "pb_guest_id";
    const id = localStorage.getItem(idKey) ?? "";
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    name = `GUEST-${(h % 10000).toString().padStart(4, "0")}`;
    localStorage.setItem(key, name);
  }
  return name;
}

/**
 * Returns the current JWT access token (for authenticated REST/fetch calls).
 * Returns null if not logged in — callers should fall back to the anon key.
 */
export async function getAccessToken() {
  const session = await _getSession();
  return session?.access_token ?? null;
}

/**
 * Subscribe to auth state changes (login / logout / token refresh).
 * Returns an unsubscribe function.
 *
 * Callback receives: { event, session }
 *   event is one of: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED"
 *
 * Example:
 *   const unsub = onAuthChange(({ event, session }) => {
 *     loggedIn.value = !!session;
 *   });
 *   onUnmounted(unsub);
 */
export function onAuthChange(callback) {
  if (!supabase) return () => {};
  const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
    callback({ event, session });
  });
  return () => subscription.unsubscribe();
}

/**
 * Convenience: returns true if there's a live session right now.
 */
export async function isLoggedIn() {
  const session = await _getSession();
  return !!session;
}
