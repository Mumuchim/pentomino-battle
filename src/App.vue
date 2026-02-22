<template>
  <div ref="appRoot" class="app" :class="{ inGame: isInGame, hasBottomBar: showBottomBar }">
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

    <!-- ✅ Full-screen interaction lock + loading (prevents "loaded but not visible" desync clicks) -->
    <div v-if="uiLock.active" class="loadOverlay" aria-live="polite" aria-busy="true">
      <div class="loadCard">
        <div class="loadTop">
          <img :src="logoUrl" class="loadLogo" alt="" />
          <div class="loadText">
            <div class="loadTitle">PentoBattle</div>
            <div class="loadSub">{{ uiLock.label }}</div>
          </div>
        </div>

        <div
          class="loadBar"
          role="progressbar"
          :aria-valuenow="Math.round(uiLock.progress * 100)"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="loadBarFill" :style="{ width: Math.round(uiLock.progress * 100) + '%' }"></div>
        </div>

        <div class="loadHint">{{ uiLock.hint }}</div>
      </div>
    </div>

    <!-- 📱 Landscape lock overlay (optional) -->
    <div v-if="landscapeLockActive" class="rotateOverlay" aria-live="polite" aria-busy="true">
      <div class="rotateCard">
        <div class="rotateTitle">Rotate your device</div>
        <div class="rotateSub">This match is locked to <b>landscape</b>.</div>
      </div>
    </div>

    <header class="topbar" :class="{ tetrBar: showTetrChrome }">
      <!-- TETR-like top bar (menus) -->
      <template v-if="showTetrChrome">
        <div class="tetrTopLeft">
          <div class="tetrTopTitle">{{ topPageTitle }}</div>
        </div>

        <div class="tetrTopRight">
          <div class="tetrTopIgn">
            <span class="tetrTopIgnLabel">IGN</span>
            <span class="tetrTopIgnName">{{ displayName }}</span>
          </div>
        </div>
</template>

      <!-- Original game top bar (in-game) -->
      <template v-else>
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
      </template>
    </header>

    <!-- Back button below the top bar (menus) -->
    <div v-if="showTetrChrome && canGoBack" class="tetrBackRow">
      <button class="tetrBackBtn" @mouseenter="uiHover" @click="uiClick(); goBack()">BACK</button>
    </div>

    <main class="main">
      <!-- =========================
           AUTH MENU
      ========================== -->
      <section v-if="screen === 'auth'" class="menuShell tetrShell">
        <div class="tetrPane">
          <div class="tetrHero">
            <div class="tetrHeroTop"></div>

            <!-- WELCOME hero title (AAA-style) -->
            <div class="tetrHeroTitle tetrWelcomeTitle" aria-label="PentoBattle">
              <img :src="logoUrl" class="tetrWelcomeLogo" alt="" />
              <span class="tetrWelcomeWord">PENTO</span>
              <span class="tetrWelcomeWord strong">BATTLE</span>
            </div>
          </div>

          <div class="tetrTiles">
            <button class="tetrTile disabled" disabled title="Login not implemented yet" @mouseenter="uiHover">
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">LG</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">LOGIN</div>
                  <div class="tetrTileDesc">not working yet</div>
                </div>
              </div>
            </button>

            <button class="tetrTile accentPink" @mouseenter="uiHover" @click="uiClick(); playAsGuest()">
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">GS</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">PLAY AS GUEST</div>
                  <div class="tetrTileDesc">jump straight into the modes</div>
                </div>
              </div>
            </button>
          </div>

          <div class="tetrFine">Tip: Q rotate • E flip</div>
        </div>
      </section>


      <!-- =========================
           MODE MENU (STACKED)
      ========================== -->
      <section v-else-if="screen === 'mode'" class="menuShell tetrShell">
        <div class="tetrHeaderRow">
          <div class="tetrPageTitle">WELCOME</div>
        </div>

        <div class="tetrPane">
          <div class="tetrHero compact">
            <div class="tetrHeroTitle">FLIP | ROTATE | DOMINATE</div>
          </div><div class="tetrTiles">
            <button
              class="tetrTile accentPurple"
              :disabled="!loggedIn"
              :class="{ disabled: !loggedIn }"
              :title="!loggedIn ? 'Ranked requires login' : ''"
              @mouseenter="uiHover"
              @click="uiClick(); goRanked()"
            >
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">RK</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">RANKED</div>
                  <div class="tetrTileDesc">auto finds lobby with same tier</div>
                </div>
              </div>
            </button>

            <button class="tetrTile accentPink" @mouseenter="uiHover" @click="uiClick(); startQuickMatchAuto()">
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">QM</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">QUICK MATCH</div>
                  <div class="tetrTileDesc">finding opponent · please wait</div>
                </div>
              </div>
            </button>

            <button class="tetrTile accentPurple2" @mouseenter="uiHover" @click="uiClick(); goLobby()">
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">LB</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">GO TO LOBBY</div>
                  <div class="tetrTileDesc">create session · browse rooms · join by code</div>
                </div>
              </div>
            </button>

            <button class="tetrTile accentBlue" @mouseenter="uiHover" @click="uiClick(); startCouchPlay()">
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">1P</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">COUCH PLAY</div>
                  <div class="tetrTileDesc">local 2-player on one device</div>
                </div>
              </div>
            </button>

            <button class="tetrTile disabled" disabled title="Practice vs. AI is locked for now" @mouseenter="uiHover">
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">AI</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">PRACTICE VS AI</div>
                  <div class="tetrTileDesc">locked for now</div>
                </div>
              </div>
            </button>

            <button class="tetrTile accentGrey" @mouseenter="uiHover" @click="uiClick(); screen = 'settings'">
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">ST</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">SETTINGS</div>
                  <div class="tetrTileDesc">controls · preferences</div>
                </div>
              </div>
            </button>

            <button class="tetrTile accentGrey2" @mouseenter="uiHover" @click="uiClick(); screen = 'credits'">
              <div class="tetrTileInner">
                <div class="tetrTileGlyph">CR</div>
                <div class="tetrTileText">
                  <div class="tetrTileTitle">CREDITS</div>
                  <div class="tetrTileDesc">about the game</div>
                </div>
              </div>
            </button>
          </div>
        </div>
      </section>


            <!-- =========================
           LOBBY
      ========================== -->
      <section v-else-if="screen === 'lobby'" class="menuShell tetrShell">
        <div class="tetrHeaderRow">
          <div class="tetrPageTitle">MULTIPLAYER</div>
        </div>

        <div class="tetrPane">
          <div class="tetrHero compact">
            <div class="tetrHeroTitle">LOBBY</div>
            <div class="tetrHeroSub">Create a session, browse rooms, or join by code.</div>
          </div>

          <div class="tetrCard">
            <div class="tetrTitleRow">
              <div class="tetrTitle">CREATE SESSION</div>
              <div class="tetrHint">PUBLIC OR PRIVATE</div>
            </div>

            <div class="tetrForm">
              <label class="tetrField">
                <span>LOBBY NAME</span>
                <input v-model="quick.lobbyName" class="tetrInput" placeholder="e.g., Mumuchxm room" />
              </label>

              <label class="tetrField inline">
                <span>PRIVATE</span>
                <input class="tetrCheck" type="checkbox" v-model="quick.isPrivate" />
              </label>
            </div>

            <div class="tetrRow">
              <button class="tetrMiniBtn" @mouseenter="uiHover" @click="uiClick(); refreshLobby()">REFRESH</button>
              <button class="tetrMiniBtn primary" @mouseenter="uiHover" @click="uiClick(); lobbyCreate()">CREATE</button>
            </div>

            <div class="tetrDivider"></div>

            <div class="tetrTitleRow">
              <div class="tetrTitle">JOIN / SEARCH</div>
              <div class="tetrHint">CODE OR NAME</div>
            </div>

            <div class="tetrForm">
              <label class="tetrField">
                <span>CODE OR NAME</span>
                <input
                  v-model="quick.joinCode"
                  class="tetrInput"
                  placeholder="PB-XXXXYYYY or lobby name"
                  @keydown.enter.prevent="lobbySearchOrJoin"
                />
              </label>
            </div>

            <div class="tetrRow">
              <button class="tetrMiniBtn primary" @mouseenter="uiHover" @click="uiClick(); lobbySearchOrJoin()">GO</button>
            </div>

            <div class="tetrDivider"></div>

            <div class="tetrTitleRow">
              <div class="tetrTitle">AVAILABLE ROOMS</div>
              <div class="tetrHint">{{ publicLobbies.length }} FOUND</div>
            </div>

            <div v-if="loadingPublic" class="tetrFineLine">Loading rooms…</div>
            <div v-else-if="!publicLobbies.length" class="tetrFineLine">No public rooms waiting right now.</div>

            <div v-else class="tetrLobbyList">
              <div class="tetrLobbyRow" v-for="l in publicLobbies" :key="l.id">
                <div class="tetrLobbyInfo">
                  <div class="tetrLobbyName">{{ l.lobby_name || "Public Lobby" }}</div>
                  <div class="tetrLobbyMeta">
                    Code: <b>{{ l.code || "—" }}</b>
                    <span class="dot">•</span>
                    Players: <b>{{ lobbyCountLabel(l) }}</b>
                  </div>
                </div>

                <button
                  class="tetrMiniBtn primary joinBtn"
                  @mouseenter="uiHover"
                  @click="uiClick(); joinPublicLobby(l)"
                >
                  JOIN
                </button>
              </div>
            </div>

            <div v-if="myPrivateLobbies.length" class="tetrDivider"></div>

            <div v-if="myPrivateLobbies.length" class="tetrTitleRow">
              <div class="tetrTitle">YOUR PRIVATE SESSIONS</div>
              <div class="tetrHint">{{ myPrivateLobbies.length }}</div>
            </div>

            <div v-if="myPrivateLobbies.length" class="tetrLobbyList">
              <div class="tetrLobbyRow" v-for="l in myPrivateLobbies" :key="'p_'+l.id">
                <div class="tetrLobbyInfo">
                  <div class="tetrLobbyName">{{ l.lobby_name || "Private Lobby" }}</div>
                  <div class="tetrLobbyMeta">
                    Code: <b>{{ l.code || "—" }}</b>
                    <span class="dot">•</span>
                    Status: <b>{{ l.status || "waiting" }}</b>
                  </div>
                </div>

                <button class="tetrMiniBtn" @mouseenter="uiHover" @click="uiClick(); copyCode(l.code)">COPY</button>
                <button class="tetrMiniBtn primary joinBtn" @mouseenter="uiHover" @click="uiClick(); reEnterLobby(l)">
                  ENTER
                </button>
              </div>
            </div>

            <div class="tetrFineLine">
              Private rooms are hidden — join by code. Quick Match rooms never show up here.
            </div>
          </div>
        </div>
      </section>

      <!-- =========================
           RANKED
      ========================== -->
	  <section v-else-if="screen === 'ranked'" class="menuShell">
	    <div class="hero compact heroAnim" :key="'hero-'+screen">
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
	    <div class="hero compact heroAnim" :key="'hero-'+screen">
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

            <div class="divider"></div>

            <label class="field">
              <span>Enable Drag Placement</span>
              <input type="checkbox" v-model="game.ui.enableDragPlace" />
            </label>

            <label class="field">
              <span>Enable Click Placement</span>
              <input type="checkbox" v-model="game.ui.enableClickPlace" />
            </label>

            <label class="field">
              <span>Enable Hover Preview</span>
              <input type="checkbox" v-model="game.ui.enableHoverPreview" />
            </label>

            <label class="field">
              <span>Landscape Only (Mobile)</span>
              <input type="checkbox" v-model="game.ui.lockLandscape" />
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
	    <div class="hero compact heroAnim" :key="'hero-'+screen">
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
          <div class="panelHead hudPanel">
            <div class="hudTop">
              <div class="hudMode">
                <div class="hudKicker">MODE</div>
                <div class="hudLine">
                  <span class="hudModeName">{{ modeLabel }}</span>
                  <span v-if="isOnline && myPlayer" class="hudYou">YOU: P{{ myPlayer }}</span>
                </div>
              </div>

              <div
                class="turnPill"
                :class="{
                  p1: game.phase !== 'gameover' && game.currentPlayer === 1,
                  p2: game.phase !== 'gameover' && game.currentPlayer === 2,
                  end: game.phase === 'gameover',
                }"
              >
                <span v-if="game.phase === 'draft'">P{{ game.draftTurn }} PICK</span>
                <span v-else-if="game.phase === 'place'">P{{ game.currentPlayer }} TURN</span>
                <span v-else>GAME OVER</span>
              </div>
            </div>

            <div class="hudPhase">
              <div class="hudKicker">PHASE</div>
              <div class="hudPhaseMain">{{ phaseTitle }}</div>
              <div class="hudPhaseSub" v-if="phaseSub">{{ phaseSub }}</div>
            </div>

            <div v-if="isOnline" class="hudGrid">
              <div class="hudStat ping" :class="pingLevelClass">
                <span class="pingDot" aria-hidden="true"></span>
                <span class="statLabel">PING</span>
                <span class="statValue">{{ pingText }}</span>
              </div>

              <div v-if="online.code" class="hudStat code">
                <span class="statLabel">CODE</span>
                <span class="mono statValue">{{ online.code }}</span>
                <button class="copyBtn" @click="copyLobbyCode" title="Copy code">COPY</button>
              </div>

              <div v-if="onlineTurnText" class="hudStat turn">
                <span class="statLabel">STATUS</span>
                <span class="statValue">{{ onlineTurnText }}</span>
              </div>

              <div
                v-if="timerHud"
                class="hudStat timer"
                :class="{
                  p1: timerHud.kind === 'clock' && timerHud.player === 1,
                  p2: timerHud.kind === 'clock' && timerHud.player === 2,
                  urgent: timerHud.kind === 'draft' && timerHud.seconds <= 10,
                }"
              >
                <template v-if="timerHud.kind === 'draft'">
                  <span class="statLabel">TIME</span>
                  <span class="statValue">{{ timerHud.value }}</span>
                </template>
                <template v-else>
                  <span class="statLabel">CLOCK</span>
                  <span class="clockBadge" :class="{ p1: timerHud.player === 1, p2: timerHud.player === 2 }">
                    P{{ timerHud.player }}
                  </span>
                  <span class="statValue clockValue">{{ timerHud.value }}</span>
                </template>
              </div>
            </div>

            <div class="hudKeys" v-if="game.phase === 'place'">
              <span class="hudKicker">CONTROLS</span>
              <span class="hudKeysLine"><b>Q</b> Rotate <span class="sepDot">•</span> <b>E</b> Flip</span>
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


