
import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { useGameStore } from "./store/game";

import Board from "./components/Board.vue";
import DraftPanel from "./components/DraftPanel.vue";
import PiecePicker from "./components/PiecePicker.vue";
import Controls from "./components/Controls.vue";

const game = useGameStore();

const screen = ref("auth");
const loggedIn = ref(false);
const allowFlip = ref(true);

const logoUrl = new URL("./assets/logo.png", import.meta.url).href;

const quick = reactive({
  lobbyName: "",
  isPrivate: false,
  joinCode: "",
});

const rankedTier = computed(() => (loggedIn.value ? "Wood" : "—"));

const isInGame = computed(() => screen.value === "couch" || screen.value === "ai" || screen.value === "online");
const modeLabel = computed(() =>
  screen.value === "ai" ? "Practice vs AI" : screen.value === "couch" ? "Couch Play" : screen.value === "online" ? "Online Match" : "—"
);

const phaseTitle = computed(() => {
  if (game.phase === "draft") return "Draft";
  if (game.phase === "place") return "Battle";
  if (game.phase === "gameover") return "Game Over";
  return game.phase || "—";
});

const phaseSub = computed(() => {
  if (game.phase === "draft") return `Draft pick: P${game.draftTurn}`;
  if (game.phase === "place") return `Turn: P${game.currentPlayer}`;
  return "";
});

const canGoBack = computed(() =>
  ["mode", "quick", "quick_find", "quick_make", "settings", "credits", "ranked"].includes(screen.value)
);

// ✅ Online match
const isOnline = computed(() => screen.value === "online");
const myPlayer = ref(null); // 1 | 2 | null
const onlineSyncing = ref(false);

const onlineTurnText = computed(() => {
  if (!isOnline.value || !myPlayer.value) return "";
  if (game.phase === "gameover") return "";
  if (game.phase === "draft") return game.draftTurn === myPlayer.value ? "Your turn" : `Waiting for Player ${game.draftTurn}...`;
  if (game.phase === "place") return game.currentPlayer === myPlayer.value ? "Your turn" : `Waiting for Player ${game.currentPlayer}...`;
  return "";
});

const pingText = computed(() => {
  const v = online.pingMs;
  if (v === null || v === undefined) return "—";
  const ms = Math.max(0, Math.round(v));
  return `${ms}ms`;
});

const nowTick = ref(Date.now());

/* =========================
   ✅ UI LOADING / INPUT LOCK
   (Blocks clicks until the screen is visually ready)
========================= */
const uiLock = reactive({
  // Default to OFF so a failed/unmounted boot won't leave a permanent black screen.
  active: false,
  label: "Booting…",
  hint: "Preparing the neon arena…",
  progress: 0,
  _timer: null,
  _minUntil: 0,
});

function startUiLock({ label = "Loading…", hint = "Please wait…", minMs = 650 } = {}) {
  uiLock.active = true;
  uiLock.label = label;
  uiLock.hint = hint;
  uiLock._minUntil = Date.now() + Math.max(0, minMs);

  if (uiLock._timer) clearInterval(uiLock._timer);
  uiLock.progress = Math.min(uiLock.progress || 0, 0.15);
  uiLock._timer = setInterval(() => {
    uiLock.progress = Math.min(0.92, uiLock.progress + (0.92 - uiLock.progress) * 0.08 + 0.01);
  }, 90);
}

function stopUiLock() {
  const done = () => {
    uiLock.progress = 1;
    uiLock.active = false;
    if (uiLock._timer) clearInterval(uiLock._timer);
    uiLock._timer = null;
  };
  const left = uiLock._minUntil - Date.now();
  if (left > 0) setTimeout(done, left);
  else done();
}

function stopUiLockAfterPaint(extraMinMs = 650) {
  // Ensure at least two frames have rendered before allowing clicks.
  uiLock._minUntil = Math.max(uiLock._minUntil, Date.now() + Math.max(0, extraMinMs));
  // Some browsers/tabs can stall rAF (background tab, throttling). Add a hard fallback.
  const hardStop = setTimeout(() => stopUiLock(), extraMinMs + 2200);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      clearTimeout(hardStop);
      stopUiLock();
    })
  );
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

const turnTimerText = computed(() => {
  if (!isInGame.value) return "";
  if (game.phase === "gameover") return "";
  if (isOnline.value && !myPlayer.value) return "";

  if (game.phase === "draft") {
    if (!game.turnStartedAt) return "";
    const limit = game.turnLimitDraftSec || 30;
    const left = Math.max(0, limit - (nowTick.value - game.turnStartedAt) / 1000);
    const s = Math.ceil(left);
    return `Time: ${s}s`;
  }

  const p1 = fmtClock(game.battleClockSec?.[1] ?? 0);
  const p2 = fmtClock(game.battleClockSec?.[2] ?? 0);
  return `Clock P1 ${p1} · P2 ${p2}`;
});

// Top-right button
const primaryMatchActionLabel = computed(() => {
  if (!isInGame.value) return "";
  if (isOnline.value) return game.phase === "gameover" ? "Play Again" : "Surrender";
  return "Reset Match";
});

const canAct = computed(() => {
  if (!isOnline.value) return true;
  if (!myPlayer.value) return false;
  if (game.phase === "gameover") return false;
  if (game.phase === "draft") return game.draftTurn === myPlayer.value;
  if (game.phase === "place") return game.currentPlayer === myPlayer.value;
  return false;
});

// ✅ Lock input briefly when entering heavy screens (prevents early clicks before UI is painted)
watch(
  () => screen.value,
  (nv, ov) => {
    if (nv === ov) return;
    if (["online", "couch", "ai"].includes(nv)) {
      startUiLock({ label: "Loading match…", hint: "Syncing visuals and state…", minMs: 850 });
      stopUiLockAfterPaint(850);
    }
    if (["auth", "mode", "quick", "quick_find", "quick_make", "settings", "credits", "ranked"].includes(nv)) {
      // If we navigated back to menus, ensure the lock isn't stuck.
      if (uiLock.active && Date.now() > uiLock._minUntil) stopUiLock();
    }
  }
);

/* =========================
   ✅ MODAL SYSTEM
========================= */
const modal = reactive({
  open: false,
  title: "Notice",
  message: "",
  tone: "info", // "info" | "bad" | "good" | "victory"
  actions: [],
  locked: false,
});

