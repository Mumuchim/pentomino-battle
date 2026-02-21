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
        <div class="logoMark">⬛</div>
        <div class="brandText">
          <div class="title">PentoBattle</div>
          <div class="sub">Rotate • Flip • Dominate</div>
        </div>
      </div>

      <div class="right">
        <button class="btn ghost" v-if="canGoBack" @click="goBack">← Back</button>
        <button class="btn ghost" v-if="screen !== 'auth'" @click="goAuth">Main Menu</button>
        <button class="btn" v-if="isInGame" @click="hardResetMatch">Reset Match</button>
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
              <div class="modeTag">Mode: <b>{{ modeLabel }}</b></div>

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
              <span v-if="game.phase === 'draft'">
                · Draft pick:
                <b>P{{ game.draftTurn }}</b>
                <span v-if="isOnline && myPlayer"> · You are <b>P{{ myPlayer }}</b></span>
                <span v-if="isOnline && myPlayer && !canAct"> · <b style="opacity:.85;">WAIT</b></span>
              </span>
              <span v-else-if="game.phase === 'place'">
                · Turn:
                <b>P{{ game.currentPlayer }}</b>
                <span v-if="isOnline && myPlayer"> · You are <b>P{{ myPlayer }}</b></span>
                <span v-if="isOnline && myPlayer && !canAct"> · <b style="opacity:.85;">WAIT</b></span>
              </span>
            </div>

            <div class="keysTag" v-if="game.phase === 'place'">
              Keys: <b>Q</b> Rotate · <b>E</b> Flip
            </div>

            <div v-if="isOnline && online.code" class="keysTag" style="opacity:.82;">
              Lobby: <b>{{ online.code }}</b>
            </div>
          </div>

          <DraftPanel v-if="game.phase === 'draft'" />

          <section v-else class="panel">
            <h2 class="panelTitle">Player {{ game.currentPlayer }} Pieces</h2>

            <PiecePicker
              :isOnline="isOnline"
              :myPlayer="myPlayer"
              :canAct="canAct"
            />

            <div class="divider"></div>

            <Controls
              :isOnline="isOnline"
              :canAct="canAct"
            />
          </section>
        </section>

        <section class="rightPanel">
          <Board
            :isOnline="isOnline"
            :myPlayer="myPlayer"
            :canAct="canAct"
          />
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

const quick = reactive({
  lobbyName: "",
  isPrivate: false,
  joinCode: "",
});

const rankedTier = computed(() => (loggedIn.value ? "Wood" : "—"));

const isInGame = computed(() =>
  screen.value === "couch" || screen.value === "ai" || screen.value === "online"
);

const modeLabel = computed(() =>
  screen.value === "ai"
    ? "Practice vs AI"
    : screen.value === "couch"
    ? "Couch Play"
    : screen.value === "online"
    ? "Quick Match (Online)"
    : "—"
);

const canGoBack = computed(() =>
  ["mode", "quick", "quick_find", "quick_make", "settings", "credits", "ranked"].includes(
    screen.value
  )
);

// ✅ Online match
const isOnline = computed(() => screen.value === "online");
const myPlayer = ref(null); // 1 | 2 | null

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

const modalLines = computed(() =>
  String(modal.message || "")
    .split("\n")
    .filter(Boolean)
);

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
  hardResetMatch();
}

/* =========================
   ✅ Hijack alert() so Board's illegal placement alert becomes a nice modal
========================= */
let originalAlert = null;

onMounted(() => {
  originalAlert = window.alert;
  window.alert = (msg) => {
    showModal({
      title: "Illegal Placement",
      message: String(msg || "That placement is not allowed."),
      tone: "bad",
    });
  };
});

