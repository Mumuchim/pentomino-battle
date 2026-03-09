<template>
  <section class="panel">
    <h2 class="panelTitle">Picks</h2>

    <!-- Online: show your picks on top, opponent picks below -->
    <template v-if="props.isOnline && props.myPlayer">
      <div class="draftStack">

        <!-- YOUR picks (always on top) -->
        <div class="draftCol">
          <div class="draftHead" :class="props.myPlayer === 1 ? 'p1' : 'p2'">
            <span class="draftName">{{ myName }}</span>
            <span class="youTag">YOU</span>
            <span
              class="trayAnchor"
              :data-tray="props.myPlayer"
              data-tray-context="draft"
              aria-hidden="true"
            ></span>
          </div>
          <div class="chips big">
            <PiecePreview
              v-for="k in game.picks[props.myPlayer]"
              :key="k"
              :pieceKey="k"
              :cell="cell"
            />
            <div v-if="game.picks[props.myPlayer].length === 0" class="emptyNote">
              None yet
            </div>
          </div>
        </div>

        <div class="stackDivider"></div>

        <!-- OPPONENT picks (always below) -->
        <div class="draftCol">
          <div class="draftHead" :class="opponentPlayer === 1 ? 'p1' : 'p2'">
            <span class="draftName">{{ opponentName }}</span>
            <span
              class="trayAnchor"
              :data-tray="opponentPlayer"
              data-tray-context="draft"
              aria-hidden="true"
            ></span>
          </div>
          <div class="chips big">
            <PiecePreview
              v-for="k in game.picks[opponentPlayer]"
              :key="k"
              :pieceKey="k"
              :cell="cell"
            />
            <div v-if="game.picks[opponentPlayer].length === 0" class="emptyNote">
              None yet
            </div>
          </div>
        </div>

      </div>
    </template>

    <!-- Couch / AI: two-column layout (unchanged) -->
    <template v-else>
    <div class="draftRow">

      <!-- PLAYER 1 -->
      <div class="draftCol">
        <div class="draftHead p1">
          Player 1

          <!-- Animation anchor -->
          <span
            class="trayAnchor"
            data-tray="1"
            data-tray-context="draft"
            aria-hidden="true"
          ></span>
        </div>

        <div class="chips big">
          <PiecePreview
            v-for="k in game.picks[1]"
            :key="k"
            :pieceKey="k"
            :cell="cell"
          />

          <div
            v-if="game.picks[1].length === 0"
            class="emptyNote"
          >
            None yet
          </div>
        </div>
      </div>

      <!-- PLAYER 2 -->
      <div class="draftCol">
        <div class="draftHead p2">
          Player 2

          <span
            class="trayAnchor"
            data-tray="2"
            data-tray-context="draft"
            aria-hidden="true"
          ></span>
        </div>

        <div class="chips big">
          <PiecePreview
            v-for="k in game.picks[2]"
            :key="k"
            :pieceKey="k"
            :cell="cell"
          />

          <div
            v-if="game.picks[2].length === 0"
            class="emptyNote"
          >
            None yet
          </div>
        </div>
      </div>

    </div>
    </template>

    <div class="divider"></div>

    <div class="muted">
      Remaining: <b>{{ game.pool.length }}</b> / 12 ·
      Next pick: <b>P{{ game.draftTurn }}</b>
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

// Opponent is whichever player you are not
const opponentPlayer = computed(() => props.myPlayer === 1 ? 2 : 1);

// Resolved IGN for each slot, falling back to "P1"/"P2"
const myName = computed(() => {
  const n = props.myPlayer === 1 ? props.p1Name : props.p2Name;
  return n || `P${props.myPlayer}`;
});
const opponentName = computed(() => {
  const n = opponentPlayer.value === 1 ? props.p1Name : props.p2Name;
  return n || `P${opponentPlayer.value}`;
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

.draftRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 14px;
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