<!-- TETR-like bottom bar (menus) -->
<footer v-if="showBottomBar" class="tetrBottomBar" aria-hidden="true">
  <!-- Hide the redundant bottom-left brand on WELCOME only (hero already shows the title) -->
  <div v-if="screen !== 'auth'" class="tetrBottomLeft">
    <img :src="logoUrl" alt="" class="tetrBottomLogo" />
    <div class="tetrBottomBrand">PentoBattle</div>
  </div>
  <div class="tetrBottomRight">
    <div class="tetrBottomHint">MADE BY MUMUCHXM</div>
  </div>
</footer>


    <!-- ✅ Modal -->
    <div v-if="modal.open" class="modalOverlay" @click.self="!modal.locked && closeModal()">
      <div v-if="showConfetti" class="confetti" aria-hidden="true">
        <span
          v-for="p in confettiPieces"
          :key="p.id"
          class="confettiPiece"
          :style="{ left: p.left + '%', '--d': p.delay + 's', '--t': p.dur + 's', '--r': p.rot + 'deg', '--x': p.drift + 'px', width: p.size + 'px', height: (p.size * 0.6) + 'px' }"
        />
      </div>
      <div class="modalCard" :class="modalCardClass" role="dialog" aria-modal="true">
        <div class="modalTop" :class="{ resultTop: isResultModal }">
          <div v-if="!isResultModal" class="modalTitle">
            <span class="modalDot" :class="modalDotClass"></span>
            {{ modal.title }}
          </div>
          <button v-if="showModalX" class="modalX" @click="closeModal" aria-label="Close">✕</button>
          <div v-else class="modalXSpacer" aria-hidden="true"></div>
        </div>

        <div v-if="isResultModal" class="resultHero" :class="resultHeroClass">
          <div class="resultTitle">{{ resultBigTitle }}</div>
          <div v-if="resultSubTitle" class="resultSub">{{ resultSubTitle }}</div>
          <div class="resultGlow" aria-hidden="true"></div>
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
    g.gain.value = gain;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime;
    g.gain.setValueAtTime(gain, t);
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

// Viewport sizing: we rely on responsive CSS + natural page scroll.
// Keep portrait detection for optional landscape lock UI.
const appRoot = ref(null);

function onViewportChange() {
  computeIsPortrait();
}


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


// TETR-like chrome (menus only)
const isMenuScreen = computed(() => !isInGame.value);
const topPageTitle = computed(() => {
  if (screen.value === "auth") return "WELCOME"; // Welcome page
  if (screen.value === "mode") return "WELCOME"; // Main menu page
  if (screen.value === "lobby") return "LOBBY";
  if (screen.value === "ranked") return "RANKED";
  if (screen.value === "settings") return "CONFIG";
  if (screen.value === "credits") return "ABOUT";
  return "MENU";
});
const showTetrChrome = computed(() => isMenuScreen.value && ["auth","mode","lobby","ranked","settings","credits"].includes(screen.value));
const showBottomBar = computed(() => showTetrChrome.value);

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

// Layout changes handled by normal responsive CSS.

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
const myPrivateLobbies = ref([]);
const loadingPrivate = ref(false);

