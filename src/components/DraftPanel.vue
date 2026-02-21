<template>
  <section class="panel">
    <h2 class="panelTitle">Draft Phase</h2>
    <p class="muted">
      Click a piece on the board to draft it — it stays visible (tagged P1/P2) and a clone flies into the tray.
      Both players can see all drafted pieces.
    </p>

    <div class="draftRow">
      <div class="draftCol">
        <div class="draftHead p1">
          Player 1 Drafted
          <!-- ✅ anchor target for animation -->
          <span class="trayAnchor" data-tray="1" data-tray-context="draft" aria-hidden="true"></span>
        </div>

        <div class="chips">
          <PiecePreview v-for="k in game.picks[1]" :key="k" :pieceKey="k" :cell="10" />
          <div v-if="game.picks[1].length === 0" class="emptyNote">None yet</div>
        </div>
      </div>

      <div class="draftCol">
        <div class="draftHead p2">
          Player 2 Drafted
          <!-- ✅ anchor target for animation -->
          <span class="trayAnchor" data-tray="2" data-tray-context="draft" aria-hidden="true"></span>
        </div>

        <div class="chips">
          <PiecePreview v-for="k in game.picks[2]" :key="k" :pieceKey="k" :cell="10" />
          <div v-if="game.picks[2].length === 0" class="emptyNote">None yet</div>
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="muted">
      Remaining to draft: <b>{{ game.pool.length }}</b> / 12 · Next pick: <b>P{{ game.draftTurn }}</b>
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
  font-size: 15px;
  font-weight: 900;
}

.divider {
  height: 1px;
  background: rgba(255,255,255,0.08);
  margin: 12px 0;
}

.draftRow {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.draftHead {
  position: relative;
  font-weight: 1000;
  margin-bottom: 8px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-size: 12px;
  opacity: 0.9;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.draftHead.p1 { color: rgba(78, 201, 255, 0.98); }
.draftHead.p2 { color: rgba(255, 107, 107, 0.98); }

.chips { display: flex; flex-wrap: wrap; gap: 8px; min-height: 34px; }

.emptyNote {
  opacity: 0.6;
  font-size: 12px;
  padding: 6px 8px;
  border: 1px dashed rgba(255,255,255,0.12);
  border-radius: 10px;
}

.muted { opacity: 0.75; }

/* ✅ anchor target (invisible but has a real rect) */
.trayAnchor {
  width: 16px;
  height: 16px;
  border-radius: 8px;
  display: inline-block;
  opacity: 0;
  pointer-events: none;
}
</style>