const modalLines = computed(() => String(modal.message || "").split("\n").filter(Boolean));
const modalDotClass = computed(() =>
  modal.tone === "bad" ? "bad" : modal.tone === "victory" ? "victory" : modal.tone === "good" ? "good" : "info"
);

const modalCardClass = computed(() => ({
  modalVictory: modal.tone === "victory",
  modalDanger: modal.tone === "bad",
  modalResult: isResultModal.value,
}));

// Hide the X when it would do the exact same thing as the only action button.
const showModalX = computed(() => {
  if (modal.locked) return false;
  const acts = Array.isArray(modal.actions) ? modal.actions : [];
  if (acts.length === 1) {
    const lbl = String(acts[0]?.label || "").trim().toLowerCase();
    if (lbl === "ok" || lbl === "close") return false;
  }
  return true;
});

// ✅ Result-style modal (Victory/Defeat) helpers + confetti
const isResultModal = computed(() => {
  const t = String(modal.title || "").toUpperCase().trim();
  if (t === "VICTORY" || t === "DEFEAT") return true;
  if (t === "MATCH ENDED") return true;
  if (/^PLAYER\s*[12]\s+WINS$/.test(t)) return true;
  return false;
});

const showConfetti = computed(() => modal.open && String(modal.title || '').toUpperCase().trim() === 'VICTORY');
const confettiPieces = ref([]);

function genConfetti(n = 70) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const left = Math.random() * 100;
    const delay = Math.random() * 0.25;
    const dur = 0.9 + Math.random() * 0.8;
    const rot = Math.floor(Math.random() * 360);
    const drift = (Math.random() * 2 - 1) * 26;
    const size = 6 + Math.random() * 8;
    out.push({ id: i + '-' + Date.now(), left, delay, dur, rot, drift, size });
  }
  confettiPieces.value = out;
}

watch(showConfetti, (v) => {
  if (v) {
    genConfetti(78);
    // refresh once for longer animations
    window.setTimeout(() => { if (showConfetti.value) genConfetti(60); }, 520);
  } else {
    confettiPieces.value = [];
  }
});

const resultBigTitle = computed(() => {
  if (!isResultModal.value) return String(modal.title || "");
  return String(modal.title || "").toUpperCase().trim();
});

const resultSubTitle = computed(() => {
  if (!isResultModal.value) return "";
  const t = String(modal.title || "").toUpperCase().trim();
  if (t === "VICTORY") return "YOU WIN";
  if (t === "DEFEAT") return "YOU LOSE";
  return "";
});

const resultHeroClass = computed(() => {
  const t = String(modal.title || "").toUpperCase().trim();
  return {
    victory: t === "VICTORY",
    defeat: t === "DEFEAT",
    couchP1: t === "PLAYER 1 WINS",
    couchP2: t === "PLAYER 2 WINS",
  };
});


// ✅ Ping indicator helpers
const pingLevelClass = computed(() => {
  const ms = Number(online.pingMs ?? NaN);
  if (!Number.isFinite(ms)) return 'na';
  if (ms <= 120) return 'good';
  if (ms <= 300) return 'mid';
  return 'bad';
});

async function copyToClipboard(text) {
  try {
    await navigator.clipboard.writeText(String(text || ''));
    showModal({ title: 'Copied', tone: 'good', message: 'Copied to clipboard.' });
  } catch {
    // fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = String(text || '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      showModal({ title: 'Copied', tone: 'good', message: 'Copied to clipboard.' });
    } catch {
      showModal({ title: 'Copy Failed', tone: 'bad', message: 'Could not copy. Please copy manually.' });
    }
  }
}

function copyLobbyCode() {
  if (!online.code) return;
  copyToClipboard(online.code);
}

function showModal({ title = "Notice", message = "", tone = "info", actions = null, locked = false } = {}) {
  modal.title = title;
  modal.message = message;
  modal.tone = tone;
  // If actions is explicitly provided as an array (even empty), respect it.
  // If actions is null/undefined, default to a single OK button.
  if (Array.isArray(actions)) modal.actions = actions;
  else modal.actions = [{ label: "OK", tone: "primary" }];
  modal.locked = !!locked;
  modal.open = true;
}

function closeModal() {
  modal.open = false;
  modal.actions = [];
  modal.locked = false;
}

function onModalAction(a) {
  try {
    if (a && typeof a.onClick === "function") return a.onClick();
  } finally {
    if (modal.open) closeModal();
  }
}

/* =========================
   ✅ Hijack alert() -> Modal
========================= */
let originalAlert = null;
let tickTimer = null;

/* =========================
   QUICK MATCH — Supabase REST
========================= */
const online = reactive({
  lobbyId: null,
  code: null,
  role: null, // "host" | "guest"
  polling: false,
  pollTimer: null,
  lastAppliedVersion: 0,
  lastSeenUpdatedAt: null,
  applyingRemote: false,
  pingMs: null,
  localDirty: false,
  lastHostId: null,
  lastGuestId: null,
  waitingForOpponent: true,
  hostWaitStartedAt: null,
});

const publicLobbies = ref([]);
const loadingPublic = ref(false);

function getGuestId() {
  const k = "pb_guest_id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = (crypto?.randomUUID?.() || `g_${Math.random().toString(16).slice(2)}_${Date.now()}`).toString();
    localStorage.setItem(k, id);
  }
  return id;
}

function sbConfig() {
  const url = import.meta.env.VITE_SUPABASE_URL;
  const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
  return { url, anon };
}

function sbHeaders() {
  const { anon } = sbConfig();
  return {
    apikey: anon,
    Authorization: `Bearer ${anon}`,
    "Content-Type": "application/json",
  };
}

function sbRestUrl(pathAndQuery) {
  const { url } = sbConfig();
  const base = String(url || "").replace(/\/+$/, "");
  return `${base}/rest/v1/${pathAndQuery}`;
}

async function ensureSupabaseReadyOrExplain() {
  const { url, anon } = sbConfig();
  if (!url || !anon) {
    showModal({
      title: "Supabase Not Connected",
      tone: "bad",
      message:
        "Missing .env values.\n\nAdd these to your project root .env:\nVITE_SUPABASE_URL=...\nVITE_SUPABASE_ANON_KEY=...\n\nThen restart: npm run dev",
    });
    return false;
  }
  return true;
}

