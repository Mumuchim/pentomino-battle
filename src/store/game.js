// src/store/game.js
import { defineStore } from "pinia";
import { PENTOMINOES } from "../lib/pentominoes";
import { transformCells } from "../lib/geom";

function makeEmptyBoard(w, h) {
  // null = empty, otherwise { player: 1|2, pieceKey: "T" }
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}

function makeEmptyDraftBoard(w, h) {
  // null = empty, otherwise { pieceKey: "T" }
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}

function inBounds(x, y, w, h) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

/**
 * ---- Draft tiling solver (find one 10x6 tiling) ----
 * Cache per (w,h,allowFlip) so Settings toggles don't reuse the wrong board.
 */
const _draftCache = new Map();

function shuffleArray(arr) {
  // Fisher–Yates (in-place)
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}


function uniqOrientations(baseCells, allowFlip = true) {
  const seen = new Set();
  const outs = [];
  const flips = allowFlip ? [false, true] : [false];

  for (const f of flips) {
    for (let r = 0; r < 4; r++) {
      const cells = transformCells(baseCells, r, f);

      // normalize to min x/y = 0
      let minX = Infinity,
        minY = Infinity;
      for (const [x, y] of cells) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
      }
      const norm = cells
        .map(([x, y]) => [x - minX, y - minY])
        .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));

      const key = norm.map(([x, y]) => `${x},${y}`).join("|");
      if (!seen.has(key)) {
        seen.add(key);
        outs.push(norm);
      }
    }
  }
  return outs;
}

function computeDraftTiling(w, h, allowFlip = true, randomize = false) {
  const cacheKey = `${w}x${h}|flip:${allowFlip ? 1 : 0}`;
  if (!randomize && _draftCache.has(cacheKey)) return _draftCache.get(cacheKey);

  const keys = Object.keys(PENTOMINOES);

  // precompute unique orientations for each piece
  const orients = {};
  for (const k of keys) {
    orients[k] = uniqOrientations(PENTOMINOES[k], allowFlip);
  }

  const board = makeEmptyDraftBoard(w, h);

  function findNextEmpty() {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (board[y][x] === null) return { x, y };
      }
    }
    return null;
  }

  function canPlace(pieceCells, ox, oy) {
    for (const [dx, dy] of pieceCells) {
      const x = ox + dx;
      const y = oy + dy;
      if (!inBounds(x, y, w, h)) return false;
      if (board[y][x] !== null) return false;
    }
    return true;
  }

  function place(pieceKey, pieceCells, ox, oy) {
    for (const [dx, dy] of pieceCells) {
      board[oy + dy][ox + dx] = { pieceKey };
    }
  }

  function lift(pieceCells, ox, oy) {
    for (const [dx, dy] of pieceCells) {
      board[oy + dy][ox + dx] = null;
    }
  }

  // heuristic: try pieces with fewer orientations first (often helps)
  const pieceOrder = [...keys].sort((a, b) => orients[a].length - orients[b].length);

  if (randomize) {
    shuffleArray(pieceOrder);
    // also shuffle orientation order per piece to vary solutions
    for (const k of keys) shuffleArray(orients[k]);
  }


  const used = new Set();

  function backtrack() {
    const next = findNextEmpty();
    if (!next) return true;

    // choose next empty cell
    const { x: tx, y: ty } = next;

    for (const pk of pieceOrder) {
      if (used.has(pk)) continue;

      // try all orientations of pk
      for (const cells of orients[pk]) {
        // anchor trick: align each cell in the shape to the target empty cell
        for (const [ax, ay] of cells) {
          const ox = tx - ax;
          const oy = ty - ay;

          if (!canPlace(cells, ox, oy)) continue;

          used.add(pk);
          place(pk, cells, ox, oy);

          if (backtrack()) return true;

          lift(cells, ox, oy);
          used.delete(pk);
        }
      }
    }

    return false;
  }

  const ok = backtrack();
  if (!ok) {
    // fallback: should basically never happen unless piece defs are odd
    const empty = makeEmptyDraftBoard(w, h);
    if (!randomize) _draftCache.set(cacheKey, empty);
    return empty;
  }

  if (!randomize) _draftCache.set(cacheKey, board);
  return board;
}