function getGuestId() {
  const k = "pb_guest_id";
  let id = localStorage.getItem(k);
  if (!id) {
    id = (crypto?.randomUUID?.() || `g_${Math.random().toString(16).slice(2)}_${Date.now()}`).toString();
    localStorage.setItem(k, id);
  }
  return id;
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

      // ✅ Quick Match rooms should NEVER linger.
// If someone leaves (even mid-match), delete/close the room so the next queue can't get shoved
// into an already-ended or half-finished session.
      const isQuickMatchRoom =
        String(lobby.lobby_name || "") === "__QM__" || String(st?.meta?.kind || "") === "quickmatch";

      if (isQuickMatchRoom) {
        try {
          const ok = await sbDeleteLobby(online.lobbyId);
          if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: matchEndedLocally ? "ended" : "abandoned", reason: "qm_leave" });
        } catch {
          // ignore
        }
      } else {
        // For normal public lobbies: if the match already ended, clear the row to avoid history pileup.
        if (isPublicQuick && matchEndedLocally) {
          try {
            const ok = await sbDeleteLobby(online.lobbyId);
            if (!ok) await sbCloseAndNukeLobby(online.lobbyId, { terminateReason: "ended", reason: "quick_cleanup" });
          } catch {
            // ignore
          }
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

async function sbCreateLobby({ isPrivate = false, lobbyName = "", extraStateMeta = null } = {}) {
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
    state: { meta: { ...(extraStateMeta || {}) } },
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

}

async function ensureOnlineInitialized(lobby) {
  if (!lobby) return;

  const hasPlayers = !!lobby?.state?.meta?.players;
  if (hasPlayers) return;
  if (!lobby.host_id || !lobby.guest_id) return;

  // Randomize player numbers for THIS round, then write it once into meta.
  const { players } = makeRandomPlayers(lobby.host_id, lobby.guest_id);

  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();

  const prevMeta = lobby.state?.meta ? lobby.state.meta : {};
  const nextRound = Number(prevMeta.round || 0) + 1;

  const initState = buildSyncedState({
    ...prevMeta,
    players,
    round: nextRound,
    roundSeed: makeRoundSeed(),
    started_at: new Date().toISOString(),
  });

  const nextVersion = Number(lobby.version || 0) + 1;

  try {
    // Prefer guarded patch to avoid race if both clients try to init at once.
    const updated = await sbPatchStateWithVersionGuard(lobby.id, lobby.version, {
      state: initState,
      version: nextVersion,
      status: "playing",
      updated_at: new Date().toISOString(),
    });

    online.lastAppliedVersion = updated?.version || nextVersion;
  } catch {
    // If it failed, assume the other side initialized it.
  }
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

      // ✅ If someone joined an expired/abandoned room, cancel cleanly.
      if (isLobbyExpired(lobby)) {
        stopPolling();
        myPlayer.value = null;
        screen.value = "mode";
        showModal({
          title: "Expired Lobby",
          tone: "bad",
          message: online.role === "guest"
            ? "You joined an expired lobby.\nPlease create or join a fresh lobby."
            : "This lobby expired.\nPlease create a fresh lobby.",
          actions: [{ label: "OK", tone: "primary" }],
        });
        return;
      }

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

        // ✅ Reset round assignment so the next challenger gets a fresh random P1/P2.
        (async () => {
          try {
            const meta = lobby.state?.meta ? lobby.state.meta : {};
            game.boardW = 10;
            game.boardH = 6;
            game.allowFlip = allowFlip.value;
            game.resetGame();
            const snapshot = buildSyncedState({ ...meta, players: null, started_at: null, roundSeed: null });
            const nextVersion = Number(lobby.version || 0) + 1;
            await sbForcePatchState(lobby.id, {
              state: snapshot,
              version: nextVersion,
              status: "waiting",
              updated_at: new Date().toISOString(),
            });
          } catch {
            // ignore
          }
        })();
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

  // Prefer a single author for round resets to avoid version fights.
  // Host resets the round; guest simply waits for the new state.
  if (online.role !== "host") {
    game.resetGame();
    return;
  }

  try {
    const lobby = await sbSelectLobbyById(online.lobbyId);
    if (!lobby) return;

    if (!lobby.host_id || !lobby.guest_id) {
      showModal({
        title: "Rematch Failed",
        tone: "bad",
        message: "Opponent is no longer in the lobby.",
        actions: [{ label: "OK", tone: "primary", onClick: () => stopAndExitToMenu("Opponent left.") }],
      });
      return;
    }

    const meta = lobby.state?.meta ? lobby.state.meta : {};
    const nextRound = Number(meta.round || 0) + 1;

    const { players } = makeRandomPlayers(lobby.host_id, lobby.guest_id);

    game.boardW = 10;
    game.boardH = 6;
    game.allowFlip = allowFlip.value;
    game.resetGame();

    const snapshot = buildSyncedState({
      ...meta,
      players,
      round: nextRound,
      roundSeed: makeRoundSeed(),
      started_at: new Date().toISOString(),
    });
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

    // Only show lobbies that are still valid for joining (and NOT quick-match hidden rooms).
    publicLobbies.value = list.filter((l) => {
      if (!(lobbyPlayerCount(l) > 0) || isLobbyExpired(l)) return false;
      const name = String(l?.lobby_name || "");
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
      "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
      "status=eq.waiting",
      "is_private=eq.true",
      `host_id=eq.${encodeURIComponent(me)}`,
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
    showModal({ title: "Enter Code or Name", tone: "bad", message: "Type a lobby code (PB-...) or a lobby name." });
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
  const found = (list || []).find((l) => String(l?.lobby_name || "").toLowerCase().includes(term.toLowerCase()));
  if (found) {
    await joinPublicLobby(found);
    return;
  }

  showModal({
    title: "No Match Found",
    tone: "bad",
    message: "Couldn't find a public room with that name. Try refreshing, or join by code for private rooms.",
  });
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

  try {
    showModal({ title: "Quick Match", tone: "info", message: "Finding opponent, please wait…" });

    // Guard against rare hangs / stalled fetches.
    const withTimeout = (p, ms) =>
      Promise.race([
        p,
        new Promise((_, rej) => setTimeout(() => rej(new Error("Quick Match timed out")), ms)),
      ]);

    let result;
    try {
      result = await withTimeout(sbQuickMatch(), 9000);
    } catch {
      // One retry after a short delay.
      await new Promise((r) => setTimeout(r, 600));
      result = await withTimeout(sbQuickMatch(), 9000);
    }

    const { lobby, role } = result;

    closeModal();
    showModal({
      title: "Match Found",
      tone: "good",
      message: role === "host" ? `Created quick match room.
Waiting for opponent…` : `Opponent found!
Joining…`,
    });

    // Jump to online immediately
    screen.value = "online";
    startPollingLobby(lobby.id, role);
  } catch (e) {
    closeModal();
    showModal({ title: "Quick Match Error", tone: "bad", message: String(e?.message || e || "Something went wrong.") });
  }
}

async function sbQuickMatch() {
  // Quick Match rooms are hidden from the lobby browser by lobby_name="__QM__"
  const me = getGuestId();

  // 1) Try to claim the oldest waiting quickmatch room
  const q = [
    "select=id,code,status,is_private,lobby_name,updated_at,host_id,guest_id,state,version",
    "status=eq.waiting",
    "is_private=eq.false",
    "guest_id=is.null",
    "lobby_name=eq.__QM__",
    "order=updated_at.asc",
    "limit=6",
  ].join("&");

  const res = await fetch(sbRestUrl(`pb_lobbies?${q}`), { headers: sbHeaders() });
  if (!res.ok) throw new Error(`Quick match lookup failed (${res.status})`);
  const rows = await res.json();
  const list = Array.isArray(rows) ? rows : [];

  for (const lobby of list) {
    // Clean up dead rows so they don't get reused by accident
    if (lobbyPlayerCount(lobby) === 0) {
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

    if (lobby.host_id === me) continue;

    // Claim it (atomic PATCH guarded by guest_id is null + status waiting)
    const joined = await sbJoinLobby(lobby.id);
    if (joined?.id) return { lobby: joined, role: "guest" };
  }

  // 2) Otherwise, create a new hidden quick match room and wait as host
  const created = await sbCreateLobby({
    isPrivate: false,
    lobbyName: "__QM__",
    extraStateMeta: { kind: "quickmatch", hidden: true },
  });

  if (!created?.id) throw new Error("Failed to create quick match lobby.");
  return { lobby: created, role: "host" };
}


/* =========================
   NAV
========================= */
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
    message: `Allow Flip: ${allowFlip.value ? "ON" : "OFF"}
Drag: ${game.ui.enableDragPlace ? "ON" : "OFF"} · Click: ${game.ui.enableClickPlace ? "ON" : "OFF"} · Hover: ${game.ui.enableHoverPreview ? "ON" : "OFF"}`,
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

  onViewportChange();
  window.addEventListener("resize", onViewportChange, { passive: true });
  window.addEventListener("orientationchange", onViewportChange, { passive: true });
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
  try { if (_fitRaf) cancelAnimationFrame(_fitRaf); } catch {}
  stopPolling();
});
</script>

<style scoped>
@import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@600;700;800&family=Rajdhani:wght@400;500;600;700&display=swap');
/* =========================
   RGB GAME VIBES
========================= */
.app {
  /* Keep the whole app locked to the viewport height so you can't scroll into
     "empty gradient space" on short menu pages. */
  min-height: 100vh;
  height: 100dvh;
  color: #eaeaea;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  background: #06060a;
  font-family: 'Rajdhani', Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif;
}

/* When the fixed bottom bar is visible, keep layout at exactly 100vh (no extra scroll).
   Padding is compensated by reducing min-height. */
.app.hasBottomBar{
  /* Bottom bar is fixed; we only need extra padding so content never hides behind it.
     Avoid min-height hacks that can cause scrollbars to "pulse" on some browsers. */
  padding-bottom: 62px;
}

/* Ensure form controls inherit theme fonts */
.app :deep(button, input, textarea, select){
  font-family: inherit;
  font-size: inherit;
  letter-spacing: inherit;
}

/* Headings use Orbitron-like sci-fi */
.app :is(.title, .heroTitle, .menuTitle, .menuBtnTop, .turnPill, .resultTitle){
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
}

/* Prefer crisp edges on small text + icons */
.app :is(.title, .sub, .menuTitle, .menuHint, .menuBtnTop, .menuBtnSub, .heroBadge) {
  letter-spacing: 0.6px;
}

/* =========================
   LOADING / LOCK OVERLAY
========================= */
.loadOverlay{
  position: fixed;
  inset: 0;
  z-index: 60;
  display: grid;
  place-items: center;
  padding: 18px;
  background:
    radial-gradient(1200px 700px at 50% 20%, rgba(0,229,255,0.10), transparent 60%),
    radial-gradient(1000px 600px at 20% 80%, rgba(255,43,214,0.10), transparent 60%),
    rgba(0,0,0,0.72);
  backdrop-filter: blur(12px);
}
.loadCard{
  width: min(560px, 100%);
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.14);
  background: linear-gradient(180deg, rgba(18,18,28,0.88), rgba(10,10,16,0.84));
  box-shadow:
    0 18px 80px rgba(0,0,0,0.65),
    0 0 0 1px rgba(0,229,255,0.08) inset,
    0 0 0 1px rgba(255,43,214,0.06);
  padding: 16px;
  animation: popIn .22s ease-out;
}
.loadTop{ display:flex; gap: 12px; align-items:center; }
.loadLogo{
  width: 54px;
  height: 54px;
  object-fit: contain;
  filter:
    drop-shadow(0 10px 22px rgba(0,0,0,0.55))
    drop-shadow(0 0 18px rgba(0,229,255,0.16))
    drop-shadow(0 0 18px rgba(255,43,214,0.12));
}
.loadTitle{ font-size: 16px; font-weight: 900; }
.loadSub{ margin-top: 6px; font-size: 12px; opacity: 0.85; }
.loadBar{
  margin-top: 14px;
  height: 12px;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.12);
  overflow: hidden;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.35) inset;
}
.loadBarFill{
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, rgba(0,229,255,0.9), rgba(255,43,214,0.9));
  box-shadow:
    0 0 18px rgba(0,229,255,0.22),
    0 0 18px rgba(255,43,214,0.18);
}
.loadHint{ margin-top: 12px; font-size: 11px; opacity: 0.78; line-height: 1.4; }

