<template>
  <Teleport to="body">
    <Transition name="rvFade">
      <div v-if="visible" class="rvOverlay" @keydown="onKeyDown" tabindex="-1" ref="overlayEl">

        <!-- ── Header ─────────────────────────────── -->
        <div class="rvHeader">
          <div class="rvHeaderLeft">
            <span class="rvTitle">⚔ REPLAY</span>
            <span class="rvHeaderMeta">
              {{ p1Name }} <span class="rvVs">vs</span> {{ p2Name }}
              <span class="rvDot">·</span>
              Round {{ meta?.round ?? 1 }}
              <span class="rvDot">·</span>
              {{ modeLabel }}
            </span>
          </div>
          <button class="rvClose" @click="$emit('close')" aria-label="Close">✕</button>
        </div>

        <!-- ── Main layout ────────────────────────── -->
        <div class="rvBody">

          <!-- Move List panel -->
          <div class="rvMovePanel">

            <!-- Draft picks summary -->
            <div class="rvSection">
              <div class="rvSectionLabel">DRAFT PICKS</div>
              <div class="rvDraftRow">
                <div class="rvPickCol">
                  <div class="rvPickHeader p1">P1</div>
                  <div class="rvPicks">
                    <span
                      v-for="(piece, i) in draftEvents.filter(e => e.player === 1).map(e => e.piece)"
                      :key="i"
                      class="rvPip"
                      :style="{ background: pieceColor(piece) }"
                      :title="piece"
                    >{{ piece }}</span>
                  </div>
                </div>
                <div class="rvPickDivider"></div>
                <div class="rvPickCol">
                  <div class="rvPickHeader p2">P2</div>
                  <div class="rvPicks">
                    <span
                      v-for="(piece, i) in draftEvents.filter(e => e.player === 2).map(e => e.piece)"
                      :key="i"
                      class="rvPip"
                      :style="{ background: pieceColor(piece) }"
                      :title="piece"
                    >{{ piece }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Placement move list -->
            <div class="rvSection rvMoveList" ref="moveListEl">
              <div class="rvSectionLabel">PLACEMENTS <span class="rvMoveCount">{{ placeEvents.length }} moves</span></div>
              <div
                v-for="(ev, i) in placeEvents"
                :key="ev.seq"
                class="rvMoveRow"
                :class="{
                  active: currentStep === i + 1,
                  past:   currentStep > i + 1,
                  p1:     ev.player === 1,
                  p2:     ev.player === 2,
                }"
                @click="jumpTo(i + 1)"
              >
                <span class="rvMoveNum">{{ i + 1 }}</span>
                <span class="rvMovePip" :style="{ background: pieceColor(ev.piece) }"></span>
                <span class="rvMovePlayer">P{{ ev.player }}</span>
                <span class="rvMovePiece">{{ ev.piece }}</span>
                <span class="rvMoveTs">{{ formatTs(ev._ts) }}</span>
              </div>

              <!-- Terminal events -->
              <div v-if="terminalEvent" class="rvMoveRow rvMoveTerminal">
                <span class="rvMoveNum">—</span>
                <span class="rvMovePip" style="background:rgba(255,255,255,0.2)"></span>
                <span class="rvMovePiece rvTerminalLabel">{{ terminalLabel }}</span>
              </div>
            </div>
          </div>

          <!-- Board + result panel -->
          <div class="rvBoardCol">

            <!-- Result banner (shown when fully played) -->
            <Transition name="rvResultIn">
              <div v-if="currentStep >= placeEvents.length && placeEvents.length > 0" class="rvResult">
                <div
                  class="rvResultBadge"
                  :class="resultClass"
                >{{ resultText }}</div>
                <div class="rvResultSub">{{ winnerName }} wins</div>
              </div>
            </Transition>

            <!-- Board -->
            <div class="rvBoardWrap" ref="boardWrapEl">
              <div class="rvBoardSizer" :style="sizerStyle">
                <div class="rvNeonFrame"></div>
                <div class="rvScanlines"></div>
                <div class="rvBoard" :style="gridStyle">
                  <div
                    v-for="cell in flatBoard"
                    :key="cell.key"
                    class="rvCell"
                    :class="{
                      placed: !!cell.v,
                      'rv-p1': cell.v?.player === 1,
                      'rv-p2': cell.v?.player === 2,
                      highlight: isHighlighted(cell.x, cell.y),
                    }"
                    :style="cellStyle(cell)"
                  ></div>
                </div>
              </div>
            </div>

            <!-- Step info strip -->
            <div class="rvStepStrip">
              <span class="rvStepPhase">{{ stepPhaseLabel }}</span>
              <div class="rvProgressBar">
                <div class="rvProgressFill" :style="{ width: progressPct + '%' }"></div>
              </div>
              <span class="rvStepCounter">{{ currentStep }} / {{ placeEvents.length }}</span>
            </div>

          </div>
        </div>

        <!-- ── Controls bar ───────────────────────── -->
        <div class="rvControls">
          <div class="rvControlsLeft">
            <button class="rvBtn" @click="jumpTo(0)" :disabled="currentStep === 0" title="Start (Home)">⏮</button>
            <button class="rvBtn" @click="stepBack" :disabled="currentStep === 0" title="Back (←)">◀</button>
            <button class="rvBtn rvPlayBtn" @click="togglePlay" :title="playing ? 'Pause (Space)' : 'Play (Space)'">
              {{ playing ? '⏸' : '▶' }}
            </button>
            <button class="rvBtn" @click="stepForward" :disabled="currentStep >= placeEvents.length" title="Forward (→)">▶</button>
            <button class="rvBtn" @click="jumpTo(placeEvents.length)" :disabled="currentStep >= placeEvents.length" title="End (End)">⏭</button>
          </div>
          <div class="rvControlsCenter">
            <span class="rvSpeedLabel">SPEED</span>
            <button
              v-for="s in speeds" :key="s.ms"
              class="rvSpeedBtn"
              :class="{ active: playSpeed === s.ms }"
              @click="setSpeed(s.ms)"
            >{{ s.label }}</button>
          </div>
          <div class="rvControlsRight">
            <span class="rvKeyHint">← → Space</span>
          </div>
        </div>

      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from "vue";
