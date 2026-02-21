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

function computeDraftTiling(w, h, allowFlip = true) {
  const cacheKey = `${w}x${h}|flip:${allowFlip ? 1 : 0}`;
  if (_draftCache.has(cacheKey)) return _draftCache.get(cacheKey);

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
    _draftCache.set(cacheKey, empty);
    return empty;
  }

  _draftCache.set(cacheKey, board);
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

    winner: null,
    lastMove: null,
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

      this.winner = null;
      this.lastMove = null;

      // ✅ rebuild solved draft puzzle (cached)
      this.draftBoard = computeDraftTiling(this.boardW, this.boardH, this.allowFlip)
        .map(row => row.map(cell => (cell ? { pieceKey: cell.pieceKey } : null)));

      // keep announcer consistent during draft
      this.currentPlayer = this.draftTurn;
    },

    // ----- DRAFT (click pieces on the puzzle board) -----
    draftPick(pieceKey) {
      if (this.phase !== "draft") return;
      if (!this.pool.includes(pieceKey)) return;

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

      // swap turns
      this.draftTurn = this.draftTurn === 1 ? 2 : 1;
      this.currentPlayer = this.draftTurn;

      // if all drafted -> start placement phase
      if (this.pool.length === 0) {
        this.phase = "place";

        // placement board starts empty
        this.board = makeEmptyBoard(this.boardW, this.boardH);

        // inventories become remaining pieces
        this.remaining[1] = [...this.picks[1]];
        this.remaining[2] = [...this.picks[2]];

        // placement starts with P1
        this.currentPlayer = 1;

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
    },

    rotateSelected() {
      if (!this.selectedPieceKey) return;
      this.rotation = (this.rotation + 1) % 4;
    },

    flipSelected() {
      if (!this.selectedPieceKey) return;
      if (!this.allowFlip) return;
      this.flipped = !this.flipped;
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

      const abs = this.selectedCells.map(([dx, dy]) => [anchorX + dx, anchorY + dy]);

      for (const [x, y] of abs) {
        this.board[y][x] = { player: this.currentPlayer, pieceKey: this.selectedPieceKey };
      }

      const key = this.selectedPieceKey;
      this.remaining[this.currentPlayer] = this.remaining[this.currentPlayer].filter(
        (k) => k !== key
      );

      this.placedCount += 1;
      this.lastMove = { player: this.currentPlayer, piece: key, x: anchorX, y: anchorY };

      // next player
      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;

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
  },
});