.rotateOverlay{
  position: fixed;
  inset: 0;
  z-index: 65;
  display: grid;
  place-items: center;
  padding: 18px;
  background: rgba(0,0,0,0.78);
  backdrop-filter: blur(10px);
}
.rotateCard{
  width: min(420px, 92vw);
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.12);
  background:
    radial-gradient(800px 320px at 50% 0%, rgba(0,229,255,0.16), transparent 70%),
    radial-gradient(800px 320px at 50% 100%, rgba(255,43,214,0.14), transparent 70%),
    rgba(255,255,255,0.04);
  box-shadow: 0 20px 70px rgba(0,0,0,0.65);
  padding: 16px 16px 14px;
  text-align: center;
}
.rotateTitle{ font-weight: 1000; letter-spacing: 1.2px; text-transform: uppercase; font-size: 16px; }
.rotateSub{ margin-top: 6px; opacity: 0.85; font-weight: 700; }

@keyframes popIn{
  from{ transform: translateY(8px) scale(0.98); opacity: 0; }
  to{ transform: translateY(0) scale(1); opacity: 1; }
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
  justify-content: flex-start;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.10);
  background:
    linear-gradient(180deg, rgba(12,12,20,0.72), rgba(10,10,16,0.46));
  backdrop-filter: blur(12px);
  box-shadow:
    0 10px 40px rgba(0,0,0,0.45),
    0 0 0 1px rgba(0,229,255,0.06) inset,
    0 0 0 1px rgba(255,43,214,0.05);
}

/* In-game header: keep buttons on the top-right */
.topbar:not(.tetrBar){ justify-content: space-between; }
.topbar:not(.tetrBar) .right{ margin-left: auto; }

