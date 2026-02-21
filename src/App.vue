<template>
  <div class="app" :class="{ inGame: isInGame }">
    <!-- 🔥 Animated RGB background -->
    <div class="bg">
      <div class="bgGradient"></div>
      <div class="bgNoise"></div>
      <div class="bgGlow g1"></div>
      <div class="bgGlow g2"></div>
      <div class="bgGlow g3"></div>
    </div>

    <!-- ✅ Turn border (only during game) -->
    <div
      v-if="isInGame"
      class="turnFrame"
      :class="{
        p1: game.phase !== 'gameover' && game.currentPlayer === 1,
        p2: game.phase !== 'gameover' && game.currentPlayer === 2,
        end: game.phase === 'gameover',
      }"
      aria-hidden="true"
    ></div>

    <header class="topbar">
      <div class="brand" @click="goAuth" title="Back to Main Menu">
        <div class="logoMark"><img :src="logoUrl" alt="Logo" class="logoImg" /></div>
        <div class="brandText">
          <div class="title">PentoBattle</div>
          <div class="sub">Rotate • Flip • Dominate</div>
        </div>
      </div>

      <div class="right">
        <button class="btn ghost" v-if="canGoBack" @click="goBack">← Back</button>
        <button class="btn ghost" v-if="screen !== 'auth'" @click="goAuth">Main Menu</button>
        <button class="btn" v-if="isInGame" @click="onPrimaryMatchAction">{{ primaryMatchActionLabel }}</button>
      </div>
    </header>

    <main class="main">
      <!-- =========================
           AUTH MENU
      ========================== -->
      <section v-if="screen === 'auth'" class="menuShell">
        <div class="hero">
          <div class="heroBadge">WEB EDITION</div>
          <h1 class="heroTitle">
            <span class="rgbText">PentoBattle</span>
          </h1>
          <p class="heroDesc">
            Draft pieces, outplay your opponent, and claim the board.
          </p>
        </div>

        <div class="menuCard">
          <div class="menuTitleRow">
            <div class="menuTitle">Start</div>
            <div class="menuHint">Login unlocks Ranked later</div>
          </div>

          <div class="menuStack">
            <button class="menuBtn disabled" disabled title="Login not implemented yet">
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">🔒</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Login</div>
                  <div class="menuBtnSub">Not working yet</div>
                </div>
              </div>
              <div class="menuBtnRight">SOON</div>
            </button>

            <button class="menuBtn primary" @click="playAsGuest">
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">👤</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Play as Guest</div>
                  <div class="menuBtnSub">Works now</div>
                </div>
              </div>
              <div class="menuBtnRight">▶</div>
            </button>
          </div>

          <div class="finePrint">
            Tip: You can still play Couch + Practice without login.
          </div>
        </div>
      </section>

      <!-- =========================
           MODE MENU (STACKED)
      ========================== -->
      <section v-else-if="screen === 'mode'" class="menuShell">
        <div class="hero compact">
          <div class="heroBadge" :class="{ green: loggedIn }">
            {{ loggedIn ? "LOGGED IN" : "GUEST" }}
          </div>
          <h1 class="heroTitle small">
            Choose a <span class="rgbText">Mode</span>
          </h1>
          <p class="heroDesc small">
            Ranked requires login. Others work offline.
          </p>
        </div>

        <div class="menuCard">
          <div class="menuTitleRow">
            <div class="menuTitle">Game Modes</div>
            <div class="menuHint">Keyboard: Q rotate • E flip</div>
          </div>

          <div class="menuStack">
            <button
              class="menuBtn"
              :disabled="!loggedIn"
              :class="{ disabled: !loggedIn }"
              :title="!loggedIn ? 'Ranked requires login' : ''"
              @click="goRanked"
            >
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">🏆</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Ranked</div>
                  <div class="menuBtnSub">Auto finds lobby with same tier</div>
                </div>
              </div>
              <div class="menuBtnRight">{{ loggedIn ? "▶" : "LOCKED" }}</div>
            </button>

            <button class="menuBtn" @click="goQuick">
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">⚡</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Quick Match</div>
                  <div class="menuBtnSub">Browse public lobbies or join by code</div>
                </div>
              </div>
              <div class="menuBtnRight">▶</div>
            </button>

            <button class="menuBtn primary" @click="startCouchPlay">
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">🛋️</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Couch Play</div>
                  <div class="menuBtnSub">Local 2-player (your current mode)</div>
                </div>
              </div>
              <div class="menuBtnRight">PLAY</div>
            </button>

            <button class="menuBtn" @click="startPracticeAi">
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">🤖</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Practice vs. AI</div>
                  <div class="menuBtnSub">Uses local flow for now</div>
                </div>
              </div>
              <div class="menuBtnRight">▶</div>
            </button>

            <div class="menuSplitRow">
              <button class="btn soft" @click="screen = 'settings'">⚙ Settings</button>
              <button class="btn soft" @click="screen = 'credits'">✨ Credits</button>
            </div>
          </div>

          <div class="finePrint">
            Public lobbies are visible. Private lobbies require a code.
          </div>
        </div>
      </section>

      <!-- =========================
           QUICK MATCH MENU
      ========================== -->
      <section v-else-if="screen === 'quick'" class="menuShell">
        <div class="hero compact">
          <div class="heroBadge">ONLINE</div>
          <h1 class="heroTitle small">
            <span class="rgbText">Quick Match</span>
          </h1>
          <p class="heroDesc small">Public lobbies are listed. Private requires code.</p>
        </div>

        <div class="menuCard">
          <div class="menuStack">
            <button class="menuBtn primary" @click="enterQuickFind">
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">🔎</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Matchmaking</div>
                  <div class="menuBtnSub">See public lobbies + join by code</div>
                </div>
              </div>
              <div class="menuBtnRight">▶</div>
            </button>

            <button class="menuBtn" @click="screen = 'quick_make'">
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">➕</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Make Lobby</div>
                  <div class="menuBtnSub">Create public or private room</div>
                </div>
              </div>
              <div class="menuBtnRight">▶</div>
            </button>

            <button class="btn soft" @click="screen = 'mode'">← Back to Modes</button>
          </div>

          <div class="finePrint">
            Tip: Public = visible. Private = hidden, join by code.
          </div>
        </div>
      </section>

      <!-- QUICK MATCH: FIND -->
      <section v-else-if="screen === 'quick_find'" class="menuShell">
        <div class="hero compact">
          <div class="heroBadge">MATCHMAKING</div>
          <h1 class="heroTitle small">Find / Join Lobby</h1>
          <p class="heroDesc small">Join a public lobby from the list or type a private code.</p>
        </div>

        <div class="menuCard">
          <div class="form">
            <label class="field">
              <span>Join Code</span>
              <input
                v-model="quick.joinCode"
                class="input"
                placeholder="e.g., PB-AB12CD34"
                @keydown.enter.prevent="joinByCode"
              />
            </label>
          </div>

          <div class="row">
            <button class="btn soft" @click="screen = 'quick'">← Back</button>
            <button class="btn" @click="refreshPublicLobbies">Refresh</button>
            <button class="btn primary" @click="joinByCode">Join by Code</button>
          </div>

          <div class="divider"></div>

          <div class="menuTitleRow" style="margin-bottom: 8px;">
            <div class="menuTitle">Public Lobbies</div>
            <div class="menuHint">{{ publicLobbies.length }} found</div>
          </div>

          <div v-if="loadingPublic" class="finePrint" style="border-top:none;padding-top:0;margin-top:0;">
            Loading public lobbies...
          </div>

          <div v-else-if="!publicLobbies.length" class="finePrint" style="border-top:none;padding-top:0;margin-top:0;">
            No public lobbies waiting right now. Create one or refresh.
          </div>

          <div v-else class="form">
            <div
              class="field"
              v-for="l in publicLobbies"
              :key="l.id"
              style="justify-content: space-between;"
            >
              <div style="display:flex;flex-direction:column;gap:4px;min-width:0;">
                <div style="font-weight:900;letter-spacing:.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                  {{ l.lobby_name || "Public Lobby" }}
                </div>
                <div style="opacity:.75;font-size:12px;">
                  Code: <b>{{ l.code || "—" }}</b> · Status: <b>{{ l.status || "waiting" }}</b>
                </div>
              </div>

              <button class="btn primary" @click="joinPublicLobby(l)">
                Join
              </button>
            </div>
          </div>
        </div>
      </section>

      <!-- QUICK MATCH: MAKE -->
      <section v-else-if="screen === 'quick_make'" class="menuShell">
        <div class="hero compact">
          <div class="heroBadge">HOST</div>
          <h1 class="heroTitle small">Make Lobby</h1>
          <p class="heroDesc small">Public shows in matchmaking. Private requires a code.</p>
        </div>

        <div class="menuCard">
          <div class="form">
            <label class="field">
              <span>Lobby Name</span>
              <input v-model="quick.lobbyName" class="input" placeholder="e.g., Mumuchxm room" />
            </label>

            <label class="field">
              <span>Private</span>
              <input type="checkbox" v-model="quick.isPrivate" />
            </label>
          </div>

          <div class="row">
            <button class="btn soft" @click="screen = 'quick'">← Back</button>
            <button class="btn primary" @click="quickMake">Create</button>
          </div>

          <div class="finePrint">
            Public lobbies appear in matchmaking. Private lobbies are hidden and must be joined by code.
          </div>
        </div>
      </section>

      <!-- =========================
           RANKED
      ========================== -->
      <section v-else-if="screen === 'ranked'" class="menuShell">
        <div class="hero compact">
          <div class="heroBadge">RANKED</div>
          <h1 class="heroTitle small">Matchmaking</h1>
          <p class="heroDesc small">Placeholder screen for now.</p>
        </div>

        <div class="menuCard">
          <div class="form">
            <div class="field">
              <span>Your Tier</span>
              <b>{{ rankedTier }}</b>
            </div>
            <div class="field">
              <span>Queue</span>
              <b>Auto find same tier</b>
            </div>
          </div>

          <div class="row">
            <button class="btn soft" @click="screen = 'mode'">← Back</button>
            <button class="btn primary" disabled title="Not implemented yet">Find Match (soon)</button>
          </div>
        </div>
      </section>

      <!-- =========================
           SETTINGS
      ========================== -->
      <section v-else-if="screen === 'settings'" class="menuShell">
        <div class="hero compact">
          <div class="heroBadge">SETTINGS</div>
          <h1 class="heroTitle small">Preferences</h1>
          <p class="heroDesc small">Applies to local modes.</p>
        </div>

        <div class="menuCard">
          <div class="form">
            <label class="field">
              <span>Allow Flip (Mirror)</span>
              <input type="checkbox" v-model="allowFlip" />
            </label>
          </div>

          <div class="row">
            <button class="btn soft" @click="goMode">← Back</button>
            <button class="btn primary" @click="applySettings">Apply</button>
          </div>

          <div class="finePrint">Board is fixed to <b>10×6</b>.</div>
        </div>
      </section>

      <!-- =========================
           CREDITS
      ========================== -->
      <section v-else-if="screen === 'credits'" class="menuShell">
        <div class="hero compact">
          <div class="heroBadge">CREDITS</div>
          <h1 class="heroTitle small">PentoBattle</h1>
          <p class="heroDesc small">by Mumuchxm</p>
        </div>

        <div class="menuCard">
          <div class="credits">
            <p><b>PentoBattle</b> — by <b>Mumuchxm</b></p>
            <p class="muted">Built with Vite + Vue.</p>
          </div>

          <div class="row">
            <button class="btn soft" @click="goMode">← Back</button>
          </div>
        </div>
      </section>

      <!-- =========================
           GAME (COUCH / AI / ONLINE)
      ========================== -->
      <section v-else class="gameLayout">
        <section class="leftPanel">
          <div class="panelHead">
            <div class="modeRow">
              <div class="modeTag">Mode: <b>{{ modeLabel }}</b>
                <span v-if="isOnline && myPlayer"> · You: <b>P{{ myPlayer }}</b></span>
              </div>

              <!-- ✅ Turn badge (highlighted) -->
              <div
                class="turnBadge"
                :class="{
                  p1: game.phase !== 'gameover' && game.currentPlayer === 1,
                  p2: game.phase !== 'gameover' && game.currentPlayer === 2,
                  end: game.phase === 'gameover',
                }"
              >
                <span v-if="game.phase === 'draft'">DRAFT</span>
                <span v-else-if="game.phase === 'place'">P{{ game.currentPlayer }} TURN</span>
                <span v-else>GAME OVER</span>
              </div>
            </div>

            <div class="statusTag">
              Phase: <b>{{ game.phase }}</b>
              <span v-if="game.phase === 'draft'"> · Draft pick: <b>P{{ game.draftTurn }}</b></span>
              <span v-else-if="game.phase === 'place'"> · Turn: <b>P{{ game.currentPlayer }}</b></span>
            </div>

            <div v-if="isOnline" class="statusTag">
              <span><b>Ping:</b> {{ pingText }}</span>
              <span v-if="onlineTurnText"> · {{ onlineTurnText }}</span>
              <span v-if="turnTimerText"> · {{ turnTimerText }}</span>
            </div>

            <div class="keysTag" v-if="game.phase === 'place'">
              Keys: <b>Q</b> Rotate · <b>E</b> Flip
            </div>
          </div>

          <DraftPanel v-if="game.phase === 'draft'" />

          <section v-else class="panel">
            <h2 class="panelTitle">Player {{ game.currentPlayer }} Pieces</h2>
            <PiecePicker :isOnline="isOnline" :myPlayer="myPlayer" :canAct="canAct" />

            <div class="divider"></div>
            <Controls :isOnline="isOnline" :canAct="canAct" />
          </section>
        </section>

        <section class="rightPanel">
          <Board />
          <div class="hintSmall">
            Drag a piece to the board and hover to preview. Click or drop to place.
          </div>
        </section>
      </section>
    </main>

    <!-- ✅ Modal (illegal placement / winner / general notices) -->
    <div v-if="modal.open" class="modalOverlay" @click.self="closeModal">
      <div class="modalCard" role="dialog" aria-modal="true">
        <div class="modalTop">
          <div class="modalTitle">
            <span class="modalDot" :class="modalDotClass"></span>
            {{ modal.title }}
          </div>
          <button class="modalX" @click="closeModal" aria-label="Close">✕</button>
        </div>

        <div class="modalBody">
          <p class="modalMsg" v-for="(line, i) in modalLines" :key="i">
            {{ line }}
          </p>
        </div>

        <div class="modalActions">
          <button class="btn primary" @click="closeModal">OK</button>

          <button v-if="modal.cta === 'reset'" class="btn" @click="resetFromModal">
            Play Again
          </button>

          <button v-if="modal.cta === 'rematch'" class="btn" @click="requestRematch">
            Play Again
          </button>

          <button v-if="modal.cta === 'rematch'" class="btn ghost" @click="leaveOnlineAndGo('auth')">
            Leave Match
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
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

