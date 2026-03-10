<template>
  <Teleport to="body">
    <div v-if="devModeActive" class="dev-overlay" :style="{ top: posY+'px', left: posX+'px' }">

      <!-- Header -->
      <div class="dev-header" @mousedown="startDrag">
        <span class="dev-badge">⚙ DEV</span>
        <span class="dev-title">{{ isRecording() ? '● REC' : 'Move Inspector' }}</span>
        <div class="dev-actions">
          <button class="dev-btn" @click.stop="minimized=!minimized">{{ minimized?'▲':'▼' }}</button>
          <button class="dev-btn dev-close" @click.stop="toggleDevMode">✕</button>
        </div>
      </div>

      <div v-if="!minimized" class="dev-body">

        <!-- Tabs -->
        <div class="dev-tabs">
          <button v-for="t in tabs" :key="t.id" class="dev-tab" :class="{active:activeTab===t.id}" @click="activeTab=t.id">
            {{ t.label }}
          </button>
        </div>

        <!-- ── LIVE tab ── -->
        <div v-if="activeTab==='live'" class="dev-panel">
          <div class="dev-row"><span class="dev-k">phase</span><span class="dev-v" :class="'t-'+game.phase">{{ game.phase }}</span></div>
          <div class="dev-row"><span class="dev-k">player</span><span class="dev-v" :class="'p'+game.currentPlayer">P{{ game.currentPlayer }}</span></div>
          <div class="dev-row"><span class="dev-k">placed</span><span class="dev-v">{{ game.placedCount }}</span></div>
          <div class="dev-row"><span class="dev-k">winner</span><span class="dev-v">{{ game.winner ?? '—' }}</span></div>
          <div class="dev-sep"/>
          <div class="dev-row"><span class="dev-k">P1 pieces</span><span class="dev-v yellow">{{ (game.remaining?.[1]||[]).join(' ') || '—' }}</span></div>
          <div class="dev-row"><span class="dev-k">P2 pieces</span><span class="dev-v yellow">{{ (game.remaining?.[2]||[]).join(' ') || '—' }}</span></div>
          <div class="dev-sep"/>
          <div class="dev-row"><span class="dev-k">last move</span><span class="dev-v" :class="'t-'+(game.lastMove?.type||'')">{{ game.lastMove?.type ?? '—' }}</span></div>
          <template v-if="game.lastMove">
            <div class="dev-row"><span class="dev-k">piece</span><span class="dev-v yellow">{{ game.lastMove.piece ?? '—' }}</span></div>
            <div v-if="game.lastMove.x!=null" class="dev-row"><span class="dev-k">pos</span><span class="dev-v">({{ game.lastMove.x }}, {{ game.lastMove.y }})</span></div>
            <div class="dev-row"><span class="dev-k">seq</span><span class="dev-v muted">{{ game.lastMove.seq }}</span></div>
          </template>
          <div class="dev-sep"/>
          <div class="dev-row"><span class="dev-k">recording</span>
            <span class="dev-v" :class="isRecording()?'rec-on':'muted'">{{ isRecording() ? `● ON (${currentEventCount} events)` : 'off' }}</span>
          </div>

          <!-- ── Territory (AI mode, place phase only) ── -->
          <template v-if="territory">
            <div class="dev-sep"/>
            <div class="dev-sectionhd">Territory (Voronoi)</div>
            <div class="dev-terr-bar">
              <div class="dev-terr-fill p1" :style="{ width: territory.p1Pct + '%' }"></div>
              <div class="dev-terr-fill contested" :style="{ width: territory.cPct + '%' }"></div>
              <div class="dev-terr-fill p2" :style="{ width: territory.p2Pct + '%' }"></div>
            </div>
            <div class="dev-row">
              <span class="dev-k">P1 <span class="muted" style="font-size:9px">{{ territory.ai===1 ? 'AI' : 'YOU' }}</span></span>
              <span class="dev-v p1">{{ territory.p1Pct }}% ({{ territory.p1Cells }} cells)</span>
            </div>
            <div class="dev-row">
              <span class="dev-k">P2 <span class="muted" style="font-size:9px">{{ territory.ai===2 ? 'AI' : 'YOU' }}</span></span>
              <span class="dev-v p2">{{ territory.p2Pct }}% ({{ territory.p2Cells }} cells)</span>
            </div>
            <div class="dev-row"><span class="dev-k">contested</span><span class="dev-v muted">{{ territory.cPct }}% ({{ territory.contested }} cells)</span></div>
            <div class="dev-row"><span class="dev-k">edge</span>
              <span class="dev-v" :class="territory.p1Pct > territory.p2Pct ? 'p1' : territory.p2Pct > territory.p1Pct ? 'p2' : 'muted'">
                {{ territory.p1Pct === territory.p2Pct ? 'even' : (territory.p1Pct > territory.p2Pct ? 'P1 +' : 'P2 +') + Math.abs(territory.p1Pct - territory.p2Pct) + '%' }}
              </span>
            </div>
          </template>
        </div>

        <!-- ── HISTORY tab ── -->
        <div v-if="activeTab==='history'" class="dev-panel">
          <div class="dev-sectionhd">
            Live History
            <span class="muted">({{ liveHistory.length }})</span>
            <button class="dev-pill" @click="liveHistory=[]">clear</button>
          </div>
          <div class="dev-scroll">
            <div v-for="(mv,i) in [...liveHistory].reverse()" :key="i"
                 class="dev-hist-row" :class="'pbg'+mv.player">
              <span class="muted">#{{ mv.seq }}</span>
              <span :class="'t-'+mv.type">{{ mv.type }}</span>
              <span v-if="mv.piece" class="yellow">{{ mv.piece }}</span>
              <span v-if="mv.x!=null" class="muted">({{ mv.x }},{{ mv.y }})</span>
              <span class="muted" style="margin-left:auto">P{{ mv.player }}</span>
            </div>
            <div v-if="!liveHistory.length" class="dev-empty">No moves yet</div>
          </div>
        </div>

        <!-- ── SAVED tab ── -->
        <div v-if="activeTab==='saved'" class="dev-panel">
          <div class="dev-sectionhd">
            Saved Matches
            <span class="muted">({{ savedMatches.length }})</span>
            <button class="dev-pill danger" @click="confirmClearAll">clear all</button>
          </div>

          <!-- Match list -->
          <div v-if="!selectedMatch" class="dev-scroll">
            <div v-if="!savedMatches.length" class="dev-empty">No saved matches yet.<br>Finish a VS AI game to record one.</div>
            <div v-for="m in [...savedMatches].reverse()" :key="m.id"
                 class="dev-match-row" @click="selectedMatch=m">
              <div class="dev-match-info">
                <span class="yellow">{{ m.meta.aiDifficulty ?? 'AI' }}</span>
                <span class="muted">{{ m.events.length }} events</span>
                <span :class="m.winner===2?'p2':'p1'">{{ m.winner===2?'P2 WIN':'P1 WIN' }}</span>
              </div>
              <div class="dev-match-date muted">{{ fmtDate(m.startedAt) }}</div>
            </div>
          </div>

          <!-- Match detail -->
          <div v-else class="dev-match-detail">
            <div class="dev-sectionhd">
              <button class="dev-pill" @click="selectedMatch=null">← back</button>
              {{ selectedMatch.meta.aiDifficulty }} · {{ selectedMatch.events.length }} events
              <button class="dev-pill" @click="deleteMatch(selectedMatch.id); selectedMatch=null">delete</button>
            </div>
            <div class="dev-row"><span class="dev-k">started</span><span class="dev-v muted">{{ fmtDate(selectedMatch.startedAt) }}</span></div>
            <div class="dev-row"><span class="dev-k">duration</span><span class="dev-v">{{ fmtDuration(selectedMatch.duration) }}</span></div>
            <div class="dev-row"><span class="dev-k">winner</span><span class="dev-v" :class="'p'+selectedMatch.winner">P{{ selectedMatch.winner }}</span></div>
            <div class="dev-row"><span class="dev-k">board</span><span class="dev-v">{{ selectedMatch.meta.boardW }}×{{ selectedMatch.meta.boardH }}</span></div>
            <div class="dev-row"><span class="dev-k">P1 picks</span><span class="dev-v yellow">{{ (selectedMatch.draftPicks?.[1]||[]).join(' ') || '—' }}</span></div>
            <div class="dev-row"><span class="dev-k">P2 picks</span><span class="dev-v yellow">{{ (selectedMatch.draftPicks?.[2]||[]).join(' ') || '—' }}</span></div>
            <div class="dev-sep"/>
            <div class="dev-sectionhd">Events</div>
            <div class="dev-scroll">
              <div v-for="(ev,i) in selectedMatch.events" :key="i"
                   class="dev-hist-row" :class="'pbg'+ev.player">
                <span class="muted">#{{ ev.seq }}</span>
                <span :class="'t-'+ev.type">{{ ev.type }}</span>
                <span v-if="ev.piece" class="yellow">{{ ev.piece }}</span>
                <span v-if="ev.x!=null" class="muted">({{ ev.x }},{{ ev.y }})</span>
                <span class="muted" style="margin-left:auto">+{{ ev._ts }}ms</span>
              </div>
            </div>
            <div class="dev-sep"/>
            <!-- COPY BUTTON -->
            <button class="dev-copy-btn" @click="copyMatch(selectedMatch)">
              {{ copyState==='idle' ? '📋 Copy Full Match JSON' : copyState==='ok' ? '✓ Copied!' : '✗ Failed' }}
            </button>
          </div>
        </div>

        <!-- ── JSON tab ── -->
        <div v-if="activeTab==='json'" class="dev-panel">
          <div class="dev-sectionhd">
            Last Move JSON
            <button class="dev-pill" @click="copyLastMove">{{ lastMoveCopy==='idle'?'copy':lastMoveCopy==='ok'?'✓ copied':'✗ fail' }}</button>
          </div>
          <pre class="dev-json">{{ prettyLastMove }}</pre>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, nextTick, onUnmounted } from 'vue';
