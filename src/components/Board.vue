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
      <!-- Neon frame + scanlines -->
      <div class="neonFrame" aria-hidden="true"></div>
      <div class="scanlines" aria-hidden="true"></div>

      <!-- GRID -->
      <div class="board" :style="gridStyle">
        <button
          v-for="cell in flat"
          :key="cell.key"
          class="cell"
          :class="cellClass(cell)"
          :style="cellInlineStyle(cell)"
          @mouseenter="setHover(cell.x, cell.y)"
          @click="onCellClick(cell.x, cell.y)"
          @dragenter.prevent="setHover(cell.x, cell.y)"
          @drop.prevent="onDrop(cell.x, cell.y)"
          :title="cellTitle(cell)"
        />
      </div>

      <!-- FLOATING DRAG GHOST -->
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
      <span class="legendItem muted">Neon arcade grid. Drop or click. (Q rotate, E flip)</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useGameStore } from "../store/game";
import { getPieceStyle } from "../lib/pieceStyles"; // if yours is piecesStyles.js, change path

const game = useGameStore();
const shell = ref(null);
const hover = ref(null);

const BOARD_PADDING = 10; // must match CSS .board padding (px)

const flat = computed(() => {
  const out = [];
  for (let y = 0; y < game.boardH; y++) {
    for (let x = 0; x < game.boardW; x++) {
      const v = game.board[y][x]; // null or {player,pieceKey}
      out.push({ x, y, v, key: `${x},${y}` });
    }
  }
  return out;
});

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${game.boardW}, 1fr)`,
  gridTemplateRows: `repeat(${game.boardH}, 1fr)`,
}));

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

  if (clientX < innerLeft || clientY < innerTop || clientX >= innerLeft + innerW || clientY >= innerTop + innerH) {
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

  const ok = game.placeAt(hover.value.x, hover.value.y);
  if (!ok) alert("Illegal placement. Try another spot / rotation / flip.");
}

function onDrop(x, y) {
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;

  const ok = game.placeAt(x, y);
  if (!ok) alert("Illegal placement. Try another spot / rotation / flip.");
}

function onCellClick(x, y) {
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;

  const ok = game.placeAt(x, y);
  if (!ok) alert("Illegal placement. Try another spot / rotation / flip.");
}

function cellClass(cell) {
  const isGhost = ghost.value.map?.has(cell.key);
  return {
    empty: cell.v === null,
    placed: cell.v !== null,
    "ghost-ok": isGhost && ghost.value.ok,
    "ghost-bad": isGhost && !ghost.value.ok,
  };
}

function cellInlineStyle(cell) {
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
.boardWrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

/* Shell */
.boardShell {
  position: relative;
  width: min(720px, 92vw);
  border-radius: 18px;
}

/* ✅ Neon arcade frame */
.neonFrame {
  position: absolute;
  inset: -10px;
  border-radius: 22px;

  /* neon gradient ring */
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

  /* glow */
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

/* ✅ Scanlines (very subtle) */
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

/* Board grid background: "Tetris well" */
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

/* Cells: crisp grid */
.cell {
  border-radius: 7px;
  cursor: pointer;

  /* grid line look */
  border: 1px solid rgba(255,255,255,0.07);
  background:
    linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.02));

  /* subtle depth */
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

/* Placed pieces: neon-ish shine */
.cell.placed {
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow:
    0 10px 18px rgba(0,0,0,0.45),
    0 0 10px rgba(255,255,255,0.06),
    inset 0 1px 0 rgba(255,255,255,0.22),
    inset 0 -4px 0 rgba(0,0,0,0.30);
}

/* Preview outlines */
.cell.ghost-ok { outline: 2px solid rgba(0,255,170,0.85); }
.cell.ghost-bad { outline: 2px solid rgba(255,80,120,0.85); }

/* Floating overlay */
.ghostOverlay {
  position: absolute;
  inset: 10px; /* match board padding */
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

  /* neon block depth */
  box-shadow:
    0 14px 22px rgba(0,0,0,0.50),
    0 0 14px rgba(255,255,255,0.07),
    inset 0 1px 0 rgba(255,255,255,0.26),
    inset 0 -6px 0 rgba(0,0,0,0.34);

  overflow: hidden;
}

/* glossy highlight */
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

/* legality outline (soft) */
.ghostOverlay.ok .ghostBlock { outline: 2px solid rgba(0,255,170,0.30); }
.ghostOverlay.bad .ghostBlock { outline: 2px solid rgba(255,80,120,0.30); }

/* Legend */
.legend {
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
</style>