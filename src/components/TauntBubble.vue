<template>
  <Transition name="tauntSlide">
    <div
      v-if="visible"
      class="tauntWrap"
      :style="{ '--ch': chColor }"
      :class="{ 'tauntWrap--thinking': isLoading }"
    >
      <!-- scanline texture overlay -->
      <div class="tauntScanlines" aria-hidden="true"></div>

      <!-- header: emoji + name -->
      <div class="tauntHeader">
        <span class="tauntEmoji">{{ chapter?.emoji }}</span>
        <span class="tauntName">{{ chapter?.name }}</span>
        <span class="tauntTitle">{{ chapter?.title }}</span>
      </div>

      <!-- taunt text area -->
      <div class="tauntBody">
        <span v-if="isLoading" class="tauntDots">
          <span></span><span></span><span></span>
        </span>
        <span v-else class="tauntText">{{ currentText }}</span>
      </div>

      <!-- speech tail pointing down toward the board -->
      <div class="tauntTail" aria-hidden="true"></div>

      <!-- neon corner accents -->
      <div class="tauntCorner tauntCorner--tl" aria-hidden="true"></div>
      <div class="tauntCorner tauntCorner--tr" aria-hidden="true"></div>
      <div class="tauntCorner tauntCorner--bl" aria-hidden="true"></div>
      <div class="tauntCorner tauntCorner--br" aria-hidden="true"></div>
    </div>
  </Transition>
</template>

<script setup>
import { ref, computed, watch } from 'vue';

// ─── Props ──────────────────────────────────────────────────────────
const props = defineProps({
  /** Full STORY_CHAPTERS entry ({ name, personality, emoji, color, title, id, ... }) */
  chapter: { type: Object, default: null },
  /** Simplified game state for context */
  gameContext: { type: Object, default: () => ({}) },
});

// ─── State ──────────────────────────────────────────────────────────
const visible    = ref(false);
const isLoading  = ref(false);
const currentText = ref('');
let   dismissTimer = null;

const chColor = computed(() => props.chapter?.color || '#00C97B');

// ─── Fallback lines per character (used if API call fails or before it returns) ──
const FALLBACK_TAUNTS = {
  easy:  [
    "Okay I definitely know what I'm doing.",
    "Wait is that piece supposed to go there...?",
    "I watched THREE tutorials. I'm basically a pro.",
    "This is going great. I think.",
  ],
  cyano:   [
    "Chat are you seeing this??",
    "I'm literally top twelve. This is a warm up.",
    "Don't screenshot that. I was testing something.",
    "I would've won but I was posing for my thumbnail.",
  ],
  norm:    [
    "You're playing too fast. Slow down.",
    "Every move tells me something about you.",
    "This is what it looks like when I'm not trying.",
    "The board doesn't lie.",
  ],
  ohmen:   [
    "I've already mapped your next four moves.",
    "You blinked. I noticed.",
    "You confirmed what I suspected.",
    "Your pattern is obvious.",
  ],
  teift:   [
    "Sure. Whatever.",
    "...Cool move I guess.",
    "I don't even care, I'm just here.",
    "Okay. Fine.",
  ],
  lilica:  [
    "Okay wait no that was — actually maybe genius??",
    "I had a whole plan and now I don't know anymore.",
    "Should I be worried? I feel like I should be worried.",
    "Okay FINAL answer. Aggressive. ...No wait.",
  ],
  sefia:   [
    "You tilted your head before picking that.",
    "I wrote that down three moves ago.",
    "Interesting. You haven't done that before.",
    "Your hands give away your second choice.",
  ],
  vlad:    [
    "I have survived centuries. This is nothing.",
    "Mortals always underestimate patience.",
    "I would like to note I'm still not looking at your neck.",
    "My lentil soup is getting cold. Let's finish this.",
  ],
  axia:    [
    "I LOVE that move!! Also I saw it coming from a mile away!!",
    "You're so interesting to watch. Genuinely!!",
    "I'm paying very close attention and also smiling!",
    "People say I'm distracting. I just like being here!!",
  ],
  mumu:    [
    "I BUILT these rules and you're STILL surprising me!!",
    "YOOO okay that was actually sick though!!",
    "I designed this game and I have NO idea what you'll do next!!",
    "LET'S GOOOO this is exactly what I wanted from this!!",
  ],
  grand:   [
    "Three years of second place. You won't rattle me.",
    "I've seen every strategy. Including yours.",
    "ZERO made me better by beating me. You won't.",
    "I've been here longer than you've been playing.",
  ],
  zero:    [
    "Eleven players. You moved through all of them.",
    "I've been watching since your first match.",
    "The seat means something. Don't forget that.",
    "Curious. Not worried. Just... curious.",
  ],
};

function getFallback() {
  const id = props.chapter?.id;
  const pool = FALLBACK_TAUNTS[id] || ["Interesting move.", "I see what you're doing.", "This isn't over."];
  return pool[Math.floor(Math.random() * pool.length)];
}