import { getPieceStyle } from "../lib/pieceStyles.js";

// ─── Props / Emits ────────────────────────────────────────────────────────────
const props = defineProps({
  visible:     { type: Boolean, default: false },
  events:      { type: Array,   default: () => [] },   // from replayLogger / pb_replay_logs
  finalBoard:  { type: Array,   default: () => [] },   // 2-D board at gameover
  finalPicks:  { type: Object,  default: () => ({}) }, // { "1": [...], "2": [...] }
  metadata:    { type: Object,  default: () => ({}) }, // boardW, boardH, round, mode, startedAt
  p1Name:      { type: String,  default: "Player 1" },
  p2Name:      { type: String,  default: "Player 2" },
  winnerId:    { type: String,  default: null },
  player1Id:   { type: String,  default: null },
});
const emit = defineEmits(["close"]);

// ─── Constants ────────────────────────────────────────────────────────────────
const BOARD_W = computed(() => props.metadata?.boardW ?? 10);
const BOARD_H = computed(() => props.metadata?.boardH ?? 6);

const speeds = [
  { label: "0.5×", ms: 1600 },
  { label: "1×",   ms: 800  },
  { label: "2×",   ms: 400  },
  { label: "3×",   ms: 200  },
];

// ─── Refs ─────────────────────────────────────────────────────────────────────
const overlayEl  = ref(null);
const boardWrapEl = ref(null);
const moveListEl = ref(null);

const currentStep = ref(0);
const playing     = ref(false);
const playSpeed   = ref(800);
let   _playTimer  = null;

const boardSizerW = ref(0);
const boardSizerH = ref(0);

// ─── Derived event lists ───────────────────────────────────────────────────────
const draftEvents = computed(() =>
  (props.events || []).filter(e => e.type === "draft").sort((a,b) => a.seq - b.seq)
);

