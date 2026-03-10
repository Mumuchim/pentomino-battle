<template>
  <!-- Toggle button — always visible when in online game -->
  <button
    class="chatToggleBtn"
    :class="{ open: modelValue, hasUnread: unreadCount > 0 }"
    @click="$emit('update:modelValue', !modelValue)"
    :aria-label="modelValue ? 'Hide chat' : 'Show chat'"
    title="Chat"
  >
    <svg class="chatToggleIcon" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M2 4a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H6l-4 3V4z"
        stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/>
    </svg>
    <span v-if="!modelValue && unreadCount > 0" class="chatUnreadBadge">{{ unreadCount }}</span>
    <span class="chatToggleLabel">{{ modelValue ? 'HIDE' : 'CHAT' }}</span>
  </button>

  <!-- Sidebar panel -->
  <Transition name="chatSlide">
    <aside v-if="modelValue" class="chatSidebar" aria-label="Match chat">

      <div class="chatHeader">
        <span class="chatHeaderTitle">MATCH CHAT</span>
        <div class="chatHeaderNames">
          <span class="chatNameP1">{{ p1Name }}</span>
          <span class="chatNameVs">vs</span>
          <span class="chatNameP2">{{ p2Name }}</span>
        </div>
      </div>

      <div class="chatMessages" ref="messagesEl">
        <div v-if="messages.length === 0" class="chatEmpty">
          No messages yet. Say something!
        </div>
        <div
          v-for="(msg, i) in messages"
          :key="i"
          class="chatMsg"
          :class="{
            mine: msg.from === myPlayer,
            theirs: msg.from !== myPlayer,
            p1: msg.from === 1,
            p2: msg.from === 2,
            system: msg.from === 0,
          }"
        >
          <span v-if="msg.from !== 0" class="chatMsgAuthor">
            {{ msg.from === 1 ? p1Name : p2Name }}
          </span>
          <span class="chatMsgText">{{ msg.text }}</span>
          <span class="chatMsgTime">{{ fmtTime(msg.at) }}</span>
        </div>
      </div>

      <div class="chatInputRow">
        <input
          ref="inputEl"
          v-model="draft"
          class="chatInput"
          type="text"
          placeholder="Say something…"
          maxlength="200"
          autocomplete="off"
          spellcheck="false"
          @keydown.enter.prevent="send"
          @keydown.stop
        />
        <button
          class="chatSendBtn"
          :disabled="!draft.trim()"
          @click="send"
          aria-label="Send"
        >
          <svg viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
            <path d="M2 10L18 2l-4 8 4 8L2 10z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
          </svg>
        </button>
      </div>

    </aside>
  </Transition>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue';

const props = defineProps({
  modelValue:  { type: Boolean, default: false },   // v-model: sidebar open?
  rtChannel:   { type: Object,  default: null  },   // online.rtChannel
  myPlayer:    { type: Number,  default: null  },   // 1 | 2
  p1Name:      { type: String,  default: 'P1'  },
  p2Name:      { type: String,  default: 'P2'  },
});

const emit = defineEmits(['update:modelValue']);

const messages    = ref([]);
const draft       = ref('');
const unreadCount = ref(0);
const messagesEl  = ref(null);
const inputEl     = ref(null);

// ── Subscribe to chat broadcasts on the existing match channel ──────────────
let _unsub = null;

function attachChannel(channel) {
  if (!channel) return;
  // Listen for chat events on the shared lobby channel
  channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
    if (!payload?.text) return;
    messages.value.push({
      from: payload.from ?? 0,
      text: String(payload.text).slice(0, 200),
      at:   payload.at ?? Date.now(),
    });
    if (!props.modelValue) unreadCount.value++;
    scrollToBottom();
  });
}

// Watch for channel becoming available (set after lobby subscribe)
watch(() => props.rtChannel, (ch) => { if (ch) attachChannel(ch); }, { immediate: true });

// Clear unread counter when sidebar opens; focus input
watch(() => props.modelValue, (open) => {
  if (open) {
    unreadCount.value = 0;
    nextTick(() => {
      scrollToBottom();
      inputEl.value?.focus();
    });
  }
});

function send() {
  const text = draft.value.trim();
  if (!text || !props.rtChannel) return;

  const msg = { from: props.myPlayer, text, at: Date.now() };

  // Optimistically add own message immediately
  messages.value.push(msg);
  scrollToBottom();

  try {
    props.rtChannel.send({
      type: 'broadcast',
      event: 'chat',
      payload: msg,
    });
  } catch {
    // non-fatal
  }

  draft.value = '';
}

function scrollToBottom() {
  nextTick(() => {
    const el = messagesEl.value;
    if (el) el.scrollTop = el.scrollHeight;
  });
}

function fmtTime(ts) {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
}

onBeforeUnmount(() => { _unsub?.(); });
</script>