const logoUrl = new URL("./assets/logo.svg", import.meta.url).href;

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
  if (game.phase === "draft") {
    return game.draftTurn === myPlayer.value ? "Your turn" : `Waiting for Player ${game.draftTurn}...`;
  }
  if (game.phase === "place") {
    return game.currentPlayer === myPlayer.value ? "Your turn" : `Waiting for Player ${game.currentPlayer}...`;
  }
  return "";
});

const pingText = computed(() => {
  const v = online.pingMs;
  if (v === null || v === undefined) return "—";
  const ms = Math.max(0, Math.round(v));
  return `${ms}ms`;
});

const turnTimerText = computed(() => {
  if (!isInGame.value) return "";
  if (game.phase === "gameover") return "";
  if (!game.turnStartedAt) return "";
  if (isOnline.value && !online.hasOpponent) return "";
  const limit = game.phase === "draft" ? (game.turnLimitDraftSec || 30) : (game.turnLimitPlaceSec || 60);
  const left = Math.max(0, limit - (nowTick.value - game.turnStartedAt) / 1000);
  const s = Math.ceil(left);
  return `Time: ${s}s`;
});

const turnTimerBar = computed(() => {
  if (!isInGame.value) return { visible: false };
  if (game.phase === "gameover") return { visible: false };
  if (!game.turnStartedAt) return { visible: false };
  // online: don't show while waiting for opponent
  if (isOnline.value && !online.hasOpponent) return { visible: false };

  const limit = game.phase === "draft" ? (game.turnLimitDraftSec || 30) : (game.turnLimitPlaceSec || 60);
  const left = Math.max(0, limit - (nowTick.value - game.turnStartedAt) / 1000);
  const pct = limit > 0 ? Math.max(0, Math.min(1, left / limit)) : 0;

  const s = Math.ceil(left);
  const label = game.phase === "draft" ? `Draft timer: ${s}s` : `Turn timer: ${s}s`;
  return { visible: true, pct, text: label };
});

