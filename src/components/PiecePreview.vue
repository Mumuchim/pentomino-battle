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
import { getPieceStyle } from "../lib/pieceStyles";

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

// ✅ Make tray tiles look like board tiles (not circles)
// If cell is small (like 10), radius must be small too.
const blockRadius = computed(() => {
  // 10px cell -> 3px radius, 12 -> 3, 14 -> 4, 18 -> 5
  const r = Math.round(props.cell * 0.28);
  return Math.max(2, Math.min(6, r));
});

// Bevel thickness: ~8% of cell height, matching the logo proportions
const bevelPx = computed(() => Math.max(1, Math.round(props.cell * 0.02)));

function blockStyle(b) {
  const s = style.value;
  const bevel = bevelPx.value;
  const base = {
    gridColumn: b.x + 1,
    gridRow: b.y + 1,
    borderRadius: '8%',
    boxShadow: `inset 0 -${bevel}px 0 rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.18), 0 4px 10px rgba(0,0,0,0.60), 0 1px 3px rgba(0,0,0,0.40)`,
  };

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
  padding: 1px;
  border-radius: 10px;
}

/* ✅ Logo-style tile: flat face + proportional bevel (set via inline style) */
.block {
  width: 100%;
  height: 100%;

  position: relative;
  border-radius: 8%;
  border: 1px solid rgba(0,0,0,0.30);

  overflow: hidden;
}

/* No gradient overlay — logo blocks are flat */
.block::before {
  display: none;
}
</style>