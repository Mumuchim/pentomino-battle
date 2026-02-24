import { computed, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import { createClient } from "@supabase/supabase-js";
import { useGameStore } from "./store/game";

import Board from "./components/Board.vue";
import DraftPanel from "./components/DraftPanel.vue";
import PiecePicker from "./components/PiecePicker.vue";
import Controls from "./components/Controls.vue";

const game = useGameStore();

const screen = ref("auth");
const loggedIn = ref(false);
const allowFlip = ref(true);
const guestName = ref("GUEST");
const displayName = computed(() => (loggedIn.value ? "PLAYER" : guestName.value));

/* =========================
   Menu SFX (no asset files)
========================= */
let _uiAudioCtx = null;
let _uiAudioUnlocked = false;

function uiUnlockAudio() {
  try {
    if (!_uiAudioCtx) _uiAudioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (_uiAudioCtx.state === "suspended") _uiAudioCtx.resume();
    _uiAudioUnlocked = true;
  } catch {}
}

function uiBeep({ freq = 700, dur = 0.03, gain = 0.03 } = {}) {
  try {
    uiUnlockAudio();
    if (!_uiAudioCtx) return;
    const ctx = _uiAudioCtx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "square";
    o.frequency.value = freq;
    const vol = Math.max(0, Math.min(1, Number(sfxVolume?.value ?? 1)));
    g.gain.value = gain * vol;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain * vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t);
    o.stop(t + dur + 0.01);
  } catch {}
}

function uiHover() {
  uiBeep({ freq: 760, dur: 0.025, gain: 0.02 });
}
function uiClick() {
  uiBeep({ freq: 420, dur: 0.04, gain: 0.03 });

  // Autoplay policies: start menu BGM only after a user gesture.
  if (showMenuChrome.value) tryPlayMenuBgm();
}


// Cross-platform: optional landscape lock for mobile
const isPortrait = ref(false);
function computeIsPortrait() {
  if (typeof window === "undefined") return false;
  // Prefer matchMedia when available
  try {
    if (window.matchMedia) {
      isPortrait.value = window.matchMedia("(orientation: portrait)").matches;
      return;
    }
  } catch {}
  isPortrait.value = window.innerHeight > window.innerWidth;
}
const landscapeLockActive = computed(() => isInGame.value && !!game.ui?.lockLandscape && isPortrait.value);

// In-game settings modal (Esc)

const qmAccept = reactive({
  open: false,
  lobbyId: null,
  role: null, // "host" | "guest"
  expiresAt: 0,
  remainingMs: 0,
  progress: 1,
  pulse: false,
  myAccepted: false,
  statusLine: "",
  // internal outcome hints so the async accept loop can exit cleanly
  outcome: null, // "self_decline" | "self_timeout" | "opponent_not_accept" | null
  silentFail: false,
});

function closeQmAccept() {
  qmAccept.open = false;
  qmAccept.lobbyId = null;
  qmAccept.role = null;
  qmAccept.expiresAt = 0;
  qmAccept.remainingMs = 0;
  qmAccept.progress = 1;
  qmAccept.pulse = false;
  qmAccept.myAccepted = false;
  qmAccept.statusLine = "";
  qmAccept.outcome = null;
  qmAccept.silentFail = false;
}

async function qmAcceptClick() {
  if (!qmAccept.open || !qmAccept.lobbyId || qmAccept.myAccepted) return;
  qmAccept.myAccepted = true;
  qmAccept.statusLine = "Waiting for opponent…";
  try {
    await sbSetQuickMatchAccept(qmAccept.lobbyId, qmAccept.role, true);
  } catch {
    // If patch fails, allow re-click
    qmAccept.myAccepted = false;
    qmAccept.statusLine = "";
  }
}

async function qmDecline() {
  if (!qmAccept.open || !qmAccept.lobbyId) return;
  qmAccept.statusLine = "Declining…";
  try {
    await sbSetQuickMatchAccept(qmAccept.lobbyId, qmAccept.role, false);
  } catch {}

  // Tell the accept-loop (quickMatchAcceptFlow) to exit without showing its own modal.
  qmAccept.outcome = "self_decline";
  qmAccept.silentFail = true;

  // Best-effort cleanup so neither side gets stuck in a half-accepted room.
  try {
    await sbDeleteLobby(qmAccept.lobbyId);
  } catch {}

  closeQmAccept();

  showModal({
    title: "Matchmaking",
    tone: "info",
    message: "You declined the matchmaking.",
    actions: [{ label: "OK", tone: "primary", onClick: () => (screen.value = "mode") }],
  });
}

const inGameSettingsOpen = ref(false);
function openInGameSettings() {
  if (!isInGame.value) return;
  inGameSettingsOpen.value = true;
}
function closeInGameSettings() {
  inGameSettingsOpen.value = false;
}

// Viewport sizing: we rely on responsive CSS + natural page scroll.
// Keep portrait detection for optional landscape lock UI.
const appRoot = ref(null);

function onViewportChange() {
  computeIsPortrait();
}


const logoUrl = new URL("./assets/logo.png", import.meta.url).href;
const guestAvatarUrl = new URL("./assets/guest_avatar.png", import.meta.url).href;
// Split brand assets (replaceable):
// - ./assets/logo.png  (icon)
// - ./assets/title.png (PENTO BATTLE text)
const titleUrl = new URL("./assets/title.png", import.meta.url).href;
const useSplitBrandPng = ref(true); // toggle off to fall back to text title

// Replaceable button PNGs (safe placeholders included in /assets)
const backBtnUrl = new URL("./assets/back.png", import.meta.url).href;
const undoBtnUrl = new URL("./assets/undo.png", import.meta.url).href;
const applyBtnUrl = new URL("./assets/apply.png", import.meta.url).href;
const refreshBtnUrl = new URL("./assets/refresh.png", import.meta.url).href;
const goBtnUrl = new URL("./assets/go.png", import.meta.url).href;
const createBtnUrl = new URL("./assets/create.png", import.meta.url).href;
const mainBtnUrl = new URL("./assets/main.png", import.meta.url).href;
const surrenderBtnUrl = new URL("./assets/surrender.png", import.meta.url).href;
// Modal / action button PNGs (safe placeholders included in /assets)
const okBtnUrl = new URL("./assets/ok.png", import.meta.url).href;
const closeBtnUrl = new URL("./assets/close.png", import.meta.url).href;
const cancelBtnUrl = new URL("./assets/cancel.png", import.meta.url).href;
const cancelWaitingBtnUrl = new URL("./assets/cancel_waiting.png", import.meta.url).href;
const confirmBtnUrl = new URL("./assets/confirm.png", import.meta.url).href;
const acceptBtnUrl = new URL("./assets/accept.png", import.meta.url).href;
const declineBtnUrl = new URL("./assets/decline.png", import.meta.url).href;
const joinBtnUrl = new URL("./assets/join.png", import.meta.url).href;
const copyBtnUrl = new URL("./assets/copy.png", import.meta.url).href;
const playAgainBtnUrl = new URL("./assets/play_again.png", import.meta.url).href;
const resetBtnUrl = new URL("./assets/reset.png", import.meta.url).href;