export const useGameStore = defineStore("game", {
  state: () => ({
    boardW: 10,
    boardH: 6,

    // ✅ Placement board (used in "place" phase)
    board: makeEmptyBoard(10, 6),

    // ✅ Draft board (completed puzzle shown in "draft" phase)
    draftBoard: makeEmptyDraftBoard(10, 6),

    phase: "draft", // "draft" | "place" | "gameover"

    // During draft we keep currentPlayer synced to draftTurn for UI announcer.
    currentPlayer: 1,

    pool: Object.keys(PENTOMINOES),
    picks: { 1: [], 2: [] },
    draftTurn: 1,

    remaining: { 1: [], 2: [] },
    placedCount: 0,

    selectedPieceKey: null,
    rotation: 0,
    flipped: false,
    allowFlip: true,

    // UI / Controls (local)
    ui: {
      enableDragPlace: true,
      enableClickPlace: true,
      enableHoverPreview: true,
      lockLandscape: false,
      requireSubmit: true, // When true: mobile drops stage the piece; Submit commits. When false: drop = instant place.
      // Shared hover cell (synced by Board.vue) so Controls.vue Space key can confirm hover position
      hoverCell: null, // { x, y } | null
    },

    // Custom drag (for touch + mouse). Board updates drag.target.
    drag: {
      active: false,
      x: 0,
      y: 0,
      target: null, // { x, y, inside, ok }
      pieceKey: null,
    },

    // Board cell size in px — written by Board.vue ResizeObserver, read by App.vue drag ghost
    boardCellPx: 0,

    // Mobile staged placement: piece dropped on board but not yet confirmed
    pendingPlace: null, // { x, y } | null

    winner: null,
    // Monotonic move sequence number to prevent state clobber under latency.
    // Every authoritative action increments this and is embedded into lastMove.
    moveSeq: 0,
    lastMove: null,

    // Timers (synced for online fairness)
    turnStartedAt: null,
    matchInvalid: false,
    matchInvalidReason: null,
    turnLimitDraftSec: 30,
    turnLimitPlaceSec: 60,

    // Battle clock (place phase): default 3 minutes per player, counts down only on that player's turn
    battleClockInitSec: 180,
    battleClockSec: { 1: 180, 2: 180 },
    battleClockLastTickAt: null,

    // Timeout confirmation (helps avoid false timeouts under latency)
    timeoutPendingAt: null,
    timeoutPendingPlayer: null,

    // Draft timeout grace window — mirrors battle clock GRACE_MS pattern.
    // When a player's draft clock hits 0, we wait DRAFT_GRACE_MS before
    // committing "dodged". This absorbs clock drift between clients (typically
    // 2-4s) so a clutch last-second pick is never wrongly killed by the
    // opponent's slightly-ahead clock.
    draftTimeoutPendingAt: null,

    // Rematch handshake (online)
    rematch: { 1: false, 2: false },
    rematchDeclinedBy: null,

    // Local-only: simple undo stack (used for Couch Play)
    history: [],

  }),

  getters: {
    selectedCells(state) {
      if (!state.selectedPieceKey) return [];
      const base = PENTOMINOES[state.selectedPieceKey];
      return transformCells(base, state.rotation, state.flipped);
    },

    // Optional: show how many drafted
    draftedTotal(state) {
      return state.picks[1].length + state.picks[2].length;
    },
  },

  actions: {
    // Local-only snapshot helper (Couch Play undo)
    _pushHistory(label = "") {
      try {
        // Use JSON clone — safe with Pinia reactive proxies
        const clone = (v) => JSON.parse(JSON.stringify(v));

        const snap = {
          label,
          at: Date.now(),
          phase: this.phase,
          currentPlayer: this.currentPlayer,
          pool: clone(this.pool),
          picks: clone(this.picks),
          draftTurn: this.draftTurn,
          remaining: clone(this.remaining),
          placedCount: this.placedCount,
          selectedPieceKey: this.selectedPieceKey,
          rotation: this.rotation,
          flipped: this.flipped,
          allowFlip: this.allowFlip,
          boardW: this.boardW,
          boardH: this.boardH,
          board: clone(this.board),
          draftBoard: clone(this.draftBoard),
          winner: this.winner,
          moveSeq: this.moveSeq,
          lastMove: clone(this.lastMove),
          turnStartedAt: this.turnStartedAt,
          matchInvalid: this.matchInvalid,
          matchInvalidReason: this.matchInvalidReason,
          battleClockSec: clone(this.battleClockSec),
          battleClockLastTickAt: this.battleClockLastTickAt,
        };
        if (!Array.isArray(this.history)) this.history = [];
        this.history.push(snap);
        // keep memory bounded
        if (this.history.length > 50) this.history.splice(0, this.history.length - 50);
      } catch(e) {
        console.warn('[undo] _pushHistory failed:', e);
      }
    },

    undoLastMove() {
      try {
        if (!Array.isArray(this.history) || this.history.length === 0) return false;
        const snap = this.history.pop();
        if (!snap) return false;

        this.phase = snap.phase;
        this.currentPlayer = snap.currentPlayer;
        this.pool = snap.pool;
        this.picks = snap.picks;
        this.draftTurn = snap.draftTurn;
        this.remaining = snap.remaining;
        this.placedCount = snap.placedCount;
        this.selectedPieceKey = snap.selectedPieceKey;
        this.rotation = snap.rotation;
        this.flipped = snap.flipped;
        this.allowFlip = snap.allowFlip;
        this.boardW = snap.boardW;
        this.boardH = snap.boardH;
        this.board = snap.board;
        this.draftBoard = snap.draftBoard;
        this.winner = snap.winner;
        this.moveSeq = Number(snap.moveSeq || 0);
        this.lastMove = snap.lastMove;
        this.turnStartedAt = snap.turnStartedAt;
        this.matchInvalid = snap.matchInvalid;
        this.matchInvalidReason = snap.matchInvalidReason;
        this.battleClockSec = snap.battleClockSec;
        this.battleClockLastTickAt = snap.battleClockLastTickAt;

        // stop any active drag state
        if (this.drag) {
          this.drag.active = false;
          this.drag.pieceKey = null;
          this.drag.target = null;
        }
        return true;
      } catch {
        return false;
      }
    },

    resetGame() {
      this.board = makeEmptyBoard(this.boardW, this.boardH);

      this.phase = "draft";
      this.currentPlayer = 1;

      this.pool = Object.keys(PENTOMINOES);
      this.picks = { 1: [], 2: [] };
      this.draftTurn = 1;

      this.remaining = { 1: [], 2: [] };
      this.placedCount = 0;

      this.selectedPieceKey = null;
      this.rotation = 0;
      this.flipped = false;
      if (this.drag) {
        this.drag.active = false;
        this.drag.pieceKey = null;
        this.drag.target = null;
      }

      this.winner = null;
      this.lastMove = null;

      this.turnStartedAt = Date.now();
      this.matchInvalid = false;
      this.matchInvalidReason = null;

      this.battleClockSec = { 1: this.battleClockInitSec || 180, 2: this.battleClockInitSec || 180 };
      this.battleClockLastTickAt = null;

      this.timeoutPendingAt = null;
      this.timeoutPendingPlayer = null;
      this.draftTimeoutPendingAt = null;
      this.rematch = { 1: false, 2: false };
      this.rematchDeclinedBy = null;

      this.moveSeq = 0;

      // local-only
      this.history = [];

      // ✅ rebuild solved draft puzzle (randomized)
      this.draftBoard = computeDraftTiling(this.boardW, this.boardH, this.allowFlip, true)
        .map(row => row.map(cell => (cell ? { pieceKey: cell.pieceKey } : null)));

      // keep announcer consistent during draft
      this.currentPlayer = this.draftTurn;
    },

    // ----- DRAFT (click pieces on the puzzle board) -----
    draftPick(pieceKey) {
      if (this.phase !== "draft") return;
      if (!this.pool.includes(pieceKey)) return;

      // Couch Play undo support: snapshot BEFORE mutating
      this._pushHistory(`draft:${pieceKey}`);

      // add to current draft player
      this.picks[this.draftTurn].push(pieceKey);

      // remove from pool
      this.pool = this.pool.filter((k) => k !== pieceKey);

      // remove that piece from the draft board (so it "pulls out")
      for (let y = 0; y < this.boardH; y++) {
        for (let x = 0; x < this.boardW; x++) {
          const v = this.draftBoard[y][x];
          if (v && v.pieceKey === pieceKey) this.draftBoard[y][x] = null;
        }
      }

      this.moveSeq = Number(this.moveSeq || 0) + 1;
      this.lastMove = { type: "draft", player: this.draftTurn, piece: pieceKey, seq: this.moveSeq, at: Date.now() };

      // Any successful action cancels pending timeout.
      this.timeoutPendingAt = null;
      this.timeoutPendingPlayer = null;
      this.draftTimeoutPendingAt = null; // cancel any in-progress draft grace window

      // swap turns
      this.draftTurn = this.draftTurn === 1 ? 2 : 1;
      this.currentPlayer = this.draftTurn;
      this.turnStartedAt = Date.now();

      // if all drafted -> start placement phase
      if (this.pool.length === 0) {
        this.phase = "place";

        // placement board starts empty

        // reset battle clocks (per-player timer from lobby or default 3 min)
        const initSec = this.battleClockInitSec || 180;
        this.battleClockSec = { 1: initSec, 2: initSec };
        this.battleClockLastTickAt = Date.now();

        // placement board starts empty
        this.board = makeEmptyBoard(this.boardW, this.boardH);

        // inventories become remaining pieces
        this.remaining[1] = [...this.picks[1]];
        this.remaining[2] = [...this.picks[2]];

        // placement starts with P1
        this.currentPlayer = 1;
        this.turnStartedAt = Date.now();
        this.battleClockLastTickAt = Date.now();

        // clear selection
        this.selectedPieceKey = null;
        this.rotation = 0;
        this.flipped = false;

        this.placedCount = 0;
      }
    },

    // ----- SELECT / TRANSFORM -----
    selectPiece(pieceKey) {
      if (this.phase !== "place") return;
      if (!this.remaining[this.currentPlayer].includes(pieceKey)) return;

      this.selectedPieceKey = pieceKey;
      this.rotation = 0;
      this.flipped = false;
      this.pendingPlace = null; // clear any stale staged placement
    },

    // ----- CUSTOM DRAG (touch-friendly) -----
    beginDrag(pieceKey, clientX, clientY) {
      if (!this.ui?.enableDragPlace) return false;
      if (this.phase !== "place") return false;
      if (!this.remaining[this.currentPlayer].includes(pieceKey)) return false;

      // Selecting is part of dragging.
      this.selectedPieceKey = pieceKey;
      this.pendingPlace = null; // clear any stale staged placement

      this.drag.active = true;
      this.drag.pieceKey = pieceKey;
      this.drag.x = Number(clientX) || 0;
      this.drag.y = Number(clientY) || 0;
      this.drag.target = null;
      return true;
    },

    updateDrag(clientX, clientY) {
      if (!this.drag.active) return;
      this.drag.x = Number(clientX) || 0;
      this.drag.y = Number(clientY) || 0;
    },

    endDrag() {
      this.drag.active = false;
      this.drag.pieceKey = null;
      this.drag.target = null;
    },

    clearSelection() {
      this.selectedPieceKey = null;
      this.rotation = 0;
      this.flipped = false;
      this.pendingPlace = null;
      this.endDrag();
    },

    // Mobile: stage a placement (show ghost on board, wait for Submit)
    stagePlacement(x, y) {
      if (!this.canPlaceAt(x, y)) return false;
      this.pendingPlace = { x, y };
      return true;
    },

    clearPendingPlace() {
      this.pendingPlace = null;
    },

    commitPendingPlace() {
      if (!this.pendingPlace) return false;
      const { x, y } = this.pendingPlace;
      this.pendingPlace = null;
      return this.placeAt(x, y);
    },

    rotateSelected() {
      if (!this.selectedPieceKey) return;
      this.rotation = (this.rotation + 1) % 4;
      // Do NOT clear pendingPlace when invalid — ghost shows as red, allowing user
      // to keep rotating/flipping until valid without losing position.
    },

    flipSelected() {
      if (!this.selectedPieceKey) return;
      if (!this.allowFlip) return;
      this.flipped = !this.flipped;
      // Do NOT clear pendingPlace when invalid — ghost shows as red, allowing user
      // to keep rotating/flipping until valid without losing position.
    },

    // ----- LEGALITY -----
    canPlaceAt(anchorX, anchorY) {
      if (this.phase !== "place") return false;
      if (!this.selectedPieceKey) return false;

      const shape = this.selectedCells;
      if (!shape.length) return false;

      const abs = shape.map(([dx, dy]) => [anchorX + dx, anchorY + dy]);

      // bounds + overlap
      for (const [x, y] of abs) {
        if (!inBounds(x, y, this.boardW, this.boardH)) return false;
        if (this.board[y][x] !== null) return false;
      }

      // first move anywhere
      if (this.placedCount === 0) return true;

      // must touch existing structure edge-to-edge
      const dirs = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ];
      for (const [x, y] of abs) {
        for (const [ox, oy] of dirs) {
          const nx = x + ox,
            ny = y + oy;
          if (
            inBounds(nx, ny, this.boardW, this.boardH) &&
            this.board[ny][nx] !== null
          ) {
            return true;
          }
        }
      }
      return false;
    },

    placeAt(anchorX, anchorY) {
      if (!this.canPlaceAt(anchorX, anchorY)) return false;

      // Couch Play undo support: snapshot BEFORE mutating
      this._pushHistory(`place:${this.selectedPieceKey || "?"}`);

      const abs = this.selectedCells.map(([dx, dy]) => [anchorX + dx, anchorY + dy]);

      for (const [x, y] of abs) {
        this.board[y][x] = { player: this.currentPlayer, pieceKey: this.selectedPieceKey };
      }

      const key = this.selectedPieceKey;
      this.remaining[this.currentPlayer] = this.remaining[this.currentPlayer].filter(
        (k) => k !== key
      );

      this.placedCount += 1;
      this.moveSeq = Number(this.moveSeq || 0) + 1;
      this.lastMove = {
        type: "place",
        player: this.currentPlayer,
        piece: key,
        x: anchorX,
        y: anchorY,
        seq: this.moveSeq,
        at: Date.now(),
      };

      // Any successful action cancels pending timeout.
      this.timeoutPendingAt = null;
      this.timeoutPendingPlayer = null;

      // next player
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;
      this.turnStartedAt = Date.now();
      this.battleClockLastTickAt = Date.now();

      // clear selection
      this.selectedPieceKey = null;
      this.rotation = 0;
      this.flipped = false;

      // if next player has no moves => loses
      if (!this.playerHasAnyMove(this.currentPlayer)) {
        this.phase = "gameover";
        this.winner = this.currentPlayer === 1 ? 2 : 1;
      }

      return true;
    },

    playerHasAnyMove(player) {
      const pieces = this.remaining[player];
      if (!pieces.length) return false;

      // Check directly without mutating store state - avoids triggering reactivity
      const board = this.board;
      const boardW = this.boardW;
      const boardH = this.boardH;
      const placedCount = this.placedCount;
      const allowFlip = this.allowFlip;
      const flipOptions = allowFlip ? [false, true] : [false];
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];

      for (const pk of pieces) {
        const baseCells = PENTOMINOES[pk];

        for (const f of flipOptions) {
          for (let r = 0; r < 4; r++) {
            const shape = transformCells(baseCells, r, f);

            for (let ay = 0; ay < boardH; ay++) {
              for (let ax = 0; ax < boardW; ax++) {
                // Check bounds + overlap
                let valid = true;
                const abs = [];
                for (const [dx, dy] of shape) {
                  const x = ax + dx, y = ay + dy;
                  if (x < 0 || y < 0 || x >= boardW || y >= boardH || board[y][x] !== null) {
                    valid = false;
                    break;
                  }
                  abs.push([x, y]);
                }
                if (!valid) continue;

                // First move anywhere
                if (placedCount === 0) return true;

                // Must touch existing
                let touches = false;
                outer: for (const [x, y] of abs) {
                  for (const [ox, oy] of dirs) {
                    const nx = x + ox, ny = y + oy;
                    if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH && board[ny][nx] !== null) {
                      touches = true;
                      break outer;
                    }
                  }
                }
                if (touches) return true;
              }
            }
          }
        }
      }

      return false;
    },


    
    // ----- BATTLE CLOCK (PLACE PHASE) -----
    tickBattleClock(now = Date.now()) {
      if (this.phase !== "place") return false;
      if (this.phase === "gameover") return false;

      // Only tick when a turn is actually running
      if (!this.turnStartedAt) return false;

      if (!this.battleClockLastTickAt) {
        this.battleClockLastTickAt = now;
        return false;
      }

      const dt = Math.max(0, (now - this.battleClockLastTickAt) / 1000);
      if (dt <= 0) return false;

      const p = this.currentPlayer;
      const next = Math.max(0, (this.battleClockSec?.[p] ?? 0) - dt);
      this.battleClockSec = { ...this.battleClockSec, [p]: next };
      this.battleClockLastTickAt = now;

      // If the turn changed (remote state) clear any pending timeout.
      if (this.timeoutPendingPlayer && this.timeoutPendingPlayer !== p) {
        this.timeoutPendingPlayer = null;
        this.timeoutPendingAt = null;
      }

      if (next > 0) return false;

      // Time is at 0. Under latency, a last-second move can arrive slightly late.
      // Require a short confirmation window before finalizing timeout.
      const GRACE_MS = 1200;
      if (this.timeoutPendingPlayer !== p) {
        this.timeoutPendingPlayer = p;
        this.timeoutPendingAt = now;
        return false;
      }

      if (!this.timeoutPendingAt || now - this.timeoutPendingAt < GRACE_MS) return false;

      // Confirmed timeout for current player
      const loser = p;
      const winner = loser === 1 ? 2 : 1;
      this.phase = "gameover";
      this.winner = winner;
      this.moveSeq = Number(this.moveSeq || 0) + 1;
      this.lastMove = { type: "timeout", player: loser, seq: this.moveSeq, at: Date.now() };
      return true;
    },

    // ----- REMATCH (ONLINE) -----
    requestRematch(player) {
      if (this.phase !== "gameover") return false;
      if (!player) return false;
      this.rematch = { ...this.rematch, [player]: true };
      return true;
    },

    declineRematch(player) {
      if (this.phase !== "gameover") return false;
      if (!player) return false;
      this.rematchDeclinedBy = player;
      return true;
    },
