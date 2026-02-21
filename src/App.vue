<template>
  <div class="app">
    <header class="topbar">
      <div class="brand">
        <div class="title">PentoBattle</div>
        <div class="sub">Pentomino Battle (Web)</div>
      </div>

      <div class="right">
        <button class="btn ghost" v-if="screen !== 'menu'" @click="goMenu">
          ← Main Menu
        </button>
        <button class="btn" v-if="screen !== 'menu'" @click="game.resetGame()">
          Reset Match
        </button>
      </div>
    </header>

    <main class="main">
      <!-- MAIN MENU -->
      <section v-if="screen === 'menu'" class="card">
        <h1 class="h1">Main Menu</h1>
        <p class="muted">Choose a mode.</p>

        <div class="menuGrid">
          <button class="btn big primary" @click="startPvp">Player vs Player</button>
          <button class="btn big" @click="startAi">Player vs AI</button>
          <button class="btn big" @click="screen = 'settings'">Settings</button>
          <button class="btn big" @click="screen = 'credits'">Credits</button>
        </div>

        <div class="hint">Now with real shapes + drag preview ✅</div>
      </section>

      <!-- SETTINGS -->
      <section v-else-if="screen === 'settings'" class="card">
        <h1 class="h1">Settings</h1>

        <div class="form">
          <label class="field">
            <span>Allow Flip (Mirror)</span>
            <input type="checkbox" v-model="allowFlip" />
          </label>
        </div>

        <div class="row">
          <button class="btn" @click="screen = 'menu'">Back</button>
          <button class="btn primary" @click="applySettings">Apply</button>
        </div>

        <p class="muted small" style="margin-top:10px">
          Board is fixed to <b>10×6</b> as requested.
        </p>
      </section>

      <!-- CREDITS -->
      <section v-else-if="screen === 'credits'" class="card">
        <h1 class="h1">Credits</h1>
        <div class="credits">
          <p><b>PentoBattle</b> — by <b>Mumuchxm</b></p>
          <p class="muted">Built with Vite + Vue.</p>
        </div>

        <div class="row">
          <button class="btn" @click="screen = 'menu'">Back</button>
        </div>
      </section>

      <!-- GAME SCREEN -->
      <section v-else class="gameLayout">
        <section class="leftPanel">
          <div class="panelHead">
            <div class="modeTag">
              Mode: <b>{{ modeLabel }}</b>
            </div>
            <div class="statusTag">
              Phase: <b>{{ game.phase }}</b>
              <span v-if="game.phase === 'draft'"> · Draft pick: <b>P{{ game.draftTurn }}</b></span>
              <span v-else-if="game.phase === 'place'"> · Turn: <b>P{{ game.currentPlayer }}</b></span>
            </div>
            <div class="keysTag" v-if="game.phase === 'place'">
              Keys: <b>Q</b> Rotate · <b>E</b> Flip
            </div>
          </div>

          <DraftPanel v-if="game.phase === 'draft'" />

          <section v-else class="panel">
            <h2 class="panelTitle">Player {{ game.currentPlayer }} Pieces</h2>
            <PiecePicker />

            <div class="divider"></div>
            <Controls />

            <div v-if="game.phase === 'gameover'" class="gameover">
              <div class="gameoverTitle">GAME OVER</div>
              <div class="gameoverText">Winner: Player {{ game.winner }}</div>
              <button class="btn primary" @click="game.resetGame()">Play Again</button>
            </div>
          </section>
        </section>

        <section class="rightPanel">
          <Board />
          <div class="hintSmall">
            Drag a piece to the board and hover to preview. Click or drop to place.
          </div>
        </section>
      </section>
    </main>
  </div>
</template>

<script setup>
import { computed, ref } from "vue";
import { useGameStore } from "./store/game";

import Board from "./components/Board.vue";
import DraftPanel from "./components/DraftPanel.vue";
import PiecePicker from "./components/PiecePicker.vue";
import Controls from "./components/Controls.vue";

const game = useGameStore();

const screen = ref("menu"); // menu | settings | credits | pvp | ai
const allowFlip = ref(true);

const modeLabel = computed(() => (screen.value === "ai" ? "Player vs AI" : "Player vs Player"));

function goMenu() {
  screen.value = "menu";
}

function startPvp() {
  screen.value = "pvp";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();
}

function startAi() {
  screen.value = "ai";
  game.boardW = 10;
  game.boardH = 6;
  game.allowFlip = allowFlip.value;
  game.resetGame();
}

function applySettings() {
  alert(`Applied settings:\nAllow Flip: ${allowFlip.value}`);
  screen.value = "menu";
}
</script>

<style scoped>
.app {
  min-height: 100vh;
  background: #0f0f10;
  color: #eaeaea;
  display: flex;
  flex-direction: column;
}

.topbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 18px 20px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.02);
}

.title { font-weight: 900; letter-spacing: 0.8px; font-size: 20px; }
.sub { opacity: 0.75; font-size: 12px; margin-top: 3px; }

.right { display: flex; gap: 10px; flex-wrap: wrap; }

.main { flex: 1; padding: 22px; display: grid; place-items: center; }

.card {
  width: min(640px, 92vw);
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 16px;
  padding: 18px;
}

.h1 { margin: 0 0 8px 0; font-size: 22px; font-weight: 900; }
.muted { opacity: 0.78; }
.small { font-size: 12px; }

.menuGrid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 14px; }
@media (max-width: 520px) { .menuGrid { grid-template-columns: 1fr; } }

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
.btn.big { padding: 14px 14px; font-size: 14px; }
.btn.primary { border-color: rgba(255,255,255,0.28); background: rgba(255,255,255,0.12); }
.btn.ghost { background: transparent; }

.hint { margin-top: 14px; font-size: 13px; opacity: 0.78; padding-top: 10px; border-top: 1px solid rgba(255,255,255,0.08); }

.form { margin-top: 12px; display: grid; gap: 10px; }
.field {
  display: flex; justify-content: space-between; align-items: center; gap: 14px;
  padding: 10px 12px; border-radius: 12px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}

.row { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; }

/* GAME LAYOUT */
.gameLayout {
  width: min(1200px, 96vw);
  display: grid;
  grid-template-columns: 420px 1fr;
  gap: 16px;
  align-items: start;
}
@media (max-width: 900px) { .gameLayout { grid-template-columns: 1fr; } }

.leftPanel, .rightPanel { display: flex; flex-direction: column; gap: 12px; }

.panelHead {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 14px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  background: rgba(255,255,255,0.03);
}

.modeTag, .statusTag, .keysTag { font-size: 13px; opacity: 0.9; }

.panel {
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 14px;
  padding: 14px;
}

.panelTitle { margin: 0 0 10px 0; font-size: 15px; font-weight: 900; }

.divider { height: 1px; background: rgba(255,255,255,0.08); margin: 12px 0; }

.hintSmall { opacity: 0.75; font-size: 13px; padding: 6px 2px; }

.gameover {
  margin-top: 14px;
  padding: 12px;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.10);
  background: rgba(255,255,255,0.05);
}
.gameoverTitle { font-weight: 900; letter-spacing: 0.6px; }
.gameoverText { margin: 6px 0 10px 0; opacity: 0.8; }
</style>