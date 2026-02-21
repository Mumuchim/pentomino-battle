// src/store/game.js
import { defineStore } from "pinia";
import { PENTOMINOES } from "../lib/pentominoes";
import { transformCells } from "../lib/geom";

function makeEmptyBoard(w, h) {
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}

function makeEmptyDraftBoard(w, h) {
  // null = empty, otherwise { pieceKey: "T", draftedBy: null|1|2 }
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
      board[oy + dy][ox + dx] = { pieceKey, draftedBy: null };
    }
  }

  function lift(pieceCells, ox, oy) {
    for (const [dx, dy] of pieceCells) {
      board[oy + dy][ox + dx] = null;
    }
  }

  const pieceOrder = [...keys].sort((a, b) => orients[a].length - orients[b].length);
  const used = new Set();

  function backtrack() {
    const next = findNextEmpty();
    if (!next) return true;

    const { x: tx, y: ty } = next;

    for (const pk of pieceOrder) {
      if (used.has(pk)) continue;

      for (const cells of orients[pk]) {
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

    // ONLINE
    mode: "couch", // "couch" | "ai" | "online"
    matchId: null,
    localPlayer: 1, // 1 or 2 when online
    remoteVersion: 0,

    // PLACE phase board
    board: makeEmptyBoard(10, 6),

    // DRAFT phase puzzle board (filled)
    draftBoard: makeEmptyDraftBoard(10, 6),

    phase: "draft", // "draft" | "place" | "gameover"
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

      // ✅ build solved draft puzzle; ensure draftedBy resets
      const solved = computeDraftTiling(this.boardW, this.boardH, this.allowFlip);
      this.draftBoard = solved.map((row) =>
        row.map((cell) => (cell ? { pieceKey: cell.pieceKey, draftedBy: null } : null))
      );

      this.currentPlayer = this.draftTurn;
    },

    setMode(mode) {
      this.mode = mode;
    },
    setOnlineSession({ matchId, localPlayer }) {
      this.mode = "online";
      this.matchId = matchId;
      this.localPlayer = localPlayer;
    },
    clearOnlineSession() {
      this.matchId = null;
      this.mode = "couch";
      this.localPlayer = 1;
      this.remoteVersion = 0;
    },
    applyRemoteState(remoteState, remoteVersion = 0) {
      // keep identity/session fields; overwrite gameplay fields only
      const keep = {
        mode: this.mode,
        matchId: this.matchId,
        localPlayer: this.localPlayer,
      };

      // Pinia allows direct assignment
      this.$state = {
        ...this.$state,
        ...remoteState,
        ...keep,
        remoteVersion: remoteVersion || remoteState?.remoteVersion || this.remoteVersion,
      };
    },
    isMyTurn() {
      if (this.mode !== "online") return true;
      // during draft, currentPlayer mirrors draftTurn
      return this.localPlayer === this.currentPlayer;
    },

    // ----- DRAFT: remove piece from puzzle and send to tray -----
    draftPick(pieceKey) {
      if (this.phase !== "draft") return;
      if (!this.isMyTurn()) return;
      if (!this.pool.includes(pieceKey)) return;

      // Add to player picks
      this.picks[this.draftTurn].push(pieceKey);

      // Remove from pool
      this.pool = this.pool.filter((k) => k !== pieceKey);

      // ❌ REMOVE piece from board completely
      for (let y = 0; y < this.boardH; y++) {
        for (let x = 0; x < this.boardW; x++) {
          const v = this.draftBoard[y][x];
          if (v && v.pieceKey === pieceKey) {
            this.draftBoard[y][x] = null;
          }
        }
      }

      // Switch turn
      this.draftTurn = this.draftTurn === 1 ? 2 : 1;
      this.currentPlayer = this.draftTurn;

      // If all drafted → start placement
      if (this.pool.length === 0) {
        this.phase = "place";

        this.board = makeEmptyBoard(this.boardW, this.boardH);

        this.remaining[1] = [...this.picks[1]];
        this.remaining[2] = [...this.picks[2]];

        this.currentPlayer = 1;

        this.selectedPieceKey = null;
        this.rotation = 0;
        this.flipped = false;

        this.placedCount = 0;
      }
    },

    // ----- SELECT / TRANSFORM -----
    selectPiece(pieceKey) {
      if (this.phase !== "place") return;
      if (!this.isMyTurn()) return;
      if (!this.remaining[this.currentPlayer].includes(pieceKey)) return;

      this.selectedPieceKey = pieceKey;
      this.rotation = 0;
      this.flipped = false;
    },

    rotateSelected() {
      if (!this.selectedPieceKey) return;
      if (!this.isMyTurn()) return;
      this.rotation = (this.rotation + 1) % 4;
    },

    flipSelected() {
      if (!this.selectedPieceKey) return;
      if (!this.isMyTurn()) return;
      if (!this.allowFlip) return;
      this.flipped = !this.flipped;
    },

    // ----- LEGALITY -----
    canPlaceAt(anchorX, anchorY) {
      if (this.phase !== "place") return false;
      if (!this.selectedPieceKey) return false;

      // must be within board, empty cells, and must touch your own piece (after your first)
      const abs = this.selectedCells.map(([dx, dy]) => [anchorX + dx, anchorY + dy]);

      for (const [x, y] of abs) {
        if (!inBounds(x, y, this.boardW, this.boardH)) return false;
        if (this.board[y][x] !== null) return false;
      }

      // first placement for a player can be anywhere
      const alreadyPlacedAny = this.board.some((row) => row.some((c) => c?.player === this.currentPlayer));
      if (!alreadyPlacedAny) return true;

      // otherwise must touch orthogonally one of your cells
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
          if (inBounds(nx, ny, this.boardW, this.boardH) && this.board[ny][nx]?.player === this.currentPlayer) {
            return true;
          }
        }
      }
      return false;
    },

    // adjacency check for UI "attack zones"
    touchesAnyFilled(anchorX, anchorY) {
      if (!this.selectedPieceKey) return false;
      const abs = this.selectedCells.map(([dx, dy]) => [anchorX + dx, anchorY + dy]);
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
          if (inBounds(nx, ny, this.boardW, this.boardH) && this.board[ny][nx] !== null) {
            return true;
          }
        }
      }
      return false;
    },

    placeAt(anchorX, anchorY) {
      if (!this.canPlaceAt(anchorX, anchorY)) return false;
      if (!this.isMyTurn()) return false;

      const abs = this.selectedCells.map(([dx, dy]) => [anchorX + dx, anchorY + dy]);

      for (const [x, y] of abs) {
        this.board[y][x] = { player: this.currentPlayer, pieceKey: this.selectedPieceKey };
      }

      const key = this.selectedPieceKey;
      this.remaining[this.currentPlayer] = this.remaining[this.currentPlayer].filter((k) => k !== key);

      this.placedCount += 1;
      this.lastMove = { player: this.currentPlayer, piece: key, x: anchorX, y: anchorY };

      this.currentPlayer = this.currentPlayer === 1 ? 2 : 1;

      this.selectedPieceKey = null;
      this.rotation = 0;
      this.flipped = false;

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

        for (let r = 0; r < 4; r++) {
          this.rotation = r;

          for (const f of flipOptions) {
            this.flipped = f;

            // try every anchor
            for (let y = 0; y < this.boardH; y++) {
              for (let x = 0; x < this.boardW; x++) {
                if (this.canPlaceAt(x, y)) {
                  // restore and return
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