// ─── Cooldown logic (don't spam taunts) ─────────────────────────────
let lastTauntAt = 0;
const COOLDOWN_MS = 8000; // 8s min between taunts

// ─── Show a taunt bubble ─────────────────────────────────────────────
async function show(text, durationMs = 4500) {
  // Clear any existing dismiss timer
  if (dismissTimer) clearTimeout(dismissTimer);

  currentText.value = text;
  visible.value = true;
  isLoading.value = false;

  dismissTimer = setTimeout(() => {
    visible.value = false;
  }, durationMs);
}

// ─── Public: trigger a taunt ─────────────────────────────────────────
/**
 * @param {'game_start'|'ai_placed'|'player_placed'|'ai_winning'|'player_winning'|'game_over_win'|'game_over_lose'} trigger
 */
async function triggerTaunt(trigger) {
  if (!props.chapter) return;

  const now = Date.now();
  const isGameOver = trigger === 'game_over_win' || trigger === 'game_over_lose';

  // Enforce cooldown except for game-over events
  if (!isGameOver && now - lastTauntAt < COOLDOWN_MS) return;

  // Random skip for mid-game moves (keeps it from being annoying)
  if (trigger === 'ai_placed' || trigger === 'player_placed') {
    if (Math.random() < 0.55) return; // ~55% chance to skip
  }

  lastTauntAt = now;

  // Show loading state immediately while we fetch
  if (dismissTimer) clearTimeout(dismissTimer);
  visible.value = true;
  isLoading.value = true;
  currentText.value = '';

  // Start a fallback timer — if API takes > 2s, show fallback
  const fallbackTimer = setTimeout(() => {
    if (isLoading.value) {
      isLoading.value = false;
      currentText.value = getFallback();
    }
  }, 2000);

  try {
    const text = await fetchTaunt(trigger);
    clearTimeout(fallbackTimer);
    if (visible.value) { // still showing
      isLoading.value = false;
      currentText.value = text;
    }
  } catch {
    clearTimeout(fallbackTimer);
    if (visible.value) {
      isLoading.value = false;
      currentText.value = getFallback();
    }
  }

  // Auto-dismiss
  if (dismissTimer) clearTimeout(dismissTimer);
  const duration = isGameOver ? 6000 : 4500;
  dismissTimer = setTimeout(() => {
    visible.value = false;
  }, duration);
}

// ─── Claude API call ─────────────────────────────────────────────────
async function fetchTaunt(trigger) {
  const ch = props.chapter;
  const ctx = props.gameContext || {};

  // Build a tight context description
  const triggerDesc = {
    game_start:      'The placement phase just started. Say something as you begin the match.',
    ai_placed:       'You (the AI character) just placed a piece on the board.',
    player_placed:   'Your opponent (the human player) just placed a piece.',
    ai_winning:      'You clearly have more territory. You\'re winning.',
    player_winning:  'The human is winning. You\'re behind on territory.',
    game_over_win:   'The game just ended. You won.',
    game_over_lose:  'The game just ended. You lost.',
  }[trigger] || 'Something happened in the match.';

  const contextStr = [
    ctx.aiPiecesLeft   != null ? `You have ${ctx.aiPiecesLeft} pieces left.`   : '',
    ctx.humanPiecesLeft!= null ? `Opponent has ${ctx.humanPiecesLeft} pieces left.` : '',
    ctx.territoryLead  != null ? (
      ctx.territoryLead > 5   ? 'You are clearly ahead on territory.' :
      ctx.territoryLead < -5  ? 'You are behind on territory.' :
      'The territory is roughly even.'
    ) : '',
    ctx.phase === 'draft' ? 'You\'re in the draft phase picking pieces.' : '',
  ].filter(Boolean).join(' ');

  const systemPrompt =
    `You are ${ch.name}, a pentomino battle game character. Your personality: "${ch.personality}". ` +
    `Your title: "${ch.title}". ` +
    `Speak EXACTLY like your character would — in their voice, tone, and mannerisms. ` +
    `Keep it SHORT: 1–2 sentences, max 25 words total. No quotation marks around your response. ` +
    `Do not break character. Do not be generic. Be memorable and specific to your personality.`;

  const userPrompt = `Context: ${triggerDesc}${contextStr ? ' ' + contextStr : ''} Say something in character.`;

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 80,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  });

  if (!response.ok) throw new Error('API error');

  const data = await response.json();
  const raw = (data.content?.[0]?.text || '').trim();
  // Strip surrounding quotes if model added them
  return raw.replace(/^["']|["']$/g, '');
}

// ─── Expose public method ─────────────────────────────────────────────
defineExpose({ triggerTaunt });
</script>

<style scoped>
/* ── Wrapper ─────────────────────────────────────────────────────── */
.tauntWrap {
  position: relative;
  min-width: 220px;
  max-width: 320px;
  padding: 12px 14px 14px;
  border-radius: 14px;
  background:
    radial-gradient(ellipse 180% 80% at 50% -10%, color-mix(in srgb, var(--ch) 14%, transparent), transparent 65%),
    linear-gradient(160deg, rgba(14, 16, 26, 0.96), rgba(8, 9, 16, 0.98));
  border: 1px solid color-mix(in srgb, var(--ch) 45%, transparent);
  box-shadow:
    0 0 0 1px color-mix(in srgb, var(--ch) 12%, transparent),
    0 8px 32px rgba(0, 0, 0, 0.65),
    0 0 24px color-mix(in srgb, var(--ch) 18%, transparent),
    inset 0 1px 0 color-mix(in srgb, var(--ch) 20%, rgba(255,255,255,0.06));
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  z-index: 200;
  filter: drop-shadow(0 0 12px color-mix(in srgb, var(--ch) 25%, transparent));
}

/* scanline overlay */
.tauntScanlines {
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(
    to bottom,
    rgba(255,255,255,0.025),
    rgba(255,255,255,0.025) 1px,
    transparent 1px,
    transparent 4px
  );
  pointer-events: none;
  border-radius: inherit;
}

/* ── Header ──────────────────────────────────────────────────────── */
.tauntHeader {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 8px;
}

.tauntEmoji {
  font-size: 15px;
  line-height: 1;
  filter: drop-shadow(0 0 4px color-mix(in srgb, var(--ch) 60%, transparent));
}

.tauntName {
  font-family: 'Courier New', 'Consolas', monospace;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--ch);
  text-shadow: 0 0 8px color-mix(in srgb, var(--ch) 70%, transparent);
  text-transform: uppercase;
}