function stopPolling() {
  online.polling = false;
  onlineSyncing.value = false;
  if (online.pollTimer) clearInterval(online.pollTimer);
  online.pollTimer = null;
}

async function leaveOnlineLobby(reason = "left") {
  if (!online.lobbyId) return;
  if (!isOnline.value) return;

  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    const me = getGuestId();
    const nextVersion = Number(lobby.version || 0) + 1;
    const st = lobby.state || {};
    const meta = st.meta || {};

    const isPublicQuick = lobby.is_private === false;
    const matchEndedLocally = game.phase === "gameover";

    if (online.role === "host") {
      const nextState = {
        ...st,
        meta: {
          ...meta,
          terminateReason: "host_left",
          terminated_at: new Date().toISOString(),
          terminated_by: me,
          reason,
        },
      };

      // ✅ Prefer DELETE so we don't leave dead lobbies behind.
      // If RLS blocks delete, we close+invalidate so nobody can join.
      try {
        const ok = await sbDeleteLobby(online.lobbyId);
        if (!ok) {
          await sbForcePatchState(online.lobbyId, {
            status: "closed",
            state: nextState,
            version: nextVersion,
            updated_at: new Date().toISOString(),
          });
        }
      } catch {
        await sbForcePatchState(online.lobbyId, {
          status: "closed",
          state: nextState,
          version: nextVersion,
          updated_at: new Date().toISOString(),
        });
      }
    } else {
      const nextState = {
        ...st,
        meta: {
          ...meta,
          notice: "guest_left",
          notice_at: new Date().toISOString(),
          notice_by: me,
          reason,
        },
      };

      await sbForcePatchState(online.lobbyId, {
        guest_id: null,
        guest_ready: false,
        status: "waiting",
        state: nextState,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      });

      // ✅ If this was a public quick-match lobby and the match already ended,
      // clear it from DB so history doesn't pile up.
      if (isPublicQuick && matchEndedLocally) {
        try {
          const ok = await sbDeleteLobby(online.lobbyId);
          if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: "ended", reason: "quick_cleanup" });
        } catch {
          // ignore
        }
      }
    }
  } catch {
    // best-effort
  }
}

async function sbSelectLobbyById(id) {
  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(id)}&select=*`), {
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`Select lobby failed (${res.status})`);
  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbSelectLobbyByCode(code) {
  const safe = String(code || "").trim();
  const res = await fetch(sbRestUrl(`pb_lobbies?code=eq.${encodeURIComponent(safe)}&select=*`), {
    headers: sbHeaders(),
  });
  if (!res.ok) throw new Error(`Lookup by code failed (${res.status})`);
  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbListPublicWaitingLobbies() {
  const q = [
    // include host/guest so we can show 1/2 or 2/2 and clean up 0/2 rows
    "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state",
    "status=eq.waiting",
    "is_private=eq.false",
    "guest_id=is.null",
    "order=updated_at.desc",
    "limit=25",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`List public lobbies failed (${res.status})`);
  return await res.json();
}

async function sbCreateLobby({ isPrivate = false, lobbyName = "" } = {}) {
  const hostId = getGuestId();
  const code = `PB-${Math.random().toString(16).slice(2, 6).toUpperCase()}${Math.random()
    .toString(16)
    .slice(2, 6)
    .toUpperCase()}`;

  const payload = {
    code,
    status: "waiting",
    is_private: !!isPrivate,
    lobby_name: String(lobbyName || "").slice(0, 40),
    host_id: hostId,
    guest_id: null,
    host_ready: false,
    guest_ready: false,
    state: {},
    version: 1,
  };

  const res = await fetch(sbRestUrl("pb_lobbies"), {
    method: "POST",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Create lobby failed (${res.status})\n${txt}`);
  }

  const rows = await res.json();
  return rows?.[0] || null;
}

async function sbJoinLobby(lobbyId) {
  const guestId = getGuestId();

  // ✅ Guard join so you can't join closed/full/expired lobbies.
  // This PATCH will only succeed if the lobby is still waiting and has no guest.
  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}&guest_id=is.null&status=eq.waiting`), {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      guest_id: guestId,
      status: "full",
      updated_at: new Date().toISOString(),
    }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Join lobby failed (${res.status})\n${txt}`);
  }

  const rows = await res.json();
  return rows?.[0] || null;
}

/* =========================
   ✅ Lobby hygiene helpers
========================= */
const LOBBY_WAITING_TTL_MS = 5 * 60 * 1000; // 5 minutes (prevents joining very old / abandoned rooms)

function lobbyPlayerCount(lobby) {
  return (lobby?.host_id ? 1 : 0) + (lobby?.guest_id ? 1 : 0);
}

function lobbyCountLabel(lobby) {
  return `${lobbyPlayerCount(lobby)}/2`;
}

function parseIsoMs(iso) {
  const t = Date.parse(String(iso || ""));
  return Number.isFinite(t) ? t : 0;
}

function isLobbyExpired(lobby) {
  if (!lobby) return true;
  if (String(lobby.status || "").toLowerCase() === "closed") return true;

  const pc = lobbyPlayerCount(lobby);
  if (pc === 0) return true;

  const st = lobby?.state || {};
  const meta = st?.meta || {};
  if (meta?.terminateReason === "expired") return true;

  // If it's waiting with no guest and hasn't been touched in a while, treat as abandoned.
  const upd = parseIsoMs(lobby.updated_at);
  if (String(lobby.status || "").toLowerCase() === "waiting" && !lobby.guest_id) {
    if (upd && Date.now() - upd > LOBBY_WAITING_TTL_MS) return true;
  }
  return false;
}

async function cleanupLobbyIfNeeded(lobby, { reason = "cleanup" } = {}) {
  if (!lobby?.id) return;

  const pc = lobbyPlayerCount(lobby);
  if (pc === 0) {
    try {
      const ok = await sbDeleteLobby(lobby.id);
      if (!ok) await sbCloseAndNukeLobby(lobby.id, { terminateReason: "empty", reason });
    } catch {}
    return;
  }

  if (isLobbyExpired(lobby)) {
    try {
      const ok = await sbDeleteLobby(lobby.id);
      if (!ok) await sbCloseAndNukeLobby(lobby.id, { terminateReason: "expired", reason });
    } catch {}
  }
}