.brand {
  display: flex;
  gap: 10px;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.topbar .right{
  display:flex;
  align-items:center;
  gap: 10px;
  flex-wrap: wrap;
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
.finePrint{
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid rgba(255,255,255,0.10);
  opacity: .82;
  font-size: 13px;
  line-height: 1.35;
}

/* Main layout */

/* Minor UI: menus had too much gap below the top bar */
.topbar.tetrBar ~ .main{ padding-top: 8px; }

/* Only add bottom padding when the fixed bottom bar is visible */
.app.hasBottomBar .main{
  padding-bottom: 84px;
}

/* Main content is the only scroll container (prevents double-scroll + empty scroll). */
.main{
  position: relative;
  z-index: 1;
  padding: 18px;
  flex: 1 1 auto;
  /* Allow vertical scrolling, but never allow horizontal scrollbars
     (menu tiles intentionally overhang to the right for the AAA "off-panel" effect). */
  overflow-y: auto;
  overflow-x: hidden;
}

/* In-game: lock the canvas; UI already fits the viewport. */
.app.inGame .main{ overflow: hidden; }

/* On very small/narrow devices (especially portrait), the in-game UI can't reliably
   fit without clipping. Allow scrolling there while keeping desktop locked. */
@media (max-width: 980px){
  .app.inGame .main{ overflow: auto; -webkit-overflow-scrolling: touch; }
  .gameLayout{ height: auto; }
}

@media (max-height: 620px){
  .app.inGame .main{ overflow: auto; -webkit-overflow-scrolling: touch; }
  .gameLayout{ height: auto; }
}

.btn{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  line-height: 1.1;
  white-space: nowrap;
  overflow: visible;
  padding: 10px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  color: #eaeaea;
  font-weight: 900;
  font-family: 'Orbitron', 'Rajdhani', Inter, system-ui, sans-serif;
  letter-spacing: 0.6px;
  cursor: pointer;
  transition: transform .08s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease, opacity .18s ease;
  box-shadow:
    0 8px 22px rgba(0,0,0,0.35),
    0 0 0 1px rgba(255,255,255,0.06) inset;
}
.btn:hover{
  transform: translateY(-1px);
  border-color: rgba(255,255,255,0.20);
  box-shadow:
    0 10px 26px rgba(0,0,0,0.42),
    0 0 0 1px rgba(255,255,255,0.07) inset,
    0 0 18px rgba(0,229,255,0.10);
}
.btn:active{ transform: translateY(0px) scale(0.99); }

.btn.primary{
  background: linear-gradient(180deg, rgba(0,229,255,0.18), rgba(0,229,255,0.10));
  border-color: rgba(0,229,255,0.28);
  box-shadow:
    0 12px 30px rgba(0,0,0,0.45),
    0 0 0 1px rgba(0,229,255,0.10) inset,
    0 0 22px rgba(0,229,255,0.12);
}
.btn.soft{
  background: rgba(255,255,255,0.05);
}
.btn.ghost{
  background: transparent;
  box-shadow: none;
}
.menuShell{ max-width: 640px; margin: 0 auto; display: grid; gap: 14px; padding: 6px 0 16px; }
.menuCard{ padding: 18px; border-radius: 20px; border: 1px solid rgba(255,255,255,.10); background: rgba(10,10,16,.55); backdrop-filter: blur(10px); }
.menuStack{ display: grid; gap: 10px; }
.menuSplitRow{ display:flex; gap: 10px; flex-wrap: wrap; margin-top: 2px; }
.menuBtn{ width: 100%; display:flex;
  line-height: 1.15;
  overflow: visible; justify-content:space-between; align-items:center; padding: 12px 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.14); background: linear-gradient(180deg, rgba(255,255,255,.07), rgba(255,255,255,.05)); color:#eaeaea; cursor:pointer; font-weight:900; transition: transform .08s ease, box-shadow .18s ease, border-color .18s ease, background .18s ease; box-shadow: 0 12px 34px rgba(0,0,0,.40), 0 0 0 1px rgba(0,0,0,.25) inset; }
.menuBtn:hover{ transform: translateY(-1px); border-color: rgba(255,255,255,.20); box-shadow: 0 14px 38px rgba(0,0,0,.46), 0 0 22px rgba(0,229,255,.10); }
.menuBtn:active{ transform: translateY(0px) scale(0.99); }
.menuBtn.primary{ background: linear-gradient(180deg, rgba(0,229,255,.16), rgba(0,229,255,.10)); border-color: rgba(0,229,255,.22); }
.menuBtn.alt{ background: linear-gradient(180deg, rgba(255,43,214,.16), rgba(255,64,96,.10)); border-color: rgba(255,43,214,.22); }
.menuBtn.alt:hover{ box-shadow: 0 14px 38px rgba(0,0,0,.46), 0 0 22px rgba(255,43,214,.12); }
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

/* AAA-style title entrance (auto slide + fade) */
.heroAnim .heroBadge{
  animation: heroBadgeIn .55s cubic-bezier(.2,.9,.2,1) both, heroBadgeIdle 5.5s ease-in-out 1.0s infinite;
}
.heroAnim .heroTitle{
  animation: heroTitleIn .62s cubic-bezier(.2,.9,.2,1) .05s both, heroTitleIdle 6.0s ease-in-out 1.1s infinite;
}
.heroAnim .heroDesc{
  animation: heroDescIn .65s cubic-bezier(.2,.9,.2,1) .10s both;
}

@keyframes heroBadgeIn{
  from{ opacity: 0; transform: translateY(-10px); filter: blur(2px); }
  to{ opacity: 1; transform: translateY(0px); filter: blur(0px); }
}
@keyframes heroTitleIn{
  from{ opacity: 0; transform: translateY(10px); filter: blur(3px); }
  to{ opacity: 1; transform: translateY(0px); filter: blur(0px); }
}
@keyframes heroDescIn{
  from{ opacity: 0; transform: translateY(8px); }
  to{ opacity: .8; transform: translateY(0px); }
}
@keyframes heroBadgeIdle{
  0%,100%{ transform: translateY(0px); opacity: 1; }
  50%{ transform: translateY(-1px); opacity: .92; }
}
@keyframes heroTitleIdle{
  0%,100%{ transform: translateY(0px); }
  50%{ transform: translateY(-2px); }
}
.rgbText{ background: linear-gradient(90deg, rgba(0,229,255,1), rgba(255,43,214,1)); -webkit-background-clip:text; background-clip:text; color: transparent; }
.divider{ height: 1px; background: rgba(255,255,255,.10); margin: 12px 0; }
.chip{ display:inline-flex; align-items:center; gap: 8px; }
.chip.code{ gap: 10px; }
.miniBtn{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  padding: 7px 10px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(0,0,0,0.22);
  color: #eaeaea;
  font-weight: 900;
  cursor: pointer;
}
.miniBtn:hover{ background: rgba(255,255,255,0.08); }
.field{ display:flex; gap: 12px; align-items:center; padding: 10px 12px; border-radius: 14px; border: 1px solid rgba(255,255,255,.10); background: rgba(255,255,255,.04); }
.form{ display:grid; gap: 10px; }
.input{ width: 100%; padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(255,255,255,.12); background: rgba(0,0,0,.25); color:#eaeaea; }
.row{ display:flex; gap: 10px; flex-wrap: wrap; margin-top: 10px; }
.modalOverlay{ position: fixed; inset: 0; z-index: 50; background:
  radial-gradient(1000px 600px at 50% 20%, rgba(0,229,255,0.10), transparent 60%),
  radial-gradient(900px 520px at 20% 85%, rgba(255,43,214,0.10), transparent 60%),
  rgba(0,0,0,.60);
  display:grid; place-items:center; padding: 18px; backdrop-filter: blur(10px);
}

.resultHero{
  position: relative;
  margin-top: 8px;
  padding: 18px 14px 14px;
  border-radius: 18px;
  border: 1px solid rgba(255,255,255,0.10);
  background:
    radial-gradient(900px 280px at 50% 0%, rgba(0,229,255,0.14), transparent 70%),
    radial-gradient(900px 280px at 50% 100%, rgba(255,43,214,0.12), transparent 70%),
    rgba(255,255,255,0.03);
  overflow: hidden;
  text-align: center;
}
.resultHero::after{
  content:"";
  position:absolute;
  inset:-2px;
  background: linear-gradient(90deg, rgba(0,229,255,0.0), rgba(0,229,255,0.20), rgba(255,43,214,0.18), rgba(255,43,214,0.0));
  filter: blur(18px);
  opacity: .8;
  pointer-events:none;
}
.resultHero.victory{ border-color: rgba(0,229,255,0.22); }
.resultHero.defeat{ border-color: rgba(255,64,96,0.22); }
.resultHero.couchP1{ border-color: rgba(0,229,255,0.22); }
.resultHero.couchP2{ border-color: rgba(255,43,214,0.22); }

.resultTitle{
  font-size: 44px;
  line-height: 1;
  margin: 2px 0 6px;
  font-weight: 800;
  text-transform: uppercase;
  background: linear-gradient(90deg, rgba(0,229,255,1), rgba(255,43,214,1));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-shadow: 0 18px 60px rgba(0,0,0,0.65);
}
.resultHero.defeat .resultTitle{
  background: linear-gradient(90deg, rgba(255,64,96,1), rgba(255,215,0,0.9));
  -webkit-background-clip: text;
  background-clip: text;
}

/* Couch results: solid winner colors (no gradient) */
.resultHero.couchP1 .resultTitle{
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  color: rgba(0,229,255,1);
  -webkit-text-fill-color: rgba(0,229,255,1);
}
.resultHero.couchP2 .resultTitle{
  background: none;
  -webkit-background-clip: initial;
  background-clip: initial;
  color: rgba(255,64,96,1);
  -webkit-text-fill-color: rgba(255,64,96,1);
}
.resultSub{
  font-size: 14px;
  letter-spacing: 2px;
  opacity: .85;
  font-weight: 800;
}
.resultGlow{
  position:absolute;
  left:50%;
  top: 50%;
  width: 520px;
  height: 220px;
  transform: translate(-50%,-50%);
  background: radial-gradient(circle at 50% 50%, rgba(0,229,255,0.18), transparent 60%);
  filter: blur(22px);
  opacity: .75;
  pointer-events:none;
}
.resultHero.defeat .resultGlow{
  background: radial-gradient(circle at 50% 50%, rgba(255,64,96,0.16), transparent 60%);
}

.modalTop.resultTop{
  justify-content: flex-end;
  margin-bottom: 6px;
}
.modalXSpacer{ width: 18px; height: 18px; }

.modalCard.modalResult{
  width: min(720px, 100%);
  padding: 18px 18px 16px;
}

.confetti{
  position: fixed;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
  z-index: 51;
}
.confettiPiece{
  position: absolute;
  top: -20px;
  border-radius: 3px;
  background: linear-gradient(90deg, rgba(0,229,255,1), rgba(255,43,214,1));
  opacity: 0.95;
  transform: translateX(0) rotate(var(--r));
  animation: confettiFall var(--t) ease-in forwards;
  animation-delay: var(--d);
  box-shadow: 0 10px 30px rgba(0,0,0,0.40);
}
@keyframes confettiFall{
  0%{ transform: translateX(0) translateY(0) rotate(var(--r)); opacity: 0; }
  8%{ opacity: 1; }
  100%{ transform: translateX(var(--x)) translateY(105vh) rotate(calc(var(--r) + 420deg)); opacity: 0; }
}

.modalCard{
  width: min(560px, 100%);
  border-radius: 22px;
  border: 1px solid rgba(255,255,255,0.14);
  background: linear-gradient(180deg, rgba(18,18,28,0.90), rgba(10,10,16,0.86));
  backdrop-filter: blur(14px);
  padding: 14px;
  box-shadow:
    0 18px 80px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,255,255,0.06) inset;
  animation: popIn .18s ease-out;
}
.modalCard.modalDanger{
  box-shadow:
    0 18px 80px rgba(0,0,0,0.62),
    0 0 0 1px rgba(255,64,96,0.12) inset,
    0 0 28px rgba(255,64,96,0.10);
}
.modalCard.modalVictory{
  width: min(620px, 100%);
  border-color: rgba(0,229,255,0.24);
  background:
    radial-gradient(900px 260px at 50% 0%, rgba(0,229,255,0.16), transparent 70%),
    radial-gradient(900px 260px at 50% 100%, rgba(255,43,214,0.14), transparent 70%),
    linear-gradient(180deg, rgba(18,18,28,0.92), rgba(10,10,16,0.88));
  box-shadow:
    0 22px 110px rgba(0,0,0,0.70),
    0 0 0 1px rgba(0,229,255,0.12) inset,
    0 0 36px rgba(0,229,255,0.16),
    0 0 32px rgba(255,43,214,0.12);
  animation: victoryPop .24s ease-out;
}
.modalTop{ display:flex; justify-content:space-between; align-items:center; gap: 10px; }
.modalTitle{ display:flex; align-items:center; gap: 10px; font-weight: 900; }
.modalDot{ width: 10px; height: 10px; border-radius: 999px; background: rgba(0,229,255,.92); box-shadow: 0 0 14px rgba(0,229,255,0.18); }
.modalDot.bad{ background: rgba(255,64,96,.95); }
.modalDot.good{ background: rgba(0,255,128,.95); }
.modalDot.victory{ background: linear-gradient(90deg, rgba(0,229,255,1), rgba(255,43,214,1)); box-shadow: 0 0 18px rgba(0,229,255,0.22), 0 0 18px rgba(255,43,214,0.18); }
.modalX{ background: transparent; border: 0; color:#eaeaea; font-size: 18px; cursor:pointer; }
.modalBody{ margin-top: 10px; }
.modalMsg{ margin: 0 0 8px 0; opacity: .92; line-height: 1.45; }
.modalActions{ display:flex; gap: 10px; justify-content:flex-end; margin-top: 12px; flex-wrap: wrap; }

@keyframes victoryPop{
  from{ transform: translateY(10px) scale(0.97); opacity: 0; filter: saturate(1.1); }
  to{ transform: translateY(0) scale(1); opacity: 1; filter: saturate(1.0); }
}

/* Fit-to-viewport in-game (no scroll): keep the whole layout within the main area */
.gameLayout{
  display:grid;
  grid-template-columns: 420px 1fr;
  gap: 14px;
  height: 100%;
  min-height: 0;
  align-items: stretch;
}
@media (max-width: 980px){
  .gameLayout{ grid-template-columns: 1fr; }
  .leftPanel{ order: 2; }
  .rightPanel{ order: 1; }
  .rightPanel{ display:flex; flex-direction: column; align-items: stretch; }
  .leftPanel{ display:flex; flex-direction: column; gap: 12px; }
}
@media (max-width: 520px){
  .panelHead, .panel{ border-radius: 16px; }
}

.leftPanel,.rightPanel{ min-width:0; }
.leftPanel{ display:flex; flex-direction: column; gap: 12px; min-height: 0; }
.rightPanel{ display:flex; flex-direction: column; gap: 10px; min-height: 0; }
.panelHead{ padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(10,10,16,.55); backdrop-filter: blur(10px); }
.hudPanel{ padding: 16px; }
.hudTop{ display:flex; justify-content:space-between; align-items:flex-start; gap: 12px; flex-wrap: wrap; }
.hudMode{ min-width: 0; }
.hudKicker{ font-size: 11px; opacity: .74; font-weight: 900; letter-spacing: 1.4px; }
.hudLine{ display:flex; gap: 10px; align-items: baseline; flex-wrap: wrap; margin-top: 2px; }
.hudModeName{ font-size: 18px; font-weight: 900; }
.hudYou{ font-size: 12px; font-weight: 900; padding: 4px 9px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); }

.hudPhase{ margin-top: 10px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.10); }
.hudPhaseMain{ font-size: 22px; font-weight: 900; text-transform: uppercase; letter-spacing: 1.2px; }
.hudPhaseSub{ margin-top: 3px; font-size: 13px; opacity: .82; font-weight: 700; }

.hudGrid{ margin-top: 12px; display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 10px; }
@media (max-width: 920px){ .hudGrid{ grid-template-columns: 1fr; } }

.hudStat{ display:flex; align-items:center; gap: 10px; padding: 10px 12px; border-radius: 16px; border: 1px solid rgba(255,255,255,0.12); background: linear-gradient(180deg, rgba(255,255,255,0.06), rgba(0,0,0,0.18)); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.25) inset; }
.statLabel{ font-size: 11px; opacity: .72; font-weight: 900; letter-spacing: 1.2px; }
.statValue{ font-size: 14px; font-weight: 900; }
.hudStat.turn .statValue{ font-weight: 800; }
.hudStat.turn .statValue{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; }
.hudStat.timer .statValue{ font-variant-numeric: tabular-nums; }

