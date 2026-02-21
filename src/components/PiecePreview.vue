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
      :style="{ gridColumn: b.x + 1, gridRow: b.y + 1 }"
    />
  </div>
</template>

<script setup>
import { computed } from "vue";
import { PENTOMINOES } from "../lib/pentominoes";
import { boundsOf, transformCells } from "../lib/geom";

const props = defineProps({
  pieceKey: { type: String, required: true },
  rotation: { type: Number, default: 0 },
  flipped: { type: Boolean, default: false },
  cell: { type: Number, default: 12 }, // px
});

const cells = computed(() => {
  const base = PENTOMINOES[props.pieceKey];
  return transformCells(base, props.rotation, props.flipped);
});

const box = computed(() => boundsOf(cells.value));
const w = computed(() => box.value.w);
const h = computed(() => box.value.h);

const blocks = computed(() => cells.value.map(([x, y]) => ({ x, y })));
</script>

<style scoped>
.wrap {
  display: grid;
  gap: 2px;
  padding: 4px;
  border-radius: 10px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
}

.block {
  width: 100%;
  height: 100%;
  border-radius: 4px;
  background: rgba(255,255,255,0.85);
}
</style>