async function sbDeleteLobby(id) {
  // best-effort delete. If RLS blocks DELETE, fallback to closing.
  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(id)}`), {
    method: "DELETE",
    headers: sbHeaders(),
  });
  if (res.ok) return true;
  return false;
}

async function sbCloseAndNukeLobby(id, metaPatch = {}) {
  // Fallback when DELETE is not allowed.
  const nowIso = new Date().toISOString();
  const lobby = await sbSelectLobbyById(id);
  const st = lobby?.state || {};
  const meta = st.meta || {};
  const nextState = { ...st, meta: { ...meta, ...metaPatch, closed_at: nowIso } };
  const nextVersion = Number(lobby?.version || 0) + 1;
  await sbForcePatchState(id, { status: "closed", state: nextState, version: nextVersion, updated_at: nowIso });
}

/* =========================
   ✅ ONLINE STATE SERIALIZATION
========================= */
function stableHash(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function computePlayerAssignment(code, hostId, guestId) {
  const h = stableHash(String(code || ""));
  const hostIsP1 = h % 2 === 0;
  const p1 = hostIsP1 ? hostId : guestId;
  const p2 = hostIsP1 ? guestId : hostId;
  return { hostIsP1, players: { 1: p1, 2: p2 } };
}

function getMyPlayerFromPlayers(players, myId) {
  if (!players || !myId) return null;
  if (players["1"] === myId || players[1] === myId) return 1;
  if (players["2"] === myId || players[2] === myId) return 2;
  return null;
}

function deepClone(obj) {
  // State is JSON-safe (plain objects/arrays), so JSON clone is fine and avoids reference races.
  try {
    return JSON.parse(JSON.stringify(obj));
  } catch {
    return obj;
  }
}

function buildSyncedState(meta = {}) {
  // Heartbeat lives in state.meta so we can detect silent tab closes.
  const hb = { ...(meta.heartbeat || {}) };
  if (online?.role) hb[online.role] = Date.now();
  const metaWithHb = { ...meta, heartbeat: hb };

  return {
    meta: metaWithHb,
    game: {
      phase: game.phase,
      boardW: game.boardW,
      boardH: game.boardH,
      allowFlip: game.allowFlip,

      board: deepClone(game.board),
      draftBoard: deepClone(game.draftBoard),

      draftTurn: game.draftTurn,
      currentPlayer: game.currentPlayer,

      pool: deepClone(game.pool),
      picks: deepClone(game.picks),
      remaining: deepClone(game.remaining),
      placedCount: game.placedCount,

      turnStartedAt: game.turnStartedAt,
      matchInvalid: game.matchInvalid,
      matchInvalidReason: game.matchInvalidReason,
      turnLimitDraftSec: game.turnLimitDraftSec,
      turnLimitPlaceSec: game.turnLimitPlaceSec,

      winner: game.winner,

      rematch: deepClone(game.rematch),
      rematchDeclinedBy: game.rematchDeclinedBy,

      battleClockSec: deepClone(game.battleClockSec),
      battleClockLastTickAt: game.battleClockLastTickAt,
    },
  };
}

function applySyncedState(state) {
  if (!state || !state.game) return;

  online.applyingRemote = true;
  try {
    const g = state.game;
    online.localDirty = false;

    game.$patch({
      phase: g.phase,
      boardW: g.boardW,
      boardH: g.boardH,
      allowFlip: g.allowFlip,

      board: g.board,
      draftBoard: g.draftBoard,

      draftTurn: g.draftTurn,
      currentPlayer: g.currentPlayer,

      pool: g.pool,
      picks: g.picks,
      remaining: g.remaining,
      placedCount: g.placedCount,

      turnStartedAt: g.turnStartedAt,
      matchInvalid: g.matchInvalid,
      matchInvalidReason: g.matchInvalidReason,
      turnLimitDraftSec: g.turnLimitDraftSec,
      turnLimitPlaceSec: g.turnLimitPlaceSec,

      winner: g.winner,

      rematch: g.rematch,
      rematchDeclinedBy: g.rematchDeclinedBy,
      battleClockSec: g.battleClockSec,
      battleClockLastTickAt: g.battleClockLastTickAt,
    });
  } finally {
    setTimeout(() => {
      online.applyingRemote = false;
    }, 0);
  }
}

async function sbPatchStateWithVersionGuard(lobbyId, knownVersion, patchObj) {
  const url = sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}&version=eq.${encodeURIComponent(knownVersion)}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(patchObj),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`State update failed (${res.status})\n${txt}`);
  }

  const rows = await res.json().catch(() => []);
  return rows?.[0] || null;
}

async function sbForcePatchState(lobbyId, patchObj) {
  const url = sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(patchObj),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Force update failed (${res.status})\n${txt}`);
  }
  const rows = await res.json().catch(() => []);
  return rows?.[0] || null;
}

async function pushMyState(reason = "") {
  if (!isOnline.value) return;
  if (!online.lobbyId) return;
  if (online.applyingRemote) return;

  // ✅ Only push gameplay state when you are allowed to act.
  // Allow a few non-turn actions (rematch responses / surrender).
  // IMPORTANT: after you make a move, the store immediately flips the turn to the opponent.
  // That means `canAct` becomes false *right after your move*, but we still MUST push your move
  // or the other player will never receive it.
  const nonTurnAllowed =
    reason === "surrender" || String(reason || "").startsWith("rematch_") || reason === "rematch_request";

  if (online.waitingForOpponent && !nonTurnAllowed) return;

  const me = myPlayer.value;
  const lastByMe =
    !!me &&
    !!game.lastMove &&
    Number(game.lastMove.player) === Number(me) &&
    (game.lastMove.type === "draft" ||
      game.lastMove.type === "place" ||
      game.lastMove.type === "timeout" ||
      game.lastMove.type === "dodged");

  // `watch` pushes are debounced from reactive changes.
  // Allow them when it's your turn OR when you just made the last move (even if turn already flipped).
  if (reason === "watch") {
    if (!canAct.value && !(online.localDirty && lastByMe)) return;
  } else {
    if (!canAct.value && !nonTurnAllowed) return;
  }

  onlineSyncing.value = true;
  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    const meta = lobby.state?.meta ? lobby.state.meta : {};
    const snapshot = buildSyncedState(meta);
    const nextVersion = Number(lobby.version || 0) + 1;

    let updated = await sbPatchStateWithVersionGuard(online.lobbyId, lobby.version, {
      state: snapshot,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });

    if (!updated) {
      const fresh = await sbSelectLobbyById(online.lobbyId);
      if (!fresh) return;

      updated = await sbPatchStateWithVersionGuard(online.lobbyId, fresh.version, {
        state: snapshot,
        version: Number(fresh.version || 0) + 1,
        updated_at: new Date().toISOString(),
      });

      if (!updated) {
        updated = await sbForcePatchState(online.lobbyId, {
          state: snapshot,
          version: Number(fresh.version || 0) + 1,
          updated_at: new Date().toISOString(),
        });
      }
    }

    if (updated?.version) {
      online.lastAppliedVersion = Math.max(online.lastAppliedVersion || 0, updated.version);
      online.lastSeenUpdatedAt = updated.updated_at || null;
      online.localDirty = false;
    }
  } catch {
    // quiet
  } finally {
    onlineSyncing.value = false;
  }
}