import { useGameStore } from '../store/game.js';
import { useDevMode } from '../lib/devMode.js';

const props = defineProps({
  aiDifficulty: { type: String, default: null },
  aiPlayer:     { type: Number, default: null },
});

const game = useGameStore();
const {
  devModeActive, toggleDevMode, savedMatches,
  startRecording, recordMove, saveRecording, discardRecording,
  isRecording, deleteMatch, clearAllMatches,
} = useDevMode();

// ── Position + drag ───────────────────────────────────────────────────────────
const posX = ref(16), posY = ref(72);
const minimized = ref(false);
let dragging = false, ox = 0, oy = 0;
function startDrag(e) {
  dragging = true; ox = e.clientX - posX.value; oy = e.clientY - posY.value;
  window.addEventListener('mousemove', onDrag); window.addEventListener('mouseup', stopDrag);
}
function onDrag(e) { if (!dragging) return; posX.value = Math.max(0, e.clientX-ox); posY.value = Math.max(0, e.clientY-oy); }
function stopDrag() { dragging=false; window.removeEventListener('mousemove',onDrag); window.removeEventListener('mouseup',stopDrag); }
onUnmounted(stopDrag);

// ── Tabs ──────────────────────────────────────────────────────────────────────
const tabs = [
  { id:'live',    label:'Live'    },
  { id:'history', label:'History' },
  { id:'saved',   label:'Saved'   },
  { id:'json',    label:'JSON'    },
];
const activeTab = ref('live');