.pingDot{ width: 10px; height: 10px; border-radius: 999px; background: rgba(150,150,150,0.9); box-shadow: 0 0 12px rgba(255,255,255,0.10); }
.hudStat.ping.good{ border-color: rgba(0,255,128,0.22); }
.hudStat.ping.good .pingDot{ background: rgba(0,255,128,0.92); box-shadow: 0 0 14px rgba(0,255,128,0.18); }
.hudStat.ping.mid{ border-color: rgba(255,215,0,0.22); }
.hudStat.ping.mid .pingDot{ background: rgba(255,215,0,0.92); box-shadow: 0 0 14px rgba(255,215,0,0.16); }
.hudStat.ping.bad{ border-color: rgba(255,64,96,0.25); }
.hudStat.ping.bad .pingDot{ background: rgba(255,64,96,0.92); box-shadow: 0 0 14px rgba(255,64,96,0.18); }
.hudStat.ping.na .pingDot{ opacity: .55; }

.hudStat.ping{ padding: 8px 10px; }

/* CODE tile: single-line HUD row (prevents tall empty ping row) */
.hudStat.code{ padding: 8px 10px; display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: 10px; }
.hudStat.code .statLabel{ margin-right: 2px; }
.hudStat.code .statValue{ font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace; letter-spacing: 0.6px; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.copyBtn{ margin-left: 0; display:inline-flex; align-items:center; justify-content:center; padding: 6px 10px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(0,0,0,0.24); color: #eaeaea; font-weight: 900; font-size: 12px; cursor: pointer; flex: 0 0 auto; white-space: nowrap; }
.copyBtn:hover{ background: rgba(255,255,255,0.08); }
.copyBtn:active{ transform: translateY(0px) scale(0.99); }

.hudStat.timer{ gap: 10px; }
.clockBadge{ display:inline-flex; align-items:center; justify-content:center; padding: 4px 10px; border-radius: 999px; font-weight: 900; font-size: 12px; border: 1px solid rgba(255,255,255,0.14); background: rgba(255,255,255,0.06); }
.clockBadge.p1{ border-color: rgba(0,229,255,.28); background: rgba(0,229,255,.10); }
.clockBadge.p2{ border-color: rgba(255,64,96,.28); background: rgba(255,64,96,.10); }
.clockValue{ font-size: 16px; letter-spacing: 0.3px; }
.hudStat.timer.p1{ border-color: rgba(0,229,255,.22); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,229,255,0.10) inset; }
.hudStat.timer.p2{ border-color: rgba(255,64,96,.22); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,64,96,0.10) inset; }

@keyframes timeUrgentBlink{
  0%, 100%{ border-color: rgba(255,64,96,.35); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,64,96,0.12) inset, 0 0 18px rgba(255,64,96,0.10); }
  50%{ border-color: rgba(255,64,96,.70); box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(255,64,96,0.22) inset, 0 0 26px rgba(255,64,96,0.18); }
}
.hudStat.timer.urgent{ animation: timeUrgentBlink 0.85s ease-in-out infinite; }

.hudKeys{ margin-top: 12px; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.10); display:flex; justify-content:space-between; align-items:center; gap: 10px; flex-wrap: wrap; }
.hudKeysLine{ font-size: 13px; font-weight: 800; opacity: .9; }
.sepDot{ opacity: .6; padding: 0 6px; }

.panel{ margin-top: 12px; padding: 14px; border-radius: 18px; border: 1px solid rgba(255,255,255,.10); background: rgba(10,10,16,.55); backdrop-filter: blur(10px); }
.panelTitle{ margin: 0 0 10px 0; }
.hintSmall{ margin-top: 10px; opacity:.75; font-size: 12px; }
.turnBadge{ padding: 8px 10px; border-radius: 999px; font-weight: 900; border: 1px solid rgba(255,255,255,.12); background: rgba(255,255,255,.06); }
.turnBadge.p1{ border-color: rgba(0,229,255,.25); background: rgba(0,229,255,.10); }
.turnBadge.p2{ border-color: rgba(255,64,96,.25); background: rgba(255,64,96,.10); }
.turnBadge.end{ border-color: rgba(255,255,255,.18); }
.modeRow{ display:flex; justify-content:space-between; align-items:center; gap: 10px; flex-wrap: wrap; }
.statusTag,.keysTag{ margin-top: 10px; font-size: 12px; opacity: .85; font-weight: 700; }

/* Fit-to-viewport: avoid pushing Controls off-screen at 100% zoom */
@media (max-height: 820px){
  .gameLayout{ gap: 12px; }
  .leftPanel{ gap: 10px; }
  .panel{ margin-top: 10px; padding: 12px; }
  .panelHead{ padding: 13px; }
  .hudPanel{ padding: 14px; }
  .hudPhaseMain{ font-size: 20px; }
}


/* =========================
   TETR-INSPIRED MENU (ONLY MENUS)
========================= */
.tetrShell {
  /*
    AAA menu layout goal:
    - tiles feel larger than their pane
    - far right edge disappears off-screen (no visible "panel edge")
    - DO NOT crop vertical content (so lower items stay visible)

    The main scroll container (.main) has padding: 18px.
    We cancel ONLY the right padding here so the menu can reach the viewport edge.
  */
  width: min(1020px, calc(100vw - 18px));
  margin: 0 -18px 0 auto; /* cancel .main right padding so tiles can overhang to the edge */
  padding: 0 0 14px;
  /* Let the browser handle scrolling (prevents double scrollbars) */
/* topbar (~72px) + breathing room */
  display: flex;
  flex-direction: column;
}