function maybeSetMyPlayerFromLobby(lobby) {
  const myId = getGuestId();
  const players = lobby?.state?.meta?.players;

  if (players) {
    myPlayer.value = getMyPlayerFromPlayers(players, myId);
    return;
  }

  if (lobby?.code && lobby?.host_id && lobby?.guest_id) {
    const { players: p } = computePlayerAssignment(lobby.code, lobby.host_id, lobby.guest_id);
    myPlayer.value = getMyPlayerFromPlayers(p, myId);
  }
}

async function ensureOnlineInitialized(lobby) {
  if (!lobby) return;

  const myId = getGuestId();
  const hasPlayers = !!lobby?.state?.meta?.players;
  if (hasPlayers) return;

  if (!lobby.host_id || !lobby.guest_id) return;

  const { players } = computePlayerAssignment(lobby.code, lobby.host_id, lobby.guest_id);

  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  const initState = buildSyncedState({
    players,
    started_at: new Date().toISOString(),
    created_by: myId,
  });

  const nextVersion = Number(lobby.version || 0) + 1;
  const updated = await sbForcePatchState(lobby.id, {
    state: initState,
    version: nextVersion,
    status: "playing",
    updated_at: new Date().toISOString(),
  });

  online.lastAppliedVersion = updated?.version || nextVersion;
}

function startPollingLobby(lobbyId, role) {
  // ✅ Prevent early clicks while the online screen + first poll are not fully rendered.
  startUiLock({ label: "Connecting…", hint: "Establishing link to lobby…", minMs: 900 });

  stopPolling();
  online.polling = true;
  online.lobbyId = lobbyId;
  online.role = role;
  online.lastAppliedVersion = 0;
  online.lastSeenUpdatedAt = null;


  // ✅ Reset per-lobby trackers (prevents false 'opponent left' on fresh lobbies)
  online.lastHostId = null;
  online.lastGuestId = null;
  online.waitingForOpponent = true;
  online.code = null;
  online.pingMs = null;
  online.localDirty = false;
  online.hostWaitStartedAt = role === "host" ? Date.now() : null;
  myPlayer.value = null;

  screen.value = "online";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  let firstPollDone = false;

  online.pollTimer = setInterval(async () => {
    try {
      onlineSyncing.value = true;

      const t0 = performance.now();
      const lobby = await sbSelectLobbyById(lobbyId);
      online.pingMs = performance.now() - t0;

      if (!lobby) {
        stopPolling();
        showModal({ title: "Lobby Closed", message: "The lobby no longer exists.", tone: "bad" });
        return;
      }

      online.code = lobby.code || online.code;

      // Keep / show the waiting modal (host only) — but don't interrupt other modals.
      if (online.role === "host" && online.waitingForOpponent && online.code) {
        if (!modal.open) {
          showWaitingForOpponentModal(online.code);
        } else if (modal.title === "Waiting for Opponent") {
          modal.message = `Waiting for opponent…\nCode: ${online.code || "—"}`;
        }
      }

      const prevGuest = online.lastGuestId;
      online.lastGuestId = lobby.guest_id || null;
      online.lastHostId = lobby.host_id || null;

      const terminateReason = lobby?.state?.meta?.terminateReason || null;
      if (lobby.status === "closed" || terminateReason === "host_left") {
        stopPolling();
        myPlayer.value = null;
        screen.value = "mode";
        showModal({
          title: "Match Terminated",
          tone: "bad",
          message: "Lobby creator left — terminating the game.\nReturning to main menu.",
        });
        return;
      }

      // ✅ Presence heartbeat: handle silent tab closes (especially important on gameover/rematch).
      try {
        const hb = lobby?.state?.meta?.heartbeat || {};
        const oppRole = online.role === "host" ? "guest" : "host";
        const oppTs = Number(hb?.[oppRole] || 0);
        const staleMs = oppTs ? Date.now() - oppTs : 0;
        const bothPresent = !!(lobby.host_id && lobby.guest_id);

        const staleHard = bothPresent && staleMs > 45_000;
        const staleOnGameOver = bothPresent && game.phase === "gameover" && staleMs > 25_000;

        if ((staleHard || staleOnGameOver) && oppRole === "host") {
          // If the host disappeared, end the match and leave.
          try {
            await sbCloseAndNukeLobby(lobbyId, { terminateReason: "host_timeout", reason: "heartbeat" });
          } catch {
            // ignore
          }
          stopPolling();
          myPlayer.value = null;
          screen.value = "mode";
          showModal({
            title: "Match Terminated",
            tone: "bad",
            message: "Lobby creator disconnected — terminating the game.\nReturning to main menu.",
          });
          return;
        }
      } catch {
        // ignore
      }

      if (online.role === "host" && !prevGuest && lobby.guest_id) {
        if (modal.open && String(modal.title || "").toLowerCase().includes("lobby ready")) closeModal();
        if (modal.open && modal.title === "Waiting for Opponent") closeModal();
        showModal({
          title: "Player Joined!",
          tone: "good",
          message: `A challenger joined your lobby.\nCode: ${lobby.code || "—"}`,
        });
      }

      // ✅ Host waiting timer: 60s to get a challenger.
      if (online.role === "host" && !lobby.guest_id && lobby.host_id) {
        if (!online.hostWaitStartedAt) online.hostWaitStartedAt = Date.now();
        const waitedMs = Date.now() - online.hostWaitStartedAt;
        if (waitedMs >= 60_000) {
          // Expire room creation.
          try {
            if (online.lobbyId) {
              const ok = await sbDeleteLobby(online.lobbyId);
              if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: "expired" });
            }
          } catch {
            // ignore
          } finally {
            stopPolling();
            myPlayer.value = null;
            screen.value = "mode";
            closeModal();
            showModal({ title: "Room Creation Expired", tone: "bad", message: "No one joined within 60 seconds." });
          }
          return;
        }
      }

      if (online.role === "host" && prevGuest && !lobby.guest_id && lobby.host_id) {
        myPlayer.value = null;
        game.turnStartedAt = null;
        game.battleClockLastTickAt = null;
        online.waitingForOpponent = true;
        online.hostWaitStartedAt = Date.now();
        showModal({
          title: "Opponent Left",
          tone: "bad",
          message: "Your opponent left.\nThis lobby will stay open and wait for a new challenger.",
          actions: [
            {
              label: "OK",
              tone: "primary",
              onClick: () => {
                showWaitingForOpponentModal(lobby.code || online.code);
              },
            },
          ],
        });
      }

      online.waitingForOpponent = !(lobby.host_id && lobby.guest_id && lobby?.state?.meta?.players);

      // If the match is ready, ensure the waiting modal is gone.
      if (!online.waitingForOpponent && modal.open && modal.title === "Waiting for Opponent") {
        closeModal();
      }

      if (lobby.host_id && lobby.guest_id) {
        await ensureOnlineInitialized(lobby);
      }

      maybeSetMyPlayerFromLobby(lobby);

      const v = Number(lobby.version || 0);
      const st = lobby.state || null;

      if (st && v && v > (online.lastAppliedVersion || 0)) {
        online.lastAppliedVersion = v;
        online.lastSeenUpdatedAt = lobby.updated_at || null;
        applySyncedState(st);
      }

      if (!firstPollDone) {
        firstPollDone = true;
        // Allow interaction after the first successful paint + poll.
        uiLock.label = "Loaded";
        uiLock.hint = "Entering match…";
        stopUiLockAfterPaint(700);
      }
    } catch {
      // keep polling quietly
    } finally {
      onlineSyncing.value = false;
    }
  }, 650);
}

