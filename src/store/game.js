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

    // Battle clock (place phase): 2 minutes per player, counts down only on that player's turn
    battleClockSec: { 1: 120, 2: 120 },
    battleClockLastTickAt: null,

    // Timeout confirmation (helps avoid false timeouts under latency)
    timeoutPendingAt: null,
    timeoutPendingPlayer: null,

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
        const snap = {
          label,
          at: Date.now(),
          phase: this.phase,
          currentPlayer: this.currentPlayer,
          pool: JSON.parse(JSON.stringify(this.pool)),
          picks: JSON.parse(JSON.stringify(this.picks)),
          draftTurn: this.draftTurn,
          remaining: JSON.parse(JSON.stringify(this.remaining)),
          placedCount: this.placedCount,
          selectedPieceKey: this.selectedPieceKey,
          rotation: this.rotation,
          flipped: this.flipped,
          allowFlip: this.allowFlip,
          boardW: this.boardW,
          boardH: this.boardH,
          board: JSON.parse(JSON.stringify(this.board)),
          draftBoard: JSON.parse(JSON.stringify(this.draftBoard)),
          winner: this.winner,
          moveSeq: this.moveSeq,
          lastMove: JSON.parse(JSON.stringify(this.lastMove)),
          turnStartedAt: this.turnStartedAt,
          matchInvalid: this.matchInvalid,
          matchInvalidReason: this.matchInvalidReason,
          battleClockSec: JSON.parse(JSON.stringify(this.battleClockSec)),
          battleClockLastTickAt: this.battleClockLastTickAt,
        };
        if (!Array.isArray(this.history)) this.history = [];
        this.history.push(snap);
        // keep memory bounded
        if (this.history.length > 50) this.history.splice(0, this.history.length - 50);
      } catch {}
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

      this.battleClockSec = { 1: 120, 2: 120 };
      this.battleClockLastTickAt = null;

      this.timeoutPendingAt = null;
      this.timeoutPendingPlayer = null;
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

      // swap turns
      this.draftTurn = this.draftTurn === 1 ? 2 : 1;
      this.currentPlayer = this.draftTurn;
      this.turnStartedAt = Date.now();

      // if all drafted -> start placement phase
      if (this.pool.length === 0) {
        this.phase = "place";

        // placement board starts empty

        // reset battle clocks (2 mins per player)
        this.battleClockSec = { 1: 120, 2: 120 };
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
      // Keep staged position if the rotated shape still fits there
      if (this.pendingPlace && !this.canPlaceAt(this.pendingPlace.x, this.pendingPlace.y)) {
        this.pendingPlace = null;
      }
    },

    flipSelected() {
      if (!this.selectedPieceKey) return;
      if (!this.allowFlip) return;
      this.flipped = !this.flipped;
      // Keep staged position if the flipped shape still fits there
      if (this.pendingPlace && !this.canPlaceAt(this.pendingPlace.x, this.pendingPlace.y)) {
        this.pendingPlace = null;
      }
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

      const saved = {
        currentPlayer: this.currentPlayer,
        selectedPieceKey: this.selectedPieceKey,
        rotation: this.rotation,
        flipped: this.flipped,
      };

      this.currentPlayer = player;
      const flipOptions = this.allowFlip ? [false, true] : [false];

      for (const pk of pieces) {
        this.selectedPieceKey = pk;

        for (const f of flipOptions) {
          this.flipped = f;

          for (let r = 0; r < 4; r++) {
            this.rotation = r;

            for (let y = 0; y < this.boardH; y++) {
              for (let x = 0; x < this.boardW; x++) {
                if (this.canPlaceAt(x, y)) {
                  Object.assign(this, saved);
                  return true;
                }
              }
            }
          }
        }
      }

      Object.assign(this, saved);
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

      // Draft: per-turn (single) timer
      if (this.phase === "draft") {
        if (!this.turnStartedAt) return false;
        const limitSec = this.turnLimitDraftSec || 30;
        const elapsedSec = (now - this.turnStartedAt) / 1000;
        if (elapsedSec < limitSec) return false;

        // Draft pick took too long -> invalid match (dodged)
        const dodger = this.currentPlayer;
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