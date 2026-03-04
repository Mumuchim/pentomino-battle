/**
 * ═══════════════════════════════════════════════════════════════════
 *  PentoBattle — AI Web Worker  (src/lib/aiWorker.js)
 * ═══════════════════════════════════════════════════════════════════
 *
 *  Runs the heavy AI computation (getAllValidMoves + choosePlacement)
 *  entirely off the main browser thread so the UI never freezes.
 *
 *  Message protocol:
 *    IN  → { type: 'PICK_MOVE', id: number, payload: { gameState, aiPlayerNum,
 *             humanPlayerNum, difficulty, draftHistory } }
 *    OUT ← { type: 'MOVE_RESULT', id: number, move: MoveObject | null }
 *
 *  The worker creates a fresh engine instance for each request so
 *  there are no shared-state issues between turns.
 * ═══════════════════════════════════════════════════════════════════
 */

import { createAiEngine } from './aiEngine.js';
import { PENTOMINOES }    from './pentominoes.js';
import { transformCells } from './geom.js';

self.onmessage = function ({ data }) {
  const { type, id, payload } = data;

  if (type !== 'PICK_MOVE') return;

  const { gameState, aiPlayerNum, humanPlayerNum, difficulty, draftHistory } = payload;

  // Reconstruct a plain game object the engine can read from
  // (engine only destructures these fields — no Vue reactivity needed)
  const game = {
    board:        gameState.board,
    boardW:       gameState.boardW,
    boardH:       gameState.boardH,
    remaining:    gameState.remaining,
    placedCount:  gameState.placedCount,
    allowFlip:    gameState.allowFlip,
    phase:        gameState.phase,
    picks:        gameState.picks   || { 1: [], 2: [] },
    pool:         gameState.pool    || [],
  };

  const engine = createAiEngine({
    game,
    aiPlayer:     { value: aiPlayerNum },
    humanPlayer:  { value: humanPlayerNum },
    aiDifficulty: { value: difficulty },
    PENTOMINOES,
    transformCells,
    getDraftHistory: () => draftHistory || [],
  });

  const moves = engine.getAllValidMoves();
  const move  = moves.length ? engine.choosePlacement(moves) : null;

  self.postMessage({ type: 'MOVE_RESULT', id, move });
};