onBeforeUnmount(() => {
  if (originalAlert) window.alert = originalAlert;
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
        message: `Player ${w} wins.\nGG!`,
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
  role: null, // "host" | "guest"
  polling: false,
  pollTimer: null,

  // sync state
  version: 0,
  applyGuard: false, // prevent echo loop
  pushTimer: null,
  lastSig: "",
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
  if (online.pollTimer) clearInterval(online.pollTimer);
  online.pollTimer = null;
  if (online.pushTimer) clearTimeout(online.pushTimer);
  online.pushTimer = null;
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

/* =========================
   ✅ ONLINE GAME STATE SYNC
   - Host initializes random P1/P2 mapping once both connected
   - Both clients poll lobby.version/state and apply newest
   - Local changes auto push (only if canAct + online)
========================= */
function deepClone(obj) {
  if (typeof structuredClone === "function") return structuredClone(obj);
  return JSON.parse(JSON.stringify(obj));
}

function snapshotGameState(lobby) {
  // Keep ONLY authoritative gameplay state here (no local UI selections)
  return {
    _schema: 1,
    meta: {
      code: lobby?.code || online.code || null,
      players: lobby?.state?.meta?.players || null, // { p1: "host"|"guest", p2: "host"|"guest" }
      createdAt: lobby?.state?.meta?.createdAt || new Date().toISOString(),
    },
    game: {
      boardW: game.boardW,
      boardH: game.boardH,
      allowFlip: game.allowFlip,

      phase: game.phase,
      draftTurn: game.draftTurn,
      currentPlayer: game.currentPlayer,
      winner: game.winner ?? null,

      board: deepClone(game.board),
      draftBoard: deepClone(game.draftBoard),
      remaining: deepClone(game.remaining),
    },
  };
}

function applySnapshotToGame(state) {
  if (!state?.game) return;

  online.applyGuard = true;
  try {
    // fixed board for your game
    game.boardW = state.game.boardW ?? 10;
    game.boardH = state.game.boardH ?? 6;
    game.allowFlip = !!state.game.allowFlip;

    // authoritative progression
    game.phase = state.game.phase || game.phase;
    game.draftTurn = state.game.draftTurn ?? game.draftTurn;
    game.currentPlayer = state.game.currentPlayer ?? game.currentPlayer;
    game.winner = state.game.winner ?? null;

    if (state.game.board) game.board = deepClone(state.game.board);
    if (state.game.draftBoard) game.draftBoard = deepClone(state.game.draftBoard);
    if (state.game.remaining) game.remaining = deepClone(state.game.remaining);

    // IMPORTANT: do NOT force-select pieces for the other user
    // let each client keep its own selectedPieceKey/rotation/flipped
  } finally {
    // tiny delay prevents immediate echo when watchers run same tick
    setTimeout(() => {
      online.applyGuard = false;
    }, 0);
  }
}

function computeMyPlayerFromPlayersMap(playersMap) {
  if (!playersMap) return null;
  const mine = online.role; // "host"|"guest"
  if (!mine) return null;
  if (playersMap.p1 === mine) return 1;
  if (playersMap.p2 === mine) return 2;
  return null;
}

function randomBool() {
  const a = new Uint8Array(1);
  crypto.getRandomValues(a);
  return (a[0] % 2) === 0;
}

async function sbPatchLobbyState(nextState) {
  // optimistic concurrency: patch only if version matches
  const lobbyId = online.lobbyId;
  const currentVersion = online.version || 1;

  const res = await fetch(
    sbRestUrl(`pb_lobbies?id=eq.${encodeURIComponent(lobbyId)}&version=eq.${encodeURIComponent(currentVersion)}`),
    {
      method: "PATCH",
      headers: { ...sbHeaders(), Prefer: "return=representation" },
      body: JSON.stringify({
        state: nextState,
        version: currentVersion + 1,
        updated_at: new Date().toISOString(),
      }),
    }
  );

  // If mismatch (0 rows updated), Supabase returns 200 with [] sometimes, or 204
  const ok = res.ok;
  const rows = ok ? await res.json().catch(() => []) : [];
  if (!ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`State push failed (${res.status})\n${txt}`);
  }
  if (!Array.isArray(rows) || rows.length === 0) {
    // version mismatch; caller should refetch
    return null;
  }
  return rows[0];
}

function gameSigForSync() {
  // Small + stable signature for detecting changes
  const payload = {
    phase: game.phase,
    draftTurn: game.draftTurn,
    currentPlayer: game.currentPlayer,
    winner: game.winner ?? null,
    allowFlip: game.allowFlip,
    board: game.board,
    draftBoard: game.draftBoard,
    remaining: game.remaining,
  };
  return JSON.stringify(payload);
}

function schedulePush(reason = "") {
  if (!isOnline.value) return;
  if (online.applyGuard) return; // remote apply => no echo
  if (!online.lobbyId) return;
  if (!canAct.value) return; // only push when it's your legit turn

  // debounce
  if (online.pushTimer) clearTimeout(online.pushTimer);
  online.pushTimer = setTimeout(async () => {
    try {
      const lobby = await sbSelectLobbyById(online.lobbyId);
      if (!lobby) return;

      online.version = lobby.version || online.version || 1;
      online.code = lobby.code || online.code;

      const sig = gameSigForSync();
      if (sig === online.lastSig) return;

      const nextState = snapshotGameState(lobby);
      const patched = await sbPatchLobbyState(nextState);

      if (!patched) {
        // version mismatch; refetch and let polling reapply
        return;
      }

      online.version = patched.version || online.version;
      online.lastSig = sig;
      // console.log("pushed:", reason, online.version);
    } catch {
      // silent; polling will recover
    }
  }, 120);
}

watch(
  () => [
    isOnline.value,
    canAct.value,
    game.phase,
    game.draftTurn,
    game.currentPlayer,
    game.winner,
    game.allowFlip,
    game.board,
    game.draftBoard,
    game.remaining,
  ],
  () => {
    // If user changed authoritative stuff locally (draftPick/placeAt), push it.
    // NOTE: schedulePush only runs when canAct + online.
    schedulePush("state-change");
  },
  { deep: true }
);

function startPollingLobby(lobbyId, role) {
  stopPolling();
  online.polling = true;
  online.lobbyId = lobbyId;
  online.role = role;

  online.pollTimer = setInterval(async () => {
    try {
      const lobby = await sbSelectLobbyById(lobbyId);
      if (!lobby) {
        stopPolling();
        showModal({
          title: "Lobby Closed",
          message: "The lobby no longer exists.",
          tone: "bad",
        });
        return;
      }

      online.code = lobby.code || online.code;
      online.version = lobby.version || online.version || 1;

      const hasHost = !!lobby.host_id;
      const hasGuest = !!lobby.guest_id;

      // Wait until both connected
      if (!(hasHost && hasGuest)) return;

      // Host initializes the match state + random role assignment once
      const hasPlayersMap = !!lobby.state?.meta?.players?.p1 && !!lobby.state?.meta?.players?.p2;
      if (role === "host" && !hasPlayersMap) {
        // initialize local game then push initial snapshot
        game.boardW = 10;
        game.boardH = 6;
        game.allowFlip = allowFlip.value;
        game.resetGame();

        const players = randomBool()
          ? { p1: "host", p2: "guest" }
          : { p1: "guest", p2: "host" };

        const initState = snapshotGameState(lobby);
        initState.meta.players = players;

        // push with concurrency; if mismatch, polling will retry later
        const patched = await sbPatchLobbyState(initState);
        if (patched) {
          online.version = patched.version || online.version;
          // set myPlayer immediately for host
          myPlayer.value = computeMyPlayerFromPlayersMap(players);
          screen.value = "online";
          showModal({
            title: "Match Found!",
            message: `Connected.\nYou are Player ${myPlayer.value}.\nLobby: ${online.code || "—"}`,
            tone: "good",
          });
        }
        return;
      }

      // Guest: wait until host wrote players map
      const playersMap = lobby.state?.meta?.players;
      if (!playersMap?.p1 || !playersMap?.p2) return;

      // enter online mode + apply newest state
      if (screen.value !== "online") {
        screen.value = "online";
        myPlayer.value = computeMyPlayerFromPlayersMap(playersMap);

        showModal({
          title: "Match Found!",
          message: `Connected.\nYou are Player ${myPlayer.value}.\nLobby: ${online.code || "—"}`,
          tone: "good",
        });
      }

      // Apply state only when version is newer
      const incomingVersion = lobby.version || 0;
      const localVersion = online.version || 0;

      // If lobby version changed (or we have no sig yet), apply
      if (incomingVersion && incomingVersion >= localVersion) {
        // apply only if different signature to avoid reassign spam
        const incomingSig = JSON.stringify(lobby.state?.game || {});
        const localSig = online.lastSig;

        // Note: localSig is about our local authoritative state; if not set, apply anyway
        if (!localSig || incomingSig) {
          applySnapshotToGame(lobby.state);
          online.version = incomingVersion;
          online.lastSig = gameSigForSync();
        }
      }
    } catch {
      // keep polling quietly
    }
  }, 650);
}

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
    showModal({ title: "Joined!", tone: "good", message: `Waiting for host...\nLobby: ${joined?.code || lobby?.code || "—"}` });
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

    showModal({ title: "Joined!", tone: "good", message: `Waiting for host...\nLobby: ${joined?.code || code}` });
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

    online.code = created.code || null;

    if (created.code) {
      try {
        await navigator.clipboard.writeText(created.code);
      } catch {}
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
  stopPolling();
  online.lobbyId = null;
  online.code = null;
  online.role = null;
  online.version = 0;
  online.lastSig = "";
  myPlayer.value = null;
  screen.value = "auth";
}
function goMode() {
  stopPolling();
  online.lobbyId = null;
  online.code = null;
  online.role = null;
  online.version = 0;
  online.lastSig = "";
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

function hardResetMatch() {
  // Local reset always works; online will auto-push ONLY when it's your turn
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();
  schedulePush("manual-reset");
}

onBeforeUnmount(() => stopPolling());
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
</style>