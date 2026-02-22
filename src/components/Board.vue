<template>
  <div class="boardWrap">
    <div
      class="boardShell"
      ref="shell"
      @mousemove="onPointerMove"
      @mouseleave="clearHover"
      @dragover.prevent="onDragOver"
      @drop.prevent="onShellDrop"
    >
      <div class="neonFrame" aria-hidden="true"></div>
      <div class="scanlines" aria-hidden="true"></div>

      <div class="board" :style="gridStyle" :class="{ draftMode: game.phase === 'draft' }">
        <button
          v-for="cell in flat"
          :key="cell.key"
          class="cell"
          :class="cellClass(cell)"
          :style="cellInlineStyle(cell)"
          @mouseenter="setHover(cell.x, cell.y)"
          @click="onCellClick(cell.x, cell.y, $event)"
          @dragenter.prevent="setHover(cell.x, cell.y)"
          @drop.prevent="onDrop(cell.x, cell.y)"
          :title="cellTitle(cell)"
        >
          <span
            v-if="game.phase === 'draft' && cell.v?.draftedBy"
            class="cornerTag"
            :class="cell.v.draftedBy === 1 ? 'p1' : 'p2'"
            aria-hidden="true"
          >
            P{{ cell.v.draftedBy }}
          </span>
        </button>
      </div>

      <div
        v-if="ghostOverlay.visible"
        class="ghostOverlay"
        :class="{ ok: ghostOverlay.ok, bad: !ghostOverlay.ok }"
        aria-hidden="true"
      >
        <div
          v-for="(b, i) in ghostOverlay.blocks"
          :key="i"
          class="ghostBlock"
          :style="ghostBlockStyle(b)"
        />
      </div>
    </div>

    <div class="legend">
      <span class="legendItem"><span class="swatch ok"></span> OK</span>
      <span class="legendItem"><span class="swatch bad"></span> BAD</span>

      <span v-if="game.phase === 'draft'" class="legendItem muted">
        Click a piece to draft — it’ll fly to the player tray.
      </span>
      <span v-else class="legendItem muted">
        Drop or click. (Q rotate, E flip)
      </span>
    </div>

    <div v-if="warningMessage" class="warning" role="status" aria-live="polite">
      <span class="warnIcon" aria-hidden="true">⚠</span>
      <span class="warnText">{{ warningMessage }}</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useGameStore } from "../store/game";
import { getPieceStyle } from "../lib/pieceStyles";
import { playBuzz } from "../lib/sfx";
import { PENTOMINOES } from "../lib/pentominoes";

const props = defineProps({
  isOnline: { type: Boolean, default: false },
  myPlayer: { type: [Number, null], default: null },
  canAct: { type: Boolean, default: true },
});

const game = useGameStore();
const shell = ref(null);
const hover = ref(null);

const BOARD_PADDING = 10;

const warningMessage = ref("");
let warnTimer = null;
function showWarning(msg) {
  warningMessage.value = msg;
  if (warnTimer) clearTimeout(warnTimer);
  warnTimer = setTimeout(() => {
    warningMessage.value = "";
    warnTimer = null;
  }, 1400);
}

const activeBoard = computed(() => (game.phase === "draft" ? game.draftBoard : game.board));

