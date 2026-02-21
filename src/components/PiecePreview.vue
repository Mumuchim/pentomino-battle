<template>
  <div
    class="wrap"
    :style="{
      gridTemplateColumns: `repeat(${w}, ${cell}px)`,
      gridTemplateRows: `repeat(${h}, ${cell}px)`,
    }"
    aria-hidden="true"
  >
    <div
      v-for="(b, i) in blocks"
      :key="i"
      class="block"
      :style="blockStyle(b)"
    />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { PENTOMINOES } from "../lib/pentominoes";
import { boundsOf, transformCells } from "../lib/geom";
import { getPieceStyle } from "../lib/pieceStyles"; // (or piecesStyles if that's your filename)

const props = defineProps({
  pieceKey: { type: String, required: true },
  rotation: { type: Number, default: 0 },
  flipped: { type: Boolean, default: false },
  cell: { type: Number, default: 12 },
});

const style = computed(() => getPieceStyle(props.pieceKey));

const cells = computed(() => {
  const base = PENTOMINOES[props.pieceKey];
  return transformCells(base, props.rotation, props.flipped);
});

const box = computed(() => boundsOf(cells.value));
const w = computed(() => box.value.w);
const h = computed(() => box.value.h);

const blocks = computed(() => cells.value.map(([x, y]) => ({ x, y })));

function blockStyle(b) {
  const s = style.value;
  const base = { gridColumn: b.x + 1, gridRow: b.y + 1 };

  if (s.skin) {
    return {
      ...base,
      backgroundImage: `url(${s.skin})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    };
  }

  return { ...base, backgroundColor: s.color };
}
</script>

<style scoped>
.wrap {
  display: grid;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.08);
}

.block {
  width: 100%;
  height: 100%;
  border-radius: 5px;

  /* ✅ 3D effect */
  position: relative;
  border: 1px solid rgba(0,0,0,0.35);
  box-shadow:
    0 2px 6px rgba(0,0,0,0.35),
    inset 0 1px 0 rgba(255,255,255,0.18),
    inset 0 -2px 0 rgba(0,0,0,0.20);
  overflow: hidden;
}

/* shiny highlight */
.block::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.22),
    rgba(255,255,255,0.06) 35%,
    rgba(0,0,0,0.10)
  );
  pointer-events: none;
}
</style>