// src/store/game.js
import { defineStore } from "pinia";
import { PENTOMINOES } from "../lib/pentominoes";
import { transformCells, validatePlacement, uniqOrientations } from "../lib/geom";

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


// uniqOrientations is now imported from geom.js (Fix 11 — deduplication)


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

    // Fix 1 — tracks which player opened the draft (used for snake turn logic and
    // fair placement start). Randomised each game in resetGame().
    _draftOpener: 1,

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

    // Shared hover cell (written by Board.vue, read by Controls.vue for Space-key confirm)
    hoverCell: null, // { x, y } | null

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

    // Fix 21 — only accumulate undo history in local modes (couch/ai).
    // Set to false when an online match starts.
    isLocalMode: true,

  }),

  getters: {
    selectedCells(state) {
      if (!state.selectedPieceKey) return [];
      const base = PENTOMINOES[state.selectedPieceKey];
      return transformCells(base, state.rotation, state.flipped);
    },
  },

  actions: {
    // Local-only snapshot helper (Couch Play undo)
    _pushHistory(label = "") {
      // Fix 21 — never accumulate history in online games
      if (!this.isLocalMode) return;
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
        // Fix 8 — clear staged ghost after undo so stale pendingPlace doesn't persist
        this.pendingPlace = null;
        return true;
      } catch {
        return false;
      }
    },

    resetGame() {
      this.board = makeEmptyBoard(this.boardW, this.boardH);

      this.phase = "draft";
      // Fix 1 — randomise who opens the draft each game so neither player has a
      // permanent first-pick advantage across sessions.
      const opener = Math.random() < 0.5 ? 1 : 2;
      this._draftOpener = opener;
      this.currentPlayer = opener;

      this.pool = Object.keys(PENTOMINOES);
      this.picks = { 1: [], 2: [] };
      this.draftTurn = opener;

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
      // Guard: only run solver when pieces exactly tile the board (normal 10×6 mode).
      const _resetTotalCells = this.boardW * this.boardH;
      const _resetPieceCells = this.pool.length * 5;
      const _resetCanTile = _resetTotalCells === _resetPieceCells;
      this.draftBoard = _resetCanTile
        ? computeDraftTiling(this.boardW, this.boardH, this.allowFlip, true)
            .map(row => row.map(cell => (cell ? { pieceKey: cell.pieceKey } : null)))
        : makeEmptyDraftBoard(this.boardW, this.boardH);

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

      // Snake draft — repeating 4-pick cycle: P1, P2, P2, P1, P1, P2, P2, P1 …
      // totalPicks = total picks made so far (after this one).
      // nextIdx = index of the NEXT pick (0-based).
      // Within each group of 4: positions 0 and 3 go to the opener, 1 and 2 go to the other.
      const totalPicks = this.picks[1].length + this.picks[2].length;
      const nextIdx = totalPicks; // 0-based index of the pick that's about to happen
      const opener = this._draftOpener ?? 1;
      const other  = opener === 1 ? 2 : 1;
      // Pattern within each group of 4: [opener, other, other, opener]
      const CYCLE = [opener, other, other, opener];
      this.draftTurn = CYCLE[nextIdx % 4];
      this.currentPlayer = this.draftTurn;
      this.turnStartedAt = Date.now();

      // if all drafted -> start placement phase
      if (this.pool.length === 0) {
        this.phase = "place";


        // reset battle clocks (per-player timer from lobby or default 3 min)
        const initSec = this.battleClockInitSec || 180;
        this.battleClockSec = { 1: initSec, 2: initSec };
        this.battleClockLastTickAt = Date.now();

        // placement board starts empty
        this.board = makeEmptyBoard(this.boardW, this.boardH);

        // inventories become remaining pieces
        this.remaining[1] = [...this.picks[1]];
        this.remaining[2] = [...this.picks[2]];

        // Fix 5 — The player who opened the draft gets second placement turn so
        // both phases share the advantage fairly.
        this.currentPlayer = (this._draftOpener ?? 1) === 1 ? 2 : 1;
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

    // Fix 9 — Dedicated setter so toggling allowFlip OFF while a piece is
    // flipped doesn't leave the flip state in an illegal/inconsistent condition.
    setAllowFlip(value) {
      this.allowFlip = !!value;
      if (!this.allowFlip && this.flipped) {
        this.flipped = false;
        // pendingPlace may now be invalid (flipped ghost was legal, unflipped isn't).
        // Clear it so the user has to re-stage rather than submitting a bad position.
        this.pendingPlace = null;
      }
    },

    // ----- LEGALITY -----
    canPlaceAt(anchorX, anchorY) {
      if (this.phase !== "place") return false;
      if (!this.selectedPieceKey) return false;
      const shape = this.selectedCells;
      if (!shape.length) return false;
      // Fix 2 — use the single canonical validator shared with aiEngine.js
      return validatePlacement(this.board, shape, anchorX, anchorY, this.boardW, this.boardH, this.placedCount) !== null;
    },

    placeAt(anchorX, anchorY) {
      // Fix 2 — use canonical validator so legality logic is defined in exactly one place
      const abs = validatePlacement(this.board, this.selectedCells, anchorX, anchorY, this.boardW, this.boardH, this.placedCount);
      if (!abs) return false;

      // Couch Play undo support: snapshot BEFORE mutating
      this._pushHistory(`place:${this.selectedPieceKey || "?"}`);

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


    
    // ----- DIRECT PLACEMENT START (skips draft) -----
    startPlacementDirect(picks1, picks2, boardW, boardH) {
      const w = boardW != null ? boardW : this.boardW;
      const h = boardH != null ? boardH : this.boardH;

      this.boardW = w;
      this.boardH = h;

      this.phase = "place";

      this.picks = { 1: picks1, 2: picks2 };
      this.remaining = { 1: [...picks1], 2: [...picks2] };
      this.pool = [];

      this.board = makeEmptyBoard(w, h);

      // Rebuild draftBoard for new dimensions (board component still reads it).
      // Guard: only run the solver when the pieces exactly tile the board AND
      // the total piece count is small enough to be feasible.
      // Mirror War (15×8 = 120 cells, 24 picks × 5 = 120) satisfies the cell-count
      // check but uses 24 pieces — a 24-piece backtracking tiling is computationally
      // infeasible and will hang the browser tab. Cap to 12 pieces maximum.
      const totalCells = w * h;
      const totalPieces = picks1.length + picks2.length;
      const totalPieceCells = totalPieces * 5;
      const canTile = totalCells === totalPieceCells && totalPieces <= 12;
      this.draftBoard = canTile
        ? computeDraftTiling(w, h, this.allowFlip, false)
            .map(row => row.map(cell => (cell ? { pieceKey: cell.pieceKey } : null)))
        : makeEmptyDraftBoard(w, h);

      // Reset clocks
      const initSec = this.battleClockInitSec || 180;
      this.battleClockSec = { 1: initSec, 2: initSec };
      this.battleClockLastTickAt = null;
      this.turnStartedAt = Date.now();

      this.currentPlayer = 1;

      // Reset selection / placement state
      this.selectedPieceKey = null;
      this.rotation = 0;
      this.flipped = false;
      this.placedCount = 0;
      this.winner = null;
      this.matchInvalid = false;
      this.matchInvalidReason = null;

      this.rematch = { 1: false, 2: false };
      this.rematchDeclinedBy = null;
      this.history = [];
      this.moveSeq = Number(this.moveSeq || 0) + 1;
      this.lastMove = { type: "start_placement", player: 0, seq: this.moveSeq, at: Date.now() };

      this.timeoutPendingAt = null;
      this.timeoutPendingPlayer = null;
      this.draftTimeoutPendingAt = null;

      if (this.drag) {
        this.drag.active = false;
        this.drag.pieceKey = null;
        this.drag.target = null;
      }
      this.pendingPlace = null;
    },

    // ----- BATTLE CLOCK (PLACE PHASE) -----
    tickBattleClock(now = Date.now()) {
      if (this.phase !== "place") return false;

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

        // Grace window expired with no pick — confirmed timeout.
        // Fix 4 — award the win to the opponent; matchInvalid is wrong here.
        const dodger = this.currentPlayer;
        const winner = dodger === 1 ? 2 : 1;
        this.draftTimeoutPendingAt = null;
        this.phase = "gameover";
        this.winner = winner;
        this.matchInvalid = false;
        this.matchInvalidReason = null;
        this.moveSeq = Number(this.moveSeq || 0) + 1;
        this.lastMove = { type: "draft_timeout", player: dodger, seq: this.moveSeq, at: Date.now() };
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
      // Fix 10 — use 'draft_timeout' (consistent with checkAndApplyTimeout)
      this.lastMove = { type: 'draft_timeout', player: loser, seq: this.moveSeq, at: Date.now() };
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
/**
 * Splits allKeys into two roughly equal halves for the two players.
 * An optional integer seed can be provided for deterministic shuffles.
 * Player 1 gets the extra piece when allKeys.length is odd.
 */
export function randomSplitPieces(allKeys, seed) {
  // Copy so we never mutate the original
  const copy = [...allKeys];

  if (seed != null) {
    // Simple seeded shuffle using a linear-congruential PRNG
    let s = seed >>> 0; // coerce to uint32
    const rand = () => {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 0x100000000;
    };
    for (let i = copy.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
  } else {
    shuffleArray(copy);
  }

  const half = Math.ceil(copy.length / 2);
  return {
    picks1: copy.slice(0, half),
    picks2: copy.slice(half),
  };
}
