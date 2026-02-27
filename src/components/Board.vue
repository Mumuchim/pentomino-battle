<template>
  <div class="boardWrap">
    <div
      class="boardShell"
      ref="shell"
      @mousemove="onPointerMove"
      @mouseleave="clearHover"
      @dragover.prevent="onDragOver"
      @drop.prevent="onShellDrop"
      @touchstart="onBoardTouchStart"
      @touchmove="onTouchMove"
      @touchend="onTouchEnd"
      @touchcancel="onTouchEnd"
    >
      <!--
        boardSizer makes the board always take the *maximum possible* space
        inside the right panel while keeping the 10x6 aspect ratio.
      -->
      <div class="boardSizer" :style="sizerStyle">
        <div class="neonFrame" aria-hidden="true"></div>
        <div class="scanlines" aria-hidden="true"></div>

        <div
          ref="boardEl"
          class="board"
          :style="gridStyle"
          :class="{ draftMode: game.phase === 'draft' }"
        >
          <button
            v-for="cell in flat"
            :key="cell.key"
            class="cell"
            :class="cellClass(cell)"
            :style="cellInlineStyle(cell)"
            @mouseenter="setHover(cell.x, cell.y)"
            @click="onCellClick(cell.x, cell.y, $event)"
            @dragenter.prevent="setHover(cell.x, cell.y)"
            @drop.prevent="onDrop(cell.x, cell.y)"
            :title="cellTitle(cell)"
          >
            <span
              v-if="game.phase === 'draft' && cell.v?.draftedBy"
              class="cornerTag"
              :class="cell.v.draftedBy === 1 ? 'p1' : 'p2'"
              aria-hidden="true"
            >
              P{{ cell.v.draftedBy }}
            </span>
          </button>
        </div>

        <div
          v-if="ghostOverlay.visible"
          class="ghostOverlay"
          :class="{ ok: ghostOverlay.ok, bad: !ghostOverlay.ok, staged: ghostOverlay.staged }"
          aria-hidden="true"
        >
          <div
            v-for="(b, i) in ghostOverlay.blocks"
            :key="i"
            class="ghostBlock"
            :style="ghostBlockStyle(b)"
          />
        </div>
      </div>
    </div>

    <div class="legend">
      <span class="legendItem"><span class="swatch ok"></span> OK</span>
      <span class="legendItem"><span class="swatch bad"></span> BAD</span>

      <span v-if="game.phase === 'draft'" class="legendItem muted">
        Click a piece to draft — it’ll fly to the player tray.
      </span>
      <span v-else class="legendItem muted">
        Drop or click. (Q rotate, E flip) · Mobile: drag ghost to reposition.
      </span>
    </div>

    <div v-if="warningMessage" class="warning" role="status" aria-live="polite">
      <span class="warnIcon" aria-hidden="true">⚠</span>
      <span class="warnText">{{ warningMessage }}</span>
    </div>
  </div>

  <!-- ── Mobile action bar: fixed at bottom, outside board layout flow ── -->
  <Teleport to="body">
    <div
      v-if="game.phase === 'place' && game.selectedPieceKey"
      class="mobileActionBar"
      :class="{ dragActive: game.drag?.active }"
      aria-label="Mobile piece controls"
    >
      <!-- ROTATE -->
      <button
        class="mobileBtn mobileIconBtn"
        tabindex="-1"
        @touchstart.prevent="handleRotate()"
        @touchend.prevent
        @click="handleRotate()"
        aria-label="Rotate piece"
      >
        <span class="mobileBtnIcon">↻</span>
        <span class="mobileBtnLabel">ROTATE</span>
      </button>

      <!-- SUBMIT (only when requireSubmit is on) -->
      <button
        v-if="game.ui?.requireSubmit"
        class="mobileBtn mobileSubmitBtn"
        :class="{ hasPending: isPendingValid }"
        :disabled="!isPendingValid"
        tabindex="-1"
        @touchstart.prevent="onMobileSubmit"
        @touchend.prevent
        @click="onMobileSubmit"
        aria-label="Confirm placement"
      >
        <span class="mobileBtnIcon">✓</span>
        <span class="mobileBtnLabel">SUBMIT</span>
      </button>

      <!-- FLIP -->
      <button
        class="mobileBtn mobileIconBtn"
        :disabled="!game.allowFlip"
        tabindex="-1"
        @touchstart.prevent="handleFlip()"
        @touchend.prevent
        @click="handleFlip()"
        aria-label="Flip piece"
      >
        <span class="mobileBtnIcon">⇄</span>
        <span class="mobileBtnLabel">FLIP</span>
      </button>
    </div>
  </Teleport>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useGameStore } from "../store/game";
