// src/store/game.js
import { defineStore } from "pinia";
import { PENTOMINOES } from "../lib/pentominoes";
import { transformCells } from "../lib/geom";

function makeEmptyBoard(w, h) {
  // null = empty, otherwise { player: 1|2, pieceKey: "T" }
  return Array.from({ length: h }, () => Array.from({ length: w }, () => null));
}

function inBounds(x, y, w, h) {
  return x >= 0 && y >= 0 && x < w && y < h;
}

export const useGameStore = defineStore("game", {
  state: () => ({
    boardW: 10,
    boardH: 6,
    board: makeEmptyBoard(10, 6),

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
    },

    // ----- DRAFT -----
    draftPick(pieceKey) {
      if (this.phase !== "draft") return;
      if (!this.pool.includes(pieceKey)) return;

      this.picks[this.draftTurn].push(pieceKey);
      this.pool = this.pool.filter((k) => k !== pieceKey);

      this.draftTurn = this.draftTurn === 1 ? 2 : 1;

      if (this.pool.length === 0) {
        this.phase = "place";
        this.remaining[1] = [...this.picks[1]];
        this.remaining[2] = [...this.picks[2]];
        this.currentPlayer = 1;
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
      const dirs = [[1,0],[-1,0],[0,1],[0,-1]];
      for (const [x, y] of abs) {
        for (const [ox, oy] of dirs) {
          const nx = x + ox, ny = y + oy;
          if (inBounds(nx, ny, this.boardW, this.boardH) && this.board[ny][nx] !== null) {
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
      this.remaining[this.currentPlayer] = this.remaining[this.currentPlayer].filter((k) => k !== key);

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