// Extra replaceable menu PNG assets (safe placeholders included in /assets)
const welcomeUrl = new URL("./assets/welcome.png", import.meta.url).href;
const menuTitleUrl = new URL("./assets/menu.png", import.meta.url).href;
const madeByUrl = new URL("./assets/madeby.png", import.meta.url).href;

// Top bar titles (replaceable)
const lobbyTopTitleUrl = new URL("./assets/lobby.png", import.meta.url).href;
const configTopTitleUrl = new URL("./assets/config.png", import.meta.url).href;

// Audio
// - Menu BGM (starts on first click due to autoplay restrictions)
// - Separate BGM for Couch/AI and Online matches
const menuBgmUrl = new URL("./assets/audio/bgm.mp3", import.meta.url).href;
const couchBgmUrl = new URL("./assets/audio/couch_bgm.mp3", import.meta.url).href;
const onlineBgmUrl = new URL("./assets/audio/online_bgm.mp3", import.meta.url).href;

// Audio settings (0..100 UI)
const bgmVolumeUi = ref(100);
const sfxVolumeUi = ref(100);
const bgmVolume = computed(() => Math.max(0, Math.min(1, (Number(bgmVolumeUi.value) || 0) / 100)));
const sfxVolume = computed(() => Math.max(0, Math.min(1, (Number(sfxVolumeUi.value) || 0) / 100)));
function loadAudioPrefs() {
  try {
    const b = Number(localStorage.getItem("pb_bgm_vol"));
    const s = Number(localStorage.getItem("pb_sfx_vol"));
    if (Number.isFinite(b)) bgmVolumeUi.value = Math.max(0, Math.min(100, Math.round(b)));
    if (Number.isFinite(s)) sfxVolumeUi.value = Math.max(0, Math.min(100, Math.round(s)));
  } catch {}
}
function saveAudioPrefs() {
  try {
    localStorage.setItem("pb_bgm_vol", String(bgmVolumeUi.value));
    localStorage.setItem("pb_sfx_vol", String(sfxVolumeUi.value));
  } catch {}
}

let _menuBgm = null;
let _couchBgm = null;
let _onlineBgm = null;

function _attachLoopFix(audioEl) {
  try {
    if (!audioEl?.addEventListener) return;
    // Prevent double-binding if the app hot-reloads or mounts twice.
    if (audioEl.__pbLoopFixAttached) return;
    audioEl.__pbLoopFixAttached = true;
    audioEl.addEventListener("ended", () => {
      try {
        if (!audioEl.loop) return;
        audioEl.currentTime = 0;
        audioEl.play?.().catch?.(() => {});
      } catch {}
    });
  } catch {}
}

function ensureMenuBgm() {
  try {
    if (_menuBgm) return;
    // Use a window-global singleton so we never end up with 2 menu BGMs after remounts.
    const g = typeof window !== "undefined" ? window : null;
    if (g && g.__PB_MENU_BGM instanceof Audio) {
      _menuBgm = g.__PB_MENU_BGM;
    } else {
      _menuBgm = new Audio(menuBgmUrl);
      if (g) g.__PB_MENU_BGM = _menuBgm;
    }
    _menuBgm.loop = true;
    _menuBgm.preload = "auto";
    _menuBgm.volume = bgmVolume.value;
    _attachLoopFix(_menuBgm);
  } catch {
    _menuBgm = null;
  }
}

function ensureCouchBgm() {
  try {
    if (_couchBgm) return;
    const g = typeof window !== "undefined" ? window : null;
    if (g && g.__PB_COUCH_BGM instanceof Audio) {
      _couchBgm = g.__PB_COUCH_BGM;
    } else {
      _couchBgm = new Audio(couchBgmUrl);
      if (g) g.__PB_COUCH_BGM = _couchBgm;
    }
    _couchBgm.loop = true;
    _couchBgm.preload = "auto";
    _couchBgm.volume = bgmVolume.value;
    _attachLoopFix(_couchBgm);
  } catch {
    _couchBgm = null;
  }
}

function ensureOnlineBgm() {
  try {
    if (_onlineBgm) return;
    const g = typeof window !== "undefined" ? window : null;
    if (g && g.__PB_ONLINE_BGM instanceof Audio) {
      _onlineBgm = g.__PB_ONLINE_BGM;
    } else {
      _onlineBgm = new Audio(onlineBgmUrl);
      if (g) g.__PB_ONLINE_BGM = _onlineBgm;
    }
    _onlineBgm.loop = true;
    _onlineBgm.preload = "auto";
    _onlineBgm.volume = bgmVolume.value;
    _attachLoopFix(_onlineBgm);
  } catch {
    _onlineBgm = null;
  }
}

function tryPlayMenuBgm() {
  ensureMenuBgm();
  // Ensure only ONE BGM plays at a time.
  stopCouchBgm();
  stopOnlineBgm();
  try {
    if (!_menuBgm) return;
    if (isInGame.value) return;
    if (bgmVolume.value <= 0) return;
    if (!_menuBgm.paused) return;
    _menuBgm.play?.().catch?.(() => {});
  } catch {}
}

function stopMenuBgm() {
  try {
    if (!_menuBgm) return;
    _menuBgm.pause?.();
    _menuBgm.currentTime = 0;
  } catch {}
}

function stopCouchBgm() {
  try {
    if (!_couchBgm) return;
    _couchBgm.pause?.();
    _couchBgm.currentTime = 0;
  } catch {}
}

function stopOnlineBgm() {
  try {
    if (!_onlineBgm) return;
    _onlineBgm.pause?.();
    _onlineBgm.currentTime = 0;
  } catch {}
}