.tetrHeaderRow{
  /* Page title is now handled by the top bar (TETR-like),
     so we hide the extra in-pane header to avoid duplicates. */
  display:none;
}

.tetrPageTitle{
  font-weight: 1000;
  letter-spacing: 2px;
  font-size: clamp(28px, 5vh, 44px);
  opacity:.75;
  text-transform: uppercase;
  text-shadow: 0 2px 18px rgba(0,0,0,.55);
}

.tetrPane{
  background: transparent;
  border: none;
  box-shadow: none;
  border-radius: 14px;
  padding: 0;
  backdrop-filter: none;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
}

.tetrHero{
  padding: 2px 6px clamp(8px, 1.6vh, 12px);
  border-bottom: 1px solid rgba(255,255,255,0.08);
  margin-bottom: 10px;
}
.tetrHero.compact{
  padding-bottom: 12px;
}

.tetrHeroTop{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  margin-bottom: 8px;
}

.tetrBadge{
  display:inline-flex;
  align-items:center;
  gap:8px;
  padding: 6px 10px;
  border-radius: 999px;
  font-weight: 900;
  letter-spacing: 1px;
  font-size: 12px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,0.10);
  text-transform: uppercase;
}
.tetrBadge.green{
  border-color: rgba(80,255,160,0.25);
  box-shadow: 0 0 0 1px rgba(80,255,160,0.12) inset;
}

.tetrIgn{
  display:flex;
  align-items:baseline;
  gap:10px;
  padding: 6px 10px;
  border-radius: 10px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,0.10);
}
.tetrIgnLabel{
  font-size: 11px;
  letter-spacing: 2px;
  opacity:.65;
}
.tetrIgnName{
  font-weight: 1000;
  letter-spacing: 1px;
}

.tetrHintRight{
  font-size: 12px;
  opacity: .75;
}

.tetrHeroTitle{
  font-weight: 1000;
  letter-spacing: 4px;
  font-size: clamp(26px, 4.6vh, 40px);
  text-transform: uppercase;
}

/* WELCOME: big AAA-style title with logo mark */
.tetrWelcomeTitle{
  display: inline-flex;
  align-items: center;
  gap: clamp(10px, 2vh, 18px);
  font-size: clamp(34px, 6.2vh, 64px);
  letter-spacing: clamp(2px, 0.5vh, 6px);
  text-shadow:
    0 18px 50px rgba(0,0,0,0.55),
    0 0 26px rgba(0,229,255,0.10),
    0 0 22px rgba(255,43,214,0.08);
}
.tetrWelcomeLogo{
  width: clamp(44px, 7vh, 86px);
  height: clamp(44px, 7vh, 86px);
  object-fit: contain;
  filter:
    drop-shadow(0 14px 34px rgba(0,0,0,0.62))
    drop-shadow(0 0 22px rgba(0,229,255,0.18))
    drop-shadow(0 0 18px rgba(255,43,214,0.14));
}
.tetrWelcomeWord{ opacity: 0.98; }
.tetrWelcomeWord.strong{ opacity: 1; }
.tetrHeroSub{
  margin-top: 6px;
  opacity: .78;
  font-size: 14px;
  letter-spacing: .4px;
}

.tetrTiles{
  display:flex;
  flex-direction:column;
  gap: clamp(10px, 1.9vh, 16px);
  flex: 1;
  min-height: 0;
  justify-content: flex-start;

  /* Let the main scroll container handle vertical overflow.
     (Previously this was overflow:hidden which cropped lower menu items like Couch/AI/Settings/Credits.) */
  overflow: visible;
  padding-right: 0;
}

.tetrTile{
  /* Big, uniform tile sizing (AAA menu feel) */
  height: clamp(120px, 18vh, 190px);
  flex: 0 0 auto;

  /* AAA "off-panel" illusion without cropping:
     push the tile slightly to the right (beyond viewport), so its far edge is not visible.
     We keep the left edge fully visible (no negative left margin), avoiding cut text/glyphs. */
  width: 100%;
  /* Push farther past the right edge so there is NO visible pane edge (Valorant/TETR vibe) */
  margin-right: clamp(-140px, -12vw, -260px);

  position: relative;
  text-align:left;
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 14px;
  background: rgba(0,0,0,.36);
  padding: 0;
  cursor: pointer;

  /* Keep inner VFX inside the tile, but shadows still render outside */
  overflow: hidden;

  box-shadow:
    0 14px 40px rgba(0,0,0,.55),
    0 0 0 1px rgba(0,0,0,0.35) inset;

  transition:
    transform .28s cubic-bezier(.2,.85,.2,1),
    box-shadow .28s cubic-bezier(.2,.85,.2,1),
    filter .28s cubic-bezier(.2,.85,.2,1);
}
.tetrTile:before{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;

  /* Subtle glass + diagonal sheen */
  background:
    linear-gradient(135deg, rgba(255,255,255,.10), rgba(255,255,255,0) 55%),
    radial-gradient(900px 320px at 18% 12%, rgba(0,229,255,0.14), transparent 60%),
    radial-gradient(900px 320px at 55% 88%, rgba(255,43,214,0.12), transparent 62%);

  opacity: .70;
}

/* Neon border + scanline shimmer (AAA "juicy" feel) */
.tetrTile:after{
  content:"";
  position:absolute;
  inset:0;
  pointer-events:none;
  border-radius: inherit;

  background:
    linear-gradient(90deg, rgba(0,229,255,0.22), rgba(255,43,214,0.18) 55%, rgba(255,255,255,0.06)),
    repeating-linear-gradient(
      180deg,
      rgba(255,255,255,0.05) 0px,
      rgba(255,255,255,0.05) 1px,
      rgba(255,255,255,0) 6px,
      rgba(255,255,255,0) 10px
    );
  mix-blend-mode: screen;
  opacity: .18;
  transform: translateX(-10%);
  animation: tetrScan 4.2s linear infinite;
}

@keyframes tetrScan{
  0%{ background-position: 0 0, 0 0; }
  100%{ background-position: 240px 0, 0 120px; }
}
.tetrTile:hover{
  transform: translateX(-34px);
  box-shadow:
    0 18px 55px rgba(0,0,0,.62),
    0 0 0 1px rgba(0,229,255,0.10) inset,
    0 0 0 1px rgba(255,43,214,0.07);
  filter: brightness(1.08) saturate(1.04);
}
.tetrTile:active{
  transform: translateX(-34px) scale(0.995);
}
.tetrTile.disabled,
.tetrTile:disabled{
  cursor:not-allowed;
  opacity:.55;
  filter: grayscale(.2);
}
.tetrTile.disabled:hover,
.tetrTile:disabled:hover{
  transform:none;
  box-shadow:none;
  filter:none;
}

.tetrTileInner{
  display:flex;
  align-items:center;
  gap: clamp(12px, 2vh, 18px);
  padding: clamp(10px, 1.9vh, 18px) clamp(12px, 2.2vh, 18px);
}

.tetrTileGlyph{
  width: clamp(68px, 10vh, 96px);
  height: clamp(44px, 7vh, 58px);
  display:flex;
  align-items:center;
  justify-content:center;
  font-weight: 1000;
  letter-spacing: 2px;
  font-size: clamp(30px, 5.2vh, 44px);
  opacity: .95;
  text-shadow: 0 3px 16px rgba(0,0,0,.6);
}

.tetrTileText{
  display:flex;
  flex-direction:column;
  gap: 4px;
  min-width:0;
}
.tetrTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  font-weight: 1000;
  letter-spacing: 3px;
  font-size: clamp(22px, 4.2vh, 34px);
  text-transform: uppercase;
  line-height:1.05;
}
.tetrTileDesc{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  opacity: .75;
  letter-spacing: 1.4px;
  font-size: 12px;
  text-transform: uppercase;
}

.tetrFine{
  margin-top: 14px;
  opacity: .7;
  font-size: 12px;
  letter-spacing: 1px;
  text-transform: uppercase;
  border-top: 1px solid rgba(255,255,255,0.08);
  padding-top: 12px;
}

.tetrBottomRow{
  display:flex;
  gap: 12px;
  margin-top: 14px;
}
.tetrMiniBtn{
  flex:1;
  border-radius: 10px;
  padding: 12px 14px;
  font-weight: 1000;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,.35);
  cursor:pointer;
  transition: transform .12s ease, filter .12s ease;
}
.tetrMiniBtn:hover{ transform: translateX(-6px); filter: brightness(1.05); }


