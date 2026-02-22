<template>
  <div class="picker">
    <div class="draftRow">
      <!-- PLAYER 1 -->
      <div class="draftCol" :class="{ active: canSelect(1) }">
        <div class="draftHead p1">
          <span class="headLeft">Player 1 Pieces</span>
          <span class="count">{{ game.remaining[1].length }}</span>

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
            @pointerdown="onPiecePointerDown(1, k, $event)"
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
            @pointerdown="onPiecePointerDown(2, k, $event)"
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
import { onBeforeUnmount, ref } from "vue";
import { useGameStore } from "../store/game";
import { playBuzz } from "../lib/sfx";
import PiecePreview from "./PiecePreview.vue";

const props = defineProps({
  isOnline: { type: Boolean, default: false },
  myPlayer: { type: [Number, null], default: null },
  canAct: { type: Boolean, default: true },
});

const game = useGameStore();

function canSelect(player) {
  if (game.phase !== "place") return false;
  if (game.currentPlayer !== player) return false;
  if (!props.isOnline) return true;
  return props.canAct && props.myPlayer === player;
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

const dragPending = ref(null);

function cleanupPointerListeners() {
  try { window.removeEventListener("pointermove", onPiecePointerMove); } catch {}
  try { window.removeEventListener("pointerup", onPiecePointerUp); } catch {}
  try { window.removeEventListener("pointercancel", onPiecePointerUp); } catch {}
}

function onPiecePointerDown(player, key, e) {
  if (!game.ui?.enableDragPlace) return;
  if (!canSelect(player)) return;

  // Don't start drag immediately — wait until the pointer actually moves a bit (keeps click behavior intact).
  dragPending.value = {
    player,
    key,
    pointerId: e.pointerId,
    startX: e.clientX,
    startY: e.clientY,
    started: false,
  };

  cleanupPointerListeners();
  window.addEventListener("pointermove", onPiecePointerMove, { passive: false });
  window.addEventListener("pointerup", onPiecePointerUp, { passive: false });
  window.addEventListener("pointercancel", onPiecePointerUp, { passive: false });
}

function onPiecePointerMove(e) {
  const p = dragPending.value;
  if (!p) return;
  if (p.pointerId != null && e.pointerId !== p.pointerId) return;

  const dx = e.clientX - p.startX;
  const dy = e.clientY - p.startY;
  const dist = Math.hypot(dx, dy);

  if (!p.started) {
    if (dist < 6) return;
    // Start the drag
    const ok = game.beginDrag(p.key, p.startX, p.startY);
    if (!ok) {
      dragPending.value = null;
      cleanupPointerListeners();
      return;
    }
    p.started = true;
  }

  // Update drag position
  e.preventDefault();
  game.updateDrag(e.clientX, e.clientY);
}

function onPiecePointerUp(e) {
  const p = dragPending.value;
  dragPending.value = null;
  cleanupPointerListeners();

  if (!p) return;

  // If drag never started, let the normal click handler do its thing.
  if (!p.started) return;

  // Finish drag (place if valid)
  game.updateDrag(e.clientX, e.clientY);

  if (props.isOnline && !props.canAct) {
    game.clearSelection();
    return;
  }

  const t = game.drag?.target;
  if (t && t.inside) {
    const ok = game.placeAt(t.x, t.y);
    if (!ok) {
      playBuzz();
      game.clearSelection();
    }
  } else {
    // Dropped outside board: snap back to panel (clear selection)
    game.clearSelection();
  }
}

onBeforeUnmount(() => {
  cleanupPointerListeners();
});

</script>

<style scoped>
.picker {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.draftRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
}

.draftCol { min-width: 0; }

.draftCol.active .draftHead { filter: brightness(1.08); }
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

.headLeft { min-width: 0; }

.draftHead.p1 { color: rgba(78, 201, 255, 0.98); }
.draftHead.p2 { color: rgba(255, 107, 107, 0.98); }

.count {
  padding: 2px 8px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.06);
  letter-spacing: 0.06em;
  flex: 0 0 auto;
}

.chips.big {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 64px;
}

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

.chipBtn.mine { cursor: grab; }
.chipBtn.mine:active { cursor: grabbing; }

.chipBtn.selected {
  outline: 2px solid rgba(0, 255, 170, 0.55);
  box-shadow: 0 0 18px rgba(0, 255, 170, 0.1);
}

.chipBtn.enemy {
  opacity: 0.55;
  filter: grayscale(0.25) saturate(0.8);
  cursor: default;
}
.chipBtn:disabled { pointer-events: none; }

.emptyNote {
  opacity: 0.6;
  font-size: 13px;
  padding: 8px 10px;
  border: 1px dashed rgba(255, 255, 255, 0.14);
  border-radius: 12px;
}

.trayAnchor {
  position: absolute;
  right: 0;
  top: 50%;
  width: 1px;
  height: 1px;
  transform: translateY(-50%);
}
</style>