import { getPieceStyle } from "../lib/pieceStyles";
import { playBuzz } from "../lib/sfx";
import { PENTOMINOES } from "../lib/pentominoes";

const props = defineProps({
  isOnline: { type: Boolean, default: false },
  myPlayer: { type: [Number, null], default: null },
  canAct: { type: Boolean, default: true },
});

const game = useGameStore();
const shell = ref(null);
const boardEl = ref(null);
const hover = ref(null);
const targetCell = ref(null);

// Detect touch device for mobile-specific staging behavior
const isTouchDevice = typeof window !== 'undefined' &&
  ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// Track board-initiated drags (re-positioning staged pieces)
const boardDragging = ref(false);
// Timestamp of last staging — used to block accidental submit triggers
let stagedAt = 0;

// Must match .board padding in CSS
const BOARD_PADDING = 10;
// Leave a little breathing room around the board so it never feels "flattened".
const SIZER_MARGIN = 14;

const sizerPx = ref({ w: 0, h: 0 });
let ro = null;

function recomputeSizer() {
  const host = shell.value;
  if (!host) return;

  const rect = host.getBoundingClientRect();
  const availW = Math.max(0, rect.width - SIZER_MARGIN * 2);
  const availH = Math.max(0, rect.height - SIZER_MARGIN * 2);

  // Fit (contain) preserving the board aspect ratio exactly.
  const cell = Math.min(availW / game.boardW, availH / game.boardH);
  const w = Math.floor(cell * game.boardW);
  const h = Math.floor(cell * game.boardH);
  sizerPx.value = { w, h };
  // Share cell size so App.vue can size the drag ghost to match board cells
  game.boardCellPx = Math.max(10, Math.floor(cell));
}

const sizerStyle = computed(() => {
  const w = sizerPx.value.w;
  const h = sizerPx.value.h;
  if (!w || !h) return {};
  return { width: `${w}px`, height: `${h}px` };
});

onMounted(() => {
  const host = shell.value;
  if (!host) return;
  ro = new ResizeObserver(() => recomputeSizer());
  ro.observe(host);
  recomputeSizer();
});

onBeforeUnmount(() => {
  try {
    ro?.disconnect?.();
  } catch {}
  ro = null;
});

// Track whenever a piece gets staged so onMobileSubmit can apply a brief cooldown
// (prevents synthetic click events from auto-committing right after a drop)
watch(
  () => game.pendingPlace,
  (newVal, oldVal) => {
    if (newVal && !oldVal) {
      stagedAt = Date.now();
    }
  }
);

// ── Keep board hover in sync while dragging from the panel ─────────────────
// When the pointer is captured by PiecePicker's chip button, the board's
// own mousemove/mouseenter events don't fire.  Watching drag.x/y lets us
// still compute which board cell the cursor is over and show the green/red overlay.
watch(
  () => [game.drag?.active, game.drag?.x, game.drag?.y],
  ([active, x, y]) => {
    if (!active) {
      hover.value = null;
      return;
    }
    updateHoverFromClientXY(x ?? 0, y ?? 0);
  },
  { immediate: false }
);
// ────────────────────────────────────────────────────────────────────────────

// ── Is the currently staged placement actually valid? ─────────────────────
// Prevents the submit button lighting up on red/illegal placements.
const isPendingValid = computed(() => {
  if (!game.pendingPlace) return false;
  return game.canPlaceAt(game.pendingPlace.x, game.pendingPlace.y);
});

// ── Rotate/flip handlers that gracefully handle mid-board-drag ────────────
// requireSubmit ON:  stage current position then stop drag (user confirms via Submit).
// requireSubmit OFF: just rotate/flip in place — the drag continues naturally.
//                    Stopping the drag here would "drop" the piece and cause accidental placements.
function handleRotate() {
  if (boardDragging.value) {
    if (game.ui?.requireSubmit) {
      const t = game.drag?.target;
      if (t && t.inside) {
        game.$patch({ pendingPlace: { x: t.x, y: t.y } });
      }
      boardDragging.value = false;
      game.endDrag();
    }
    // requireSubmit OFF: keep drag active, just rotate the shape in place.
  }
  // Preserve scroll position so mobile doesn't snap back to the left panel.
  const scrollEl = document.querySelector('.app.inGame .main');
  const savedLeft = scrollEl?.scrollLeft ?? 0;
  game.rotateSelected();
  if (scrollEl) requestAnimationFrame(() => { scrollEl.scrollLeft = savedLeft; });
}

