# TauntBubble Integration Guide

Add `TauntBubble.vue` to `src/components/` then make 4 small edits to `App.vue`.

---

## 1. Import the component

Near the other component imports at the top of App.vue's `<script setup>`:

```js
import TauntBubble from './components/TauntBubble.vue';
```

---

## 2. Add a ref and game context computed

Somewhere in your script (near other `ref` declarations, e.g. around line 7363):

```js
// ── Taunt bubble ────────────────────────────────────────────────────
const tauntBubbleRef = ref(null);

const tauntGameContext = computed(() => ({
  aiPiecesLeft:    (game.remaining?.[aiPlayer.value]    || []).length,
  humanPiecesLeft: (game.remaining?.[humanPlayer.value] || []).length,
  phase:           game.phase,
  // Simple territory read from piece count delta (no need to run Voronoi here)
  territoryLead: (() => {
    let ai = 0, hp = 0;
    for (let y = 0; y < game.boardH; y++)
      for (let x = 0; x < game.boardW; x++) {
        const p = game.board?.[y]?.[x]?.player;
        if (p === aiPlayer.value) ai++;
        else if (p === humanPlayer.value) hp++;
      }
    return ai - hp;
  })(),
}));

// Current chapter for the active story fight (null if not in story mode)
const tauntChapter = computed(() => {
  if (!storyMode.active) return null;
  return STORY_CHAPTERS[storyMode.chapterIndex] ?? null;
});
```

---

## 3. Watch game events to fire taunts

Add this watch block near the other game watchers (e.g. after the `_doAiMove` watcher around line 7720):

```js
// ── Taunt triggers ──────────────────────────────────────────────────
let _lastPlacedCount = 0;

watch(
  () => game.placedCount,
  (newCount, oldCount) => {
    if (!tauntBubbleRef.value || !storyMode.active) return;
    if (newCount <= oldCount) return; // undo or reset

    // Who just placed?
    // After a placement, currentPlayer has already switched to the next player.
    // So the one who placed is the PREVIOUS current player.
    // Simplest heuristic: if aiPiecesLeft decreased, AI placed; otherwise human placed.
    const aiLeft   = (game.remaining?.[aiPlayer.value]    || []).length;
    const humanLeft= (game.remaining?.[humanPlayer.value] || []).length;

    const aiPlaced = aiLeft < _lastAiLeft;
    _lastAiLeft    = aiLeft;
    _lastHumanLeft = humanLeft;

    const lead = tauntGameContext.value.territoryLead;

    if (aiPlaced) {
      // AI just placed — taunt based on state
      if (lead > 10)       tauntBubbleRef.value.triggerTaunt('ai_winning');
      else if (lead < -10) tauntBubbleRef.value.triggerTaunt('player_winning');
      else                 tauntBubbleRef.value.triggerTaunt('ai_placed');
    } else {
      tauntBubbleRef.value.triggerTaunt('player_placed');
    }
  }
);

let _lastAiLeft    = 0;
let _lastHumanLeft = 0;

// Track piece counts when game starts
watch(
  () => game.phase,
  (phase, oldPhase) => {
    if (!tauntBubbleRef.value || !storyMode.active) return;
    if (phase === 'place' && oldPhase === 'draft') {
      // Reset trackers
      _lastAiLeft    = (game.remaining?.[aiPlayer.value]    || []).length;
      _lastHumanLeft = (game.remaining?.[humanPlayer.value] || []).length;
      // Fire the opening taunt
      setTimeout(() => tauntBubbleRef.value?.triggerTaunt('game_start'), 800);
    }
    if (phase === 'gameover') {
      // Determine winner
      const winner = game.winner ?? game.scores
        ? Object.entries(game.scores ?? {}).sort((a, b) => b[1] - a[1])[0]?.[0]
        : null;
      const aiWon = winner != null && Number(winner) === aiPlayer.value;
      setTimeout(() => {
        tauntBubbleRef.value?.triggerTaunt(aiWon ? 'game_over_win' : 'game_over_lose');
      }, 1200);
    }
  }
);
```

> **Note on winner detection**: swap `game.winner` / `game.scores` for whatever field
> your store actually exposes for the winning player.

---

## 4. Add the component to the template

Find the section in your template that renders the AI game screen
(search for `screen === 'ai'` in a `v-if` container). Add the bubble
above or beside the board. A good spot is right before `<Board />` or
wrapping the left-side HUD column. Example:

```html
<!-- ── AI Taunt Bubble (story mode only) ── -->
<div
  v-if="screen === 'ai' && storyMode.active"
  class="tauntBubbleAnchor"
>
  <TauntBubble
    ref="tauntBubbleRef"
    :chapter="tauntChapter"
    :game-context="tauntGameContext"
  />
</div>
```

And add this CSS somewhere in App.vue's `<style>` section:

```css
/* Position the taunt bubble above the board HUD */
.tauntBubbleAnchor {
  position: fixed;
  top: 76px;   /* adjust to sit just below your topbar */
  right: 18px;
  z-index: 200;
  pointer-events: none;
}

/* On narrow screens push it down slightly */
@media (max-width: 640px) {
  .tauntBubbleAnchor {
    top: 60px;
    right: 8px;
  }
}
```

---

## How it works

| Trigger | When fired |
|---|---|
| `game_start` | 0.8s after draft → place transition |
| `ai_placed` | AI places a piece (random ~45% chance to fire) |
| `player_placed` | Human places a piece (random ~45% chance to fire) |
| `ai_winning` | AI places and is 10+ cells ahead on territory |
| `player_winning` | AI places and is 10+ cells behind |
| `game_over_win` | 1.2s after gameover, AI won |
| `game_over_lose` | 1.2s after gameover, human won |

**Cooldown**: 8 seconds minimum between taunts (except game-over events).

**Fallback**: If the API takes >2s or fails, it shows a pre-written
in-character line immediately with no blank time.

**All 12 characters** have their own fallback pool and the Claude system
prompt is tuned per character using `name`, `personality`, and `title`
from `STORY_CHAPTERS`.