/* ===== Lobby (TETR-inspired card + form) ===== */
.tetrCard{
  margin-top: 6px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.12);
  background:
    radial-gradient(900px 420px at 20% 0%, rgba(160,120,255,0.18), transparent 60%),
    radial-gradient(900px 420px at 100% 80%, rgba(0,229,255,0.14), transparent 62%),
    linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0.22));
  box-shadow:
    0 18px 60px rgba(0,0,0,0.55),
    0 0 0 1px rgba(0,0,0,0.30) inset;
  padding: 14px 14px 12px;
  backdrop-filter: blur(10px);
}
.tetrTitleRow{
  display:flex;
  justify-content:space-between;
  align-items:baseline;
  gap: 12px;
  margin-top: 4px;
}
.tetrTitle{
  font-weight: 1000;
  letter-spacing: 2.2px;
  text-transform: uppercase;
  font-size: 14px;
  opacity: .92;
}
.tetrHint{
  font-weight: 900;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  font-size: 11px;
  opacity: .65;
}
.tetrDivider{
  height: 1px;
  background: rgba(255,255,255,0.10);
  margin: 12px 0;
}
.tetrForm{
  display:grid;
  gap: 10px;
  margin-top: 10px;
}
.tetrField{
  display:grid;
  gap: 6px;
}
.tetrField > span{
  font-size: 11px;
  letter-spacing: 2px;
  text-transform: uppercase;
  opacity: .75;
  font-weight: 900;
}
.tetrField.inline{
  grid-template-columns: 1fr auto;
  align-items:center;
}
.tetrInput{
  width: 100%;
  border-radius: 10px;
  padding: 12px 12px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(0,0,0,0.35);
  color: #eaeaea;
  outline: none;
  font-weight: 800;
  letter-spacing: .6px;
  box-shadow: 0 0 0 1px rgba(0,0,0,0.28) inset;
}
.tetrInput:focus{
  border-color: rgba(0,229,255,0.26);
  box-shadow: 0 0 0 1px rgba(0,229,255,0.10) inset, 0 0 22px rgba(0,229,255,0.10);
}
.tetrCheck{
  width: 18px;
  height: 18px;
  accent-color: rgb(200,160,255);
}
.tetrRow{
  display:flex;
  gap: 10px;
  margin-top: 10px;
}
.tetrMiniBtn.primary{
  border-color: rgba(0,229,255,0.18);
  background: linear-gradient(180deg, rgba(0,229,255,0.18), rgba(0,229,255,0.08));
}
.tetrFineLine{
  margin-top: 10px;
  opacity: .75;
  font-size: 12px;
  letter-spacing: .8px;
}
.tetrLobbyList{
  display:grid;
  gap: 10px;
  margin-top: 10px;
}
.tetrLobbyRow{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap: 12px;
  padding: 12px 12px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,0.28);
  transition: transform .14s ease, border-color .14s ease, background .14s ease;
}
.tetrLobbyRow:hover{
  transform: translateX(-10px);
  border-color: rgba(255,255,255,0.16);
  background: rgba(0,0,0,0.34);
}
.tetrLobbyInfo{
  min-width: 0;
  display:flex;
  flex-direction:column;
  gap: 4px;
}
.tetrLobbyName{
  font-weight: 1000;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tetrLobbyMeta{
  font-size: 12px;
  opacity: .75;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tetrLobbyMeta .dot{
  margin: 0 8px;
  opacity: .55;
}
.joinBtn{
  flex: 0 0 auto;
  min-width: 110px;
}

.tetrBackBtn{
  border-radius: 10px;
  padding: 12px 18px;
  font-weight: 1000;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,.35);
  cursor:pointer;
  transition: transform .12s ease, filter .12s ease;
}
.tetrBackBtn:hover{ transform: translateX(-6px); filter: brightness(1.05); }

.tetrTile.accentPink{
  box-shadow: 0 0 0 1px rgba(255,70,160,0.12) inset;
}
.tetrTile.accentPink .tetrTileGlyph,
.tetrTile.accentPink .tetrTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
 color: rgba(255,170,220,0.98); }

.tetrTile.accentPurple{
  box-shadow: 0 0 0 1px rgba(190,130,255,0.14) inset;
}
.tetrTile.accentPurple .tetrTileGlyph,
.tetrTile.accentPurple .tetrTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
 color: rgba(220,200,255,0.98); }

.tetrTile.accentPurple2{
  box-shadow: 0 0 0 1px rgba(160,120,255,0.12) inset;
}
.tetrTile.accentPurple2 .tetrTileGlyph,
.tetrTile.accentPurple2 .tetrTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
 color: rgba(210,190,255,0.98); }

.tetrTile.accentBlue{
  box-shadow: 0 0 0 1px rgba(120,170,255,0.14) inset;
}
.tetrTile.accentBlue .tetrTileGlyph,
.tetrTile.accentBlue .tetrTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
 color: rgba(190,220,255,0.98); }

/* Responsive: keep everything visible on smaller screens */
@media (max-width: 700px) {
  .tetrPageTitle{ font-size: 34px; }
  .tetrHeroTitle{ font-size: 30px; }
  .tetrTileGlyph{ width: 74px; font-size: 34px; }
  .tetrTileTitle{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
 font-size: 26px; }
  .tetrTileInner{ padding: 14px 14px; gap: 14px; }
}
@media (max-width: 420px) {
  .tetrHeaderRow{ flex-wrap: wrap; }
  .tetrIgn{ width: 100%; justify-content: flex-start; }
}

/* Short viewports: tighten the menu to avoid scrolling */
@media (max-height: 820px) {
  .tetrShell{ padding: 10px 0 12px; max-height: calc(100vh - 86px); }
  .tetrHeroSub{ font-size: 13px; }
  .tetrTileDesc{
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
 font-size: 11px; }
}



/* TETR-like top & bottom bars (menus) */
.topbar.tetrBar{
  min-height: 64px;
  height: auto;
  padding: 10px 18px 10px;
  background: linear-gradient(180deg, rgba(0,0,0,0.62), rgba(0,0,0,0.22));
  border-bottom: 1px solid rgba(255,255,255,0.10);
  justify-content: space-between;
  align-items: flex-start;
}
.tetrTopLeft{ display:flex; flex-direction:column; align-items:flex-start; gap: 6px; min-width: 0; }
.tetrTopTitle{
  font-weight: 1000;
  letter-spacing: 2.2px;
  font-size: 34px;
  opacity: .75;
  text-transform: uppercase;
}
.tetrTopRight{ display:flex; align-items:center; gap: 12px; margin-left:auto; }
.tetrTopIgn{
  display:flex;
  align-items:baseline;
  gap:10px;
  padding: 8px 12px;
  border-radius: 10px;
  background: rgba(0,0,0,.35);
  border: 1px solid rgba(255,255,255,0.10);
}
.tetrTopIgnLabel{ font-size: 11px; letter-spacing: 2px; opacity:.65; }
.tetrTopIgnName{ font-weight: 1000; letter-spacing: 1px; }
.tetrTopBtn{
  border-radius: 10px;
  padding: 10px 14px;
  font-weight: 1000;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(0,0,0,.35);
  color: #eaeaea;
  cursor: pointer;
  transition: transform .12s ease, filter .12s ease;
}

.tetrBackRow{
  /* IMPORTANT: The back button must NOT push the menu down when it appears.
     Keep it visually below the top bar, but take it out of document flow. */
  position: absolute;
  left: 0;
  top: 70px; /* sits right under the TETR top bar */
  width: 100%;

  padding: 10px 18px 0;
  display: flex;
  justify-content: flex-start;

  z-index: 3;
  pointer-events: none;
}
.tetrBackBtn{
  border-radius: 12px;
  padding: 12px 18px;
  font-weight: 1000;
  letter-spacing: 2px;
  text-transform: uppercase;
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  color: #eaeaea;
  box-shadow: 0 10px 26px rgba(0,0,0,0.32), 0 0 0 1px rgba(0,0,0,0.25) inset;
  cursor: pointer;
  pointer-events: auto;
}
.tetrBackBtn:hover{ background: rgba(255,255,255,0.10); transform: translateY(-1px); }

.tetrTopBtn:hover{ transform: translateX(-6px); filter: brightness(1.05); }
.tetrTopBtn.under{
  padding: 8px 12px;
  border-radius: 10px;
}
.tetrTopBtn.under:hover{ transform: translateX(-10px); }


.tetrBottomBar{
  position: fixed;
  left: 0; right: 0; bottom: 0;
  height: 62px;
  z-index: 25;
  display:flex;
  align-items:center;
  justify-content:space-between;
  padding: 0 16px;
  background: linear-gradient(180deg, rgba(0,0,0,0.18), rgba(0,0,0,0.62));
  border-top: 1px solid rgba(255,255,255,0.10);
  backdrop-filter: blur(10px);
  pointer-events: none;
}
.tetrBottomLeft{ display:flex; align-items:center; gap: 10px; }
.tetrBottomLogo{
  width: 28px; height: 28px; object-fit: contain;
  filter: drop-shadow(0 10px 22px rgba(0,0,0,0.55));
}
.tetrBottomBrand{ font-weight: 1000; letter-spacing: 2px; opacity:.75; text-transform: uppercase; }
.tetrBottomRight{ opacity:.55; font-weight: 900; letter-spacing: 2px; text-transform: uppercase; }

</style>