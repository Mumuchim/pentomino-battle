<template>
  <div class="picker">
    <div class="draftRow">
      <!-- PLAYER 1 -->
      <div class="draftCol" :class="{ active: canSelect(1) }">
        <div class="draftHead p1">
          <span class="headLeft">Player 1 Pieces</span>
          <span class="count">{{ game.remaining[1].length }}</span>

          <!-- battle tray anchor -->
          <span
            class="trayAnchor"
            data-tray="1"
            data-tray-context="battle"
            aria-hidden="true"
          ></span>
        </div>

        <div class="chips big">
          <button
            v-for="k in game.remaining[1]"
            :key="'p1-' + k"
            class="chipBtn"
            :class="btnClass(1, k)"
            :disabled="!canSelect(1)"
            @click="onPick(1, k)"
            :title="canSelect(1) ? 'Select piece' : 'Enemy piece (visible only)'"
          >
            <PiecePreview :pieceKey="k" :cell="20" />
          </button>

          <div v-if="game.remaining[1].length === 0" class="emptyNote">
            No pieces left
          </div>
        </div>
      </div>

      <!-- PLAYER 2 -->
      <div class="draftCol" :class="{ active: canSelect(2) }">
        <div class="draftHead p2">
          <span class="headLeft">Player 2 Pieces</span>
          <span class="count">{{ game.remaining[2].length }}</span>

          <!-- battle tray anchor -->
          <span
            class="trayAnchor"
            data-tray="2"
            data-tray-context="battle"
            aria-hidden="true"
          ></span>
        </div>

        <div class="chips big">
          <button
            v-for="k in game.remaining[2]"
            :key="'p2-' + k"
            class="chipBtn"
            :class="btnClass(2, k)"
            :disabled="!canSelect(2)"
            @click="onPick(2, k)"
            :title="canSelect(2) ? 'Select piece' : 'Enemy piece (visible only)'"
          >
            <PiecePreview :pieceKey="k" :cell="20" />
          </button>

          <div v-if="game.remaining[2].length === 0" class="emptyNote">
            No pieces left
          </div>
        </div>
      </div>
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

function btnClass(player, key) {
  const mine = canSelect(player);
  const selected = mine && game.selectedPieceKey === key;
  return {
    mine,
    enemy: !mine,
    selected,
  };
}
</script>

<style scoped>
/* ✅ Match DraftPanel style: NO inner container boxes */
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

/* same structure names as DraftPanel */
.draftRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

/* DraftPanel has no border/background here — we keep it clean */
.draftCol {
  min-width: 0;
}

/* Active player subtle emphasis (without adding a full container card) */
.draftCol.active .draftHead {
  filter: brightness(1.08);
}
.draftCol.active .draftHead::after {
  content: "";
  position: absolute;
  left: 0;
  right: 0;
  bottom: -8px;
  height: 2px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.12);
  box-shadow: 0 0 18px rgba(0, 255, 255, 0.08);
}

.draftHead {
  position: relative;
  font-weight: 1000;
  margin-bottom: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 13px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.headLeft {
  min-width: 0;
}

.draftHead.p1 {
  color: rgba(78, 201, 255, 0.98);
}
.draftHead.p2 {
  color: rgba(255, 107, 107, 0.98);
}

.count {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  letter-spacing: 0.06em;
  flex: 0 0 auto;
}

/* 🔥 BIG tray layout (same as DraftPanel) */
.chips.big {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 64px;
}

/* button wrapper (still clean, no box UI) */
.chipBtn {
  padding: 0;
  border: 0;
  background: transparent;
  border-radius: 14px;
  cursor: pointer;
  transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease,
    opacity 120ms ease;
}

.chipBtn:hover {
  transform: translateY(-1px);
  filter: brightness(1.06);
}

/* selected glow */
.chipBtn.selected {
  outline: 2px solid rgba(0, 255, 170, 0.55);
  box-shadow: 0 0 18px rgba(0, 255, 170, 0.1);
}

/* enemy visible but locked */
.chipBtn.enemy {
  opacity: 0.55;
  filter: grayscale(0.25) saturate(0.8);
  cursor: default;
}
.chipBtn:disabled {
  pointer-events: none;
}

/* empty note (same as DraftPanel) */
.emptyNote {
  opacity: 0.6;
  font-size: 13px;
  padding: 8px 10px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 12px;
}

/* Animation target */
.trayAnchor {
  width: 18px;
  height: 18px;
  border-radius: 9px;
  opacity: 0;
  pointer-events: none;
  flex: 0 0 auto;
}
</style>