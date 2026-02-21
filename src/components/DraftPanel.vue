<template>
  <section class="panel">
    <h2 class="panelTitle">Draft Phase</h2>
    <p class="muted">
      Take turns picking until all 12 are claimed. (No placing yet.)
    </p>

    <div class="draftRow">
      <div class="draftCol">
        <div class="draftHead">Player 1</div>
        <div class="chips">
          <PiecePreview v-for="k in game.picks[1]" :key="k" :pieceKey="k" :cell="10" />
        </div>
      </div>

      <div class="draftCol">
        <div class="draftHead">Player 2</div>
        <div class="chips">
          <PiecePreview v-for="k in game.picks[2]" :key="k" :pieceKey="k" :cell="10" />
        </div>
      </div>
    </div>

    <div class="divider"></div>

    <div class="draftHead">Shared Pool (click to pick)</div>
    <div class="pool">
      <button
        v-for="k in game.pool"
        :key="k"
        class="poolBtn"
        @click="game.draftPick(k)"
        :title="`Pick ${k}`"
      >
        <PiecePreview :pieceKey="k" :cell="10" />
      </button>
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

.muted { opacity: 0.75; }

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

.draftHead { font-weight: 900; margin-bottom: 8px; }
.chips { display: flex; flex-wrap: wrap; gap: 8px; }

.pool {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.poolBtn {
  border: 1px solid rgba(255,255,255,0.14);
  background: rgba(255,255,255,0.06);
  border-radius: 14px;
  padding: 6px;
  cursor: pointer;
}

.poolBtn:hover { background: rgba(255,255,255,0.10); }
</style>