// ----- TIMEOUTS / SURRENDER -----
    getTurnLimitSec() {
      return this.phase === "draft" ? this.turnLimitDraftSec : this.turnLimitPlaceSec;
    },

    checkAndApplyTimeout(now = Date.now()) {
      if (this.phase === "gameover") return false;

      // Draft: per-turn timer with grace window.
      // Both clients run this independently, but their clocks can differ by 2-4s
      // (observable in prod: P1 sees 19s, P2 sees 16s for the same turn).
      // Without a grace window, the opponent's ahead clock fires "dodged" while
      // the picker is still within their own legitimate time budget.
      // DRAFT_GRACE_MS absorbs that drift — a clutch last-second pick arrives and
      // clears draftTimeoutPendingAt before the window expires.
      if (this.phase === "draft") {
        if (!this.turnStartedAt) return false;
        const limitSec = this.turnLimitDraftSec || 30;
        const elapsedSec = (now - this.turnStartedAt) / 1000;

        if (elapsedSec < limitSec) {
          // Time still remaining — reset grace window if it somehow started early.
          this.draftTimeoutPendingAt = null;
          return false;
        }

        // Time expired. Start (or continue) the grace window.
        const DRAFT_GRACE_MS = 3000; // covers ~3s of observed clock drift
        if (!this.draftTimeoutPendingAt) {
          this.draftTimeoutPendingAt = now;
          return false; // begin window — do not commit yet
        }
        if (now - this.draftTimeoutPendingAt < DRAFT_GRACE_MS) {
          return false; // still inside window — a pick can still cancel this
        }

        // Grace window expired with no pick — confirmed dodge.
        const dodger = this.currentPlayer;
        this.draftTimeoutPendingAt = null;
        this.matchInvalid = true;
        this.matchInvalidReason = `Player ${dodger} did not pick — automatically dodges the game.`;
        this.phase = "gameover";
        this.winner = null;
        this.moveSeq = Number(this.moveSeq || 0) + 1;
        this.lastMove = { type: "dodged", player: dodger, seq: this.moveSeq, at: Date.now() };
        return true;
      }

      // Place: chess-style clock (2 mins each, only current player ticks)
      return this.tickBattleClock(now);
    },

    aiDraftTimeout(loser, winner) {
      if (this.phase !== 'draft') return false;
      this.phase = 'gameover';
      this.winner = winner;
      this.moveSeq = Number(this.moveSeq || 0) + 1;
      this.lastMove = { type: 'timeout', player: loser, seq: this.moveSeq, at: Date.now() };
      return true;
    },

    surrender(player) {
      if (this.phase === "gameover") return false;
      const loser = player;
      const winner = loser === 1 ? 2 : 1;
      this.phase = "gameover";
      this.winner = winner;
      this.moveSeq = Number(this.moveSeq || 0) + 1;
      this.lastMove = { type: "surrender", player: loser, seq: this.moveSeq, at: Date.now() };

      this.timeoutPendingAt = null;
      this.timeoutPendingPlayer = null;
      return true;
    },
  },
});