// ── Territory (AI mode only) ──────────────────────────────────────────────
// BFS Voronoi: each empty cell is claimed by the nearest player's piece.
const territory = computed(() => {
  if (props.aiPlayer === null) return null;
  if (game.phase !== 'place') return null;

  const W = game.boardW, H = game.boardH;
  const board = game.board;
  const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

  const dist1 = new Array(H * W).fill(Infinity);
  const dist2 = new Array(H * W).fill(Infinity);
  const q1 = [], q2 = [];

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = board[y]?.[x]?.player;
      if (p === 1) { dist1[y * W + x] = 0; q1.push([x, y]); }
      else if (p === 2) { dist2[y * W + x] = 0; q2.push([x, y]); }
    }
  }

  function bfs(q, dist) {
    let qi = 0;
    while (qi < q.length) {
      const [cx, cy] = q[qi++];
      const cd = dist[cy * W + cx];
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (board[ny][nx] !== null) continue;
        if (dist[nk] === Infinity) { dist[nk] = cd + 1; q.push([nx, ny]); }
      }
    }
  }
  bfs(q1, dist1);
  bfs(q2, dist2);

  let p1 = 0, p2 = 0, contested = 0, empty = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (board[y][x] !== null) continue;
      const k = y * W + x;
      const d1 = dist1[k], d2 = dist2[k];
      empty++;
      if (d1 < d2) p1++;
      else if (d2 < d1) p2++;
      else contested++;
    }
  }

  const total = W * H;
  const placed1 = game.picks[1]?.length - (game.remaining[1]?.length ?? 0);
  const placed2 = game.picks[2]?.length - (game.remaining[2]?.length ?? 0);

  return {
    p1Cells: p1, p2Cells: p2, contested,
    p1Pct: total ? Math.round((p1 / total) * 100) : 0,
    p2Pct: total ? Math.round((p2 / total) * 100) : 0,
    cPct:  total ? Math.round((contested / total) * 100) : 0,
    placed1, placed2,
    ai: props.aiPlayer, human: props.aiPlayer === 1 ? 2 : 1,
  };
});