const placeEvents = computed(() =>
  (props.events || []).filter(e => e.type === "place").sort((a,b) => a.seq - b.seq)
);

const terminalEvent = computed(() =>
  (props.events || []).find(e => ["timeout","surrender","dodged","abandoned"].includes(e.type))
);

const terminalLabel = computed(() => {
  const t = terminalEvent.value?.type;
  const p = terminalEvent.value?.player;
  const map = { timeout:"Timeout", surrender:"Surrender", dodged:"Dodge", abandoned:"Abandoned" };
  return p ? `P${p} ${map[t] || t}` : (map[t] || t);
});

// ─── Cell map (player+piece → cells) ─────────────────────────────────────────
// Since each player places each piece exactly once, (player, pieceKey) uniquely
// identifies a group of cells in the finalBoard.
const cellMap = computed(() => {
  const map = {};
  const board = props.finalBoard;
  if (!board?.length) return map;
  for (let y = 0; y < board.length; y++) {
    const row = board[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x++) {
      const cell = row[x];
      if (!cell) continue;
      const k = `${cell.player}:${cell.pieceKey}`;
      if (!map[k]) map[k] = [];
      map[k].push([x, y]);
    }
  }
  return map;
});

// ─── Board reconstruction at current step ─────────────────────────────────────
const reconstructedBoard = computed(() => {
  const W = BOARD_W.value;
  const H = BOARD_H.value;
  const board = Array.from({ length: H }, () => Array(W).fill(null));
  const events = placeEvents.value;
  const map    = cellMap.value;
  const limit  = currentStep.value;

  for (let i = 0; i < limit && i < events.length; i++) {
    const ev = events[i];
    const k  = `${ev.player}:${ev.piece}`;
    const cells = map[k] || [];
    for (const [x, y] of cells) {
      if (y >= 0 && y < H && x >= 0 && x < W) {
        board[y][x] = { player: ev.player, pieceKey: ev.piece };
      }
    }
  }
  return board;
});

// Highlighted cells = the LAST placed piece
const highlightedCells = computed(() => {
  if (currentStep.value === 0) return new Set();
  const ev  = placeEvents.value[currentStep.value - 1];
  if (!ev) return new Set();
  const k   = `${ev.player}:${ev.piece}`;
  const set = new Set();
  for (const [x, y] of (cellMap.value[k] || [])) {
    set.add(`${x},${y}`);
  }
  return set;
});

function isHighlighted(x, y) {
  return highlightedCells.value.has(`${x},${y}`);
}

const flatBoard = computed(() => {
  const W = BOARD_W.value;
  const H = BOARD_H.value;
  const b = reconstructedBoard.value;
  const out = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      out.push({ key: `${x},${y}`, x, y, v: b[y]?.[x] ?? null });
    }
  }
  return out;
});