const flat = computed(() => {
  const out = [];
  for (let y = 0; y < game.boardH; y++) {
    for (let x = 0; x < game.boardW; x++) {
      const v = activeBoard.value[y][x];
      out.push({ x, y, v, key: `${x},${y}` });
    }
  }
  return out;
});

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${game.boardW}, 1fr)`,
  gridTemplateRows: `repeat(${game.boardH}, 1fr)`,
}));

/* ---------------------------
   PLACE phase ghost preview
---------------------------- */
const ghost = computed(() => {
  if (!hover.value) return { map: new Set(), ok: false };
  if (game.phase !== "place") return { map: new Set(), ok: false };
  if (!game.selectedPieceKey) return { map: new Set(), ok: false };

  const ok = game.canPlaceAt(hover.value.x, hover.value.y);
  const set = new Set();

  for (const [dx, dy] of game.selectedCells) {
    const x = hover.value.x + dx;
    const y = hover.value.y + dy;
    if (x >= 0 && y >= 0 && x < game.boardW && y < game.boardH) {
      set.add(`${x},${y}`);
    }
  }
  return { map: set, ok };
});

const ghostOverlay = computed(() => {
  if (!hover.value) return { visible: false };
  if (game.phase !== "place") return { visible: false };
  if (!game.selectedPieceKey) return { visible: false };

  const ok = game.canPlaceAt(hover.value.x, hover.value.y);
  const blocks = game.selectedCells.map(([dx, dy]) => ({
    x: hover.value.x + dx,
    y: hover.value.y + dy,
  }));

  return { visible: true, ok, blocks };
});

function setHover(x, y) {
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;
  hover.value = { x, y };
}

function clearHover() {
  hover.value = null;
}

function updateHoverFromClientXY(clientX, clientY) {
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;

  const el = shell.value;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const innerLeft = rect.left + BOARD_PADDING;
  const innerTop = rect.top + BOARD_PADDING;
  const innerW = rect.width - BOARD_PADDING * 2;
  const innerH = rect.height - BOARD_PADDING * 2;

  if (
    clientX < innerLeft ||
    clientY < innerTop ||
    clientX >= innerLeft + innerW ||
    clientY >= innerTop + innerH
  ) {
    hover.value = null;
    return;
  }

  const cellW = innerW / game.boardW;
  const cellH = innerH / game.boardH;

  let x = Math.floor((clientX - innerLeft) / cellW);
  let y = Math.floor((clientY - innerTop) / cellH);

  x = Math.max(0, Math.min(game.boardW - 1, x));
  y = Math.max(0, Math.min(game.boardH - 1, y));

  hover.value = { x, y };
}

function onPointerMove(e) {
  updateHoverFromClientXY(e.clientX, e.clientY);
}
function onDragOver(e) {
  updateHoverFromClientXY(e.clientX, e.clientY);
}

function onShellDrop() {
  if (!hover.value) return;
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;
  if (props.isOnline && !props.canAct) return;

  const ok = game.placeAt(hover.value.x, hover.value.y);
  if (!ok) {
    playBuzz();
    showWarning("Illegal placement — try another spot / rotate / flip.");
  }
}

function onDrop(x, y) {
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;
  if (props.isOnline && !props.canAct) return;

  const ok = game.placeAt(x, y);
  if (!ok) {
    playBuzz();
    showWarning("Illegal placement — try another spot / rotate / flip.");
  }
}

/* ---------------------------
   ✅ Floating clone animation
---------------------------- */
function getTrayAnchor(player) {
  const draft = document.querySelector(`[data-tray="${player}"][data-tray-context="draft"]`);
  if (draft) return draft;

  const battle = document.querySelector(`[data-tray="${player}"][data-tray-context="battle"]`);
  if (battle) return battle;

  return null;
}

function spawnFlyClone(pieceKey, player, fromEl) {
  const tray = getTrayAnchor(player);
  if (!tray || !fromEl) return;

  const from = fromEl.getBoundingClientRect();
  const to = tray.getBoundingClientRect();

  const shape = PENTOMINOES[pieceKey];
  const s = getPieceStyle(pieceKey);

  const node = document.createElement("div");
  node.className = `flyClone ${player === 1 ? "p1" : "p2"}`;
  node.style.position = "fixed";
  node.style.left = `${from.left}px`;
  node.style.top = `${from.top}px`;
  node.style.pointerEvents = "none";
  node.style.zIndex = "999999";
  node.style.display = "grid";
  node.style.transformOrigin = "center center";

  let maxX = 0, maxY = 0;
  for (const [x, y] of shape) {
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const cell = Math.min(from.width, from.height) * 0.5;

  node.style.gridTemplateColumns = `repeat(${maxX + 1}, ${cell}px)`;
  node.style.gridTemplateRows = `repeat(${maxY + 1}, ${cell}px)`;

  for (const [x, y] of shape) {
    const block = document.createElement("div");
    block.style.width = `${cell}px`;
    block.style.height = `${cell}px`;
    block.style.borderRadius = "6px";
    block.style.border = "1px solid rgba(255,255,255,0.2)";
    block.style.boxShadow =
      "0 6px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)";

    if (s.skin) {
      block.style.backgroundImage = `url(${s.skin})`;
      block.style.backgroundSize = "cover";
    } else {
      block.style.background = s.color || "#fff";
    }

    block.style.gridColumn = x + 1;
    block.style.gridRow = y + 1;

    node.appendChild(block);
  }

  document.body.appendChild(node);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  node.animate(
    [
      { transform: "translate(0px,0px) scale(1)", opacity: 1 },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.35)`,
        opacity: 0.95,
      },
    ],
    {
      duration: 520,
      easing: "cubic-bezier(.18,.9,.18,1)",
      fill: "forwards",
    }
  );

  setTimeout(() => {
    node.animate(
      [
        { filter: "brightness(1.2)", opacity: 0.9 },
        { filter: "brightness(1.6)", opacity: 0 },
      ],
      { duration: 180, easing: "ease-out", fill: "forwards" }
    );
  }, 470);

  setTimeout(() => node.remove(), 700);
}