async function copyLobbyCode() {
  if (!online.code) return;
  try {
    await navigator.clipboard.writeText(String(online.code));
    showModal({ title: "Copied", tone: "good", message: `Lobby code copied:\n${online.code}` });
  } catch {
    showModal({ title: "Copy Failed", tone: "bad", message: "Your browser blocked clipboard access." });
  }
}


// Top-right button: Reset (offline) / Surrender (online)
const primaryMatchActionLabel = computed(() => {
  if (!isInGame.value) return "";
  if (isOnline.value) return game.phase === "gameover" ? "Play Again" : "Surrender";
  return "Reset Match";
});

function onPrimaryMatchAction() {
  if (!isInGame.value) return;
  if (isOnline.value) {
    if (!myPlayer.value) return;
    if (game.phase === "gameover") {
      requestRematch();
      return;
    }
    game.surrender(myPlayer.value);
    online.localDirty = true;
    pushMyState("surrender");
    return;
  }
  onResetClick();
}

function winnerMessage(w) {
  const me = myPlayer.value;
  if (!me) return `Player ${w} wins.\nGG!`;
  if (w === null || w === undefined) {
    return game.matchInvalid ? `Match invalid — ${game.matchInvalidReason || "dodged"}.` : "Match ended.";
  }
  return w === me ? "You win!\nGG!" : "Opponent wins.\nGG!";
}

const sfxPick = new Audio();
const sfxPlace = new Audio();
const bgm = new Audio();

function loadAudioSafe(audio, url) {
  try {
    audio.src = url;
    audio.load?.();
  } catch {
    // ignore
  }
}

function initAudio() {
  // optional: place your files here (add them under src/assets/audio/*)
  loadAudioSafe(sfxPick, new URL("./assets/audio/pick.mp3", import.meta.url).href);
  loadAudioSafe(sfxPlace, new URL("./assets/audio/place.mp3", import.meta.url).href);
  loadAudioSafe(bgm, new URL("./assets/audio/bgm.mp3", import.meta.url).href);
  bgm.loop = true;
  bgm.volume = 0.25;
}

function playSfx(a) {
  try {
    a.currentTime = 0;
    a.play?.();
  } catch {
    // ignore autoplay restrictions
  }
}

function tryStartBgm() {
  try {
    if (!bgm.src) return;
    bgm.play?.();
  } catch {}
}

initAudio();

watch(
  () => game.lastMove,
  (mv, prev) => {
    if (!mv || mv === prev) return;
    if (mv.type === "draft") playSfx(sfxPick);
    if (mv.type === "place") playSfx(sfxPlace);
  }
);

const canAct = computed(() => {
  if (!isOnline.value) return true;
  if (!myPlayer.value) return false;
  if (game.phase === "gameover") return false;
  if (game.phase === "draft") return game.draftTurn === myPlayer.value;
  if (game.phase === "place") return game.currentPlayer === myPlayer.value;
  return false;
});

/* =========================
   ✅ MODAL SYSTEM
========================= */
const modal = reactive({
  open: false,
  title: "Notice",
  message: "",
  tone: "info", // "info" | "bad" | "good"
  cta: null, // null | "reset"
});

const modalLines = computed(() => String(modal.message || "").split("\n").filter(Boolean));

const modalDotClass = computed(() => {
  if (modal.tone === "bad") return "bad";
  if (modal.tone === "good") return "good";
  return "info";
});

function showModal({ title = "Notice", message = "", tone = "info", cta = null } = {}) {
  modal.title = title;
  modal.message = message;
  modal.tone = tone;
  modal.cta = cta;
  modal.open = true;
}

function closeModal() {
  modal.open = false;
}

function resetFromModal() {
  closeModal();
  game.resetGame();
}

