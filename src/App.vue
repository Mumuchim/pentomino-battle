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
        <div class="logoMark">
          <img :src="logoUrl" alt="Logo" class="logoImg floatingLogo" />
        </div>
        <div class="brandText">
          <div class="title">PentoBattle</div>
          <div class="sub">Rotate • Flip • Dominate</div>
        </div>
      </div>

      <div class="right">
        <button class="btn ghost" v-if="canGoBack" @click="goBack">← Back</button>
        <button class="btn ghost" v-if="screen !== 'auth'" @click="goAuth">Main Menu</button>
        <button class="btn" v-if="isInGame" @click="onPrimaryMatchAction">
          {{ primaryMatchActionLabel }}
        </button>
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
            <span class="sep">·</span>
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

            <button class="menuBtn primary" @click="goQuick">
              <div class="menuBtnLeft">
                <div class="menuBtnIcon">⚡</div>
                <div class="menuBtnText">
                  <div class="menuBtnTop">Quick Match</div>
                  <div class="menuBtnSub">Browse public lobbies or join by code</div>
                </div>
              </div>
              <div class="menuBtnRight">PLAY</div>
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
              <div class="modeTag">
                Mode: <b>{{ modeLabel }}</b>
                <span v-if="isOnline && myPlayer"> · You: <b>P{{ myPlayer }}</b></span>
              </div>

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
              <span v-if="online.code"> · <b>Code:</b> {{ online.code }}</span>
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
          <Board :isOnline="isOnline" :myPlayer="myPlayer" :canAct="canAct" />
          <div class="hintSmall">
            Drag a piece to the board and hover to preview. Click or drop to place.
          </div>
        </section>
      </section>
    </main>

    <!-- ✅ Modal -->
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
          <button
            v-for="(a, i) in modal.actions"
            :key="i"
            class="btn"
            :class="{ primary: a.tone === 'primary', soft: a.tone === 'soft', ghost: a.tone === 'ghost' }"
            @click="onModalAction(a)"
          >
            {{ a.label }}
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

/* =========================
   ✅ MODAL SYSTEM
========================= */
const modal = reactive({
  open: false,
  title: "Notice",
  message: "",
  tone: "info", // "info" | "bad" | "good"
  actions: [],
});

const modalLines = computed(() => String(modal.message || "").split("\n").filter(Boolean));
const modalDotClass = computed(() => (modal.tone === "bad" ? "bad" : modal.tone === "good" ? "good" : "info"));

function showModal({ title = "Notice", message = "", tone = "info", actions = null } = {}) {
  modal.title = title;
  modal.message = message;
  modal.tone = tone;
  modal.actions = Array.isArray(actions) && actions.length ? actions : [{ label: "OK", tone: "primary" }];
  modal.open = true;
}

