<template>
  <section class="panel">
    <h2 class="panelTitle">Draft Phase</h2>

    <p class="muted">
      Click a piece on the board to draft it — it flies into the tray.
      Both players can see all drafted pieces.
    </p>

    <div class="draftRow">

      <!-- PLAYER 1 -->
      <div class="draftCol">
        <div class="draftHead p1">
          Player 1 Drafted

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
            :cell="20"
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
          Player 2 Drafted

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
            :cell="20"
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

    <div class="divider"></div>

    <div class="muted">
      Remaining: <b>{{ game.pool.length }}</b> / 12 ·
      Next pick: <b>P{{ game.draftTurn }}</b>
    </div>
  </section>
</template>

<script setup>
import { useGameStore } from "../store/game";
import PiecePreview from "./PiecePreview.vue";

const game = useGameStore();
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