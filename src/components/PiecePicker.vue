<template>
  <div class="grid">
    <button
      v-for="k in mine"
      :key="k"
      class="pieceBtn"
      :class="{ selected: game.selectedPieceKey === k }"
      draggable="true"
      @dragstart="onDragStart($event, k)"
      @click="game.selectPiece(k)"
      title="Click to select. Drag to board to place."
    >
      <PiecePreview :pieceKey="k" :cell="12" />
    </button>

    <div v-if="!mine.length" class="muted">
      No pieces left.
    </div>
  </div>
</template>

<script setup>
import { computed } from "vue";
import { useGameStore } from "../store/game";
import PiecePreview from "./PiecePreview.vue";

const game = useGameStore();
const mine = computed(() => game.remaining[game.currentPlayer]);

function onDragStart(e, key) {
  game.selectPiece(key);
  // helps some browsers
  e.dataTransfer?.setData("text/plain", key);
  e.dataTransfer.effectAllowed = "copyMove";
}
</script>

<style scoped>
.grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.pieceBtn {
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 6px;
  cursor: grab;
}

.pieceBtn:active {
  cursor: grabbing;
}

.pieceBtn.selected {
  outline: 2px solid rgba(255,255,255,0.55);
}

.muted { opacity: 0.75; }
</style>