function tryPlayGameBgm() {
  try {
    if (!isInGame.value) return;
    if (bgmVolume.value <= 0) return;

    // ensure menu bgm is off
    stopMenuBgm();

    if (isOnline.value) {
      ensureOnlineBgm();
      stopCouchBgm();
      if (_onlineBgm && _onlineBgm.paused) _onlineBgm.play?.().catch?.(() => {});
    } else {
      ensureCouchBgm();
      stopOnlineBgm();
      if (_couchBgm && _couchBgm.paused) _couchBgm.play?.().catch?.(() => {});
    }
  } catch {}
}
const loginTitleUrl = new URL("./assets/login.png", import.meta.url).href;
const loginIconUrl = new URL("./assets/login_icon.png", import.meta.url).href;
const playGuestTitleUrl = new URL("./assets/play_guest.png", import.meta.url).href;
const playGuestIconUrl = new URL("./assets/gs_icon.png", import.meta.url).href;

// MODE MENU replaceable PNGs (icons + titles)
const rkIconUrl = new URL("./assets/rk_icon.png", import.meta.url).href;
const rankedTitleUrl = new URL("./assets/ranked.png", import.meta.url).href;

const qmIconUrl = new URL("./assets/qm_icon.png", import.meta.url).href;
const quickMatchTitleUrl = new URL("./assets/quick_match.png", import.meta.url).href;

const lbIconUrl = new URL("./assets/lb_icon.png", import.meta.url).href;
const goLobbyTitleUrl = new URL("./assets/go_lobby.png", import.meta.url).href;

const onePIconUrl = new URL("./assets/onep_icon.png", import.meta.url).href;
const couchPlayTitleUrl = new URL("./assets/couch_play.png", import.meta.url).href;

const aiIconUrl = new URL("./assets/ai_icon.png", import.meta.url).href;
const practiceAiTitleUrl = new URL("./assets/practice_ai.png", import.meta.url).href;

const stIconUrl = new URL("./assets/st_icon.png", import.meta.url).href;
const settingsTitleUrl = new URL("./assets/settings.png", import.meta.url).href;

const crIconUrl = new URL("./assets/cr_icon.png", import.meta.url).href;
const creditsTitleUrl = new URL("./assets/credits.png", import.meta.url).href;

// Toggle: replace specific menu texts with PNGs (falls back to text if turned off)
const useMenuPngs = ref(true);


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
  if (game.phase === "draft") return "Drafting";
  if (game.phase === "place") return "Battle";
  if (game.phase === "gameover") return "Game Over";
  return game.phase || "—";
});

const phaseSub = computed(() => {
  if (game.phase === "draft") return `Pick: P${game.draftTurn}`;
  if (game.phase === "place") return `Turn: P${game.currentPlayer}`;
  return "";
});

const canGoBack = computed(() =>
  ["mode", "lobby", "settings", "credits", "ranked"].includes(screen.value)
);


// Menu-style chrome (menus only)
const isMenuScreen = computed(() => !isInGame.value);

// Stop menu BGM as soon as a match starts.
watch(isInGame, (v) => {
  if (v) {
    stopMenuBgm();
    // best-effort start game bgm (may require user gesture)
    tryPlayGameBgm();
  } else {
    stopCouchBgm();
    stopOnlineBgm();
    // If the user has already interacted once, we can resume menu BGM.
    tryPlayMenuBgm();
  }
});

// Keep volumes in sync (also persists to localStorage)
watch([bgmVolumeUi, sfxVolumeUi], () => {
  saveAudioPrefs();
  try {
    if (_menuBgm) _menuBgm.volume = bgmVolume.value;
    if (_couchBgm) _couchBgm.volume = bgmVolume.value;
    if (_onlineBgm) _onlineBgm.volume = bgmVolume.value;
  } catch {}

  // If muted, stop bgm.
  if (bgmVolume.value <= 0) {
    stopMenuBgm();
    stopCouchBgm();
    stopOnlineBgm();
  }
});
const topPageTitle = computed(() => {
  if (screen.value === "auth") return "WELCOME"; // Welcome page
  if (screen.value === "mode") return "MENU"; // Main menu page
  if (screen.value === "lobby") return "LOBBY";
  if (screen.value === "ranked") return "RANKED";
  if (screen.value === "settings") return "CONFIG";
  if (screen.value === "credits") return "ABOUT";
  return "MENU";
});
const showMenuChrome = computed(() => isMenuScreen.value && ["auth","mode","lobby","ranked","settings","credits"].includes(screen.value));
const showBottomBar = computed(() => showMenuChrome.value);

// ✅ Online match
const isOnline = computed(() => screen.value === "online");
const myPlayer = ref(null); // 1 | 2 | null
const onlineSyncing = ref(false);