// ── Live history ──────────────────────────────────────────────────────────────
const liveHistory = ref([]);
const currentEventCount = ref(0);

watch(() => game.lastMove, (mv) => {
  if (!mv || !devModeActive.value) return;
  const last = liveHistory.value[liveHistory.value.length-1];
  if (last?.seq === mv.seq) return;
  liveHistory.value.push({...mv});
  if (liveHistory.value.length > 200) liveHistory.value.shift();

  // Forward to recorder
  if (isRecording()) {
    recordMove(mv, { board: game.board, remaining: game.remaining, picks: game.picks });
    currentEventCount.value++;
  }
});

// ── Auto start/stop recording ─────────────────────────────────────────────────
let _pendingSave = false;

async function _doSave() {
  if (_pendingSave || !isRecording()) return;
  _pendingSave = true;
  // nextTick ensures Pinia has finished setting BOTH phase AND winner
  await nextTick();
  if (!isRecording()) { _pendingSave = false; return; }
  saveRecording({
    winner: game.winner,
    board:  game.board,
    picks:  game.picks,
  });
  _pendingSave = false;
}

watch(() => game.phase, (phase, prev) => {
  if (!devModeActive.value) return;

  if (phase === 'draft' && prev !== 'draft') {
    liveHistory.value = [];
    currentEventCount.value = 0;
    _pendingSave = false;
    discardRecording();
    startRecording({
      boardW:       game.boardW,
      boardH:       game.boardH,
      aiDifficulty: props.aiDifficulty,
      aiPlayer:     props.aiPlayer,
      allowFlip:    game.allowFlip,
      mode:         'vsai',
    });
  }

  if (phase === 'gameover') _doSave();
});

// Belt-and-suspenders: also trigger on winner changing (fires after phase in same flush)
watch(() => game.winner, (w) => {
  if (!devModeActive.value || !isRecording()) return;
  if (game.phase === 'gameover' && w !== null && w !== undefined) _doSave();
});