/* =========================
   ✅ Hijack alert() so Board's illegal placement alert becomes a nice modal
========================= */
let originalAlert = null;
let tickTimer = null;
let uiTickTimer = null;
const nowTick = ref(Date.now());

onMounted(() => {
  originalAlert = window.alert;
  window.alert = (msg) => {
    showModal({
      title: "Illegal Placement",
      message: String(msg || "That placement is not allowed."),
      tone: "bad",
    });
  };

  // Timer watchdog (draft 30s / place 60s)
  // UI tick (keeps countdown visible)
  uiTickTimer = window.setInterval(() => {
    nowTick.value = Date.now();
  }, 250);

  // Timer watchdog (draft 30s / place 60s)
  tickTimer = window.setInterval(() => {
    if (!isOnline.value) return;
    if (!online.hasOpponent) return; // don't run timers while lobby isn't full
    // Only one side needs to finalize; allow either client to declare.
    const changed = game.checkAndApplyTimeout(Date.now());
    if (changed) {
      online.localDirty = true;
      pushMyState("timeout");
    }
  }, 250);


  // Gameover announcer (winner / timeout / dodge)
  // Uses store.lastMove so it matches both players in online.
  // (For online, lastMove is synced via buildSyncedState.)
  // watch is declared below (outside onMounted) for clarity.
  // Best-effort cleanup if the tab is closed
  window.addEventListener("beforeunload", onBeforeUnload);

  // Start BGM on first user gesture
  const startBgmOnce = () => {
    tryStartBgm();
    window.removeEventListener("pointerdown", startBgmOnce);
    window.removeEventListener("keydown", startBgmOnce);
  };
  window.addEventListener("pointerdown", startBgmOnce, { once: true });
  window.addEventListener("keydown", startBgmOnce, { once: true });
});

onBeforeUnmount(() => {
  if (originalAlert) window.alert = originalAlert;
  if (tickTimer) window.clearInterval(tickTimer);
});

/* =========================
   ✅ Winner modal when phase becomes gameover
========================= */
watch(
  () => game.phase,
  (p, prev) => {
    if (p === "gameover" && prev !== "gameover") {
      const w = game.winner ?? "?";
      showModal({
        title: "Victory!",
        message: winnerMessage(w),
        tone: "good",
        cta: "reset",
      });
    }
  }
);

