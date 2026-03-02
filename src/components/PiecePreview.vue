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
import { computed, ref } from "vue";
import { PENTOMINOES } from "../lib/pentominoes";
import { boundsOf, transformCells } from "../lib/geom";
import { getPieceStyle } from "../lib/pieceStyles";

const props = defineProps({
  pieceKey: { type: String, required: true },
  rotation: { type: Number, default: 0 },
  flipped: { type: Boolean, default: false },
  cell: { type: Number, default: 12 },
});

// Track legacy mode via HTML class (same pattern as Board.vue)
const _legacyTick = ref(0);
if (typeof MutationObserver !== 'undefined') {
  const _mo = new MutationObserver(() => { _legacyTick.value++; });
  _mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
}
const legacy = computed(() => { void _legacyTick.value; return document.documentElement.classList.contains('legacy-visuals'); });

const style = computed(() => getPieceStyle(props.pieceKey, legacy.value));

const cells = computed(() => {
  const base = PENTOMINOES[props.pieceKey];
  return transformCells(base, props.rotation, props.flipped);
});

const box = computed(() => boundsOf(cells.value));
const w = computed(() => box.value.w);
const h = computed(() => box.value.h);

const blocks = computed(() => cells.value.map(([x, y]) => ({ x, y })));

const blockRadius = computed(() => {
  const r = Math.round(props.cell * 0.28);
  return Math.max(2, Math.min(6, r));
});

function blockStyle(b) {
  const s = style.value;
  const base = {
    gridColumn: b.x + 1,
    gridRow: b.y + 1,
    borderRadius: `${blockRadius.value}px`,
    '--piece-glow': s.glow,
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
  padding: 5px;
  border-radius: 10px;
  background: rgba(5,6,15,0.70);
  border: 1px solid rgba(99,102,241,0.14);
  box-shadow:
    inset 0 1px 4px rgba(0,0,0,0.70),
    0 0 0 1px rgba(255,255,255,0.02) inset;
  transition: box-shadow 140ms ease;
}

/* New theme block — crystal tile with glow */
.block {
  width: 100%;
  height: 100%;
  position: relative;
  border-top:    1px solid rgba(255,255,255,0.52);
  border-left:   1px solid rgba(255,255,255,0.26);
  border-right:  1px solid rgba(0,0,0,0.38);
  border-bottom: 1px solid rgba(0,0,0,0.50);
  box-shadow:
    0 0 6px color-mix(in srgb, var(--piece-glow, #818CF8) 40%, transparent),
    0 3px 8px rgba(0,0,0,0.70),
    inset 0 1px 0 rgba(255,255,255,0.40);
  overflow: hidden;
}

/* Glassy specular highlight */
.block::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    138deg,
    rgba(255,255,255,0.55) 0%,
    rgba(255,255,255,0.20) 22%,
    rgba(255,255,255,0.04) 44%,
    transparent 62%
  );
  pointer-events: none;
}

/* ═══ LEGACY overrides ═══ */
:global(.legacy-visuals) .wrap {
  background: rgba(10,10,18,0.65);
  border: 1px solid rgba(255,255,255,0.08);
  box-shadow:
    inset 0 1px 3px rgba(0,0,0,0.50);
}

:global(.legacy-visuals) .block {
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow:
    0 8px 14px rgba(0,0,0,0.35),
    inset 0 1px 0 rgba(255,255,255,0.22),
    inset 0 -4px 0 rgba(0,0,0,0.30);
}

:global(.legacy-visuals) .block::before {
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.22),
    rgba(255,255,255,0.08) 35%,
    rgba(0,0,0,0.12)
  );
}
</style>