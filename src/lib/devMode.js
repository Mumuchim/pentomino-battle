// src/lib/devMode.js
import { ref, readonly } from 'vue';
import { supabase } from './supabase.js';

const STORAGE_KEY = 'pb_dev_matches';
const MAX_SAVED   = 20;
const MAX_EVENTS  = 500;

const _isDevUser     = ref(false);
const _devModeActive = ref(false);
const _checked       = ref(false);
const _savedMatches  = ref([]);
let   _session       = null;
let   _storageLoaded = false;

function _loadStorage() {
  if (_storageLoaded) return;
  _storageLoaded = true;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    // Prune any previously-saved matches with null winner (from old race condition bug)
    _savedMatches.value = parsed.filter(m => m.winner !== null && m.winner !== undefined);
  } catch { _savedMatches.value = []; }
}

function _persistStorage() {
  try {
    const trimmed = _savedMatches.value.slice(-MAX_SAVED);
    _savedMatches.value = trimmed;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  } catch (e) { console.warn('[devMode] localStorage write failed:', e?.message); }
}

export async function checkDevStatus() {
  if (!supabase) return false;
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user?.id) {
    _isDevUser.value = false; _devModeActive.value = false; _checked.value = true;
    return false;
  }
  const { data, error } = await supabase
    .from('pb_profiles').select('is_dev').eq('id', session.user.id).single();
  const isDev = !error && data?.is_dev === true;
  _isDevUser.value = isDev;
  if (!isDev) _devModeActive.value = false;
  _checked.value = true;
  return isDev;
}

export function startRecording(meta = {}) {
  _loadStorage();
  _session = {
    id: `dev_${Date.now()}_${Math.random().toString(16).slice(2,8)}`,
    startedAt: new Date().toISOString(),
    meta: {
      boardW: meta.boardW ?? 10, boardH: meta.boardH ?? 6,
      aiDifficulty: meta.aiDifficulty ?? null, aiPlayer: meta.aiPlayer ?? null,
      allowFlip: meta.allowFlip ?? true, mode: meta.mode ?? 'vsai',
    },
    events: [], boardSnapshots: [], draftPicks: null,
    finalBoard: null, winner: null, endedAt: null, duration: null,
  };
}

export function recordMove(move, gameState = {}) {
  if (!_session || !move) return;
  if (_session.events.length >= MAX_EVENTS) return;
  const last = _session.events[_session.events.length - 1];
  if (last?.seq === move.seq && move.seq != null) return;
  _session.events.push({
    ...move,
    _ts: Date.now() - new Date(_session.startedAt).getTime(),
    _remaining: gameState.remaining
      ? { 1: [...(gameState.remaining[1]||[])], 2: [...(gameState.remaining[2]||[])] }
      : undefined,
  });
  if (move.type === 'place' && gameState.board) {
    try { _session.boardSnapshots.push({ seq: move.seq, board: JSON.parse(JSON.stringify(gameState.board)) }); } catch {}
  }
  if (move.type === 'start_placement' && gameState.picks) {
    try { _session.draftPicks = JSON.parse(JSON.stringify(gameState.picks)); } catch {}
  }
}

export function saveRecording({ winner = null, board = null, picks = null } = {}) {
  if (!_session) return null;
  // Guard against double-save (race condition from dual watchers)
  const sessionId = _session.id;
  _loadStorage();
  if (_savedMatches.value.some(m => m.id === sessionId)) {
    _session = null; return sessionId;
  }
  const now = Date.now();
  _session.winner   = winner;
  _session.endedAt  = new Date(now).toISOString();
  _session.duration = now - new Date(_session.startedAt).getTime();
  try {
    if (board) _session.finalBoard = JSON.parse(JSON.stringify(board));
    if (picks && !_session.draftPicks) _session.draftPicks = JSON.parse(JSON.stringify(picks));
  } catch {}
  _savedMatches.value.push({ ..._session });
  _persistStorage();
  _session = null;
  return sessionId;
}

export function discardRecording() { _session = null; }
export function isRecording() { return _session !== null; }
export function deleteMatch(id) {
  _loadStorage();
  _savedMatches.value = _savedMatches.value.filter(m => m.id !== id);
  _persistStorage();
}
export function clearAllMatches() {
  _savedMatches.value = [];
  try { localStorage.removeItem(STORAGE_KEY); } catch {}
}

export function useDevMode() {
  _loadStorage();
  return {
    isDevUser:     readonly(_isDevUser),
    devModeActive: readonly(_devModeActive),
    checked:       readonly(_checked),
    savedMatches:  readonly(_savedMatches),
    toggleDevMode() { if (_isDevUser.value) _devModeActive.value = !_devModeActive.value; },
    checkDevStatus, startRecording, recordMove, saveRecording,
    discardRecording, isRecording, deleteMatch, clearAllMatches,
  };
}
