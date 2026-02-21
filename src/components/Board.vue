<template>
  <div class="boardWrap">
    <div class="board" :style="gridStyle">
      <button
        v-for="cell in flat"
        :key="cell.key"
        class="cell"
        :class="cellClass(cell)"
        @mouseenter="setHover(cell.x, cell.y)"
        @mouseleave="clearHover"
        @click="onCellClick(cell.x, cell.y)"
        @dragover.prevent
        @dragenter.prevent="setHover(cell.x, cell.y)"
        @drop.prevent="onDrop(cell.x, cell.y)"
        :title="`(${cell.x},${cell.y})`"
      />
    </div>

    <div class="legend">
      <span class="legendItem"><span class="swatch p1"></span> Player 1</span>
      <span class="legendItem"><span class="swatch p2"></span> Player 2</span>
      <span class="legendItem"><span class="swatch ok"></span> Preview OK</span>
      <span class="legendItem"><span class="swatch bad"></span> Preview BAD</span>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useGameStore } from "../store/game";

const game = useGameStore();

const hover = ref(null); // {x,y} or null

const flat = computed(() => {
  const out = [];
  for (let y = 0; y < game.boardH; y++) {
    for (let x = 0; x < game.boardW; x++) {
      out.push({ x, y, v: game.board[y][x], key: `${x},${y}` });
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

  // show the 5 blocks even if illegal; only in-bounds get highlighted
  for (const [dx, dy] of game.selectedCells) {
    const x = hover.value.x + dx;
    const y = hover.value.y + dy;
    if (x >= 0 && y >= 0 && x < game.boardW && y < game.boardH) {
      set.add(`${x},${y}`);
    }
  }

  return { map: set, ok };
});

function setHover(x, y) {
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;
  hover.value = { x, y };
}
function clearHover() {
  hover.value = null;
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
  const key = cell.key;
  const isGhost = ghost.value.map.has(key);

  return {
    p1: cell.v === 1,
    p2: cell.v === 2,
    empty: cell.v === 0,
    "ghost-ok": isGhost && ghost.value.ok,
    "ghost-bad": isGhost && !ghost.value.ok,
  };
}
</script>

<style scoped>
.boardWrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
  align-items: flex-start;
}

/* 10×6 board looks better if not forced square */
.board {
  width: min(720px, 92vw);
  aspect-ratio: 10 / 6;
  display: grid;
  gap: 3px;
  padding: 10px;
  border-radius: 14px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
}

.cell {
  border: 1px solid rgba(255,255,255,0.06);
  background: rgba(255,255,255,0.03);
  border-radius: 6px;
  cursor: pointer;
}

.cell:hover { background: rgba(255,255,255,0.07); }

.cell.p1 { background: rgba(80,170,255,0.55); }
.cell.p2 { background: rgba(255,120,160,0.55); }

/* Drag preview */
.cell.ghost-ok { outline: 2px solid rgba(120,255,160,0.85); }
.cell.ghost-bad { outline: 2px solid rgba(255,120,120,0.85); }

.legend {
  display: flex;
  gap: 14px;
  opacity: 0.85;
  font-size: 13px;
  flex-wrap: wrap;
}

.legendItem { display: flex; align-items: center; gap: 8px; }

.swatch {
  width: 14px; height: 14px; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.15);
}
.swatch.p1 { background: rgba(80,170,255,0.55); }
.swatch.p2 { background: rgba(255,120,160,0.55); }
.swatch.ok { background: rgba(120,255,160,0.55); }
.swatch.bad { background: rgba(255,120,120,0.55); }
</style>