const onlineTurnText = computed(() => {
  if (!isOnline.value || !myPlayer.value) return "";
  if (game.phase === "gameover") return "";
  if (game.phase === "draft") return game.draftTurn === myPlayer.value ? "Your turn" : `Waiting for P${game.draftTurn}...`;
  if (game.phase === "place") return game.currentPlayer === myPlayer.value ? "Your turn" : `Waiting for P${game.currentPlayer}...`;
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
  active: true,
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
  requestAnimationFrame(() => requestAnimationFrame(() => stopUiLock()));
}

function fmtClock(sec) {
  const s = Math.max(0, Math.floor(Number(sec || 0)));
  const m = Math.floor(s / 60);
  const r = String(s % 60).padStart(2, "0");
  return `${m}:${r}`;
}

const timerHud = computed(() => {
  if (!isInGame.value) return null;
  if (game.phase === "gameover") return null;
  if (isOnline.value && !myPlayer.value) return null;

  // Draft timer (countdown)
  if (game.phase === "draft") {
    if (!game.turnStartedAt) return null;
    const limit = game.turnLimitDraftSec || 30;
    const left = Math.max(0, limit - (nowTick.value - game.turnStartedAt) / 1000);
    const s = Math.ceil(left);
    return { kind: "draft", seconds: s, value: `${s}s` };
  }

  // Battle clock (interchanges depending on whose turn it is)
  if (game.phase === "place") {
    const p = game.currentPlayer === 2 ? 2 : 1;
    const v = fmtClock(game.battleClockSec?.[p] ?? 0);
    return { kind: "clock", player: p, value: v };
  }

  return null;
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
    if (["auth", "mode", "lobby", "settings", "credits", "ranked"].includes(nv)) {
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
const showModalX = computed(() => false);

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


function actionPngUrl(action) {
  const lab = String(action?.label || "").trim().toLowerCase();
  if (!lab) return "";
  // Normalize some common labels
  const norm = lab
    .replace(/\s+/g, " ")
    .replace(/…/g, "...")
    .replace(/\u2013|\u2014/g, "-");
  if (norm === "ok") return okBtnUrl;
  if (norm === "close") return closeBtnUrl;
  if (norm === "cancel") return cancelBtnUrl;
  if (norm === "cancel waiting") return cancelWaitingBtnUrl;
  if (norm === "confirm") return confirmBtnUrl;
  if (norm === "accept") return acceptBtnUrl;
  if (norm === "decline") return declineBtnUrl;
  if (norm === "join") return joinBtnUrl;
  if (norm === "copy code" || norm === "copy") return copyBtnUrl;
  if (norm === "play again") return playAgainBtnUrl;
  if (norm === "reset" || norm === "reset match") return resetBtnUrl;
  return "";
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
let escHandler = null;

// Layout changes handled by normal responsive CSS.

/* =========================
   QUICK MATCH — Supabase REST
========================= */
const online = reactive({
  lastSeq: 0,
  movesUnsub: null,
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
  lastHbSentAt: 0,
});

const publicLobbies = ref([]);
const loadingPublic = ref(false);
const myPrivateLobbies = ref([]);
const loadingPrivate = ref(false);

function getGuestId() {
  const k = "pb_guest_key";
  let id = localStorage.getItem(k);
  if (!id) {
    id = (crypto?.randomUUID?.() || `g_${Math.random().toString(16).slice(2)}_${Date.now()}`).toString();
    localStorage.setItem(k, id);
  }
  return id;
}


function makeCode() {
  // 6-char lobby code without confusing characters (0/O, 1/I, etc.)
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function getGuestName() {
  const k = "pb_guest_name";
  let name = localStorage.getItem(k);
  if (!name) {
    const id = getGuestId();
    // Make a stable 4-digit code from the UUID-ish guest id
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    const num = (h % 10000).toString().padStart(4, "0");
    name = `GUEST-${num}`;
    localStorage.setItem(k, name);
  }
  return name;
}

// Ensure guest name is ready for menus/topbar
try {
  guestName.value = getGuestName();
} catch {}


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


let _sbClient = null;
function sbClient() {
  if (_sbClient) return _sbClient;
  const { url, anon } = sbConfig();
  if (!url || !anon) return null;
  _sbClient = createClient(url, anon, { auth: { persistSession: false }, realtime: { params: { eventsPerSecond: 30 } } });
  return _sbClient;
}

async function sbRpcCommitMove(args) {
  const client = sbClient();
  if (!client) throw new Error("Supabase not connected.");
  const { data, error } = await client.rpc("pb_commit_move", args);
  if (error) throw error;
  return data;
}

function sbSubscribeMoves(lobbyId, onMoveRow) {
  const client = sbClient();
  if (!client) return () => {};
  const ch = client
    .channel("pb_moves_" + lobbyId)
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "pb_moves", filter: `lobby_id=eq.${lobbyId}` },
      (payload) => payload?.new && onMoveRow(payload.new)
    )
    .subscribe();
  return () => {
    try { client.removeChannel(ch); } catch {}
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

    if (online.role === "host") {
      // Prefer delete to avoid dead lobbies; fallback to marking closed.
      try {
        const ok = await sbDeleteLobby(online.lobbyId);
        if (!ok) {
          await sbPatchLobby(online.lobbyId, { status: "closed", guest_key: null });
        }
      } catch {
        await sbPatchLobby(online.lobbyId, { status: "closed", guest_key: null });
      }
    } else {
      // Guest leaving: release slot
      try {
        await sbPatchLobby(online.lobbyId, { guest_key: null, guest_ready: false, status: "waiting" });
      } catch {}
    }
  } catch {
    // ignore
  } finally {
    try { if (online.movesUnsub) online.movesUnsub(); } catch {}
    online.movesUnsub = null;
    online.lobbyId = null;
    online.code = null;
    online.role = null;
    online.lastSeq = 0;
    stopPolling();
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
    "select=id,code,status,is_private,updated_at,host_key,guest_key",
    "status=eq.waiting",
    "is_private=eq.false",
        "guest_key=is.null",
    "order=updated_at.desc",
    "limit=25",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`List public lobbies failed (${res.status})`);
  return await res.json();
}

async function sbFindPublicLobbyByName(term) {
  const t = String(term || "").trim();
  if (!t) return null;
  const pat = `*${t}*`;
  const q = [
    "select=id,code,status,is_private,updated_at,host_key,guest_key",
    "status=eq.waiting",
    "is_private=eq.false",
             "guest_key=is.null",
    `=ilike.${encodeURIComponent(pat)}`,
    "order=updated_at.desc",
    "limit=10",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Search lobby failed (${res.status})`);
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : [];
  // Return the first valid joinable lobby.
  return (
    list.find((l) => {
      if (!l) return false;
      if (isLobbyExpired(l)) return false;
      if (lobbyPlayerCount(l) <= 0) return false;
      const name = String(l?. || "");
      if (name === "__QM__") return false;
      const meta = l?.state?.meta || {};
      if (meta?.kind === "quickmatch") return false;
      return true;
    }) || null
  );
}

async function sbCreateLobby({ isPrivate = false, region = null } = {}) {
  const hostKey = String(getGuestId());

  const payloadBase = {
    code: makeCode(),
    status: "waiting",
    is_private: !!isPrivate,
    region: region || null,
    host_key: hostKey,
    guest_key: null,
    host_ready: false,
    guest_ready: false,
    last_seq: 0,
  };

  // Retry a few times in case of code collisions
  let payload = { ...payloadBase };
  for (let i = 0; i < 5; i++) {
    const res = await fetch(sbRestUrl("pb_lobbies"), {
      method: "POST",
      headers: { ...sbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const rows = await res.json();
      return rows?.[0] || null;
    }
    const txt = await res.text().catch(() => "");
    if (!String(txt).toLowerCase().includes("duplicate")) throw new Error(`Create lobby failed (${res.status})\n${txt}`);
    payload = { ...payloadBase, code: makeCode() };
  }
  throw new Error("Failed to create lobby (code collision). Try again.");
}

async function sbJoinLobby(lobbyId) {
  const guestId = getGuestId();

  // ✅ Guard join so you can't join closed/full/expired lobbies.
  // This PATCH will only succeed if the lobby is still waiting and has no guest.
  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}&guest_key=is.null&status=eq.waiting`), {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify({
      guest_key: guestId,
      // Keep status as 'waiting' until the match is fully initialized (players assigned).
      // This avoids edge cases where clients treat unknown statuses differently.
      status: "waiting",
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
  return (lobby?.host_key ? 1 : 0) + (lobby?.guest_key ? 1 : 0);
}

function lobbyCountLabel(lobby) {
  return `${lobbyPlayerCount(lobby)}/2`;
}

function parseIsoMs(iso) {
  const t = Date.parse(String(iso || ""));
  return Number.isFinite(t) ? t : 0;
}



function normalizeLobbyState(state) {
  // Supabase can return null for jsonb; normalize to a safe shape.
  let st = state;
  if (!st || typeof st !== "object") st = {};
  // Avoid mutating shared references from reactive payloads.
  try {
    st = structuredClone(st);
  } catch {
    try { st = JSON.parse(JSON.stringify(st)); } catch {}
  }
  if (!st || typeof st !== "object") st = {};
  if (!st.meta || typeof st.meta !== "object") st.meta = {};
  if (!st.game || typeof st.game !== "object") st.game = {};
  return st;
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
  if (String(lobby.status || "").toLowerCase() === "waiting" && !lobby.guest_key) {
    // If host heartbeat is stale (tab closed / app crashed), expire the room sooner.
    try {
      const hb = lobby?.state?.meta?.heartbeat || {};
      const hostTs = Number(hb?.host || 0);
      if (hostTs && Date.now() - hostTs > 90_000) return true;
    } catch {}
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
  // New schema: just mark closed (no embedded state/meta).
  const nowIso = new Date().toISOString();
  await sbPatchLobby(id, { status: "closed", guest_key: null, updated_at: nowIso });
}

/* =========================
   ✅ ONLINE STATE SERIALIZATION
========================= */
function makeRandomPlayers(hostId, guestId) {
  // Random per round (written into state.meta.players so both clients agree)
  const hostIsP1 = Math.random() < 0.5;
  const p1 = hostIsP1 ? hostId : guestId;
  const p2 = hostIsP1 ? guestId : hostId;
  return { hostIsP1, players: { 1: p1, 2: p2 } };
}

function makeRoundSeed() {
  try {
    // Prefer crypto when available
    const a = new Uint32Array(2);
    crypto.getRandomValues(a);
    return `${a[0].toString(16)}${a[1].toString(16)}_${Date.now().toString(16)}`;
  } catch {
    return `${Math.random().toString(16).slice(2)}_${Date.now().toString(16)}`;
  }
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

      // Needed for correct gameover messaging (surrender / timeout) across both clients.
      lastMove: deepClone(game.lastMove),
    },
  };
}


function handleMoveRow(row) {
  if (!row) return;
  const seq = Number(row.seq || 0);
  if (seq && seq <= (online.lastSeq || 0)) return;
  if (seq) online.lastSeq = seq;

  // We use 'sync' moves to carry full authoritative state snapshots.
  if (row.kind === "sync" && row.payload && row.payload.state) {
    applySyncedState(row.payload.state);
    return;
  }

  // For compatibility: if server sends a 'place/draft/timeout/surrender' with a state snapshot, apply it too.
  if (row.payload && row.payload.state) {
    applySyncedState(row.payload.state);
  }
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

      lastMove: g.lastMove,
    });
  } finally {
    setTimeout(() => {
      online.applyingRemote = false;
    }, 0);
  }
}

async function sbPatchStateWithVersionGuard(lobbyId, knownVersion, patchObj) {
  // Back-compat shim: new schema no longer uses versioned state rows.
  // We just patch the lobby row.
  return await sbPatchLobby(lobbyId, patchObj);
}

async function sbPatchLobby(lobbyId, patchObj) {
  const url = sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}`);
  const res = await fetch(url, {
    method: "PATCH",
    headers: { ...sbHeaders(), Prefer: "return=representation" },
    body: JSON.stringify(patchObj),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Lobby update failed (${res.status})\n${txt}`);
  }
  const rows = await res.json().catch(() => []);
  return rows?.[0] || null;
}

