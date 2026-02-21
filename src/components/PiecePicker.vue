<template>
  <div class="pickerWrap">
    <div class="cols">
      <!-- Player 1 column -->
      <section class="col" :class="{ active: game.currentPlayer === 1 && game.phase === 'place' }">
        <div class="colHead p1">
          <span>PLAYER 1</span>
          <span class="count">{{ game.remaining[1].length }}</span>

          <!-- ✅ battle tray anchor -->
          <span class="trayAnchor" data-tray="1" data-tray-context="battle" aria-hidden="true"></span>
        </div>

        <div class="grid">
          <button
            v-for="k in game.remaining[1]"
            :key="'p1-' + k"
            class="chip"
            :class="chipClass(1, k)"
            :disabled="!canSelect(1)"
            @click="onPick(1, k)"
            :title="canSelect(1) ? 'Select' : 'Enemy piece (visible only)'"
          >
            <PiecePreview :pieceKey="k" :cell="10" />
            <span class="chipLabel">{{ k }}</span>
          </button>

          <div v-if="game.remaining[1].length === 0" class="emptyNote">No pieces left.</div>
        </div>
      </section>

      <!-- Player 2 column -->
      <section class="col" :class="{ active: game.currentPlayer === 2 && game.phase === 'place' }">
        <div class="colHead p2">
          <span>PLAYER 2</span>
          <span class="count">{{ game.remaining[2].length }}</span>

          <!-- ✅ battle tray anchor -->
          <span class="trayAnchor" data-tray="2" data-tray-context="battle" aria-hidden="true"></span>
        </div>

        <div class="grid">
          <button
            v-for="k in game.remaining[2]"
            :key="'p2-' + k"
            class="chip"
            :class="chipClass(2, k)"
            :disabled="!canSelect(2)"
            @click="onPick(2, k)"
            :title="canSelect(2) ? 'Select' : 'Enemy piece (visible only)'"
          >
            <PiecePreview :pieceKey="k" :cell="10" />
            <span class="chipLabel">{{ k }}</span>
          </button>

          <div v-if="game.remaining[2].length === 0" class="emptyNote">No pieces left.</div>
        </div>
      </section>
    </div>

    <div class="selectedRow" v-if="game.phase === 'place'">
      <span class="muted">Selected:</span>
      <b class="sel">{{ game.selectedPieceKey ?? "None" }}</b>
    </div>
  </div>
</template>

<script setup>
import { useGameStore } from "../store/game";
import PiecePreview from "./PiecePreview.vue";

const game = useGameStore();

function canSelect(player) {
  return game.phase === "place" && game.currentPlayer === player;
}

function onPick(player, key) {
  if (!canSelect(player)) return;
  game.selectPiece(key);
}

function chipClass(player, key) {
  const isMine = canSelect(player);
  const isSelected = game.selectedPieceKey === key && game.currentPlayer === player;
  return {
    mine: isMine,
    enemy: !isMine,
    selected: isSelected,
    p1: player === 1,
    p2: player === 2,
  };
}
</script>

<style scoped>
.pickerWrap {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.col {
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  padding: 10px;
  overflow: hidden;
}

.col.active {
  border-color: rgba(255,255,255,0.16);
  box-shadow: 0 0 0 1px rgba(0,255,255,0.06), 0 18px 34px rgba(0,0,0,0.35);
}

.colHead {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-weight: 1000;
  font-size: 12px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  opacity: 0.95;
  margin-bottom: 10px;
  gap: 10px;
}

.colHead.p1 { color: rgba(78, 201, 255, 0.98); }
.colHead.p2 { color: rgba(255, 107, 107, 0.98); }

.count {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.12);
  background: rgba(255,255,255,0.06);
  letter-spacing: 0.06em;
}

.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  min-height: 56px;
}

.chip {
  display: grid;
  place-items: center;
  gap: 4px;
  padding: 8px;
  border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(10,10,14,0.45);
  cursor: pointer;
  transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease, opacity 120ms ease;
}

.chip:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow: 0 12px 22px rgba(0,0,0,0.35);
}

.chipLabel {
  font-size: 11px;
  font-weight: 900;
  opacity: 0.85;
  letter-spacing: 0.08em;
}

.chip.mine { opacity: 1; }
.chip.enemy {
  opacity: 0.55;
  cursor: default;
  filter: grayscale(0.25) saturate(0.8);
}
.chip:disabled { pointer-events: none; }

.chip.selected {
  outline: 2px solid rgba(0,255,170,0.55);
  box-shadow: 0 0 18px rgba(0,255,170,0.10);
}

.emptyNote {
  opacity: 0.6;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px dashed rgba(255,255,255,0.12);
  border-radius: 10px;
}

.selectedRow {
  display: flex;
  align-items: center;
  gap: 8px;
  opacity: 0.9;
}
.muted { opacity: 0.7; }
.sel { letter-spacing: 0.06em; }

/* invisible but real target rect for animation */
.trayAnchor {
  width: 16px;
  height: 16px;
  border-radius: 8px;
  opacity: 0;
  pointer-events: none;
  flex: 0 0 auto;
}
</style>