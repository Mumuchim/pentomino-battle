<template>
  <div class="announcerWrap" aria-live="polite" aria-atomic="true">
    <div class="announcer" :class="playerClass" :key="animKey">
      <div class="rowTop">
        <span class="pill">{{ playerLabel }}</span>
        <span class="dot" aria-hidden="true"></span>
        <span class="sub">{{ phaseLabel }}</span>
      </div>
      <div class="rowMain">{{ mainLabel }}</div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref, watch } from "vue";
import { useGameStore } from "@/store/game";

const game = useGameStore();

// Force re-mount to replay animation when player/phase changes
const animKey = ref(0);
watch(
  () => [game.currentPlayer, game.phase],
  () => {
    animKey.value++;
  }
);

const playerLabel = computed(() =>
  game.currentPlayer === 1 ? "PLAYER 1" : "PLAYER 2"
);

const mainLabel = computed(() =>
  game.currentPlayer === 1 ? "P1 TURN" : "P2 TURN"
);

const phaseLabel = computed(() => {
  if (game.phase === "draft") return "Draft";
  if (game.phase === "place") return "Place";
  if (game.phase === "gameover") return "Game Over";
  return String(game.phase || "").toUpperCase();
});

const playerClass = computed(() => (game.currentPlayer === 1 ? "p1" : "p2"));
</script>

<style scoped>
.announcerWrap {
  position: relative;
  width: 100%;
  display: flex;
  justify-content: center;
  pointer-events: none;
  margin: 2px 0 10px;
}

.announcer {
  min-width: 240px;
  padding: 10px 18px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(8, 10, 16, 0.72);
  backdrop-filter: blur(8px);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.55),
    0 0 18px rgba(255, 255, 255, 0.06);
  animation: pop 220ms ease;
}

.rowTop {
  display: flex;
  align-items: center;
  gap: 10px;
  opacity: 0.92;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  margin-bottom: 6px;
}

.pill {
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
  font-weight: 900;
}

.dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 0 10px rgba(255, 255, 255, 0.25);
}

.sub {
  opacity: 0.75;
  font-weight: 800;
}

.rowMain {
  font-weight: 1000;
  font-size: 22px;
  letter-spacing: 0.14em;
  line-height: 1;
}

/* Player theming */
.p1 {
  color: rgba(78, 201, 255, 0.98);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.55),
    0 0 22px rgba(78, 201, 255, 0.18);
}

.p2 {
  color: rgba(255, 107, 107, 0.98);
  box-shadow:
    0 18px 40px rgba(0, 0, 0, 0.55),
    0 0 22px rgba(255, 107, 107, 0.18);
}

@keyframes pop {
  from {
    transform: translateY(-6px) scale(0.92);
    opacity: 0;
    filter: blur(0.6px);
  }
  to {
    transform: translateY(0) scale(1);
    opacity: 1;
    filter: blur(0);
  }
}
</style>