async function pushMyState(reason = "") {
  if (!isOnline.value) return;
  if (!online.lobbyId) return;
  if (online.applyingRemote) return;

  // Only send state snapshots as ordered move events (prevents clobber / visual snapback).
  // We use RPC pb_commit_move which serializes by seq on the server.
  try {
    const snapshot = serializeGame();
    const seq = Number(online.lastSeq || 0) + 1;
    const playerKey = String(getGuestId());
    const res = await sbRpcCommitMove({
      p_lobby_id: online.lobbyId,
      p_seq: seq,
      p_player_key: playerKey,
      p_kind: "sync",
      p_payload: { reason: String(reason || ""), state: snapshot },
    });

    if (res && res.ok === false && res.reason === "bad_seq") {
      // Our seq is behind; pull lobby.last_seq and retry once.
      const lobby = await sbSelectLobbyById(online.lobbyId);
      online.lastSeq = Number(lobby?.last_seq || 0);
      const retrySeq = Number(online.lastSeq || 0) + 1;
      await sbRpcCommitMove({
        p_lobby_id: online.lobbyId,
        p_seq: retrySeq,
        p_player_key: playerKey,
        p_kind: "sync",
        p_payload: { reason: String(reason || ""), state: snapshot },
      });
      online.lastSeq = retrySeq;
    } else if (res && res.server_seq) {
      online.lastSeq = Number(res.server_seq);
    } else {
      online.lastSeq = seq;
    }
  } catch (e) {
    // best-effort; keep local dirty so next tick tries again
    online.localDirty = true;
  }
}

function maybeSetMyPlayerFromLobby(lobby) {
  const myId = String(getGuestId());
  if (!lobby) return;
  if (lobby.host_key && myId === String(lobby.host_key)) {
    myPlayer.value = 1;
  } else if (lobby.guest_key && myId === String(lobby.guest_key)) {
    myPlayer.value = 2;
  }
}

async function ensureOnlineInitialized(lobby) {
  if (!lobby) return;
  if (!lobby.host_key || !lobby.guest_key) return;

  // Only the host initializes the authoritative first snapshot.
  if (online.role !== "host") return;

  // If already playing, nothing to do.
  if (String(lobby.status) === "playing") return;

  // Initialize local game then broadcast a snapshot via pb_moves.
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  // Patch lobby to playing (matchmaking metadata only)
  try {
    await sbPatchLobby(lobby.id, {
      status: "playing",
      turn_key: lobby.host_key,
      turn_deadline: new Date(Date.now() + 30_000).toISOString(),
    });
  } catch {}

  // Seed seq from lobby and push initial snapshot
  online.lastSeq = Number(lobby.last_seq || 0);
  await pushMyState("init");
}