// Also start recording when dev mode is toggled on mid-game
watch(devModeActive, (active) => {
  if (active && (game.phase === 'draft' || game.phase === 'place') && !isRecording()) {
    liveHistory.value = [];
    currentEventCount.value = 0;
    startRecording({
      boardW: game.boardW, boardH: game.boardH,
      aiDifficulty: props.aiDifficulty, aiPlayer: props.aiPlayer,
      allowFlip: game.allowFlip, mode: 'vsai',
    });
  }
  if (!active && isRecording()) discardRecording();
});

// ── Saved match UI ────────────────────────────────────────────────────────────
const selectedMatch = ref(null);

function confirmClearAll() {
  if (confirm('Delete all saved dev matches?')) { clearAllMatches(); selectedMatch.value = null; }
}

// ── Copy helpers ──────────────────────────────────────────────────────────────
const copyState    = ref('idle');
const lastMoveCopy = ref('idle');

async function copyMatch(match) {
  try {
    await navigator.clipboard.writeText(JSON.stringify(match, null, 2));
    copyState.value = 'ok';
  } catch { copyState.value = 'fail'; }
  setTimeout(() => copyState.value = 'idle', 2000);
}

async function copyLastMove() {
  try {
    await navigator.clipboard.writeText(prettyLastMove.value);
    lastMoveCopy.value = 'ok';
  } catch { lastMoveCopy.value = 'fail'; }
  setTimeout(() => lastMoveCopy.value = 'idle', 2000);
}

// ── Computed ──────────────────────────────────────────────────────────────────
const prettyLastMove = computed(() =>
  game.lastMove ? JSON.stringify(game.lastMove, null, 2) : 'null'
);

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-US', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDuration(ms) {
  if (!ms) return '—';
  const s = Math.floor(ms/1000), m = Math.floor(s/60);
  return m ? `${m}m ${s%60}s` : `${s}s`;
}
</script>