/* =========================
   QUICK MATCH — Supabase REST
   Env:
   - VITE_SUPABASE_URL
   - VITE_SUPABASE_ANON_KEY
   Table: public.pb_lobbies
========================= */
const online = reactive({
  lobbyId: null,
  code: null,
  hasOpponent: false,
  prevGuestId: null,
  prevHasOpponent: false,
  role: null, // "host" | "guest"
  polling: false,
  pollTimer: null,
  lastAppliedVersion: 0,
  lastSeenUpdatedAt: null,
  applyingRemote: false,
  pingMs: null,
  localDirty: false,
  rematchPromptKey: null,
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


function onBeforeUnload() {
  // Fire-and-forget. Browsers may ignore async, but this helps sometimes.
  try {
    if (!online.lobbyId || !isOnline.value) return;
    const lobbyId = online.lobbyId;
    const role = online.role;
    const url = sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}`);
    if (role === "host") {
      navigator.sendBeacon?.(url, "");
      // sendBeacon can't set method headers; so this may not delete. Still keep.
    } else {
      // guest: we at least stop timers locally.
    }
  } catch {}
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

async function sbSelectLobbyById(id) {
  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(id)}&select=*`), {
    headers: sbHeaders(),
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Select lobby failed (${res.status})`);
  }
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
    "select=id,code,status,is_private,lobby_name,updated_at",
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

  const res = await fetch(sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}`), {
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
   ✅ ONLINE STATE SERIALIZATION
   - Only sync "authoritative" game state (not selection UI)
========================= */

function stableHash(str) {
  // FNV-1a 32-bit
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

function computePlayerAssignment(code, hostId, guestId) {
  // deterministic: both clients compute same mapping from lobby code
  const h = stableHash(String(code || ""));
  const hostIsP1 = (h % 2) === 0;
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

function buildSyncedState(meta = {}) {
  // "meta" keeps players mapping + started_at etc.
  // only include store fields that MUST match between players
  return {
    meta,
    game: {
      phase: game.phase,
      boardW: game.boardW,
      boardH: game.boardH,
      allowFlip: game.allowFlip,

      // core boards
      board: game.board,
      draftBoard: game.draftBoard,

      // turn systems
      draftTurn: game.draftTurn,
      currentPlayer: game.currentPlayer,

      // pools
      pool: game.pool,
      picks: game.picks,
      remaining: game.remaining,
      placedCount: game.placedCount,

      // timers / validity
      turnStartedAt: game.turnStartedAt,
      matchInvalid: game.matchInvalid,
      matchInvalidReason: game.matchInvalidReason,
      turnLimitDraftSec: game.turnLimitDraftSec,
      turnLimitPlaceSec: game.turnLimitPlaceSec,

      // win + last move (for announcements)
      winner: game.winner,
      lastMove: game.lastMove,

      // NOTE: exclude selection/rotation/flipped to avoid fighting
    },
  };
}

function applySyncedState(state) {
  if (!state || !state.game) return;

  online.applyingRemote = true;
  try {
    const g = state.game;

    // patch only known fields to avoid nuking Pinia internals
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
      lastMove: g.lastMove || null,
    });
  } finally {
    // release in next tick so watchers don't instantly re-push
    setTimeout(() => {
      online.applyingRemote = false;
    }, 0);
  }
}

async function sbPatchStateWithVersionGuard(lobbyId, knownVersion, patchObj) {
  // optimistic update: only update if current version matches knownVersion
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
  return rows?.[0] || null; // null if 0 rows (version mismatch)
}

async function sbForcePatchState(lobbyId, patchObj) {
  // fallback: patch without version guard (rare)
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


async function sbDeleteLobby(lobbyId) {
  const url = sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}`);
  const res = await fetch(url, { method: "DELETE", headers: sbHeaders() });
  // DELETE returns 204 or 200; ignore failures (user might have lost connection)
  if (!res.ok && res.status !== 404) {
    const txt = await res.text().catch(() => "");
    throw new Error(`Delete lobby failed (${res.status})\n${txt}`);
  }
  return true;
}

async function sbHostResetToWaiting(lobby) {
  if (!lobby?.id) return;
  const nextVersion = Number(lobby.version || 0) + 1;
  await sbForcePatchState(lobby.id, {
    guest_id: null,
    host_ready: false,
    guest_ready: false,
    status: "waiting",
    state: {},
    version: nextVersion,
    updated_at: new Date().toISOString(),
  });
}

async function sbGuestLeaveToWaiting(lobby) {
  if (!lobby?.id) return;
  const nextVersion = Number(lobby.version || 0) + 1;
  await sbForcePatchState(lobby.id, {
    guest_id: null,
    host_ready: false,
    guest_ready: false,
    status: "waiting",
    state: {},
    version: nextVersion,
    updated_at: new Date().toISOString(),
  });
}

async function leaveOnlineAndGo(toScreen = "mode") {
  if (!isOnline.value || !online.lobbyId) {
    screen.value = toScreen;
    return;
  }
  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (online.role === "host") {
      // creator leaving => delete lobby
      await sbDeleteLobby(online.lobbyId);
    } else {
      // guest leaving => keep lobby for host
      if (lobby) await sbGuestLeaveToWaiting(lobby);
    }
  } catch {
    // ignore
  } finally {
    stopPolling();
    myPlayer.value = null;
    online.lobbyId = null;
    online.code = null;
    online.role = null;
    online.hasOpponent = false;
    screen.value = toScreen;
  }
}

async function pushMyState(reason = "") {
  if (!isOnline.value) return;
  if (!online.lobbyId) return;
  if (online.applyingRemote) return;

  // only the player whose turn can push moves (prevents overwrites)
  // BUT: we allow one-shot push right after a local action (localDirty)
  if (!canAct.value && !online.localDirty) return;

  onlineSyncing.value = true;

  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    const meta = (lobby.state && lobby.state.meta) ? lobby.state.meta : {};
    const snapshot = buildSyncedState(meta);

    const nextVersion = Number(lobby.version || 0) + 1;

    // try guarded update first
    let updated = await sbPatchStateWithVersionGuard(online.lobbyId, lobby.version, {
      state: snapshot,
      version: nextVersion,
      updated_at: new Date().toISOString(),
    });

    // if mismatch (0 rows), refetch once and try again
    if (!updated) {
      const fresh = await sbSelectLobbyById(online.lobbyId);
      if (!fresh) return;

      // if remote already contains our intended change (rare), just accept it
      const freshState = fresh.state || {};
      // otherwise retry with new version
      updated = await sbPatchStateWithVersionGuard(online.lobbyId, fresh.version, {
        state: snapshot,
        version: Number(fresh.version || 0) + 1,
        updated_at: new Date().toISOString(),
      });

      // final fallback: unguarded (should basically never happen if turns are respected)
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
    // ignore transient errors
  } finally {
    onlineSyncing.value = false;
  }
}

function maybeSetMyPlayerFromLobby(lobby) {
  const myId = getGuestId();
  const st = lobby?.state || {};
  const players = st?.meta?.players;

  if (players) {
    myPlayer.value = getMyPlayerFromPlayers(players, myId);
    return;
  }

  // if no players yet, infer from deterministic assignment
  if (lobby?.code && lobby?.host_id && lobby?.guest_id) {
    const { players: p } = computePlayerAssignment(lobby.code, lobby.host_id, lobby.guest_id);
    myPlayer.value = getMyPlayerFromPlayers(p, myId);
  }
}

async function ensureOnlineInitialized(lobby) {
  if (!lobby) return;

  const myId = getGuestId();

  // if state.meta.players missing, allow either client to initialize (deterministic)
  const hasPlayers = !!lobby?.state?.meta?.players;
  if (hasPlayers) return;

  if (!lobby.host_id || !lobby.guest_id) return;

  const { players } = computePlayerAssignment(lobby.code, lobby.host_id, lobby.guest_id);

  // init local fresh game BEFORE writing
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  const initState = buildSyncedState({
    players,
    rematch: { 1: false, 2: false },
    started_at: new Date().toISOString(),
    created_by: myId,
  });

  // write it (unguarded is OK here since it’s the first init)
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
  stopPolling();
  online.polling = true;
  online.lobbyId = lobbyId;
  online.role = role;
  online.lastAppliedVersion = 0;
  online.lastSeenUpdatedAt = null;

  // go to online screen immediately
  screen.value = "online";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();
  // don't start the turn timer until the lobby is actually full
  game.turnStartedAt = null;
  online.code = null;
  online.hasOpponent = false;
  online.prevGuestId = null;
  online.prevHasOpponent = false;

  online.pollTimer = setInterval(async () => {
    try {
      onlineSyncing.value = true;
      const t0 = performance.now();
      const lobby = await sbSelectLobbyById(lobbyId);
      online.pingMs = performance.now() - t0;
      if (!lobby) {
        stopPolling();
        showModal({
          title: "Lobby Terminated",
          tone: "bad",
          message: online.role === "guest"
            ? "The lobby creator left. Terminating the game and returning you to the main menu."
            : "The lobby no longer exists.",
        });
        screen.value = "auth";
        return;
      }

      online.code = lobby.code || online.code;

      const hasOpponentNow = !!(lobby.host_id && lobby.guest_id);
      online.hasOpponent = hasOpponentNow;

      // Host: detect a new challenger join
      if (online.role === "host") {
        const guestNow = lobby.guest_id || null;
        const guestPrev = online.prevGuestId;
        if (!guestPrev && guestNow) {
          // close the "Lobby Ready" modal if it's still open
          if (modal.open && String(modal.title || "").toLowerCase().includes("lobby ready")) {
            closeModal();
          }
          showModal({ title: "Challenger Joined!", tone: "good", message: "A player joined your lobby. Let’s go!" });
        }
        online.prevGuestId = guestNow;

        // If challenger left, keep the lobby open and wait.
        if (guestPrev && !guestNow) {
          // reset local game view to waiting mode
          myPlayer.value = null;
          game.resetGame();
          game.turnStartedAt = null;
          showModal({ title: "Player Left", tone: "info", message: "Your challenger left. Lobby stays open — waiting for a new one." });
        }
      }


      // if we just joined and host is missing etc.
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

        // If opponent requested a rematch, prompt you once.
        try {
          const rm = st?.meta?.rematch;
          if (rm && myPlayer.value && game.phase === "gameover") {
            const other = myPlayer.value === 1 ? 2 : 1;
            const wants = !!rm[other];
            const mine = !!rm[myPlayer.value];
            const k = `${v}|${wants ? 1 : 0}|${mine ? 1 : 0}`;
            if (wants && !mine && online.rematchPromptKey !== k) {
              online.rematchPromptKey = k;
              showModal({
                title: "Rematch?",
                tone: "info",
                message: "Your opponent wants to play again. Hit Play Again to accept.",
                cta: "rematch",
              });
            }
          }
        } catch {}
      }
    } catch {
      // keep polling quietly
    } finally {
      onlineSyncing.value = false;
    }
  }, 650);
}

/* =========================
   Auto-push on local authoritative changes (online)
   - This is what makes "P1 pick" instantly appear on P2
========================= */
watch(
  () => [
    isOnline.value,
    game.phase,
    game.draftTurn,
    game.currentPlayer,
    game.winner,
    // JSON string keeps it simple + stable for small boards
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
  ],
  async () => {
    if (!isOnline.value) return;
    if (!online.lobbyId) return;
    if (online.applyingRemote) return;
    // mark local changes for upload
    online.localDirty = true;

    // small debounce: multiple mutations in one tick (draftPick/placeAt) -> single push
    if (pushDebounceTimer) clearTimeout(pushDebounceTimer);
    pushDebounceTimer = setTimeout(() => pushMyState("watch"), 80);
  }
);

let pushDebounceTimer = null;


const _lastGameoverKey = ref("");
watch(
  () => [game.phase, JSON.stringify(game.lastMove || null), String(game.winner), String(game.matchInvalid), String(game.matchInvalidReason)],
  () => {
    if (!isInGame.value) return;
    if (game.phase !== "gameover") return;

    const key = `${game.phase}|${game.winner}|${game.matchInvalid}|${game.matchInvalidReason}|${JSON.stringify(game.lastMove || null)}`;
    if (_lastGameoverKey.value === key) return;
    _lastGameoverKey.value = key;

    const lm = game.lastMove || {};
    let title = "GAME OVER";
    let tone = "info";
    let message = "";

    if (lm.type === "dodged") {
      const p = lm.player || game.currentPlayer;
      title = "DODGE!";
      tone = "bad";
      message = `Player ${p} did not pick in time — automatically dodges the game.`;
    } else if (lm.type === "timeout") {
      const p = lm.player || game.currentPlayer;
      title = "TIMEOUT!";
      tone = "bad";
      message = `Player ${p} ran out of time — forfeits the match.`;
    } else if (lm.type === "surrender") {
      const p = lm.player || "?";
      title = "SURRENDER";
      tone = "bad";
      message = `Player ${p} surrendered.`;
    } else {
      message = winnerMessage(game.winner);
      tone = game.winner ? "good" : "info";
    }

    // Add winner line if available
    if (game.winner) {
      message += `\n\nWinner: Player ${game.winner}`;
    }

    // Modal CTA: offline => reset, online => rematch
    const cta = isOnline.value ? "rematch" : "reset";
    showModal({ title, message, tone, cta });
  }
);

/* =========================
   ONLINE RESET
========================= */
async function onResetClick() {
  if (!isOnline.value || !online.lobbyId) {
    game.resetGame();
    return;
  }

  // online: reset the shared state (anyone can, but turn guard still applies)
  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    // keep players mapping
    const meta = (lobby.state && lobby.state.meta) ? lobby.state.meta : {};
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

/* =========================
   Quick Match handlers
========================= */

async function refreshPublicLobbies() {
  if (!(await ensureSupabaseReadyOrExplain())) return;
  loadingPublic.value = true;
  try {
    const rows = await sbListPublicWaitingLobbies();
    publicLobbies.value = Array.isArray(rows) ? rows : [];
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
    const joined = await sbJoinLobby(lobby.id);
    closeModal();
    showModal({ title: "Joined!", tone: "good", message: `Connected.\nCode: ${joined?.code || lobby?.code || "—"}` });

    // start online polling immediately
    startPollingLobby(lobby.id, "guest");
  } catch (e) {
    closeModal();
    showModal({
      title: "Join Failed",
      tone: "bad",
      message: String(e?.message || e || "Could not join lobby."),
    });
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

    if (lobby.guest_id) {
      closeModal();
      showModal({ title: "Lobby Full", tone: "bad", message: "That lobby already has a guest." });
      return;
    }

    const joined = await sbJoinLobby(lobby.id);
    closeModal();

    showModal({ title: "Joined!", tone: "good", message: `Connected.\nCode: ${joined?.code || code}` });

    startPollingLobby(lobby.id, "guest");
  } catch (e) {
    closeModal();
    showModal({
      title: "Join by Code Error",
      tone: "bad",
      message: String(e?.message || e || "Something went wrong."),
    });
  }
}

async function quickMake() {
  if (!(await ensureSupabaseReadyOrExplain())) return;

  try {
    showModal({
      title: "Creating Lobby...",
      tone: "info",
      message: "Setting up your room...",
    });

    const created = await sbCreateLobby({
      isPrivate: quick.isPrivate,
      lobbyName: quick.lobbyName || (quick.isPrivate ? "Private Lobby" : "Public Lobby"),
    });

    closeModal();

    if (!created?.id) throw new Error("Lobby created but no ID returned.");

    if (created.code) {
      try { await navigator.clipboard.writeText(created.code); } catch {}
    }

    showModal({
      title: "Lobby Ready",
      tone: "good",
      message: `Lobby Code: ${created.code || "—"}\n\n${
        created.is_private
          ? "This is PRIVATE. Only people with the code can join."
          : "This is PUBLIC. It will appear in matchmaking."
      }\n\n(Code copied if your browser allowed it.)`,
    });

    if (!created.is_private) {
      await refreshPublicLobbies();
    }

    // host starts polling now; when guest joins we init + sync
    startPollingLobby(created.id, "host");
  } catch (e) {
    closeModal();
    showModal({
      title: "Create Lobby Error",
      tone: "bad",
      message: String(e?.message || e || "Something went wrong."),
    });
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
function goAuth() {
  leaveOnlineAndGo("auth");
}
function goMode() {
  leaveOnlineAndGo("mode");
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

onBeforeUnmount(() => {
  stopPolling();
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
  window.removeEventListener("beforeunload", onBeforeUnload);
  if (uiTickTimer) clearInterval(uiTickTimer);
  uiTickTimer = null;
});
</script>

<style scoped>
/* =========================
   RGB GAME VIBES
========================= */
.app {
  min-height: 100vh;
  color: #eaeaea;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: #06060a;
  font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial;
}

/* ✅ Big screen border glow per turn */
.turnFrame {
  position: fixed;
  inset: 10px;
  border-radius: 18px;
  pointer-events: none;
  z-index: 30;

  border: 2px solid rgba(255, 255, 255, 0.10);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 12px 60px rgba(0, 0, 0, 0.55);
  opacity: 0.95;
}

.turnFrame.p1 {
  border-color: rgba(0, 229, 255, 0.35);
  box-shadow:
    0 0 0 1px rgba(0, 229, 255, 0.10) inset,
    0 0 26px rgba(0, 229, 255, 0.18),
    0 0 60px rgba(0, 229, 255, 0.12),
    0 20px 70px rgba(0, 0, 0, 0.55);
}

.turnFrame.p2 {
  border-color: rgba(255, 64, 96, 0.38);
  box-shadow:
    0 0 0 1px rgba(255, 64, 96, 0.10) inset,
    0 0 26px rgba(255, 64, 96, 0.18),
    0 0 60px rgba(255, 64, 96, 0.12),
    0 20px 70px rgba(0, 0, 0, 0.55);
}

.turnFrame.end {
  border-color: rgba(255, 255, 255, 0.22);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 0 26px rgba(255, 255, 255, 0.12),
    0 0 60px rgba(0, 229, 255, 0.08),
    0 0 60px rgba(255, 43, 214, 0.06),
    0 20px 70px rgba(0, 0, 0, 0.55);
}

.bg {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.bgGradient {
  position: absolute;
  inset: -40%;
  background: conic-gradient(
    from 180deg,
    rgba(255, 0, 128, 0.28),
    rgba(0, 255, 255, 0.24),
    rgba(140, 0, 255, 0.26),
    rgba(0, 255, 128, 0.22),
    rgba(255, 0, 128, 0.28)
  );
  filter: blur(60px);
  animation: spin 14s linear infinite;
  opacity: 0.9;
}

.bgGlow {
  position: absolute;
  width: 520px;
  height: 520px;
  border-radius: 999px;
  filter: blur(70px);
  opacity: 0.35;
  animation: floaty 9s ease-in-out infinite;
}
.bgGlow.g1 { left: -120px; top: 15%; background: rgba(255, 0, 180, 0.55); }
.bgGlow.g2 { right: -140px; top: 5%; background: rgba(0, 255, 255, 0.5); animation-delay: 1.4s; }
.bgGlow.g3 { left: 35%; bottom: -180px; background: rgba(130, 0, 255, 0.5); animation-delay: 2.2s; }

.bgNoise {
  position: absolute;
  inset: 0;
  opacity: 0.07;
  background-image:
    radial-gradient(circle at 20% 30%, rgba(255,255,255,0.35) 0 1px, transparent 1px),
    radial-gradient(circle at 70% 60%, rgba(255,255,255,0.25) 0 1px, transparent 1px),
    radial-gradient(circle at 40% 80%, rgba(255,255,255,0.2) 0 1px, transparent 1px);
  background-size: 180px 180px, 220px 220px, 260px 260px;
}

@keyframes spin { to { transform: rotate(360deg); } }
@keyframes floaty {
  0%, 100% { transform: translateY(0px) translateX(0px) scale(1); }
  50% { transform: translateY(-18px) translateX(10px) scale(1.05); }
}

.topbar {
  position: relative;
  z-index: 2;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 18px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(10, 10, 16, 0.55);
  backdrop-filter: blur(10px);
}

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  cursor: pointer;
  user-select: none;
}
.logoMark {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08) inset,
    0 0 18px rgba(0, 255, 255, 0.10),
    0 0 18px rgba(255, 0, 180, 0.08);
}
.brandText .title {
  font-weight: 1000;
  letter-spacing: 0.8px;
  font-size: 18px;
}
.brandText .sub {
  opacity: 0.75;
  font-size: 12px;
  margin-top: 2px;
}

.right { display: flex; gap: 10px; flex-wrap: wrap; }

.main {
  position: relative;
  z-index: 1;
  flex: 1;
  padding: 28px 18px 36px;
  display: grid;
  place-items: center;
}

.rgbText {
  background: linear-gradient(90deg, #ff2bd6, #00e5ff, #7c4dff, #00ff9a);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 0 18px rgba(0, 229, 255, 0.18);
}

/* =========================
   MENU SHELL
========================= */
.menuShell { width: min(720px, 94vw); display: grid; gap: 14px; }

.hero { padding: 18px 18px 6px; }
.hero.compact { padding-bottom: 0; }
.heroBadge {
  display: inline-flex;
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 1px;
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.25);
  box-shadow: 0 0 22px rgba(255, 0, 180, 0.08);
}
.heroBadge.green { box-shadow: 0 0 22px rgba(0, 255, 154, 0.10); }
.heroTitle { margin: 10px 0 6px; font-size: 46px; font-weight: 1000; letter-spacing: 0.5px; }
.heroTitle.small { font-size: 30px; }
.heroDesc { margin: 0; opacity: 0.82; line-height: 1.45; }
.heroDesc.small { font-size: 13px; opacity: 0.8; }

.menuCard {
  border-radius: 18px;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(8, 8, 14, 0.62);
  backdrop-filter: blur(12px);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 12px 40px rgba(0, 0, 0, 0.45);
}

.menuTitleRow {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  margin-bottom: 12px;
}
.menuTitle {
  font-size: 14px;
  font-weight: 1000;
  letter-spacing: 0.8px;
  text-transform: uppercase;
  opacity: 0.95;
}
.menuHint { font-size: 12px; opacity: 0.7; }

.menuStack { display: grid; gap: 10px; }

.menuBtn {
  width: 100%;
  border-radius: 16px;
  padding: 14px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  color: #eaeaea;
  cursor: pointer;
  text-align: left;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  transition: transform 0.12s ease, background 0.12s ease, border-color 0.12s ease;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.05) inset,
    0 0 22px rgba(0, 229, 255, 0.06);
}
.menuBtn:hover {
  transform: translateY(-1px);
  border-color: rgba(255, 255, 255, 0.22);
  background: rgba(255, 255, 255, 0.09);
}
.menuBtn.primary {
  border-color: rgba(0, 229, 255, 0.30);
  background: linear-gradient(180deg, rgba(0, 229, 255, 0.16), rgba(255, 43, 214, 0.10));
  box-shadow:
    0 0 0 1px rgba(0, 229, 255, 0.08) inset,
    0 0 26px rgba(0, 229, 255, 0.10),
    0 0 26px rgba(255, 43, 214, 0.08);
}
.menuBtn.disabled,
.menuBtn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  transform: none !important;
}

.menuBtnLeft { display: flex; align-items: center; gap: 12px; min-width: 0; }
.menuBtnIcon {
  width: 42px;
  height: 42px;
  border-radius: 14px;
  display: grid;
  place-items: center;
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.10);
  flex: 0 0 auto;
  box-shadow: 0 0 18px rgba(124, 77, 255, 0.08);
}
.menuBtnText { min-width: 0; }
.menuBtnTop { font-weight: 1000; letter-spacing: 0.2px; }
.menuBtnSub {
  margin-top: 4px;
  font-size: 12px;
  opacity: 0.75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 520px;
}
.menuBtnRight { font-weight: 1000; opacity: 0.88; letter-spacing: 0.6px; flex: 0 0 auto; }

.menuSplitRow { display: flex; gap: 10px; margin-top: 4px; }
@media (max-width: 520px) { .menuSplitRow { flex-direction: column; } }

.finePrint {
  margin-top: 12px;
  font-size: 12px;
  opacity: 0.72;
  border-top: 1px solid rgba(255, 255, 255, 0.10);
  padding-top: 10px;
}

/* =========================
   Shared buttons / forms
========================= */
.btn {
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.06);
  color: #eaeaea;
  padding: 9px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 900;
  letter-spacing: 0.2px;
}
.btn:hover { background: rgba(255, 255, 255, 0.10); }
.btn.primary { border-color: rgba(0, 229, 255, 0.28); background: rgba(0, 229, 255, 0.12); }
.btn.ghost { background: transparent; }
.btn.soft { width: 100%; text-align: left; background: rgba(0, 0, 0, 0.18); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.form { margin-top: 6px; display: grid; gap: 10px; }
.field {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 14px;
  padding: 12px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(0, 0, 0, 0.22);
}
.input,
.select {
  width: 240px;
  max-width: 58vw;
  padding: 9px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(0, 0, 0, 0.28);
  color: #eaeaea;
}
.row { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }

.muted { opacity: 0.78; }

/* =========================
   GAME LAYOUT
========================= */
.gameLayout {
  width: min(1200px, 96vw);
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) { .gameLayout { grid-template-columns: 1fr; } }

.leftPanel, .rightPanel { display: flex; flex-direction: column; gap: 12px; }

.panelHead {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.10);
  background: rgba(10, 10, 16, 0.58);
  backdrop-filter: blur(10px);
}

.modeRow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}
.modeTag { font-size: 13px; opacity: 0.92; }

.turnBadge {
  padding: 7px 10px;
  border-radius: 999px;
  font-weight: 1000;
  font-size: 12px;
  letter-spacing: 0.8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(0, 0, 0, 0.20);
  opacity: 0.95;
}
.turnBadge.p1 {
  border-color: rgba(0, 229, 255, 0.30);
  box-shadow: 0 0 18px rgba(0, 229, 255, 0.14);
}
.turnBadge.p2 {
  border-color: rgba(255, 64, 96, 0.32);
  box-shadow: 0 0 18px rgba(255, 64, 96, 0.14);
}
.turnBadge.end {
  border-color: rgba(255, 255, 255, 0.18);
  box-shadow: 0 0 18px rgba(255, 255, 255, 0.10);
}

.statusTag, .keysTag { font-size: 13px; opacity: 0.92; }


.statusTag {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.dotSep {
  opacity: 0.5;
  margin: 0 2px;
}
.chipBtn{
  border: 1px solid rgba(255,255,255,0.16);
  background: rgba(0,0,0,0.22);
  color: rgba(255,255,255,0.9);
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 900;
  letter-spacing: 0.02em;
  cursor: pointer;
  transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease;
}
.chipBtn:hover{
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow: 0 10px 22px rgba(0,0,0,0.35), 0 0 18px rgba(0,255,255,0.12);
}

.timerBar{
  position: relative;
  height: 14px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(0,0,0,0.28);
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255,255,255,0.10), 0 12px 26px rgba(0,0,0,0.30);
  margin-top: 8px;
}
.timerBarFill{
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  background: linear-gradient(90deg, rgba(0,255,255,0.70), rgba(255,0,255,0.65), rgba(255,255,0,0.55));
  filter: saturate(1.15);
  box-shadow: 0 0 18px rgba(0,255,255,0.18), 0 0 18px rgba(255,0,255,0.14);
}
.timerBar.danger .timerBarFill{
  background: linear-gradient(90deg, rgba(255,80,120,0.82), rgba(255,200,80,0.64));
  box-shadow: 0 0 18px rgba(255,80,120,0.20);
}
.timerBarText{
  position: relative;
  z-index: 2;
  font-size: 11px;
  line-height: 14px;
  font-weight: 1000;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: center;
  opacity: 0.92;
  text-shadow: 0 2px 10px rgba(0,0,0,0.65);
}

.logoMark{
  width: auto !important;
  height: auto !important;
  background: transparent !important;
  border: none !important;
  box-shadow: none !important;
  padding: 0 !important;
}
.logoImg{
  width: 38px;
  height: 38px;
  object-fit: contain;
  filter: drop-shadow(0 10px 22px rgba(0,0,0,0.55)) drop-shadow(0 0 14px rgba(0,255,255,0.16));
  animation: floatLogo 3.4s ease-in-out infinite;
}
@keyframes floatLogo{
  0%,100%{ transform: translateY(0) rotate(-1deg); }
  50%{ transform: translateY(-2px) rotate(1deg); }
}

/* Modal: make it feel more "game over" */
.modalCard{
  border-radius: 18px !important;
  background:
    radial-gradient(900px 360px at 50% 20%, rgba(0,255,255,0.10), rgba(0,0,0,0) 55%),
    radial-gradient(900px 420px at 40% 85%, rgba(255,0,255,0.10), rgba(0,0,0,0) 58%),
    linear-gradient(180deg, rgba(12,14,24,0.96), rgba(6,7,12,0.98)) !important;
  border: 1px solid rgba(255,255,255,0.14) !important;
  box-shadow:
    0 26px 70px rgba(0,0,0,0.72),
    0 0 42px rgba(0,255,255,0.14),
    0 0 42px rgba(255,0,255,0.12);
}
.modalTitle{
  font-weight: 1100 !important;
  letter-spacing: 0.04em;
}
.modalMsg{
  font-size: 14px !important;
  line-height: 1.35 !important;
}
.panel {
  background: rgba(10, 10, 16, 0.58);
  border: 1px solid rgba(255, 255, 255, 0.10);
  border-radius: 14px;
  padding: 14px;
  backdrop-filter: blur(10px);
}
.panelTitle { margin: 0 0 10px 0; font-size: 15px; font-weight: 1000; }
.divider { height: 1px; background: rgba(255, 255, 255, 0.10); margin: 12px 0; }
.hintSmall { opacity: 0.75; font-size: 13px; padding: 6px 2px; }

/* =========================
   MODAL
========================= */
.modalOverlay {
  position: fixed;
  inset: 0;
  z-index: 60;
  background: rgba(0, 0, 0, 0.62);
  backdrop-filter: blur(10px);
  display: grid;
  place-items: center;
  padding: 18px;
}

.modalCard {
  width: min(520px, 92vw);
  border-radius: 18px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 10, 16, 0.78);
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.06) inset,
    0 20px 80px rgba(0, 0, 0, 0.65);
  overflow: hidden;
}

.modalTop {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 14px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
}

.modalTitle {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 1000;
  letter-spacing: 0.3px;
}
.modalDot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.35);
  box-shadow: 0 0 18px rgba(255, 255, 255, 0.12);
}
.modalDot.info { background: rgba(0, 229, 255, 0.75); box-shadow: 0 0 18px rgba(0, 229, 255, 0.18); }
.modalDot.bad { background: rgba(255, 64, 96, 0.85); box-shadow: 0 0 18px rgba(255, 64, 96, 0.18); }
.modalDot.good { background: rgba(0, 255, 154, 0.85); box-shadow: 0 0 18px rgba(0, 255, 154, 0.18); }

.modalX {
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  color: #eaeaea;
  width: 34px;
  height: 34px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 900;
}
.modalX:hover { background: rgba(255, 255, 255, 0.10); }

.modalBody { padding: 14px; }
.modalMsg { margin: 0 0 10px 0; opacity: 0.88; line-height: 1.5; }
.modalMsg:last-child { margin-bottom: 0; }

.modalActions {
  padding: 14px;
  padding-top: 0;
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  flex-wrap: wrap;
}

.logoImg{
  width: 26px;
  height: 26px;
  object-fit: contain;
  image-rendering: auto;
  border-radius: 6px;
}
.linkBtn{
  background: transparent;
  border: 0;
  padding: 0;
  cursor: pointer;
  color: inherit;
  text-decoration: underline;
  opacity: .85;
  font-weight: 700;
}
.linkBtn:hover{ opacity: 1; }
.finePrint .sep{ margin: 0 6px; opacity:.5; }

</style>