/* =========================
   Auto-push on authoritative changes
========================= */
let pushDebounceTimer = null;

watch(
  () => [
    isOnline.value,
    game.phase,
    game.draftTurn,
    game.currentPlayer,
    game.winner,
    JSON.stringify(game.draftBoard),
    JSON.stringify(game.board),
    JSON.stringify(game.pool),
    JSON.stringify(game.picks),
    JSON.stringify(game.remaining),
    String(game.placedCount),
    String(game.turnStartedAt),
    String(game.matchInvalid),
    String(game.matchInvalidReason),
    String(game.winner),
    JSON.stringify(game.battleClockSec),
    String(game.battleClockLastTickAt),
    JSON.stringify(game.rematch),
    String(game.rematchDeclinedBy),
  ],
  () => {
    if (!isOnline.value) return;
    if (!online.lobbyId) return;
    if (online.applyingRemote) return;

    online.localDirty = true;

    if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
    pushDebounceTimer = setTimeout(() => pushMyState("watch"), 80);
  }
);

/* =========================
   ONLINE RESET / ACTIONS
========================= */
async function onResetClick() {
  if (!isOnline.value || !online.lobbyId) {
    game.resetGame();
    return;
  }

  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    const meta = lobby.state?.meta ? lobby.state.meta : {};
    game.boardW = 10;
    game.boardH = 6;
    game.allowFlip = allowFlip.value;
    game.resetGame();

    const snapshot = buildSyncedState(meta);
    const nextVersion = Number(lobby.version || 0) + 1;

    await sbForcePatchState(online.lobbyId, {
      state: snapshot,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });
  } catch {
    game.resetGame();
  }
}

function winnerMessage(w) {
  const me = myPlayer.value;
  if (!me) {
    // Couch/AI: title already shows the winner.
    if (!isOnline.value) return "GG!";
    return `Player ${w} wins.\nGG!`;
  }
  if (w === null || w === undefined) {
    return game.matchInvalid ? `Match invalid — ${game.matchInvalidReason || "dodged"}.` : "Match ended.";
  }
  return w === me ? "You win!\nGG!" : "Opponent wins.\nGG!";
}

function stopAndExitToMenu(note = "") {
  leaveOnlineLobby("exit").finally(() => {
    stopPolling();
    myPlayer.value = null;
    screen.value = "mode";
    if (note) showModal({ title: "Returned", tone: "info", message: note });
  });
}

async function cancelWaitingLobby() {
  try {
    if (online.lobbyId) {
      const ok = await sbDeleteLobby(online.lobbyId);
      if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: "cancel_wait" });
    }
  } catch {
    // ignore
  } finally {
    closeModal();
    stopPolling();
    myPlayer.value = null;
    screen.value = "mode";
  }
}

function showWaitingForOpponentModal(code) {
  showModal({
    title: "Waiting for Opponent",
    tone: "info",
    message: `Waiting for opponent…\nCode: ${code || "—"}`,
    actions: online.role === "host"
      ? [{ label: "Cancel Waiting", tone: "soft", onClick: cancelWaitingLobby }]
      : [],
    locked: true,
  });
}

function requestPlayAgain() {
  if (!isOnline.value) {
    onResetClick();
    return;
  }
  if (!myPlayer.value) return;

  const me = myPlayer.value;
  const other = me === 1 ? 2 : 1;

  if (game.rematchDeclinedBy) {
    stopAndExitToMenu("Rematch declined.");
    return;
  }

  // If opponent already requested, your click acts as ACCEPT.
  if (game.rematch?.[other] && !game.rematch?.[me]) {
    game.requestRematch(me);
    online.localDirty = true;
    pushMyState("rematch_yes");
    return;
  }

  // Already requested.
  if (game.rematch?.[me]) {
    showModal({
      title: "Rematch Requested",
      tone: "info",
      message: "Waiting for the other player to answer…",
      actions: [
        { label: "OK", tone: "primary" },
        { label: "Cancel & Exit", tone: "soft", onClick: () => stopAndExitToMenu("Exited match.") },
      ],
    });
    return;
  }

  game.requestRematch(me);
  online.localDirty = true;
  pushMyState("rematch_request");

  showModal({
    title: "Rematch Requested",
    tone: "info",
    message: "Waiting for the other player to answer…",
    actions: [
      { label: "OK", tone: "primary" },
      { label: "Cancel & Exit", tone: "soft", onClick: () => stopAndExitToMenu("Exited match.") },
    ],
  });
}