.tauntTitle {
  font-family: 'Courier New', monospace;
  font-size: 9px;
  letter-spacing: 0.10em;
  color: rgba(255,255,255,0.30);
  text-transform: uppercase;
  margin-left: 2px;
}

/* ── Body ────────────────────────────────────────────────────────── */
.tauntBody {
  min-height: 36px;
  display: flex;
  align-items: center;
}

.tauntText {
  font-family: 'Courier New', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.88);
  letter-spacing: 0.01em;
  text-shadow: 0 1px 4px rgba(0,0,0,0.5);
}

/* ── Loading dots ────────────────────────────────────────────────── */
.tauntDots {
  display: flex;
  gap: 5px;
  align-items: center;
  padding: 2px 0;
}

.tauntDots span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--ch);
  opacity: 0.6;
  animation: tauntDotPulse 1.2s ease-in-out infinite;
  box-shadow: 0 0 6px color-mix(in srgb, var(--ch) 50%, transparent);
}

.tauntDots span:nth-child(2) { animation-delay: 0.2s; }
.tauntDots span:nth-child(3) { animation-delay: 0.4s; }

@keyframes tauntDotPulse {
  0%, 80%, 100% { transform: scale(0.7); opacity: 0.35; }
  40%           { transform: scale(1.1); opacity: 0.85; }
}

/* ── Speech tail ─────────────────────────────────────────────────── */
.tauntTail {
  position: absolute;
  bottom: -10px;
  left: 24px;
  width: 0;
  height: 0;
  border-left:  8px solid transparent;
  border-right: 8px solid transparent;
  border-top:   10px solid color-mix(in srgb, var(--ch) 45%, rgba(14,16,26,0.96));
  filter: drop-shadow(0 3px 4px rgba(0,0,0,0.40));
}

/* ── Corner accents ──────────────────────────────────────────────── */
.tauntCorner {
  position: absolute;
  width: 10px;
  height: 10px;
  opacity: 0.7;
}

.tauntCorner--tl { top: 4px;  left: 4px;  border-top: 2px solid var(--ch); border-left: 2px solid var(--ch); border-radius: 3px 0 0 0; }
.tauntCorner--tr { top: 4px;  right: 4px; border-top: 2px solid var(--ch); border-right: 2px solid var(--ch); border-radius: 0 3px 0 0; }
.tauntCorner--bl { bottom: 4px; left: 4px;  border-bottom: 2px solid var(--ch); border-left: 2px solid var(--ch); border-radius: 0 0 0 3px; }
.tauntCorner--br { bottom: 4px; right: 4px; border-bottom: 2px solid var(--ch); border-right: 2px solid var(--ch); border-radius: 0 0 3px 0; }

/* ── Enter / leave transition ─────────────────────────────────────── */
.tauntSlide-enter-active {
  animation: tauntPopIn 280ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.tauntSlide-leave-active {
  animation: tauntFadeOut 300ms ease forwards;
}

@keyframes tauntPopIn {
  from { opacity: 0; transform: translateY(-8px) scale(0.94); }
  to   { opacity: 1; transform: translateY(0)    scale(1);    }
}

@keyframes tauntFadeOut {
  from { opacity: 1; transform: translateY(0);    }
  to   { opacity: 0; transform: translateY(-6px); }
}
</style>