function handleFlip() {
  if (!game.allowFlip) return;
  if (boardDragging.value) {
    if (game.ui?.requireSubmit) {
      const t = game.drag?.target;
      if (t && t.inside) {
        game.$patch({ pendingPlace: { x: t.x, y: t.y } });
      }
      boardDragging.value = false;
      game.endDrag();
    }
    // requireSubmit OFF: keep drag active, just flip the shape in place.
  }
  // Preserve scroll position so mobile doesn't snap back to the left panel.
  const scrollEl = document.querySelector('.app.inGame .main');
  const savedLeft = scrollEl?.scrollLeft ?? 0;
  game.flipSelected();
  if (scrollEl) requestAnimationFrame(() => { scrollEl.scrollLeft = savedLeft; });
}

const warningMessage = ref("");
let warnTimer = null;
function showWarning(msg) {
  warningMessage.value = msg;
  if (warnTimer) clearTimeout(warnTimer);
  warnTimer = setTimeout(() => {
    warningMessage.value = "";
    warnTimer = null;
  }, 1400);
}

const activeBoard = computed(() => (game.phase === "draft" ? game.draftBoard : game.board));

const flat = computed(() => {
  const out = [];
  for (let y = 0; y < game.boardH; y++) {
    for (let x = 0; x < game.boardW; x++) {
      const v = activeBoard.value[y][x];
      out.push({ x, y, v, key: `${x},${y}` });
    }
  }
  return out;
});

const gridStyle = computed(() => ({
  gridTemplateColumns: `repeat(${game.boardW}, 1fr)`,
  gridTemplateRows: `repeat(${game.boardH}, 1fr)`,
}));

/* ---------------------------
   PLACE phase ghost preview
---------------------------- */
// Single computed for both ghost map (cell classes) and overlay blocks
const ghostData = computed(() => {
  const empty = { map: new Set(), ok: false, visible: false, blocks: [], staged: false };
  if (!game.ui?.enableHoverPreview) return empty;
  if (game.phase !== "place") return empty;
  if (!game.selectedPieceKey) return empty;

  const pos = hover.value ?? game.pendingPlace;
  if (!pos) return empty;

  const ok = game.canPlaceAt(pos.x, pos.y);
  const map = new Set();
  const blocks = [];

  for (const [dx, dy] of game.selectedCells) {
    const x = pos.x + dx;
    const y = pos.y + dy;
    if (x >= 0 && y >= 0 && x < game.boardW && y < game.boardH) {
      map.add(`${x},${y}`);
    }
    blocks.push({ x: pos.x + dx, y: pos.y + dy });
  }

  const staged = !hover.value && !!game.pendingPlace;
  return { map, ok, visible: true, blocks, staged };
});

const ghost = computed(() => ghostData.value);
const ghostOverlay = computed(() => ghostData.value);

function setHover(x, y) {
  if (!game.ui?.enableHoverPreview) return;
  if (game.phase !== 'place') return;
  if (!game.ui?.enableClickPlace) return;
  if (!game.selectedPieceKey) return;
  hover.value = { x, y };
  game.hoverCell = { x, y };
}

function clearHover() {
  hover.value = null;
  game.hoverCell = null;
}

function updateHoverFromClientXY(clientX, clientY) {
  if (game.phase !== "place") return;
  if (!game.ui?.enableClickPlace) return;
  if (!game.selectedPieceKey) return;

  const el = boardEl.value;
  if (!el) return;

  const rect = el.getBoundingClientRect();
  const innerLeft = rect.left + BOARD_PADDING;
  const innerTop = rect.top + BOARD_PADDING;
  const innerW = rect.width - BOARD_PADDING * 2;
  const innerH = rect.height - BOARD_PADDING * 2;

  const inside =
    clientX >= innerLeft &&
    clientY >= innerTop &&
    clientX < innerLeft + innerW &&
    clientY < innerTop + innerH;

  if (!inside) {
    targetCell.value = null;
    if (game.ui?.enableHoverPreview) hover.value = null;
    game.hoverCell = null;

    if (game.drag?.active) {
      game.drag.target = { inside: false, ok: false, x: null, y: null };
    }
    return;
  }

  const cellW = innerW / game.boardW;
  const cellH = innerH / game.boardH;

  let x = Math.floor((clientX - innerLeft) / cellW);
  let y = Math.floor((clientY - innerTop) / cellH);

  x = Math.max(0, Math.min(game.boardW - 1, x));
  y = Math.max(0, Math.min(game.boardH - 1, y));

  targetCell.value = { x, y };
  if (game.ui?.enableHoverPreview) hover.value = { x, y };
  game.hoverCell = { x, y };

  if (game.drag?.active) {
    const ok = game.canPlaceAt(x, y);
    game.drag.target = { inside: true, ok, x, y };
  }
}