function closeModal() {
  modal.open = false;
  modal.actions = [];
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

      await sbForcePatchState(online.lobbyId, {
        status: "closed",
        state: nextState,
        version: nextVersion,
        updated_at: new Date().toISOString(),
      });
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

function buildSyncedState(meta = {}) {
  return {
    meta,
    game: {
      phase: game.phase,
      boardW: game.boardW,
      boardH: game.boardH,
      allowFlip: game.allowFlip,

      board: game.board,
      draftBoard: game.draftBoard,

      draftTurn: game.draftTurn,
      currentPlayer: game.currentPlayer,

      pool: game.pool,
      picks: game.picks,
      remaining: game.remaining,
      placedCount: game.placedCount,

      turnStartedAt: game.turnStartedAt,
      matchInvalid: game.matchInvalid,
      matchInvalidReason: game.matchInvalidReason,
      turnLimitDraftSec: game.turnLimitDraftSec,
      turnLimitPlaceSec: game.turnLimitPlaceSec,

      winner: game.winner,

      rematch: game.rematch,
      rematchDeclinedBy: game.rematchDeclinedBy,

      battleClockSec: game.battleClockSec,
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
  const nonTurnAllowed = reason === "surrender" || String(reason || "").startsWith("rematch_") || reason === "rematch_request";
  if (online.waitingForOpponent && !nonTurnAllowed) return;
  if (reason === "watch" && !canAct.value) return;
  if (!canAct.value && !nonTurnAllowed) return;

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
  myPlayer.value = null;

  screen.value = "online";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

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

      if (online.role === "host" && !prevGuest && lobby.guest_id) {
        if (modal.open && String(modal.title || "").toLowerCase().includes("lobby ready")) closeModal();
        showModal({
          title: "Player Joined!",
          tone: "good",
          message: `A challenger joined your lobby.\nCode: ${lobby.code || "—"}`,
        });
      }

      if (online.role === "host" && prevGuest && !lobby.guest_id && lobby.host_id) {
        myPlayer.value = null;
        game.turnStartedAt = null;
        game.battleClockLastTickAt = null;
        online.waitingForOpponent = true;
        showModal({
          title: "Opponent Left",
          tone: "bad",
          message: "Your opponent left.\nThis lobby will stay open and wait for a new challenger.",
        });
      }

      online.waitingForOpponent = !(lobby.host_id && lobby.guest_id && lobby?.state?.meta?.players);

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
  if (!me) return `Player ${w} wins.\nGG!`;
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

function requestPlayAgain() {
  if (!isOnline.value) {
    onResetClick();
    return;
  }
  if (!myPlayer.value) return;

  if (game.rematchDeclinedBy) {
    stopAndExitToMenu("Rematch declined.");
    return;
  }

  game.requestRematch(myPlayer.value);
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
        showModal({
          title: "Play Again?",
          tone: "good",
          message: "Opponent wants a rematch.\nDo you accept?",
          actions: [
            {
              label: "YES",
              tone: "primary",
              onClick: () => {
                game.requestRematch(me);
                online.localDirty = true;
                pushMyState("rematch_yes");
              },
            },
            {
              label: "NO",
              tone: "soft",
              onClick: () => {
                game.declineRematch(me);
                online.localDirty = true;
                pushMyState("rematch_no");
              },
            },
          ],
        });
        return;
      }
    }

    const w = game.winner ?? "?";
    const isBad = game.lastMove?.type === "timeout" || game.lastMove?.type === "surrender";
    showModal({
      title: "Match Over",
      message: winnerMessage(w),
      tone: isBad ? "bad" : "good",
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
    await sbJoinLobby(lobby.id);
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

    if (lobby.guest_id) {
      closeModal();
      showModal({ title: "Lobby Full", tone: "bad", message: "That lobby already has a guest." });
      return;
    }

    await sbJoinLobby(lobby.id);
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
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  background: transparent;
  border: none;
  box-shadow: none;
}

.floatingLogo{
  width: 40px;
  height: 40px;
  object-fit: contain;
  filter: drop-shadow(0 8px 18px rgba(0,0,0,0.55)) drop-shadow(0 0 18px rgba(0,229,255,0.18)) drop-shadow(0 0 18px rgba(255,43,214,0.14));
  transform: translateY(-1px);
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

/* Minimal helpers so it doesn't look unstyled if your old CSS was longer */
.main{ position: relative; z-index: 1; padding: 18px; }
.btn{ padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color: #eaeaea; font-weight: 800; cursor: pointer; }
.btn.primary{ background: rgba(0,229,255,.14); border-color: rgba(0,229,255,.25); }
.btn.soft{ background: rgba(255,255,255,.05); }
.btn.ghost{ background: transparent; }
.menuShell{ max-width: 860px; margin: 0 auto; display: grid; gap: 14px; }
.menuCard{ padding: 16px; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(10,10,16,.55); backdrop-filter: blur(10px); }
.menuStack{ display: grid; gap: 10px; }
.menuBtn{ width: 100%; display:flex; justify-content:space-between; align-items:center; padding: 12px 14px; border-radius: 16px; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); color:#eaeaea; cursor:pointer; font-weight:900; }
.menuBtn.primary{ background: rgba(0,229,255,.12); border-color: rgba(0,229,255,.20); }
.menuBtn.disabled{ opacity:.45; cursor:not-allowed; }
.menuBtnLeft{ display:flex; gap: 12px; align-items:center; min-width:0; }
.menuBtnIcon{ width: 38px; height: 38px; display:grid; place-items:center; border-radius: 12px; background: rgba(255,255,255,.06); }
.menuBtnTop{ font-size: 14px; }
.menuBtnSub{ font-size: 12px; opacity: .75; font-weight: 700; }
.menuTitleRow{ display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px; }
.menuTitle{ font-size: 14px; font-weight: 900; }
.menuHint{ font-size: 12px; opacity:.7; font-weight: 700; }
.heroTitle{ margin: 0; }
.heroDesc{ opacity:.8; }
.rgbText{ background: linear-gradient(90deg, rgba(0,229,255,1), rgba(255,43,214,1)); -webkit-background-clip:text; background-clip:text; color: transparent; }
.divider{ height: 1px; background: rgba(255,255,255,.10); margin: 12px 0; }
.field{ display:flex; gap: 12px; align-items:center; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.04); }
.form{ display:grid; gap: 10px; }
.input{ width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#eaeaea; }
.row{ display:flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.modalOverlay{ position: fixed; inset: 0; z-index: 50; background: rgba(0,0,0,.55); display:grid; place-items:center; padding: 18px; }
.modalCard{ width: min(560px, 100%); border-radius: 18px; border: 1px solid rgba(255,255,255,.12); background: rgba(10,10,16,.80); backdrop-filter: blur(12px); padding: 14px; }
.modalTop{ display:flex; justify-content:space-between; align-items:center; gap: 10px; }
.modalTitle{ display:flex; align-items:center; gap: 10px; font-weight: 900; }
.modalDot{ width: 10px; height: 10px; border-radius: 999px; background: rgba(0,229,255,.9); }
.modalDot.bad{ background: rgba(255,64,96,.95); }
.modalDot.good{ background: rgba(0,255,128,.95); }
.modalX{ background: transparent; border: 0; color:#eaeaea; font-size: 18px; cursor:pointer; }
.modalBody{ margin-top: 10px; }
.modalMsg{ margin: 0 0 8px 0; opacity: .9; }
.modalActions{ display:flex; gap: 10px; justify-content:flex-end; margin-top: 12px; flex-wrap: wrap; }

/* You already have these elsewhere in your CSS normally */
.gameLayout{ display:grid; grid-template-columns: 420px 1fr; gap: 14px; }
.leftPanel,.rightPanel{ min-width:0; }
.panelHead{ padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(10,10,16,.55); backdrop-filter: blur(10px); }
.panel{ margin-top: 12px; padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(10,10,16,.55); backdrop-filter: blur(10px); }
.panelTitle{ margin: 0 0 10px 0; }
.hintSmall{ margin-top: 10px; opacity:.75; font-size: 12px; }
.turnBadge{ padding: 8px 10px; border-radius: 999px; font-weight: 900; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); }
.turnBadge.p1{ border-color: rgba(0,229,255,.25); background: rgba(0,229,255,.10); }
.turnBadge.p2{ border-color: rgba(255,64,96,.25); background: rgba(255,64,96,.10); }
.turnBadge.end{ border-color: rgba(255,255,255,.18); }
.modeRow{ display:flex; justify-content:space-between; align-items:center; gap: 10px; flex-wrap: wrap; }
.statusTag,.keysTag{ margin-top: 10px; font-size: 12px; opacity: .85; font-weight: 700; }
</style>