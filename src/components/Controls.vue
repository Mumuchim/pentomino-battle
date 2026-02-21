<template>
  <div class="controls">
    <div class="row">
      <div class="label">Selected:</div>
      <div class="value">
        <b>{{ game.selectedPieceKey || "None" }}</b>
      </div>
    </div>

    <div v-if="game.selectedPieceKey" class="previewRow">
      <PiecePreview
        :pieceKey="game.selectedPieceKey"
        :rotation="game.rotation"
        :flipped="game.flipped"
        :cell="16"
      />
    </div>

    <div class="row buttons">
      <button class="btn" :disabled="!game.selectedPieceKey" @click="game.rotateSelected()">
        Rotate (Q)
      </button>

      <button
        class="btn"
        :disabled="!game.selectedPieceKey || !game.allowFlip"
        @click="game.flipSelected()"
      >
        Flip (E)
      </button>

      <button class="btn" @click="toggleFlipAllowed">
        Allow Flip: <b>{{ game.allowFlip ? "ON" : "OFF" }}</b>
      </button>
    </div>

    <div class="muted small">
      Drag a piece onto the board to preview. Click a cell to place too.
    </div>
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount } from "vue";
import { useGameStore } from "../store/game";
import PiecePreview from "./PiecePreview.vue";

const game = useGameStore();

function toggleFlipAllowed() {
  game.allowFlip = !game.allowFlip;
  // If flip gets disabled, force unflipped
  if (!game.allowFlip) game.flipped = false;
}

function onKeyDown(e) {
  // Don't hijack keys when typing
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;

  const k = e.key?.toLowerCase();
  if (k === "q") {
    e.preventDefault();
    game.rotateSelected();
  }
  if (k === "e") {
    e.preventDefault();
    game.flipSelected();
  }
}

onMounted(() => window.addEventListener("keydown", onKeyDown));
onBeforeUnmount(() => window.removeEventListener("keydown", onKeyDown));
</script>

<style scoped>
.controls .row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin: 8px 0;
}

.label { width: 86px; opacity: 0.75; }
.value { opacity: 0.95; }

.previewRow {
  margin: 10px 0;
}

.buttons {
  gap: 8px;
  flex-wrap: wrap;
}

.btn {
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  color: #eaeaea;
  padding: 10px 12px;
  border-radius: 12px;
  cursor: pointer;
  font-weight: 700;
}

.btn:hover { background: rgba(255,255,255,0.10); }
.btn:disabled { opacity: 0.5; cursor: not-allowed; }

.muted { opacity: 0.75; }
.small { font-size: 12px; }
</style>