function onPointerMove(e) {
  if (game.phase !== "place") return;
  if (!game.ui?.enableClickPlace) return;
  if (!game.selectedPieceKey) return;
  if (!game.ui?.enableHoverPreview && !game.drag?.active) return;
  updateHoverFromClientXY(e.clientX, e.clientY);
}
function onDragOver(e) {
  if (game.phase !== "place") return;
  if (!game.ui?.enableClickPlace) return;
  if (!game.selectedPieceKey) return;
  // native HTML drag
  updateHoverFromClientXY(e.clientX, e.clientY);
}

function onShellDrop() {
  if (!targetCell.value) return;
  if (game.phase !== "place") return;
  if (!game.ui?.enableClickPlace) return;
  if (!game.selectedPieceKey) return;
  if (!props.canAct) return;

  const ok = game.placeAt(targetCell.value.x, targetCell.value.y);
  if (!ok) {
    playBuzz();
    showWarning("Illegal placement — try another spot / rotate / flip.");
  }
}

function onDrop(x, y) {
  if (game.phase !== "place") return;
  if (!game.ui?.enableClickPlace) return;
  if (!game.selectedPieceKey) return;
  if (!props.canAct) return;

  const ok = game.placeAt(x, y);
  if (!ok) {
    playBuzz();
    showWarning("Illegal placement — try another spot / rotate / flip.");
  }
}

/* ---------------------------
   ✅ Floating clone animation
---------------------------- */
function getTrayAnchor(player) {
  const draft = document.querySelector(`[data-tray="${player}"][data-tray-context="draft"]`);
  if (draft) return draft;

  const battle = document.querySelector(`[data-tray="${player}"][data-tray-context="battle"]`);
  if (battle) return battle;

  return null;
}

