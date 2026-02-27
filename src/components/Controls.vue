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
      <button class="btn hideOnMobile" :disabled="!game.selectedPieceKey || !props.canAct" @click="game.rotateSelected()">
        Rotate (Q)
      </button>

      <button
        class="btn hideOnMobile"
        :disabled="!game.selectedPieceKey || !game.allowFlip || !props.canAct"
        @click="game.flipSelected()"
      >
        Flip (E)
      </button>

      <button class="btn" :disabled="props.isOnline || !props.canAct" @click="toggleFlipAllowed">
        Allow Flip: <b>{{ game.allowFlip ? "ON" : "OFF" }}</b>
      </button>
    </div>

    <!-- PC Submit button — only shown on desktop when requireSubmit is on -->
    <div v-if="game.ui?.requireSubmit" class="row submitRow hideOnMobile">
      <button
        class="btn submitBtn"
        :class="{ hasPending: isPendingValid }"
        :disabled="!isPendingValid || !props.canAct"
        @click="onPcSubmit"
      >
        <span class="submitIcon">✓</span> Submit (Space)
      </button>
    </div>

    <div class="muted small">
      Drag a piece onto the board to preview. Click a cell to place too.
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from "vue";
import { useGameStore } from "../store/game";
import PiecePreview from "./PiecePreview.vue";
import { playBuzz } from "../lib/sfx";

const props = defineProps({
  isOnline: { type: Boolean, default: false },
  canAct: { type: Boolean, default: true },
});

const game = useGameStore();

const isPendingValid = computed(() => {
  if (!game.pendingPlace) return false;
  return game.canPlaceAt(game.pendingPlace.x, game.pendingPlace.y);
});

function onPcSubmit() {
  if (!isPendingValid.value) return;
  if (!props.canAct) return;
  const ok = game.commitPendingPlace();
  if (!ok) playBuzz();
}

function toggleFlipAllowed() {
  game.allowFlip = !game.allowFlip;
  if (!game.allowFlip) game.flipped = false;
}

function onKeyDown(e) {
  const tag = (e.target?.tagName || '').toLowerCase();
  if (tag === 'input' || tag === 'textarea' || tag === 'select') return;

  if (game.phase !== 'place') return;
  if (!props.canAct) return;
  if (!game.selectedPieceKey) return;

  const k = e.key?.toLowerCase();
  if (k === 'q') {
    e.preventDefault();
    game.rotateSelected();
  }
  if (k === 'e') {
    e.preventDefault();
    game.flipSelected();
  }

  // Space / Enter = confirm placement on PC when requireSubmit is on.
  // Priority: if cursor is hovering over a valid cell, stage+commit that cell directly
  // (one-step confirm from wherever the cursor is). Otherwise fall back to the last
  // clicked/staged position (pendingPlace) so you can click to stage, then Space to commit.
  if ((k === ' ' || e.key === 'Enter') && game.ui?.requireSubmit) {
    e.preventDefault();

    const hovered = game.hoverCell;
    if (hovered && game.canPlaceAt(hovered.x, hovered.y)) {
      // Instantly stage the hovered cell and commit — cursor confirms placement.
      game.pendingPlace = { x: hovered.x, y: hovered.y };
      onPcSubmit();
    } else if (isPendingValid.value) {
      // No hover (cursor left board) — commit the last staged position.
      onPcSubmit();
    }
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

.previewRow { margin: 10px 0; }

.buttons { gap: 8px; flex-wrap: wrap; }

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

/* PC Submit / Confirm Placement button */
.submitRow {
  margin-top: 4px;
}

.submitBtn {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  border-color: rgba(255,255,255,0.16);
  transition: background 140ms ease, border-color 140ms ease, box-shadow 140ms ease;
}

.submitBtn.hasPending {
  background: linear-gradient(160deg, rgba(0, 200, 100, 0.30), rgba(0, 160, 80, 0.22));
  border-color: rgba(0, 255, 140, 0.55);
  color: rgba(150, 255, 200, 0.98);
  box-shadow: 0 0 22px rgba(0, 255, 140, 0.18);
  animation: submitPulse 1.8s ease-in-out infinite;
}

.submitIcon { font-size: 15px; }

@keyframes submitPulse {
  0%, 100% { box-shadow: 0 0 16px rgba(0,255,140,0.14); }
  50%       { box-shadow: 0 0 28px rgba(0,255,140,0.38); }
}

.muted { opacity: 0.75; }
.small { font-size: 12px; }

/* Hide desktop-only controls on touch devices (the mobile action bar handles those) */
@media (pointer: coarse), (max-width: 980px) {
  .hideOnMobile { display: none !important; }
}

/* Fit-to-viewport: keep these buttons visible on 100% zoom / shorter screens */
@media (max-height: 820px){
  .controls .row{ margin: 6px 0; }
  .label{ width: 72px; }
  .btn{ padding: 8px 10px; font-size: 12px; border-radius: 11px; }
  .previewRow{ margin: 8px 0; }
}
</style>