<style scoped>
.dev-overlay {
  position: fixed;
  width: 310px;
  max-height: 580px;
  background: #0b0b10;
  border: 1px solid #252535;
  border-radius: 8px;
  box-shadow: 0 8px 32px rgba(0,0,0,.75), 0 0 0 1px rgba(110,60,255,.18);
  font-family: 'JetBrains Mono','Fira Code','Courier New',monospace;
  font-size: 11px;
  z-index: 99999;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Header */
.dev-header {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 8px;
  background: linear-gradient(90deg,#160830,#0c1430);
  border-bottom: 1px solid #1e1e30;
  cursor: grab; flex-shrink: 0;
}
.dev-header:active { cursor: grabbing; }
.dev-badge {
  font-size: 9px; font-weight: 700; letter-spacing:.05em;
  background: #6d28d9; color: #fff; padding: 2px 5px; border-radius: 3px;
}
.dev-title { flex:1; color:#7070a0; font-size:10px; }
.dev-actions { display:flex; gap:3px; }
.dev-btn {
  background:#181828; border:1px solid #2a2a40; color:#606090;
  border-radius:3px; width:20px; height:20px; font-size:9px;
  cursor:pointer; display:flex; align-items:center; justify-content:center;
}
.dev-btn:hover { background:#222240; color:#c0c0ff; }
.dev-close:hover { background:#2a1010; color:#ff6060; }

/* Tabs */
.dev-tabs { display:flex; background:#08080e; border-bottom:1px solid #1a1a28; flex-shrink:0; }
.dev-tab {
  flex:1; padding:5px 2px; font-size:9px; font-family:inherit;
  color:#505070; background:transparent; border:none;
  border-bottom:2px solid transparent; cursor:pointer; letter-spacing:.02em;
}
.dev-tab:hover { color:#9090c0; }
.dev-tab.active { color:#b090ff; border-bottom-color:#6d28d9; }

/* Body */
.dev-body { overflow:hidden; display:flex; flex-direction:column; flex:1; min-height:0; }
.dev-panel { padding:8px; overflow-y:auto; flex:1; min-height:0; }

.dev-row {
  display:flex; align-items:baseline; gap:6px;
  padding:2px 0; border-bottom:1px solid #0e0e18;
}
.dev-k { width:72px; min-width:72px; color:#444460; font-size:10px; }
.dev-v { color:#c0c0e0; font-size:10px; }
.dev-sep { height:1px; background:#121220; margin:4px 0; }

.dev-sectionhd {
  display:flex; align-items:center; gap:5px;
  font-size:9px; letter-spacing:.07em; text-transform:uppercase;
  color:#404060; margin-bottom:5px;
}
.dev-scroll {
  max-height:220px; overflow-y:auto;
  display:flex; flex-direction:column; gap:1px;
}
.dev-hist-row {
  display:flex; align-items:center; gap:5px;
  padding:3px 4px; background:#0d0d16; border-radius:3px;
  font-size:10px; border-left:2px solid transparent;
}
.pbg1 { border-left-color:#1a4080; }
.pbg2 { border-left-color:#801a40; }
.dev-empty { color:#303050; padding:10px 0; text-align:center; font-size:10px; }

.dev-match-row {
  padding:6px 6px; background:#0d0d18; border-radius:4px;
  margin-bottom:3px; cursor:pointer; border:1px solid transparent;
}
.dev-match-row:hover { border-color:#2a2a50; background:#111122; }
.dev-match-info { display:flex; align-items:center; gap:8px; font-size:10px; }
.dev-match-date { font-size:9px; margin-top:2px; }
.dev-match-detail { display:flex; flex-direction:column; gap:0; }

.dev-pill {
  font-family:inherit; font-size:9px; cursor:pointer;
  background:#181828; border:1px solid #2a2a40;
  color:#606090; padding:1px 6px; border-radius:3px;
}
.dev-pill:hover { background:#1e1e38; color:#9090d0; }
.dev-pill.danger:hover { background:#2a1010; color:#ff8080; }

.dev-copy-btn {
  margin-top:8px; width:100%; padding:8px;
  font-family:inherit; font-size:11px; font-weight:700; letter-spacing:.05em;
  background:linear-gradient(135deg,#2d1060,#1a0840);
  border:1px solid #5b21b6; color:#c4b5fd;
  border-radius:5px; cursor:pointer;
  transition:all .15s;
}
.dev-copy-btn:hover { background:linear-gradient(135deg,#3d1880,#250e58); box-shadow:0 0 12px rgba(109,40,217,.4); }

.dev-json {
  background:#070710; border:1px solid #181828; border-radius:4px;
  padding:7px; font-size:10px; color:#90d090;
  white-space:pre-wrap; word-break:break-word;
  max-height:280px; overflow-y:auto; margin:0; user-select:text;
}

/* Value colors */
.muted  { color:#454565; }
.yellow { color:#fbbf24; }
.rec-on { color:#ef4444; font-weight:700; }
.p1 { color:#60a5fa; } .p2 { color:#f472b6; }
.t-draft   { color:#38bdf8; }
.t-place   { color:#4ade80; }
.t-gameover,.t-timeout,.t-surrender { color:#f87171; }
.t-start_placement { color:#fbbf24; }

/* Territory bar */
.dev-terr-bar {
  display: flex;
  height: 7px;
  border-radius: 4px;
  overflow: hidden;
  background: #111120;
  margin: 4px 0 6px;
  gap: 1px;
}
.dev-terr-fill { height: 100%; transition: width 400ms ease; min-width: 0; }
.dev-terr-fill.p1        { background: #60a5fa; }
.dev-terr-fill.p2        { background: #f472b6; }
.dev-terr-fill.contested { background: #454565; }
</style>