// ─── Board sizing (maintain 10:6 aspect, fill available space) ───────────────
const sizerStyle = computed(() => ({
  width:  `${boardSizerW.value}px`,
  height: `${boardSizerH.value}px`,
}));

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${BOARD_W.value}, 1fr)`,
  gridTemplateRows:    `repeat(${BOARD_H.value}, 1fr)`,
}));

function cellStyle(cell) {
  if (!cell.v?.pieceKey) return null;
  const s = getPieceStyle(cell.v.pieceKey);
  return { backgroundColor: s.color };
}

function pieceColor(pieceKey) {
  return getPieceStyle(pieceKey)?.color ?? "#fff";
}

function updateBoardSize() {
  if (!boardWrapEl.value) return;
  const { clientWidth: W, clientHeight: H } = boardWrapEl.value;
  const aspect = BOARD_W.value / BOARD_H.value; // 10/6 ≈ 1.667
  let w = W;
  let h = w / aspect;
  if (h > H) { h = H; w = h * aspect; }
  boardSizerW.value = Math.floor(w);
  boardSizerH.value = Math.floor(h);
}

// ─── Labels / computed display ────────────────────────────────────────────────
const modeLabel = computed(() => {
  const m = props.metadata?.mode || "online";
  return { online: "Online", quick: "Quick", ranked: "Ranked", custom: "Custom" }[m] || m;
});

const progressPct = computed(() => {
  const total = placeEvents.value.length;
  return total === 0 ? 0 : (currentStep.value / total) * 100;
});

const stepPhaseLabel = computed(() => {
  if (placeEvents.value.length === 0) return "DRAFT ONLY";
  if (currentStep.value === 0)        return "START";
  if (currentStep.value >= placeEvents.value.length) return "FINAL";
  const ev = placeEvents.value[currentStep.value - 1];
  return `P${ev.player} PLACED ${ev.piece}`;
});

const resultClass = computed(() => {
  const wId = props.winnerId;
  const p1Id = props.player1Id;
  if (!wId) return "draw";
  if (wId === p1Id) return "p1win";
  return "p2win";
});

const resultText = computed(() => {
  const wId = props.winnerId;
  const p1Id = props.player1Id;
  if (!wId) return "DRAW";
  if (wId === p1Id) return "P1 WINS";
  return "P2 WINS";
});

const winnerName = computed(() => {
  const wId = props.winnerId;
  const p1Id = props.player1Id;
  if (!wId) return "Nobody";
  return wId === p1Id ? props.p1Name : props.p2Name;
});

function formatTs(ms) {
  if (ms == null) return "";
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2,"0")}`;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function jumpTo(n) {
  const max = placeEvents.value.length;
  currentStep.value = Math.max(0, Math.min(max, n));
  if (currentStep.value >= max) stopPlay();
  scrollActiveMoveIntoView();
}

function stepForward() {
  jumpTo(currentStep.value + 1);
}

function stepBack() {
  jumpTo(currentStep.value - 1);
}

function togglePlay() {
  if (playing.value) stopPlay();
  else startPlay();
}

function startPlay() {
  if (currentStep.value >= placeEvents.value.length) {
    jumpTo(0);
  }
  playing.value = true;
  scheduleNext();
}

function stopPlay() {
  playing.value = false;
  clearTimeout(_playTimer);
  _playTimer = null;
}

function scheduleNext() {
  clearTimeout(_playTimer);
  if (!playing.value) return;
  _playTimer = setTimeout(() => {
    if (currentStep.value >= placeEvents.value.length) {
      stopPlay();
      return;
    }
    stepForward();
    scheduleNext();
  }, playSpeed.value);
}

function setSpeed(ms) {
  playSpeed.value = ms;
  if (playing.value) {
    clearTimeout(_playTimer);
    scheduleNext();
  }
}

function scrollActiveMoveIntoView() {
  nextTick(() => {
    if (!moveListEl.value) return;
    const active = moveListEl.value.querySelector(".rvMoveRow.active");
    if (active) active.scrollIntoView({ block: "nearest", behavior: "smooth" });
  });
}

// ─── Keyboard ─────────────────────────────────────────────────────────────────
function onKeyDown(e) {
  if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); stepForward(); }
  if (e.key === "ArrowLeft"  || e.key === "ArrowUp")   { e.preventDefault(); stepBack(); }
  if (e.key === " ")             { e.preventDefault(); togglePlay(); }
  if (e.key === "Home")          { e.preventDefault(); jumpTo(0); }
  if (e.key === "End")           { e.preventDefault(); jumpTo(placeEvents.value.length); }
  if (e.key === "Escape")        { emit("close"); }
}

// ─── ResizeObserver ───────────────────────────────────────────────────────────
let _ro = null;
onMounted(() => {
  _ro = new ResizeObserver(updateBoardSize);
  if (boardWrapEl.value) _ro.observe(boardWrapEl.value);
  updateBoardSize();
  nextTick(() => overlayEl.value?.focus());
});
onBeforeUnmount(() => {
  _ro?.disconnect();
  stopPlay();
});

// Reset state when opened
watch(() => props.visible, (v) => {
  if (v) {
    currentStep.value = 0;
    playing.value = false;
    clearTimeout(_playTimer);
    nextTick(() => {
      updateBoardSize();
      overlayEl.value?.focus();
    });
  } else {
    stopPlay();
  }
});
</script>