/** ✅ CLICK does two different things depending on phase */
function onCellClick(x, y, evt) {
  if (game.phase === "draft") {
    // online gate: only your draft turn can click
    if (props.isOnline && !props.canAct) return;

    const v = game.draftBoard[y][x];
    if (!v) return;
    if (v.draftedBy) return;

    const fromEl = evt?.currentTarget;
    spawnFlyClone(v.pieceKey, game.draftTurn, fromEl);

    game.draftPick(v.pieceKey);
    return;
  }

  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;
  if (props.isOnline && !props.canAct) return;

  const ok = game.placeAt(x, y);
  if (!ok) {
    playBuzz();
    showWarning("Illegal placement — try another spot / rotate / flip.");
  }
}

function cellClass(cell) {
  if (game.phase === "draft") {
    const drafted = !!cell.v?.draftedBy;
    return {
      empty: cell.v === null,
      draft: cell.v !== null,
      drafted,
      "drafted-p1": drafted && cell.v.draftedBy === 1,
      "drafted-p2": drafted && cell.v.draftedBy === 2,
    };
  }

  const isGhost = ghost.value.map?.has(cell.key);
  return {
    empty: cell.v === null,
    placed: cell.v !== null,
    "ghost-ok": isGhost && ghost.value.ok,
    "ghost-bad": isGhost && !ghost.value.ok,
  };
}