function startPollingLobby(lobbyId, role) {
  // Back-compat name: we now rely on Realtime moves, with light lobby polling for presence/closure.
  stopPolling();

  online.lobbyId = lobbyId;
  online.role = role;
  online.polling = true;
  onlineSyncing.value = true;

  // Subscribe to move events (near-instant sync)
  try { if (online.movesUnsub) online.movesUnsub(); } catch {}
  online.movesUnsub = sbSubscribeMoves(lobbyId, handleMoveRow);

  // Light polling to watch lobby status / join events
  online.pollTimer = setInterval(async () => {
    if (!online.polling || !online.lobbyId) return;
    try {
      const lobby = await sbSelectLobbyById(online.lobbyId);
      if (!lobby) return;

      online.code = lobby.code || online.code;
      online.waitingForOpponent = !(lobby.host_key && lobby.guest_key);

      // seed seq from lobby (authoritative)
      online.lastSeq = Math.max(Number(online.lastSeq || 0), Number(lobby.last_seq || 0));

      maybeSetMyPlayerFromLobby(lobby);

      if (String(lobby.status) === "closed") {
        showModal({ title: "Lobby closed", tone: "bad", message: "The lobby was closed." });
        await leaveOnlineLobby("closed");
        return;
      }

      // Host initializes match once both players are present.
      if (online.role === "host") {
        await ensureOnlineInitialized(lobby);
      }
    } catch {
      // ignore transient errors
    } finally {
      onlineSyncing.value = false;
    }
  }, 700);
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
    JSON.stringify(game.lastMove),
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

  // Online reset: host creates a fresh round snapshot and broadcasts it via pb_moves.
  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby || !lobby.host_key || !lobby.guest_key) return;

    if (online.role !== "host") {
      showToast("Only the host can reset the match.");
      return;
    }

    const meta = {};
    const nextRound = Number(meta.round || 0) + 1;
    const { players } = makeRandomPlayers(lobby.host_key, lobby.guest_key);

    game.boardW = 10;
    game.boardH = 6;
    game.allowFlip = allowFlip.value;
    game.resetGame();

    // Broadcast new snapshot
    await pushMyState("reset");
  } catch {
    game.resetGame();
  }
}