function onPrimaryMatchAction() {
  if (!isInGame.value) return;

  if (isOnline.value) {
    if (!myPlayer.value) return;

    if (game.phase === "gameover") {
      requestPlayAgain();
      return;
    }

    game.surrender(myPlayer.value);
    online.localDirty = true;
    pushMyState("surrender");
    return;
  }

  onResetClick();
}

/* =========================
   GAMEOVER + REMATCH UX
========================= */

function ensureRematchPrompt() {
  if (!isOnline.value) return;
  if (game.phase !== "gameover") return;
  if (!myPlayer.value) return;

  const me = myPlayer.value;
  const other = me === 1 ? 2 : 1;

  if (game.rematchDeclinedBy) return;

  // If opponent requested and you haven't responded, force the Accept/Decline prompt.
  if (game.rematch?.[other] && !game.rematch?.[me]) {
    // Avoid spamming the same modal every poll.
    if (modal.open && modal.title === "Play Again?") return;

    showModal({
      title: "Play Again?",
      tone: "good",
      message: "Opponent wants a rematch.\nDo you accept?",
      actions: [
        {
          label: "ACCEPT",
          tone: "primary",
          onClick: () => {
            game.requestRematch(me);
            online.localDirty = true;
            pushMyState("rematch_yes");
          },
        },
        {
          label: "DECLINE",
          tone: "soft",
          onClick: () => {
            game.declineRematch(me);
            online.localDirty = true;
            pushMyState("rematch_no");
          },
        },
      ],
    });
  }
}

watch(
  () => game.phase,
  (p, prev) => {
    if (p !== "gameover" || prev === "gameover") return;

    if (isOnline.value && myPlayer.value) {
      const me = myPlayer.value;
      const other = me === 1 ? 2 : 1;

      if (game.lastMove?.type === "dodged") {
        // ✅ Auto dodge ends the session for BOTH players and removes the lobby.
        const msg =
          game.matchInvalidReason ||
          `Player ${game.lastMove?.player || "?"} did not pick — automatically dodges the game.`;

        showModal({
  title: "Auto Dodge",
  tone: "bad",
  message: msg + "\n\nReturning to main menu…",
  actions: [{ label: "OK", tone: "primary" }],
});

        // terminate + cleanup in the background (best-effort)
        (async () => {
          try {
            if (online.lobbyId) {
              const ok = await sbDeleteLobby(online.lobbyId);
              if (!ok) {
                await sbCloseAndNukeLobby(online.lobbyId, {
                  terminateReason: "auto_dodge",
                  matchInvalidReason: msg,
                });
              }
            }
          } catch {
            // ignore
          } finally {
            stopPolling();
            myPlayer.value = null;
            screen.value = "mode";
          }
        })();

        return;
      }

      if (game.rematch?.[other] && !game.rematch?.[me] && !game.rematchDeclinedBy) {
        ensureRematchPrompt();
        return;
      }
    }

    const w = game.winner;
    const me = myPlayer.value;
    const iWin = me && (w === me);
    const isBad = game.lastMove?.type === "timeout" || game.lastMove?.type === "surrender";

    // ✅ Result modal copy rules:
    // - Couch/AI: show PLAYER 1 WINS / PLAYER 2 WINS
    // - Online: show VICTORY / DEFEAT per screen
    let title = "MATCH ENDED";
    let tone = "good";

    if (!isOnline.value) {
      title = w ? `PLAYER ${w} WINS` : "MATCH ENDED";
      tone = w ? "victory" : "good";
    } else {
      title = iWin ? "VICTORY" : w ? "DEFEAT" : "MATCH ENDED";
      tone = iWin ? "victory" : isBad ? "bad" : "good";
    }

    showModal({
      title,
      message: winnerMessage(w ?? "?"),
      tone,
      actions: isOnline.value
        ? [
            { label: "Play Again", tone: "primary", onClick: requestPlayAgain },
            { label: "Main Menu", tone: "soft", onClick: () => stopAndExitToMenu("") },
          ]
        : [{ label: "Play Again", tone: "primary", onClick: onResetClick }],
    });
  }
);

watch(
  () => [game.phase, JSON.stringify(game.rematch), game.rematchDeclinedBy],
  () => {
    if (!isOnline.value) return;
    if (game.phase !== "gameover") return;

    // If opponent requests after your gameover modal is already open,
    // update it live to the Accept/Decline prompt.
    ensureRematchPrompt();

    if (game.rematchDeclinedBy) {
      stopAndExitToMenu("Rematch declined. Game terminated.");
      return;
    }

    if (game.rematch?.[1] && game.rematch?.[2]) {
      closeModal();
      onResetClick();
    }
  }
);

/* =========================
   Quick Match handlers
========================= */
async function refreshPublicLobbies() {
  if (!(await ensureSupabaseReadyOrExplain())) return;
  loadingPublic.value = true;
  try {
    const rows = await sbListPublicWaitingLobbies();
    const list = Array.isArray(rows) ? rows : [];

    // ✅ Clean up empty/expired lobbies so they don't stay joinable.
    // Run best-effort deletes in the background of this refresh.
    for (const l of list) {
      // If a row has 0/2 or is expired, delete/close it.
      if (lobbyPlayerCount(l) === 0 || isLobbyExpired(l)) {
        cleanupLobbyIfNeeded(l, { reason: "list_refresh" });
      }
    }

    // Only show lobbies that are still valid for joining.
    publicLobbies.value = list.filter((l) => lobbyPlayerCount(l) > 0 && !isLobbyExpired(l));
  } catch (e) {
    showModal({
      title: "Refresh Failed",
      tone: "bad",
      message: String(e?.message || e || "Could not load public lobbies."),
    });
  } finally {
    loadingPublic.value = false;
  }
}

function normalizeCode(s) {
  return String(s || "").trim().toUpperCase();
}