<style scoped>
/* ── Overlay ───────────────────────────────── */
.rvOverlay {
  position: fixed;
  inset: 0;
  z-index: 9000;
  display: flex;
  flex-direction: column;
  background:
    radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,100,255,0.12), transparent 60%),
    radial-gradient(ellipse 60% 50% at 80% 100%, rgba(180,0,255,0.09), transparent 60%),
    rgba(5, 6, 14, 0.97);
  backdrop-filter: blur(16px);
  outline: none;
}

/* Transition */
.rvFade-enter-active { animation: rvIn .22s cubic-bezier(.22,1,.36,1); }
.rvFade-leave-active { animation: rvIn .18s cubic-bezier(.22,1,.36,1) reverse; }
@keyframes rvIn {
  from { opacity: 0; transform: scale(0.97) translateY(6px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}

/* ── Header ────────────────────────────────── */
.rvHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 20px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.rvHeaderLeft {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
}
.rvTitle {
  font-size: 15px;
  font-weight: 900;
  letter-spacing: 3px;
  text-transform: uppercase;
  background: linear-gradient(90deg, #00e5ff, #b450ff);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.rvHeaderMeta {
  font-size: 11px;
  letter-spacing: 1.5px;
  opacity: .45;
  text-transform: uppercase;
}
.rvVs   { opacity: .5; margin: 0 4px; }
.rvDot  { opacity: .35; margin: 0 4px; }

.rvClose {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.55);
  font-size: 14px;
  cursor: pointer;
  transition: background .15s, color .15s;
}
.rvClose:hover { background: rgba(255,255,255,0.12); color: #fff; }

/* ── Body layout ───────────────────────────── */
.rvBody {
  display: flex;
  flex: 1;
  min-height: 0;
  gap: 0;
}

/* ── Move List panel ───────────────────────── */
.rvMovePanel {
  width: 200px;
  min-width: 200px;
  border-right: 1px solid rgba(255,255,255,0.07);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.rvSection {
  padding: 10px 12px;
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.rvSectionLabel {
  font-size: 9px;
  letter-spacing: 2.5px;
  font-weight: 900;
  text-transform: uppercase;
  opacity: .35;
  margin-bottom: 8px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.rvMoveCount { font-weight: 400; letter-spacing: 1px; }

/* Draft picks */
.rvDraftRow {
  display: flex;
  gap: 0;
}
.rvPickCol {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}
.rvPickDivider {
  width: 1px;
  background: rgba(255,255,255,0.08);
  margin: 0 6px;
  align-self: stretch;
}
.rvPickHeader {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 2px;
  opacity: .5;
  text-transform: uppercase;
}
.rvPickHeader.p1 { color: #4ec9ff; opacity: .7; }
.rvPickHeader.p2 { color: #ff6b6b; opacity: .7; }
.rvPicks {
  display: flex;
  flex-wrap: wrap;
  gap: 3px;
}
.rvPip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  font-size: 8px;
  font-weight: 900;
  color: rgba(0,0,0,0.65);
  letter-spacing: 0;
}

/* Move list */
.rvMoveList {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 8px 0;
  border-bottom: none;
}
.rvMoveList::-webkit-scrollbar { width: 3px; }
.rvMoveList::-webkit-scrollbar-track { background: transparent; }
.rvMoveList::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

.rvMoveRow {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 6px 12px;
  cursor: pointer;
  transition: background .1s;
  border-left: 2px solid transparent;
  font-size: 11px;
}
.rvMoveRow:hover { background: rgba(255,255,255,0.05); }
.rvMoveRow.active {
  background: rgba(255,255,255,0.09);
  border-left-color: rgba(255,255,255,0.5);
}
.rvMoveRow.past { opacity: .55; }
.rvMoveRow.p1.active { border-left-color: #4ec9ff; }
.rvMoveRow.p2.active { border-left-color: #ff6b6b; }

.rvMoveNum {
  width: 18px;
  text-align: right;
  font-size: 9px;
  opacity: .35;
  flex-shrink: 0;
}
.rvMovePip {
  width: 9px;
  height: 9px;
  border-radius: 3px;
  flex-shrink: 0;
}
.rvMovePlayer {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 1px;
  opacity: .5;
  flex-shrink: 0;
}
.rvMovePiece {
  font-weight: 900;
  letter-spacing: 1px;
  flex: 1;
  color: rgba(255,255,255,0.85);
}
.rvMoveTs {
  font-size: 9px;
  opacity: .3;
  letter-spacing: .5px;
  flex-shrink: 0;
}

.rvMoveTerminal {
  opacity: .5 !important;
  cursor: default;
  border-left-color: transparent !important;
}
.rvTerminalLabel {
  font-size: 9px;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  opacity: .6;
}

/* ── Board column ──────────────────────────── */
.rvBoardCol {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 12px 16px 8px;
  position: relative;
}

/* Result banner */
.rvResult {
  text-align: center;
  margin-bottom: 10px;
  flex-shrink: 0;
}
.rvResultIn-enter-active { animation: rvResultPop .3s cubic-bezier(.22,1,.36,1); }
@keyframes rvResultPop {
  from { opacity: 0; transform: scale(0.85) translateY(-8px); }
  to   { opacity: 1; transform: scale(1)    translateY(0); }
}
.rvResultBadge {
  display: inline-block;
  padding: 4px 16px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 900;
  letter-spacing: 3px;
  text-transform: uppercase;
}
.rvResultBadge.p1win { background: rgba(61,255,160,0.18); color: #3dffa0; border: 1px solid rgba(61,255,160,0.30); }
.rvResultBadge.p2win { background: rgba(255,95,95,0.18);  color: #ff6b6b; border: 1px solid rgba(255,95,95,0.30); }
.rvResultBadge.draw  { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.6); border: 1px solid rgba(255,255,255,0.15); }
.rvResultSub {
  font-size: 10px;
  letter-spacing: 1.5px;
  opacity: .4;
  text-transform: uppercase;
  margin-top: 2px;
}

/* Board wrap */
.rvBoardWrap {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 0;
}
.rvBoardSizer {
  position: relative;
  flex-shrink: 0;
}

/* Neon frame (matches Board.vue) */
.rvNeonFrame {
  position: absolute;
  inset: -8px;
  border-radius: 20px;
  background:
    linear-gradient(#0000, #0000) padding-box,
    conic-gradient(
      from 180deg,
      rgba(0,255,255,0.50),
      rgba(255,0,255,0.50),
      rgba(255,255,0,0.40),
      rgba(0,255,160,0.45),
      rgba(0,255,255,0.50)
    ) border-box;
  border: 2px solid transparent;
  box-shadow:
    0 0 18px rgba(0,255,255,0.14),
    0 0 30px rgba(255,0,255,0.12);
  pointer-events: none;
  z-index: 0;
}
.rvScanlines {
  position: absolute;
  inset: 0;
  border-radius: 14px;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255,255,255,0.03),
    rgba(255,255,255,0.03) 1px,
    transparent 5px,
    transparent 9px
  );
  opacity: .12;
  mix-blend-mode: overlay;
  pointer-events: none;
  z-index: 1;
}

/* Board grid */
.rvBoard {
  position: relative;
  z-index: 2;
  width: 100%;
  height: 100%;
  display: grid;
  gap: 3px;
  padding: 8px;
  border-radius: 14px;
  background:
    radial-gradient(900px 360px at 50% 30%, rgba(0,255,255,0.06), transparent 55%),
    radial-gradient(900px 420px at 40% 85%, rgba(255,0,255,0.05), transparent 58%),
    linear-gradient(180deg, rgba(12,14,24,0.97), rgba(6,7,12,0.98));
  border: 1px solid rgba(255,255,255,0.09);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),
    inset 0 -16px 36px rgba(0,0,0,0.50);
}

/* Cells */
.rvCell {
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
  transition: background .18s, border-color .18s, box-shadow .18s, transform .12s;
}
.rvCell.placed {
  border-color: rgba(255,255,255,0.18);
  box-shadow:
    0 6px 14px rgba(0,0,0,0.42),
    inset 0 1px 0 rgba(255,255,255,0.22),
    inset 0 -4px 0 rgba(0,0,0,0.28);
}
.rvCell.highlight {
  box-shadow:
    0 0 0 2px rgba(255,255,255,0.85),
    0 6px 18px rgba(0,0,0,0.5),
    inset 0 1px 0 rgba(255,255,255,0.30);
  z-index: 2;
  transform: translateY(-1px);
  filter: brightness(1.15);
}

/* Step strip */
.rvStepStrip {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 0 2px;
  flex-shrink: 0;
}
.rvStepPhase {
  font-size: 9px;
  letter-spacing: 2px;
  font-weight: 900;
  opacity: .45;
  text-transform: uppercase;
  min-width: 110px;
}
.rvProgressBar {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: rgba(255,255,255,0.10);
  overflow: hidden;
}
.rvProgressFill {
  height: 100%;
  border-radius: 2px;
  background: linear-gradient(90deg, #00e5ff, #b450ff);
  transition: width .2s ease;
}
.rvStepCounter {
  font-size: 10px;
  letter-spacing: 1.5px;
  opacity: .4;
  min-width: 50px;
  text-align: right;
}

/* ── Controls bar ──────────────────────────── */
.rvControls {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 20px 14px;
  border-top: 1px solid rgba(255,255,255,0.07);
  flex-shrink: 0;
}
.rvControlsLeft, .rvControlsCenter, .rvControlsRight {
  display: flex;
  align-items: center;
  gap: 4px;
}
.rvControlsRight {
  font-size: 9px;
  letter-spacing: 1.5px;
  opacity: .25;
  text-transform: uppercase;
}

.rvBtn {
  width: 36px;
  height: 36px;
  border-radius: 9px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.04);
  color: rgba(255,255,255,0.70);
  font-size: 14px;
  cursor: pointer;
  transition: background .12s, border-color .12s, color .12s, transform .1s;
  display: flex;
  align-items: center;
  justify-content: center;
}
.rvBtn:hover:not(:disabled) {
  background: rgba(255,255,255,0.10);
  border-color: rgba(255,255,255,0.22);
  color: #fff;
  transform: translateY(-1px);
}
.rvBtn:active:not(:disabled) { transform: translateY(0); }
.rvBtn:disabled { opacity: .25; cursor: default; }

.rvPlayBtn {
  width: 44px;
  height: 44px;
  font-size: 16px;
  background: rgba(255,255,255,0.08);
  border-color: rgba(255,255,255,0.18);
  color: #fff;
}
.rvPlayBtn:hover:not(:disabled) {
  background: rgba(255,255,255,0.15);
  border-color: rgba(255,255,255,0.30);
}

.rvSpeedLabel {
  font-size: 8px;
  letter-spacing: 2px;
  opacity: .35;
  margin-right: 2px;
  text-transform: uppercase;
}
.rvSpeedBtn {
  padding: 5px 9px;
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.03);
  color: rgba(255,255,255,0.45);
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 1px;
  cursor: pointer;
  transition: background .12s, border-color .12s, color .12s;
}
.rvSpeedBtn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.80); }
.rvSpeedBtn.active {
  background: rgba(255,255,255,0.12);
  border-color: rgba(255,255,255,0.28);
  color: #fff;
}

/* ── Mobile ────────────────────────────────── */
@media (max-width: 640px) {
  .rvMovePanel { width: 100%; min-width: unset; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.07); max-height: 140px; }
  .rvMoveList  { flex-direction: row; overflow-x: auto; overflow-y: hidden; display: flex; gap: 0; flex-wrap: nowrap; padding: 4px 0; }
  .rvMoveRow   { flex-direction: column; padding: 6px 8px; min-width: 48px; }
  .rvMoveTs    { display: none; }
  .rvBody      { flex-direction: column; }
  .rvDraftRow  { gap: 4px; }
  .rvControlsRight { display: none; }
}
</style>