function cellInlineStyle(cell) {
  if (game.phase === "draft") {
    if (!cell.v?.pieceKey) return null;

    const s = getPieceStyle(cell.v.pieceKey);
    if (s.skin) {
      return {
        backgroundImage: `url(${s.skin})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: cell.v.draftedBy
          ? "brightness(0.55) saturate(0.65)"
          : "brightness(0.92) saturate(1.05)",
      };
    }
    return { backgroundColor: s.color };
  }

  if (cell.v && cell.v.pieceKey) {
    const s = getPieceStyle(cell.v.pieceKey);
    if (s.skin) {
      return {
        backgroundImage: `url(${s.skin})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    }
    return { backgroundColor: s.color };
  }
  return null;
}

function cellTitle(cell) {
  if (game.phase === "draft") {
    if (!cell.v) return `(${cell.x},${cell.y}) empty`;
    if (cell.v.draftedBy) return `Drafted by P${cell.v.draftedBy}: ${cell.v.pieceKey}`;
    return `Draft piece: ${cell.v.pieceKey}`;
  }
  if (!cell.v) return `(${cell.x},${cell.y}) empty`;
  return `(${cell.x},${cell.y}) P${cell.v.player} ${cell.v.pieceKey}`;
}

function ghostBlockStyle(b) {
  const s = getPieceStyle(game.selectedPieceKey);

  const leftPct = (b.x / game.boardW) * 100;
  const topPct = (b.y / game.boardH) * 100;
  const wPct = (1 / game.boardW) * 100;
  const hPct = (1 / game.boardH) * 100;

  const base = {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    width: `${wPct}%`,
    height: `${hPct}%`,
    transition: "left 55ms linear, top 55ms linear",
  };

  if (s.skin) {
    return {
      ...base,
      backgroundImage: `url(${s.skin})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }
  return { ...base, backgroundColor: s.color };
}
</script>

<style scoped>
/* board styles (same as your last version) */
.boardWrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
  align-items: flex-start;
}

.boardShell {
  position: relative;
  width: min(720px, 92vw);
  border-radius: 18px;
}

.neonFrame {
  position: absolute;
  inset: -10px;
  border-radius: 22px;
  background:
    linear-gradient(#0000, #0000) padding-box,
    conic-gradient(
      from 180deg,
      rgba(0,255,255,0.65),
      rgba(255,0,255,0.65),
      rgba(255,255,0,0.55),
      rgba(0,255,160,0.60),
      rgba(0,255,255,0.65)
    ) border-box;
  border: 2px solid transparent;
  box-shadow:
    0 0 22px rgba(0, 255, 255, 0.18),
    0 0 38px rgba(255, 0, 255, 0.16),
    0 0 52px rgba(255, 255, 0, 0.10),
    0 16px 50px rgba(0,0,0,0.65);
  filter: saturate(1.15);
  opacity: 0.92;
  animation: neonPulse 3.2s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}
@keyframes neonPulse {
  0%, 100% { transform: translateY(0); filter: saturate(1.12); opacity: 0.88; }
  50% { transform: translateY(-1px); filter: saturate(1.25); opacity: 0.98; }
}

.scanlines {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255,255,255,0.03),
    rgba(255,255,255,0.03) 1px,
    rgba(0,0,0,0.00) 5px,
    rgba(0,0,0,0.00) 9px
  );
  opacity: 0.14;
  mix-blend-mode: overlay;
  pointer-events: none;
  z-index: 1;
}

.board {
  position: relative;
  z-index: 2;

  width: 100%;
  aspect-ratio: 10 / 6;
  display: grid;
  gap: 3px;
  padding: 10px;

  border-radius: 16px;

  background:
    radial-gradient(900px 360px at 50% 30%, rgba(0,255,255,0.08), rgba(0,0,0,0) 55%),
    radial-gradient(900px 420px at 40% 85%, rgba(255,0,255,0.07), rgba(0,0,0,0) 58%),
    linear-gradient(180deg, rgba(12,14,24,0.95), rgba(6,7,12,0.96));

  border: 1px solid rgba(255,255,255,0.10);

  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    inset 0 -18px 40px rgba(0,0,0,0.55),
    inset 0 0 0 1px rgba(0,255,255,0.07);
}

.cell {
  position: relative;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.07);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.02));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),
    inset 0 -2px 0 rgba(0,0,0,0.25);
  transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease;
}

.cell:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow:
    0 6px 14px rgba(0,0,0,0.40),
    inset 0 1px 0 rgba(255,255,255,0.14),
    inset 0 -2px 0 rgba(0,0,0,0.25);
}

.cell.placed {
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow:
    0 10px 18px rgba(0,0,0,0.45),
    0 0 10px rgba(255,255,255,0.06),
    inset 0 1px 0 rgba(255,255,255,0.22),
    inset 0 -4px 0 rgba(0,0,0,0.30);
}

.cell.ghost-ok { outline: 2px solid rgba(0,255,170,0.85); }
.cell.ghost-bad { outline: 2px solid rgba(255,80,120,0.85); }

.board.draftMode .cell { cursor: pointer; }

.cell.draft {
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.20),
    inset 0 -6px 10px rgba(0,0,0,0.35);
}

/* Drafted pieces: dim + locked */
.cell.drafted {
  cursor: default;
  transform: none !important;
  filter: brightness(0.82) saturate(0.8);
  opacity: 0.95;
}
.cell.drafted:hover {
  transform: none !important;
  filter: brightness(0.80) saturate(0.8);
}

/* Corner P1/P2 */
.cornerTag {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 10px;
  font-weight: 1000;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(10,10,14,0.65);
  box-shadow: 0 8px 14px rgba(0,0,0,0.35);
  pointer-events: none;
  z-index: 2;
}
.cornerTag.p1 { color: rgba(78, 201, 255, 0.98); }
.cornerTag.p2 { color: rgba(255, 107, 107, 0.98); }

.ghostOverlay {
  position: absolute;
  inset: 10px;
  border-radius: 12px;
  pointer-events: none;
  z-index: 999;
  filter:
    drop-shadow(0 18px 32px rgba(0,0,0,0.60))
    drop-shadow(0 0 12px rgba(0,255,255,0.10));
}
.ghostOverlay.bad { opacity: 0.78; }

.ghostBlock {
  position: absolute;
  border-radius: 9px;
  border: 1px solid rgba(0,0,0,0.55);
  box-shadow:
    0 14px 22px rgba(0,0,0,0.50),
    0 0 14px rgba(255,255,255,0.07),
    inset 0 1px 0 rgba(255,255,255,0.26),
    inset 0 -6px 0 rgba(0,0,0,0.34);
  overflow: hidden;
}
.ghostBlock::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.26),
    rgba(255,255,255,0.08) 35%,
    rgba(0,0,0,0.12)
  );
}

.legend {
  margin-top: 14px;
  display: flex;
  gap: 14px;
  opacity: 0.92;
  font-size: 13px;
  flex-wrap: wrap;
}
.legendItem { display: flex; align-items: center; gap: 8px; }
.muted { opacity: 0.7; }
.swatch {
  width: 14px; height: 14px; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.18);
}
.swatch.ok { background: rgba(0,255,170,0.60); }
.swatch.bad { background: rgba(255,80,120,0.60); }

.warning {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(10, 10, 14, 0.72);
  border: 1px solid rgba(255, 120, 150, 0.22);
  box-shadow:
    0 12px 26px rgba(0,0,0,0.55),
    0 0 16px rgba(255, 80, 120, 0.10);
  color: rgba(255, 160, 175, 0.95);
  font-weight: 900;
  letter-spacing: 0.02em;
  animation: warnPop 170ms ease;
}
.warnIcon {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(255, 80, 120, 0.14);
  border: 1px solid rgba(255, 80, 120, 0.22);
}
.warnText { font-size: 13px; opacity: 0.95; }
@keyframes warnPop {
  from { transform: translateY(-4px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
</style>

<style>
.flyClone { will-change: transform, opacity, filter; }
.flyClone.p1 { outline: 2px solid rgba(78, 201, 255, 0.25); }
.flyClone.p2 { outline: 2px solid rgba(255, 107, 107, 0.25); }
</style>