async function joinPublicLobby(lobby) {
  if (!(await ensureSupabaseReadyOrExplain())) return;
  try {
    showModal({ title: "Joining...", tone: "info", message: `Joining lobby...\nCode: ${lobby?.code || "—"}` });

    // Re-check freshness so you can't join an expired lobby from a stale list.
    const fresh = await sbSelectLobbyById(lobby.id);
    if (!fresh || isLobbyExpired(fresh) || fresh.guest_id) {
      closeModal();
      // Best-effort cleanup so it won't appear again.
      if (fresh) cleanupLobbyIfNeeded(fresh, { reason: "join_public_expired" });
      showModal({ title: "Lobby Expired", tone: "bad", message: "That lobby is no longer available." });
      await refreshPublicLobbies();
      return;
    }

    const joined = await sbJoinLobby(lobby.id);
    if (!joined) {
      closeModal();
      showModal({ title: "Join Failed", tone: "bad", message: "Someone else joined first, or the lobby was closed." });
      await refreshPublicLobbies();
      return;
    }
    closeModal();
    showModal({ title: "Joined!", tone: "good", message: `Connected.\nCode: ${lobby?.code || "—"}` });
    startPollingLobby(lobby.id, "guest");
  } catch (e) {
    closeModal();
    showModal({ title: "Join Failed", tone: "bad", message: String(e?.message || e || "Could not join lobby.") });
  }
}

async function joinByCode() {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  const code = normalizeCode(quick.joinCode);
  if (!code) {
    showModal({ title: "Enter a Code", tone: "bad", message: "Type a lobby code first (example: PB-AB12CD34)." });
    return;
  }

  try {
    showModal({ title: "Searching Code...", tone: "info", message: `Looking up lobby...\n${code}` });

    const lobby = await sbSelectLobbyByCode(code);
    if (!lobby) {
      closeModal();
      showModal({ title: "Not Found", tone: "bad", message: `No lobby exists with code:\n${code}` });
      return;
    }

    // ✅ Don't allow joining expired/closed lobbies.
    if (isLobbyExpired(lobby)) {
      closeModal();
      cleanupLobbyIfNeeded(lobby, { reason: "join_by_code_expired" });
      showModal({ title: "Lobby Expired", tone: "bad", message: "That lobby is expired or closed." });
      return;
    }

    if (lobby.guest_id) {
      closeModal();
      showModal({ title: "Lobby Full", tone: "bad", message: "That lobby already has a guest." });
      return;
    }

    const joined = await sbJoinLobby(lobby.id);
    if (!joined) {
      closeModal();
      showModal({
        title: "Join Failed",
        tone: "bad",
        message: "Could not join. The lobby may have closed, expired, or someone joined first.",
      });
      return;
    }
    closeModal();
    showModal({ title: "Joined!", tone: "good", message: `Connected.\nCode: ${lobby.code || code}` });

    startPollingLobby(lobby.id, "guest");
  } catch (e) {
    closeModal();
    showModal({ title: "Join by Code Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}

async function quickMake() {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  // ✅ Require a lobby name (prevents null/empty name DB errors)
  const nm = String(quick.lobbyName || "").trim();
  if (!nm) {
    showModal({ title: "Lobby Name Required", tone: "bad", message: "Please enter a lobby name before creating one." });
    return;
  }

  try {
    showModal({ title: "Creating Lobby...", tone: "info", message: "Setting up your room..." });

    const created = await sbCreateLobby({
      isPrivate: quick.isPrivate,
      lobbyName: nm,
    });

    closeModal();

    if (!created?.id) throw new Error("Lobby created but no ID returned.");

    if (created.code) {
      try {
        await navigator.clipboard.writeText(created.code);
      } catch {}
    }

    showModal({
      title: "Lobby Ready",
      tone: "good",
      message: `Lobby Code: ${created.code || "—"}\n\n${
        created.is_private ? "This is PRIVATE. Only people with the code can join." : "This is PUBLIC. It will appear in matchmaking."
      }\n\n(Code copied if your browser allowed it.)`,
    });

    if (!created.is_private) await refreshPublicLobbies();

    startPollingLobby(created.id, "host");
  } catch (e) {
    closeModal();
    showModal({ title: "Create Lobby Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}

async function enterQuickFind() {
  screen.value = "quick_find";
  await refreshPublicLobbies();
}

/* =========================
   NAV
========================= */
function goBack() {
  if (screen.value === "quick_find" || screen.value === "quick_make") {
    screen.value = "quick";
    return;
  }
  if (["quick", "settings", "credits", "ranked"].includes(screen.value)) {
    screen.value = "mode";
    return;
  }
  if (screen.value === "mode") {
    screen.value = "auth";
    return;
  }
}

async function goAuth() {
  if (isOnline.value) await leaveOnlineLobby("main_menu");
  stopPolling();
  myPlayer.value = null;
  screen.value = "auth";
}

async function goMode() {
  if (isOnline.value) await leaveOnlineLobby("back_to_modes");
  stopPolling();
  myPlayer.value = null;
  screen.value = "mode";
}

function playAsGuest() {
  loggedIn.value = false;
  screen.value = "mode";
}

function goQuick() {
  screen.value = "quick";
}

function goRanked() {
  if (!loggedIn.value) return;
  screen.value = "ranked";
}

function startCouchPlay() {
  stopPolling();
  myPlayer.value = null;
  screen.value = "couch";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();
}

function startPracticeAi() {
  stopPolling();
  myPlayer.value = null;
  screen.value = "ai";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();
}

function applySettings() {
  showModal({
    title: "Settings Applied",
    message: `Allow Flip: ${allowFlip.value ? "ON" : "OFF"}`,
    tone: "info",
  });
  screen.value = "mode";
}

/* =========================
   MOUNT / UNMOUNT
========================= */
onMounted(() => {
  // ✅ Initial boot gate — prevent accidental clicks before first paint.
  startUiLock({ label: "Booting…", hint: "Loading UI, sounds, and neon vibes…", minMs: 750 });
  stopUiLockAfterPaint(750);

  originalAlert = window.alert;
  window.alert = (msg) => {
    showModal({
      title: "Illegal Placement",
      message: String(msg || "That placement is not allowed."),
      tone: "bad",
    });
  };

  tickTimer = window.setInterval(() => {
    nowTick.value = Date.now();

    if (!isOnline.value) return;
    if (!myPlayer.value) return;

    const changed = game.checkAndApplyTimeout?.(nowTick.value);
    if (changed) {
      online.localDirty = true;
      pushMyState("timeout");
    }
  }, 250);
});

onBeforeUnmount(() => {
  if (originalAlert) window.alert = originalAlert;
  if (tickTimer) window.clearInterval(tickTimer);
  stopPolling();
});