<style scoped>
/* ── Toggle button ─────────────────────────────────────────────────────────── */
.chatToggleBtn {
  position: fixed;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  z-index: 8000;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 8px 10px 10px;
  background: rgba(16, 16, 26, 0.92);
  border: 1px solid rgba(255,255,255,0.12);
  border-right: none;
  border-radius: 14px 0 0 14px;
  color: rgba(200,200,220,0.80);
  cursor: pointer;
  transition: background 120ms ease, color 120ms ease, border-color 120ms ease;
  backdrop-filter: blur(8px);
}
.chatToggleBtn:hover {
  background: rgba(30, 30, 50, 0.96);
  color: rgba(255,255,255,0.95);
  border-color: rgba(255,255,255,0.22);
}
.chatToggleBtn.open {
  background: rgba(20, 22, 40, 0.98);
  border-color: rgba(100,160,255,0.30);
  color: rgba(150,200,255,0.95);
}
.chatToggleBtn.hasUnread {
  border-color: rgba(0, 220, 130, 0.45);
  color: rgba(100, 255, 180, 0.95);
  animation: chatBtnPulse 1.6s ease-in-out infinite;
}
@keyframes chatBtnPulse {
  0%, 100% { box-shadow: none; }
  50%       { box-shadow: -4px 0 18px rgba(0,220,130,0.25); }
}
.chatToggleIcon {
  width: 18px;
  height: 18px;
}
.chatToggleLabel {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.12em;
  writing-mode: vertical-lr;
  text-orientation: mixed;
  transform: rotate(180deg);
  margin-top: 2px;
}
.chatUnreadBadge {
  position: absolute;
  top: 6px;
  left: 4px;
  font-size: 9px;
  font-weight: 900;
  background: rgba(0,220,130,0.90);
  color: #000;
  border-radius: 999px;
  padding: 1px 5px;
  line-height: 1.4;
}

/* ── Sidebar panel ─────────────────────────────────────────────────────────── */
.chatSidebar {
  position: fixed;
  right: 0;
  top: 60px; /* below topbar */
  bottom: 0;
  width: 270px;
  z-index: 7900;
  display: flex;
  flex-direction: column;
  background: rgba(10, 10, 18, 0.97);
  border-left: 1px solid rgba(255,255,255,0.10);
  backdrop-filter: blur(16px);
  box-shadow: -8px 0 32px rgba(0,0,0,0.55);
}

/* Slide animation */
.chatSlide-enter-active,
.chatSlide-leave-active {
  transition: transform 200ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease;
}
.chatSlide-enter-from,
.chatSlide-leave-to {
  transform: translateX(100%);
  opacity: 0;
}

/* ── Header ─────────────────────────────────────────────────────────────────── */
.chatHeader {
  padding: 12px 14px 10px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
}
.chatHeaderTitle {
  font-size: 10px;
  font-weight: 900;
  letter-spacing: 0.14em;
  color: rgba(255,255,255,0.40);
  display: block;
  margin-bottom: 4px;
}
.chatHeaderNames {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  font-weight: 800;
}
.chatNameP1  { color: rgba(78, 201, 255, 0.90); }
.chatNameP2  { color: rgba(255, 107, 107, 0.90); }
.chatNameVs  { color: rgba(255,255,255,0.28); font-size: 10px; font-weight: 600; }

/* ── Messages ───────────────────────────────────────────────────────────────── */
.chatMessages {
  flex: 1 1 auto;
  overflow-y: auto;
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  scrollbar-width: thin;
  scrollbar-color: rgba(255,255,255,0.12) transparent;
}
.chatMessages::-webkit-scrollbar { width: 4px; }
.chatMessages::-webkit-scrollbar-track { background: transparent; }
.chatMessages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.12); border-radius: 2px; }

.chatEmpty {
  color: rgba(255,255,255,0.25);
  font-size: 12px;
  text-align: center;
  padding: 24px 0;
}

.chatMsg {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-width: 88%;
  align-self: flex-start;
}
.chatMsg.mine {
  align-self: flex-end;
}
.chatMsgAuthor {
  font-size: 9px;
  font-weight: 900;
  letter-spacing: 0.08em;
  opacity: 0.55;
}
.chatMsg.p1 .chatMsgAuthor { color: rgba(78, 201, 255, 0.90); }
.chatMsg.p2 .chatMsgAuthor { color: rgba(255, 107, 107, 0.90); }

.chatMsgText {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.4;
  padding: 7px 10px;
  border-radius: 10px;
  word-break: break-word;
  white-space: pre-wrap;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.09);
  color: rgba(220,220,235,0.96);
}
.chatMsg.mine .chatMsgText {
  background: rgba(60, 100, 200, 0.22);
  border-color: rgba(100, 160, 255, 0.20);
  color: rgba(200, 220, 255, 0.97);
  border-radius: 10px 10px 3px 10px;
}
.chatMsg.theirs .chatMsgText {
  border-radius: 10px 10px 10px 3px;
}

.chatMsgTime {
  font-size: 9px;
  color: rgba(255,255,255,0.20);
  align-self: flex-end;
}
.chatMsg.mine .chatMsgTime {
  align-self: flex-end;
}

/* ── Input row ─────────────────────────────────────────────────────────────── */
.chatInputRow {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 10px 12px max(12px, env(safe-area-inset-bottom, 12px));
  border-top: 1px solid rgba(255,255,255,0.08);
  flex-shrink: 0;
  background: rgba(8,8,14,0.90);
}
.chatInput {
  flex: 1;
  background: rgba(255,255,255,0.07);
  border: 1px solid rgba(255,255,255,0.12);
  border-radius: 10px;
  padding: 8px 10px;
  color: rgba(220,220,235,0.97);
  font-size: 13px;
  font-family: inherit;
  outline: none;
  transition: border-color 120ms ease, background 120ms ease;
  caret-color: rgba(100, 160, 255, 0.90);
}
.chatInput::placeholder { color: rgba(255,255,255,0.22); }
.chatInput:focus {
  background: rgba(255,255,255,0.10);
  border-color: rgba(100, 160, 255, 0.35);
}
.chatSendBtn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  background: rgba(60, 100, 200, 0.30);
  border: 1px solid rgba(100, 160, 255, 0.28);
  color: rgba(150, 200, 255, 0.90);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 100ms ease, opacity 100ms ease;
}
.chatSendBtn svg { width: 14px; height: 14px; }
.chatSendBtn:hover:not(:disabled) {
  background: rgba(60, 100, 200, 0.55);
}
.chatSendBtn:disabled {
  opacity: 0.30;
  cursor: not-allowed;
}
</style>
