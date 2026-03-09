<template>
  <section class="panel">
    <h2 class="panelTitle">Picks</h2>

    <!-- Unified stacked layout: top player = you / P1, bottom = opponent / P2 -->
    <div class="draftStack">

      <!-- TOP: your player (online/AI) or P1 (couch) -->
      <div class="draftCol">
        <div class="draftHead" :class="topPlayer === 1 ? 'p1' : 'p2'">
          <span class="nameGroup">
            <span class="draftName">{{ topName }}</span>
            <span v-if="showYouTag" class="youTag">YOU</span>
          </span>
          <span
            class="trayAnchor"
            :data-tray="topPlayer"
            data-tray-context="draft"
            aria-hidden="true"
          ></span>
        </div>
        <div class="chips big">
          <PiecePreview
            v-for="k in game.picks[topPlayer]"
            :key="k"
            :pieceKey="k"
            :cell="cell"
          />
          <div v-if="game.picks[topPlayer].length === 0" class="emptyNote">None yet</div>
        </div>
      </div>

      <div class="stackDivider"></div>

      <!-- BOTTOM: opponent (online/AI) or P2 (couch) -->
      <div class="draftCol">
        <div class="draftHead" :class="bottomPlayer === 1 ? 'p1' : 'p2'">
          <span class="draftName">{{ bottomName }}</span>
          <span
            class="trayAnchor"
            :data-tray="bottomPlayer"
            data-tray-context="draft"
            aria-hidden="true"
          ></span>
        </div>
        <div class="chips big">
          <PiecePreview
            v-for="k in game.picks[bottomPlayer]"
            :key="k"
            :pieceKey="k"
            :cell="cell"
          />
          <div v-if="game.picks[bottomPlayer].length === 0" class="emptyNote">None yet</div>
        </div>
      </div>

    </div>

    <div class="divider"></div>

    <div class="muted">
      Remaining: <b>{{ game.pool.length }}</b> / 12 ·
      Next pick: <b>{{ draftTurnName }}</b>
    </div>
  </section>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useGameStore } from "../store/game";
import PiecePreview from "./PiecePreview.vue";

const props = defineProps({
  isOnline: { type: Boolean, default: false },
  myPlayer: { type: [Number, null], default: null },
  matchKind: { type: [String, null], default: null },
  p1Name: { type: [String, null], default: null },
  p2Name: { type: [String, null], default: null },
});

const game = useGameStore();

// topPlayer: "you" (online/AI have myPlayer set) or P1 (couch: myPlayer is null)
const topPlayer    = computed(() => props.myPlayer ?? 1);
const bottomPlayer = computed(() => topPlayer.value === 1 ? 2 : 1);

// Show YOU badge only in online/AI modes where we know who the human is
const showYouTag = computed(() => props.myPlayer !== null);

// Display names
const topName = computed(() => {
  const n = topPlayer.value === 1 ? props.p1Name : props.p2Name;
  return n || (props.myPlayer !== null ? 'Your Picks' : `Player ${topPlayer.value}`);
});
const bottomName = computed(() => {
  const n = bottomPlayer.value === 1 ? props.p1Name : props.p2Name;
  return n || `Player ${bottomPlayer.value}`;
});

// Name of whoever's turn it is in the "Next pick" footer
const draftTurnName = computed(() => {
  const n = game.draftTurn === 1 ? props.p1Name : props.p2Name;
  return n || `P${game.draftTurn}`;
});

// Fit-to-viewport: shrink preview tiles on shorter screens (no scroll in-game)
const cell = ref(20);
function computeCell() {
  const h = window.innerHeight || 800;
  // These breakpoints are intentionally simple + stable.
  if (h <= 680) return 14;
  if (h <= 760) return 16;
  return 20;
}
function onResize() {
  cell.value = computeCell();
}
onMounted(() => {
  onResize();
  window.addEventListener("resize", onResize, { passive: true });
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", onResize);
});
</script>

<style scoped>
.panel {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  padding: 14px;
}

.panelTitle {
  margin: 0 0 10px 0;
  font-size: 16px;
  font-weight: 900;
}

.divider {
  height: 1px;
  background: rgba(255,255,255,0.08);
  margin: 14px 0;
}

.draftStack {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.stackDivider {
  height: 1px;
  background: rgba(255,255,255,0.08);
  margin: 12px 0;
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
}

.draftHead.p1 { color: rgba(78, 201, 255, 0.98); }
.draftHead.p2 { color: rgba(255, 107, 107, 0.98); }

.nameGroup {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.draftName {
  font-weight: 1000;
  letter-spacing: 0.05em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 120px;
}

.youTag {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.12em;
  padding: 2px 7px;
  border-radius: 20px;
  background: rgba(255,255,255,0.12);
  color: rgba(255,255,255,0.75);
  margin-left: 6px;
  flex-shrink: 0;
}

/* 🔥 BIG tray layout */
.chips.big {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  min-height: 64px;
}

/* Empty message */
.emptyNote {
  opacity: 0.6;
  font-size: 13px;
  padding: 8px 10px;
  border: 1px dashed rgba(255,255,255,0.14);
  border-radius: 12px;
}

.muted { opacity: 0.75; }

/* Animation target */
.trayAnchor {
  width: 18px;
  height: 18px;
  border-radius: 9px;
  opacity: 0;
  pointer-events: none;
}
</style>