function spawnFlyClone(pieceKey, player, fromEl) {
  const tray = getTrayAnchor(player);
  if (!tray || !fromEl) return;

  const from = fromEl.getBoundingClientRect();
  const to = tray.getBoundingClientRect();

  const shape = PENTOMINOES[pieceKey];
  const s = getPieceStyle(pieceKey);

  const node = document.createElement("div");
  node.className = `flyClone ${player === 1 ? "p1" : "p2"}`;
  node.style.position = "fixed";
  node.style.left = `${from.left}px`;
  node.style.top = `${from.top}px`;
  node.style.pointerEvents = "none";
  node.style.zIndex = "999999";
  node.style.display = "grid";
  node.style.transformOrigin = "center center";

  let maxX = 0, maxY = 0;
  for (const [x, y] of shape) {
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const cell = Math.min(from.width, from.height) * 0.5;

  node.style.gridTemplateColumns = `repeat(${maxX + 1}, ${cell}px)`;
  node.style.gridTemplateRows = `repeat(${maxY + 1}, ${cell}px)`;

  for (const [x, y] of shape) {
    const block = document.createElement("div");
    block.style.width = `${cell}px`;
    block.style.height = `${cell}px`;
    block.style.borderRadius = "6px";
    block.style.border = "1px solid rgba(255,255,255,0.2)";
    block.style.boxShadow =
      "0 6px 12px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.3)";

    if (s.skin) {
      block.style.backgroundImage = `url(${s.skin})`;
      block.style.backgroundSize = "cover";
    } else {
      block.style.background = s.color || "#fff";
    }

    block.style.gridColumn = x + 1;
    block.style.gridRow = y + 1;

    node.appendChild(block);
  }

  document.body.appendChild(node);

  const dx = to.left + to.width / 2 - (from.left + from.width / 2);
  const dy = to.top + to.height / 2 - (from.top + from.height / 2);

  node.animate(
    [
      { transform: "translate(0px,0px) scale(1)", opacity: 1 },
      {
        transform: `translate(${dx}px, ${dy}px) scale(0.35)`,
        opacity: 0.95,
      },
    ],
    {
      duration: 520,
      easing: "cubic-bezier(.18,.9,.18,1)",
      fill: "forwards",
    }
  );

  setTimeout(() => {
    node.animate(
      [
        { filter: "brightness(1.2)", opacity: 0.9 },
        { filter: "brightness(1.6)", opacity: 0 },
      ],
      { duration: 180, easing: "ease-out", fill: "forwards" }
    );
  }, 470);

  setTimeout(() => node.remove(), 700);
}

/* ─── Touch support on the board shell ────────────────────────────────
   onBoardTouchStart: lets the user re-drag a staged (pendingPlace) piece
   directly on the board without going back to the chip panel.

   onTouchMove / onTouchEnd serve both PiecePicker drags entering the
   board area AND board-initiated re-positioning drags.
───────────────────────────────────────────────────────────── */
function onBoardTouchStart(e) {
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;
  if (game.drag?.active) return; // PiecePicker drag in flight — don't interfere

  // A piece is selected (staged or just picked): allow dragging it from the board.
  e.preventDefault();
  const touch = e.touches[0];
  if (!touch) return;

  boardDragging.value = true;
  game.beginDrag(game.selectedPieceKey, touch.clientX, touch.clientY);
  updateHoverFromClientXY(touch.clientX, touch.clientY);
}

function onTouchMove(e) {
  if (game.phase !== "place") return;
  if (!game.selectedPieceKey) return;
  // Only intercept scroll when a drag is actually in progress
  if (!game.drag?.active) return;
  e.preventDefault();
  const touch = e.touches[0];
  if (!touch) return;
  updateHoverFromClientXY(touch.clientX, touch.clientY);
  game.updateDrag(touch.clientX, touch.clientY);
}

function onTouchEnd(e) {
  if (game.phase !== "place") return;

  // ── Board-initiated repositioning drag ──────────────────────────
  if (boardDragging.value) {
    boardDragging.value = false;
    hover.value = null;

    if (!game.drag?.active) {
      targetCell.value = null;
      return;
    }

    const t = game.drag?.target;
    if (t && t.inside) {
      const requireSubmit = game.ui?.requireSubmit ?? true;
      if (requireSubmit) {
        const staged = game.stagePlacement(t.x, t.y);
        if (!staged) {
          // Invalid spot — stage unconditionally so ghost stays; user can rotate/flip to fix
          game.$patch({ pendingPlace: { x: t.x, y: t.y } });
          playBuzz();
          showWarning("Illegal placement — try another spot / rotate / flip.");
        }
        game.endDrag();
      } else {
        const ok = game.placeAt(t.x, t.y);
        if (!ok) {
          playBuzz();
          showWarning("Illegal placement — try another spot / rotate / flip.");
        }
        game.endDrag();
      }
    } else {
      game.endDrag();
    }

    targetCell.value = null;
    return;
  }

  // ── PiecePicker drag entering/leaving the board ──────────────────
  // PiecePicker's pointerup handler will commit/stage; we just clear hover.
  if (!game.drag?.active) return;
  hover.value = null;
  targetCell.value = null;
}

function onMobileSubmit() {
  if (!game.pendingPlace) return;
  // Guard against synthetic click events firing right after a drop staged the piece.
  // On mobile, pointerup → stagePlacement → 300ms later → synthetic click on submit.
  if (Date.now() - stagedAt < 480) return;
  if (!props.canAct) return;
  const ok = game.commitPendingPlace();
  if (!ok) {
    playBuzz();
    showWarning("Illegal placement — try another spot / rotate / flip.");
  }
  hover.value = null;
}

/** ✅ CLICK does two different things depending on phase */
function onCellClick(x, y, evt) {
  if (game.phase === "draft") {
    if (!props.canAct) return;
    const v = game.draftBoard[y][x];
    if (!v) return;
    if (v.draftedBy) return;
    const fromEl = evt?.currentTarget;
    spawnFlyClone(v.pieceKey, game.draftTurn, fromEl);
    game.draftPick(v.pieceKey);
    return;
  }

  if (game.phase !== "place") return;
  if (!game.ui?.enableClickPlace) return;
  if (!game.selectedPieceKey) return;
  if (!props.canAct) return;

  // While a piece is staged (pendingPlace set), tapping any cell repositions the ghost
  if (game.ui?.requireSubmit && game.pendingPlace) {
    if (game.canPlaceAt(x, y)) {
      game.pendingPlace = { x, y };
    } else {
      playBuzz();
      showWarning("Can't place there — try rotating or flipping.");
    }
    return;
  }

  // Touch: handled entirely by the drag/drop flow, ignore synthetic click
  if (evt?.pointerType === "touch") return;

  // requireSubmit ON (PC mouse click): stage for confirmation
  if (game.ui?.requireSubmit) {
    if (game.canPlaceAt(x, y)) {
      game.pendingPlace = { x, y };
    } else {
      playBuzz();
      showWarning("Illegal placement — try rotating or flipping.");
    }
    return;
  }

  // requireSubmit OFF: place immediately on click
  const ok = game.placeAt(x, y);
  if (!ok) {
    playBuzz();
    showWarning("Illegal placement — try another spot / rotate / flip.");
  }
}

function cellClass(cell) {
  if (game.phase === "draft") {
    const drafted = !!cell.v?.draftedBy;
    return {
      empty: cell.v === null,
      draft: cell.v !== null,
      drafted,
      "drafted-p1": drafted && cell.v.draftedBy === 1,
      "drafted-p2": drafted && cell.v.draftedBy === 2,
    };
  }

  const isGhost = ghost.value.map?.has(cell.key);
  return {
    empty: cell.v === null,
    placed: cell.v !== null,
    "ghost-ok": isGhost && ghost.value.ok,
    "ghost-bad": isGhost && !ghost.value.ok,
  };
}

function cellInlineStyle(cell) {
  if (game.phase === "draft") {
    if (!cell.v?.pieceKey) return null;

    const s = getPieceStyle(cell.v.pieceKey);
    if (s.skin) {
      return {
        backgroundImage: `url(${s.skin})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
        filter: cell.v.draftedBy
          ? "brightness(0.55) saturate(0.65)"
          : "brightness(0.92) saturate(1.05)",
      };
    }
    return { backgroundColor: s.color };
  }

  if (cell.v && cell.v.pieceKey) {
    const s = getPieceStyle(cell.v.pieceKey);
    if (s.skin) {
      return {
        backgroundImage: `url(${s.skin})`,
        backgroundSize: "cover",
        backgroundPosition: "center",
      };
    }
    return { backgroundColor: s.color };
  }
  return null;
}

function cellTitle(cell) {
  if (game.phase === "draft") {
    if (!cell.v) return `(${cell.x},${cell.y}) empty`;
    if (cell.v.draftedBy) return `Drafted by P${cell.v.draftedBy}: ${cell.v.pieceKey}`;
    return `Draft piece: ${cell.v.pieceKey}`;
  }
  if (!cell.v) return `(${cell.x},${cell.y}) empty`;
  return `(${cell.x},${cell.y}) P${cell.v.player} ${cell.v.pieceKey}`;
}

function ghostBlockStyle(b) {
  const s = getPieceStyle(game.selectedPieceKey);

  const leftPct = (b.x / game.boardW) * 100;
  const topPct = (b.y / game.boardH) * 100;
  const wPct = (1 / game.boardW) * 100;
  const hPct = (1 / game.boardH) * 100;

  const base = {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    width: `${wPct}%`,
    height: `${hPct}%`,
    transition: "left 55ms linear, top 55ms linear",
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
/* board styles (same as your last version) */
.boardWrap {
  display: flex;
  flex-direction: column;
  gap: 14px;
  /* Let the board consume all remaining space in the right panel */
  flex: 1 1 auto;
  min-height: 0;
  align-items: stretch;
}

.boardShell {
  position: relative;
  /* Fill the right panel; the inner sizer keeps the aspect ratio. */
  flex: 1 1 auto;
  min-height: 300px;
  width: 100%;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  /* Prevent the browser from intercepting touch events for scrolling
     so touch drag-to-place works correctly on mobile. */
  touch-action: none;
}

/* Mobile: ensure boardShell has real height so the ResizeObserver
   can calculate the board size correctly in the side-by-side layout */
@media (max-width: 980px){
  .boardShell{ min-height: 340px; }
}

/* Small devices */
@media (max-width: 520px){
  .boardWrap{ gap: 10px; }
  .boardShell{ min-height: 280px; }
  .legend{ flex-wrap: wrap; gap: 10px; font-size: 12px; }
}

@media (max-height: 620px){
  .boardWrap{ gap: 10px; }
  .boardShell{ min-height: 220px; }
  .legend{ flex-wrap: wrap; gap: 10px; font-size: 12px; }
}

.boardSizer{
  position: relative;
  /*
    JS sets width/height so the board scales *uniformly* (contain)
    and never gets "flattened".
  */
  margin: 0 auto;
}

.neonFrame {
  position: absolute;
  inset: -10px;
  border-radius: 22px;
  background:
    linear-gradient(#0000, #0000) padding-box,
    conic-gradient(
      from 180deg,
      rgba(0,255,255,0.65),
      rgba(255,0,255,0.65),
      rgba(255,255,0,0.55),
      rgba(0,255,160,0.60),
      rgba(0,255,255,0.65)
    ) border-box;
  border: 2px solid transparent;
  box-shadow:
    0 0 22px rgba(0, 255, 255, 0.18),
    0 0 38px rgba(255, 0, 255, 0.16),
    0 0 52px rgba(255, 255, 0, 0.10),
    0 16px 50px rgba(0,0,0,0.65);
  filter: saturate(1.15);
  opacity: 0.92;
  animation: neonPulse 3.2s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}
@keyframes neonPulse {
  0%, 100% { transform: translateY(0); filter: saturate(1.12); opacity: 0.88; }
  50% { transform: translateY(-1px); filter: saturate(1.25); opacity: 0.98; }
}

.scanlines {
  position: absolute;
  inset: 0;
  border-radius: 18px;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255,255,255,0.03),
    rgba(255,255,255,0.03) 1px,
    rgba(0,0,0,0.00) 5px,
    rgba(0,0,0,0.00) 9px
  );
  opacity: 0.14;
  mix-blend-mode: overlay;
  pointer-events: none;
  z-index: 1;
}

.board {
  position: relative;
  z-index: 2;

  width: 100%;
  height: 100%;
  display: grid;
  gap: 3px;
  padding: 10px;

  border-radius: 16px;

  background:
    radial-gradient(900px 360px at 50% 30%, rgba(0,255,255,0.08), rgba(0,0,0,0) 55%),
    radial-gradient(900px 420px at 40% 85%, rgba(255,0,255,0.07), rgba(0,0,0,0) 58%),
    linear-gradient(180deg, rgba(12,14,24,0.95), rgba(6,7,12,0.96));

  border: 1px solid rgba(255,255,255,0.10);

  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.12),
    inset 0 -18px 40px rgba(0,0,0,0.55),
    inset 0 0 0 1px rgba(0,255,255,0.07);
}

.cell {
  position: relative;
  border-radius: 7px;
  cursor: pointer;
  border: 1px solid rgba(255,255,255,0.07);
  background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(0,0,0,0.02));
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.10),
    inset 0 -2px 0 rgba(0,0,0,0.25);
  transition: transform 120ms ease, filter 120ms ease, box-shadow 120ms ease;
}

.cell:hover {
  transform: translateY(-1px);
  filter: brightness(1.08);
  box-shadow:
    0 6px 14px rgba(0,0,0,0.40),
    inset 0 1px 0 rgba(255,255,255,0.14),
    inset 0 -2px 0 rgba(0,0,0,0.25);
}

.cell.placed {
  border: 1px solid rgba(255,255,255,0.16);
  box-shadow:
    0 10px 18px rgba(0,0,0,0.45),
    0 0 10px rgba(255,255,255,0.06),
    inset 0 1px 0 rgba(255,255,255,0.22),
    inset 0 -4px 0 rgba(0,0,0,0.30);
}

.cell.ghost-ok { outline: 2px solid rgba(0,255,170,0.85); }
.cell.ghost-bad { outline: 2px solid rgba(255,80,120,0.85); }

.board.draftMode .cell { cursor: pointer; }

.cell.draft {
  border: 1px solid rgba(255,255,255,0.14);
  box-shadow:
    inset 0 1px 0 rgba(255,255,255,0.20),
    inset 0 -6px 10px rgba(0,0,0,0.35);
}

/* Drafted pieces: dim + locked */
.cell.drafted {
  cursor: default;
  transform: none !important;
  filter: brightness(0.82) saturate(0.8);
  opacity: 0.95;
}
.cell.drafted:hover {
  transform: none !important;
  filter: brightness(0.80) saturate(0.8);
}

/* Corner P1/P2 */
.cornerTag {
  position: absolute;
  top: 6px;
  left: 6px;
  font-size: 10px;
  font-weight: 1000;
  letter-spacing: 0.08em;
  padding: 2px 6px;
  border-radius: 999px;
  border: 1px solid rgba(255,255,255,0.18);
  background: rgba(10,10,14,0.65);
  box-shadow: 0 8px 14px rgba(0,0,0,0.35);
  pointer-events: none;
  z-index: 2;
}
.cornerTag.p1 { color: rgba(78, 201, 255, 0.98); }
.cornerTag.p2 { color: rgba(255, 107, 107, 0.98); }

.ghostOverlay {
  position: absolute;
  inset: 10px;
  border-radius: 12px;
  pointer-events: none;
  z-index: 999;
  filter:
    drop-shadow(0 18px 32px rgba(0,0,0,0.60))
    drop-shadow(0 0 12px rgba(0,255,255,0.10));
}
.ghostOverlay.bad { opacity: 0.78; }

.ghostBlock {
  position: absolute;
  border-radius: 9px;
  border: 1px solid rgba(0,0,0,0.55);
  box-shadow:
    0 14px 22px rgba(0,0,0,0.50),
    0 0 14px rgba(255,255,255,0.07),
    inset 0 1px 0 rgba(255,255,255,0.26),
    inset 0 -6px 0 rgba(0,0,0,0.34);
  overflow: hidden;
}
.ghostBlock::before {
  content: "";
  position: absolute;
  inset: 0;
  background: linear-gradient(
    to bottom,
    rgba(255,255,255,0.26),
    rgba(255,255,255,0.08) 35%,
    rgba(0,0,0,0.12)
  );
}

.legend {
  margin-top: 14px;
  display: flex;
  gap: 14px;
  opacity: 0.92;
  font-size: 13px;
  flex-wrap: wrap;
}
.legendItem { display: flex; align-items: center; gap: 8px; }
.muted { opacity: 0.7; }
.swatch {
  width: 14px; height: 14px; border-radius: 4px;
  border: 1px solid rgba(255,255,255,0.18);
}
.swatch.ok { background: rgba(0,255,170,0.60); }
.swatch.bad { background: rgba(255,80,120,0.60); }

.warning {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: rgba(10, 10, 14, 0.72);
  border: 1px solid rgba(255, 120, 150, 0.22);
  box-shadow:
    0 12px 26px rgba(0,0,0,0.55),
    0 0 16px rgba(255, 80, 120, 0.10);
  color: rgba(255, 160, 175, 0.95);
  font-weight: 900;
  letter-spacing: 0.02em;
  animation: warnPop 170ms ease;
}
.warnIcon {
  width: 22px;
  height: 22px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: rgba(255, 80, 120, 0.14);
  border: 1px solid rgba(255, 80, 120, 0.22);
}
.warnText { font-size: 13px; opacity: 0.95; }
@keyframes warnPop {
  from { transform: translateY(-4px); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}

/* ── Ghost overlay staged style (pendingPlace) ── */
.ghostOverlay.staged { opacity: 0.92; }
.ghostOverlay.staged.ok { filter: drop-shadow(0 0 18px rgba(0,255,170,0.45)) drop-shadow(0 18px 32px rgba(0,0,0,0.60)); }
.ghostOverlay.staged.bad { opacity: 0.72; }
</style>

<!-- Mobile action bar: global (teleported to body), only visible on touch/mobile -->
<style>
.mobileActionBar {
  display: none;
}

@media (max-width: 980px), (pointer: coarse) {
  .mobileActionBar {
    display: flex;
    align-items: stretch;
    justify-content: center;
    gap: 10px;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 9000;
    padding: 10px 14px max(18px, env(safe-area-inset-bottom, 18px));
    background: linear-gradient(to top, rgba(8,10,18,0.98) 65%, rgba(8,10,18,0.0));
    pointer-events: auto;
  }

  /* Base button */
  .mobileBtn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    border-radius: 18px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background: rgba(30, 32, 48, 0.92);
    color: #eaeaea;
    cursor: pointer;
    touch-action: manipulation;
    transition: background 100ms ease, transform 80ms ease, border-color 100ms ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    min-width: 80px;
    padding: 14px 10px;
  }

  .mobileBtn:active { transform: scale(0.93); }

  .mobileBtn:disabled {
    opacity: 0.28;
    cursor: not-allowed;
  }

  .mobileBtnIcon {
    font-size: 26px;
    line-height: 1;
  }

  .mobileBtnLabel {
    font-size: 11px;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    opacity: 0.85;
  }

  /* ROTATE + FLIP: equal flex share */
  .mobileIconBtn {
    flex: 1;
  }

  /* SUBMIT: wider and more prominent */
  .mobileSubmitBtn {
    flex: 1.4;
    background: rgba(20, 22, 38, 0.92);
    border-color: rgba(255,255,255,0.16);
  }

  .mobileSubmitBtn .mobileBtnIcon {
    font-size: 28px;
  }

  .mobileSubmitBtn .mobileBtnLabel {
    font-size: 12px;
    letter-spacing: 0.14em;
  }

  .mobileSubmitBtn.hasPending {
    background: linear-gradient(160deg, rgba(0, 200, 100, 0.32), rgba(0, 160, 80, 0.24));
    border-color: rgba(0, 255, 140, 0.55);
    color: rgba(150, 255, 200, 0.98);
    box-shadow: 0 0 28px rgba(0, 255, 140, 0.22);
    animation: submitPulse 1.8s ease-in-out infinite;
  }

  @keyframes submitPulse {
    0%, 100% { box-shadow: 0 0 20px rgba(0,255,140,0.18); }
    50%       { box-shadow: 0 0 36px rgba(0,255,140,0.42); }
  }

  /* Bar fades slightly while a drag is in flight.
     Rotate/Flip remain fully interactive so the user can transform mid-drag.
     Only the Submit button is blocked (staging before drop makes no sense). */
  .mobileActionBar.dragActive {
    transition: opacity 120ms ease;
  }

  .mobileActionBar.dragActive .mobileSubmitBtn {
    pointer-events: none !important;
    opacity: 0.22;
  }

  .mobileActionBar.dragActive .mobileIconBtn {
    opacity: 0.85;
  }
}

.flyClone { will-change: transform, opacity, filter; }
.flyClone.p1 { outline: 2px solid rgba(78, 201, 255, 0.25); }
.flyClone.p2 { outline: 2px solid rgba(255, 107, 107, 0.25); }
</style>