function winnerMessage(w) {
  const me = myPlayer.value;

  // Local modes: keep it simple unless we have a specific end reason.
  if (!me) {
    const lm = game.lastMove?.type;
    if (lm === "surrender") return "Opponent surrendered.";
    if (lm === "timeout") return "Opponent timer runs out.";
    if (!isOnline.value) return "GG!";
    return `Player ${w} wins.\nGG!`;
  }

  // Online: custom copy for surrender / timer.
  const lm = game.lastMove?.type;
  const loser = Number(game.lastMove?.player);

  if (lm === "surrender") {
    return loser === Number(me) ? "You surrendered." : "Opponent surrendered.";
  }

  if (lm === "timeout") {
    return loser === Number(me) ? "Your timer runs out." : "Opponent timer runs out.";
  }

  if (w === null || w === undefined) {
    return game.matchInvalid
      ? `Match invalid — ${game.matchInvalidReason || "dodged"}.`
      : "Match ended.";
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

  const lab = String(primaryMatchActionLabel.value || "").trim().toLowerCase();

  // ✅ Reset confirm (local modes / any reset label)
  if (lab.includes("reset")) {
    confirmInGame({
      title: "Reset Game?",
      message: "Are you sure you want to reset the game?",
      yesLabel: "YES",
      noLabel: "NO",
      onYes: () => onResetClick(),
    });
    return;
  }

  if (isOnline.value) {
    if (!myPlayer.value) return;

    if (game.phase === "gameover") {
      requestPlayAgain();
      return;
    }

    // ✅ Surrender confirm (online)
    if (lab.includes("surrender") || !lab) {
      confirmInGame({
        title: "Surrender?",
        message: "Are you sure you want to surrender?",
        yesLabel: "YES",
        noLabel: "NO",
        onYes: () => {
          game.surrender(myPlayer.value);
          online.localDirty = true;
          pushMyState("surrender");
        },
      });
      return;
    }
    return;
  }

  // Local modes fallback (should already be handled by reset branch above)
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

    // Only show lobbies that are still valid for joining (and NOT quick-match hidden rooms).
    publicLobbies.value = list.filter((l) => {
      if (!(lobbyPlayerCount(l) > 0) || isLobbyExpired(l)) return false;
      const name = String(l?. || "");
      if (name === "__QM__") return false;
      const meta = l?.state?.meta || {};
      if (meta?.kind === "quickmatch") return false;
      return true;
    });
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


async function refreshMyPrivateLobbies() {
  if (!(await ensureSupabaseReadyOrExplain())) return;
  loadingPrivate.value = true;
  try {
    const me = getGuestId();
    // Your own waiting private lobbies (so you can re-enter / copy code)
    const q = [
      "select=id,code,status,is_private,updated_at,host_key,guest_key",
      "status=eq.waiting",
      "is_private=eq.true",
      `host_key=eq.${encodeURIComponent(me)}`,
      "order=updated_at.desc",
      "limit=20",
    ].join("&");

    const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
    if (!res.ok) throw new Error(`List private lobbies failed (${res.status})`);
    const rows = await res.json();
    const list = Array.isArray(rows) ? rows : [];
    myPrivateLobbies.value = list.filter((l) => lobbyPlayerCount(l) > 0 && !isLobbyExpired(l));
  } catch {
    myPrivateLobbies.value = [];
  } finally {
    loadingPrivate.value = false;
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
    if (!fresh || isLobbyExpired(fresh) || fresh.guest_key) {
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

    if (lobby.guest_key) {
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

async function goLobby() {
  screen.value = "lobby";
  await refreshLobby();
}

async function refreshLobby() {
  await Promise.all([refreshPublicLobbies(), refreshMyPrivateLobbies()]);
}

function lobbyCreate() {
  return quickMake();
}

async function lobbySearchOrJoin() {
  const term = String(quick.joinCode || "").trim();
  if (!term) {
    showModal({ title: "Missing Input", tone: "bad", message: "Please type code or lobby name first." });
    return;
  }

  // If it looks like a code, treat it as code.
  const looksLikeCode = /^PB-[A-Z0-9]{8}$/i.test(term) || /^[A-Z0-9]{6,10}$/i.test(term);
  if (looksLikeCode) {
    quick.joinCode = term.toUpperCase().startsWith("PB-") ? term.toUpperCase() : term.toUpperCase();
    await joinByCode();
    return;
  }

  // Otherwise, try to find a public room by name (client-side filter over current list).
  const list = Array.isArray(publicLobbies.value) ? publicLobbies.value : publicLobbies;
  const found = (list || []).find((l) => String(l?. || "").toLowerCase().includes(term.toLowerCase()));
  if (found) {
    await joinPublicLobby(found);
    return;
  }

  // If not in the current list, try the server (helps when list is stale / you just refreshed).
  try {
    if (await ensureSupabaseReadyOrExplain()) {
      const srv = await sbFindPublicLobbyByName(term);
      if (srv) {
        await joinPublicLobby(srv);
        return;
      }
    }
  } catch {
    // ignore and fall back to "does not exist"
  }

  showModal({ title: "Not Found", tone: "bad", message: "Lobby does not exist." });
}

function copyCode(code) {
  const c = String(code || "").trim();
  if (!c) return;
  try {
    navigator.clipboard?.writeText?.(c);
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = c;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    } catch {}
  }
}


async function startQuickMatchAuto() {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  // Visible timer + 60s timeout.
  const t0 = Date.now();
  let hostLobbyId = null;
  let cancelled = false;

  const fmt = (s) => {
    const ss = Math.max(0, Math.floor(s));
    const mm = String(Math.floor(ss / 60)).padStart(2, "0");
    const rr = String(ss % 60).padStart(2, "0");
    return `${mm}:${rr}`;
  };

  const updateModal = () => {
    const sec = (Date.now() - t0) / 1000;
    modal.message = `Finding opponent… ${fmt(sec)}`;
  };

  let uiTimer = null;

  showModal({
    title: "Quick Match",
    tone: "info",
    message: "Finding opponent… 00:00",
    actions: [
      {
        label: "CANCEL",
        tone: "soft",
        onClick: async () => {
          cancelled = true;
          try {
            if (hostLobbyId) await sbDeleteLobby(hostLobbyId);
          } catch {}
          if (uiTimer) window.clearInterval(uiTimer);
          closeModal();
          showModal({ title: "Matchmaking", tone: "bad", message: "match making cancelled" });
        },
      },
    ],
  });

  uiTimer = window.setInterval(() => {
    if (!modal.open) return;
    updateModal();
  }, 250);

  // Guard against rare hangs / stalled fetches.
  const withTimeout = (p, ms) =>
    Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error("Quick Match timed out")), ms))]);

  try {
    let result;
    try {
      result = await withTimeout(sbQuickMatch(), 9000);
    } catch {
      // One retry after a short delay.
      await new Promise((r) => setTimeout(r, 600));
      result = await withTimeout(sbQuickMatch(), 9000);
    }

    if (cancelled) return;

    const { lobby, role } = result;

    // If we're the guest (found someone waiting), run the 10s accept flow first.
    if (role === "guest") {
      if (uiTimer) window.clearInterval(uiTimer);
      closeModal();

      const ok = await quickMatchAcceptFlow(lobby.id, "guest");
      if (!ok) return;

      screen.value = "online";
      startPollingLobby(lobby.id, "guest");
      return;
    }

    // If we're the host, stay in the modal until someone joins (no more "Match Found" → waiting confusion).
    hostLobbyId = lobby?.id || null;

    const waitUntil = Date.now() + 60_000;
    while (!cancelled && Date.now() < waitUntil) {
      updateModal();

      // Check if someone joined.
      const fresh = hostLobbyId ? await sbSelectLobbyById(hostLobbyId) : null;
      if (fresh?.guest_key) {
        if (uiTimer) window.clearInterval(uiTimer);
        closeModal();

        const ok = await quickMatchAcceptFlow(hostLobbyId, "host");
        if (!ok) return;

        screen.value = "online";
        startPollingLobby(hostLobbyId, "host");
        return;
      }

      await new Promise((r) => setTimeout(r, 850));
    }

    // Timeout: no opponent.
    if (uiTimer) window.clearInterval(uiTimer);
    try {
      if (hostLobbyId) await sbDeleteLobby(hostLobbyId);
    } catch {}
    closeModal();
    showModal({
      title: "No Opponent",
      tone: "bad",
      message: "No one is playing right now.",
      actions: [{ label: "OK", tone: "primary", onClick: () => (screen.value = "mode") }],
    });
  } catch (e) {
    if (uiTimer) window.clearInterval(uiTimer);
    closeModal();
    showModal({ title: "Quick Match Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}


async function sbEnsureQuickMatchAcceptState(lobbyId) {
  // Client-side accept window; lobby row holds host_ready/guest_ready.
  return { startedAt: Date.now(), expiresAt: Date.now() + 10_000 };
}

async function sbSetQuickMatchAccept(lobbyId, role, accepted) {
  // role is "host" | "guest"
  const patch = {};
  if (role === "host") patch.host_ready = !!accepted;
  if (role === "guest") patch.guest_ready = !!accepted;

  // If declined, close lobby (host) or release guest slot (guest)
  if (accepted === false) {
    patch.status = "closed";
    if (role === "guest") patch.guest_key = null;
  } else {
    // keep waiting/playing as-is
    patch.updated_at = new Date().toISOString();
  }

  try {
    return await sbPatchLobby(lobbyId, patch);
  } catch {
    return null;
  }
}

async function quickMatchAcceptFlow(lobbyId, role) {
  const windowInfo = await sbEnsureQuickMatchAcceptState(lobbyId);
  const startedAt = Number(windowInfo.startedAt || Date.now());
  const expiresAt = Number(windowInfo.expiresAt || (startedAt + 10_000));

  // Show accept modal and drive the local progress bar UI
  qmAccept.open = true;
  qmAccept.startedAt = startedAt;
  qmAccept.expiresAt = expiresAt;
  qmAccept.role = role;

  const myDecision = await new Promise((resolve) => {
    qmAccept._resolve = resolve;
  });

  qmAccept._resolve = null;
  qmAccept.open = false;

  await sbSetQuickMatchAccept(lobbyId, role, myDecision === true);

  // If declined: return false so caller can show proper messaging
  return myDecision === true;
}


async function sbQuickMatch() {
  // Quick Match rooms are hidden from the lobby browser by ="__QM__"
  const me = getGuestId();

  // 1) Try to claim the oldest waiting quickmatch room
  const q = [
    "select=id,code,status,is_private,updated_at,host_key,guest_key",
    "status=eq.waiting",
    "is_private=eq.false",
    "guest_key=is.null",
        "order=updated_at.asc",
    "limit=6",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Quick match lookup failed (${res.status})`);
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : [];

  for (const lobby of list) {
    // Clean up dead rows so they don't get reused by accident
    if (lobbyPlayerCount(lobby) === 0 || isLobbyExpired(lobby)) {
      cleanupLobbyIfNeeded(lobby, { reason: "qm_empty" });
      continue;
    }

    if (isLobbyExpired(lobby)) {
      cleanupLobbyIfNeeded(lobby, { reason: "qm_expired" });
      continue;
    }

    // ✅ If a previous quick match already ended/terminated, don't ever reuse it.
    const phase = lobby?.state?.game?.phase;
    const term = lobby?.state?.meta?.terminateReason;
    if (phase === "gameover" || term) {
      try {
        const ok = await sbDeleteLobby(lobby.id);
        if (!ok) await sbCloseAndNukeLobby(lobby.id, { terminateReason: phase === "gameover" ? "ended" : "terminated", reason: "qm_stale" });
      } catch {}
      continue;
    }

    if (lobby.host_key === me) continue;

    // Claim it (atomic PATCH guarded by guest_key is null + status waiting)
    const joined = await sbJoinLobby(lobby.id);
    if (joined?.id) return { lobby: joined, role: "guest" };
  }

  // 2) Otherwise, create a new hidden quick match room and wait as host
  const created = await sbCreateLobby({
    isPrivate: false,
    lobbyName: "__QM__",
    mode: "quick",
    extraStateMeta: { kind: "quickmatch", hidden: true },
  });

  if (!created?.id) throw new Error("Failed to create quick match lobby.");
  return { lobby: created, role: "host" };
}


/* =========================
   NAV
========================= */

function confirmInGame({ title, message, yesLabel = "YES", noLabel = "NO", onYes } = {}) {
  if (!isInGame.value) return onYes?.();
  showModal({
    title: title || "Confirm",
    tone: "info",
    message: message || "Are you sure?",
    actions: [
      { label: noLabel, tone: "soft" },
      { label: yesLabel, tone: "primary", onClick: () => onYes?.() },
    ],
  });
}

function goBack() {
  if (["lobby", "settings", "credits", "ranked"].includes(screen.value)) {
    screen.value = "mode";
    return;
  }
  if (screen.value === "mode") {
    screen.value = "auth";
    return;
  }
  // In-game back is handled by dedicated buttons (Main Menu / Reset) to avoid desync.
}

async function goAuth() {
  // ✅ If the player is currently in a match, confirm first.
  if (isInGame.value) {
    return confirmInGame({
      title: "Go to Main Menu?",
      message: "Are you sure you want to go back to main menu?",
      yesLabel: "YES",
      noLabel: "NO",
      onYes: async () => {
        if (isOnline.value) await leaveOnlineLobby("main_menu");
        stopPolling();
        myPlayer.value = null;
        screen.value = "auth";
      },
    });
  }

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

function goQuick() { return goLobby(); }

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

  tryPlayGameBgm();
}

function startPracticeAi() {
  stopPolling();
  myPlayer.value = null;
  screen.value = "ai";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  tryPlayGameBgm();
}

function applySettings() {
  saveAudioPrefs();
  // Apply volumes immediately
  try {
    if (_menuBgm) _menuBgm.volume = bgmVolume.value;
    if (_couchBgm) _couchBgm.volume = bgmVolume.value;
    if (_onlineBgm) _onlineBgm.volume = bgmVolume.value;
  } catch {}

  showModal({
    title: "Settings Applied",
    message: `Allow Flip: ${allowFlip.value ? "ON" : "OFF"}
Drag: ${game.ui.enableDragPlace ? "ON" : "OFF"} · Click: ${game.ui.enableClickPlace ? "ON" : "OFF"} · Hover: ${game.ui.enableHoverPreview ? "ON" : "OFF"}
BGM: ${bgmVolumeUi.value}% · SFX: ${sfxVolumeUi.value}%`,
    tone: "info",
  });
  screen.value = "mode";
}

function applyInGameSettings() {
  saveAudioPrefs();
  try {
    if (_menuBgm) _menuBgm.volume = bgmVolume.value;
    if (_couchBgm) _couchBgm.volume = bgmVolume.value;
    if (_onlineBgm) _onlineBgm.volume = bgmVolume.value;
  } catch {}
  closeInGameSettings();

  // Best-effort resume the correct BGM after applying.
  try {
    if (isInGame.value) tryPlayGameBgm();
    else tryPlayMenuBgm();
  } catch {}
}

/* =========================
   MOUNT / UNMOUNT
========================= */

function isMobileLike() {
  try {
    const ua = String(navigator?.userAgent || "").toLowerCase();
    const touch = (navigator?.maxTouchPoints || 0) > 0;
    const small = Math.min(window.innerWidth || 0, window.innerHeight || 0) <= 820;
    return /android|iphone|ipad|ipod|mobile/.test(ua) || (touch && small);
  } catch {
    return false;
  }
}

function maybeWarnMobile() {
  try {
    if (!isMobileLike()) return;
    const key = "pb_mobile_warn_ack";
    const ack = localStorage.getItem(key);
    if (ack === "1") return;

    // Show a one-time warning. If they insist, force landscape lock.
    showModal({
      title: "Mobile Warning",
      tone: "bad",
      message:
        "Mobile detected. This game is designed for desktop.\n\nIf you still want to play on mobile:\n• Enable Desktop Site / Desktop mode\n• Rotate to LANDSCAPE\n\nContinue anyway?",
      actions: [
        {
          label: "Back",
          tone: "soft",
          onClick: () => {
            try { localStorage.setItem(key, "1"); } catch {}
            screen.value = "auth";
          },
        },
        {
          label: "Continue",
          tone: "primary",
          onClick: () => {
            try { localStorage.setItem(key, "1"); } catch {}
            try { game.ui.lockLandscape = true; } catch {}
            closeModal();
          },
        },
      ],
    });
  } catch {}
}

onMounted(() => {
  // ✅ Initial boot gate — prevent accidental clicks before first paint.
  startUiLock({ label: "Booting…", hint: "Loading UI, sounds, and neon vibes…", minMs: 750 });

  loadAudioPrefs();

  // BGM now starts only when the player clicks a UI button (see uiClick()).


  onViewportChange();
  try { window.setTimeout(() => maybeWarnMobile(), 900); } catch {}
  window.addEventListener("resize", onViewportChange, { passive: true });
  window.addEventListener("orientationchange", onViewportChange, { passive: true });

  // Esc opens in-game settings.
  escHandler = (e) => {
    try {
      if (e.key !== "Escape") return;
      // Don't steal escape from typing in inputs.
      const tag = String(e.target?.tagName || "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (!isInGame.value) return;
      e.preventDefault?.();
      inGameSettingsOpen.value = !inGameSettingsOpen.value;
    } catch {}
  };
  window.addEventListener("keydown", escHandler, { passive: false });
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
  try { window.removeEventListener("resize", onViewportChange); } catch {}
  try { window.removeEventListener("orientationchange", onViewportChange); } catch {}
  try { if (escHandler) window.removeEventListener("keydown", escHandler); } catch {}
  try { if (_fitRaf) cancelAnimationFrame(_fitRaf); } catch {}
  stopPolling();
});
