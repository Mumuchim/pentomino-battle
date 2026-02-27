/**
 * ═══════════════════════════════════════════════════════════════════
 *  PentoBattle — AI Engine  (src/lib/aiEngine.js)
 * ═══════════════════════════════════════════════════════════════════
 *  Usage in App.vue:
 *    import { createAiEngine } from './lib/aiEngine.js'
 *    const ai = createAiEngine({ game, aiPlayer, humanPlayer, aiDifficulty, PENTOMINOES, transformCells })
 *    ai.getAllValidMoves()       → move[]
 *    ai.pickDraftPiece()        → pieceKey | null
 *    ai.choosePlacement(moves)  → move | null
 *    ai.thinkDelay()            → ms
 */

const DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

const PIECE_ROLES = {
  FLEXIBLE: new Set(['P','L','N','T','Y']),
  LINEAR:   new Set(['I']),
  FILLER:   new Set(['Z','S']),
  BLOCKER:  new Set(['X','W','F','U']),
};

const VERSATILE_PIECES = new Set(['I','L','T','Y','N','S','Z','P']);
const TRICKY_PIECES    = new Set(['F','W','X','U','V']);
const UNPAIRABLE       = new Set(['X','W','F','U']);
const SHAPE_SCORE      = { I:5, L:5, Y:5, N:4, T:4, S:4, Z:4, P:3, W:3, F:2, U:2, X:1, V:2 };

const SYNERGY_PAIRS = {
  P: ['Z','S','L','N'], Z: ['P','S'], S: ['P','Z'],
  L: ['P','N'], N: ['P','L'],
  I: ['I','L','Y','N','S','Z'], T: ['Y'], Y: ['T','N'],
};

// ─────────────────────────────────────────────────────────────────────
//  PURE BOARD UTILITIES
// ─────────────────────────────────────────────────────────────────────

function parityImbalance(cells) {
  let b = 0, w = 0;
  for (const [x, y] of cells) (x + y) % 2 === 0 ? b++ : w++;
  return Math.abs(b - w);
}

function floodFillRegions(board, W, H) {
  const visited = new Set();
  const regions = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const k = y * W + x;
      if (board[y][x] !== null || visited.has(k)) continue;
      const region = [];
      const q = [[x, y]];
      visited.add(k);
      while (q.length) {
        const [cx, cy] = q.shift();
        region.push([cx, cy]);
        for (const [ox, oy] of DIRS) {
          const nx = cx+ox, ny = cy+oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const nk = ny * W + nx;
          if (board[ny][nx] === null && !visited.has(nk)) { visited.add(nk); q.push([nx, ny]); }
        }
      }
      regions.push(region);
    }
  }
  return regions;
}

/**
 * VORONOI TERRITORY  ← the key fix for "supporting human's pieces"
 *
 * Multi-source BFS from all occupied cells simultaneously.
 * Each empty cell is assigned to whichever player reaches it in fewer
 * steps. Equidistant cells are contested and split 0.5/0.5.
 *
 * This is fundamentally better than reachableFrom(ap) - reachableFrom(hp),
 * which floods all empty space from each player independently and can't
 * distinguish "I own this area" from "we both reach it".
 */
function voronoiTerritory(board, W, H, ap, hp) {
  // dist[y][x] = { d: steps, p: playerNum, contested: bool }
  const dist   = new Array(H * W).fill(null).map(() => ({ d: Infinity, p: 0, contested: false }));
  const q      = [];  // [x, y, dist, player]

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const p = board[y][x]?.player;
      if (!p) continue;
      const k = y * W + x;
      dist[k] = { d: 0, p, contested: false };
      q.push([x, y, 0, p]);
    }
  }

  let apTerritory = 0, hpTerritory = 0;
  let qi = 0;
  while (qi < q.length) {
    const [cx, cy, cd, cp] = q[qi++];
    for (const [ox, oy] of DIRS) {
      const nx = cx+ox, ny = cy+oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (board[ny][nx] !== null) continue;  // already occupied
      const nk  = ny * W + nx;
      const nd  = cd + 1;
      const cur = dist[nk];
      if (cur.contested) continue;           // already marked contested
      if (cur.d < nd) continue;              // already claimed closer
      if (cur.d === nd && cur.p !== cp) {
        dist[nk] = { d: nd, p: 0, contested: true };  // tie → contested
        continue;
      }
      dist[nk] = { d: nd, p: cp, contested: false };
      q.push([nx, ny, nd, cp]);
    }
  }

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (board[y][x] !== null) continue;
      const { p, contested } = dist[y * W + x];
      if (contested) { apTerritory += 0.5; hpTerritory += 0.5; }
      else if (p === ap) apTerritory++;
      else if (p === hp) hpTerritory++;
    }
  }

  return { ap: apTerritory, hp: hpTerritory };
}

/** Net territory advantage for AI using Voronoi. */
function territoryAdvantage(board, W, H, ap, hp) {
  const t = voronoiTerritory(board, W, H, ap, hp);
  return t.ap - t.hp;
}

/**
 * Region feasibility bonus.
 * Any region with size % 5 != 0 cannot be fully tiled.
 * Also catches parity traps. Only scores regions touching opponent.
 */
function regionFeasibilityBonus(regions, board, W, H, hp) {
  let bonus = 0;
  for (const reg of regions) {
    const sz = reg.length;
    if (sz === 0) continue;
    const infeasible = sz % 5 !== 0;
    const imbalance  = parityImbalance(reg);
    const parityBad  = imbalance > 0;
    if (!infeasible && !parityBad) continue;

    let touchesOpp = false;
    outer: for (const [cx, cy] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = cx+ox, ny = cy+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (board[ny][nx]?.player === hp) { touchesOpp = true; break outer; }
      }
    }
    if (!touchesOpp) continue;

    if (infeasible) bonus += (sz % 5) * 12.0;
    if (parityBad)  bonus += (imbalance % 2 === 1 ? imbalance * 10.0 : imbalance * 4.0);
    if (sz <= 4)    bonus += (5 - sz) * 8.0;
  }
  return bonus;
}

/**
 * Frontier control.
 * Net count of empty cells adjacent only to AI minus those adjacent only to opponent.
 * Contested cells (adjacent to both) are scored 0.
 */
function frontierScore(simBoard, W, H, ap, hp) {
  let net = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (simBoard[y][x] !== null) continue;
      let nearAi = false, nearOpp = false;
      for (const [ox, oy] of DIRS) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const p = simBoard[ny][nx]?.player;
        if (p === ap) nearAi  = true;
        if (p === hp) nearOpp = true;
      }
      if (nearAi && !nearOpp)  net++;   // AI frontier cell
      else if (nearOpp && !nearAi) net--; // opponent frontier cell
      // contested cells: net += 0
    }
  }
  return net * 4.0;  // weight 4 (down from 7 — frontier alone shouldn't dominate)
}

/**
 * Zone sealing bonus.
 * Large bonus when the move cuts opponent off from a region they were adjacent to.
 * Also rewards sealing narrow corridors.
 */
function zoneSealBonus(regions, board, simBoard, W, H, hp) {
  let bonus = 0;
  for (const reg of regions) {
    if (reg.length < 5) continue;
    let oppCanReach = false, oppWasBefore = false;
    for (const [cx, cy] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = cx+ox, ny = cy+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (simBoard[ny][nx]?.player === hp) oppCanReach  = true;
        if (board[ny][nx]?.player   === hp) oppWasBefore = true;
      }
      if (oppCanReach && oppWasBefore) break;
    }
    if (oppWasBefore && !oppCanReach) bonus += reg.length * 9.0;

    // Narrow corridor sealed
    const xs = reg.map(([x]) => x), ys = reg.map(([,y]) => y);
    const span   = Math.max(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1);
    const narrow = Math.min(Math.max(...xs) - Math.min(...xs) + 1, Math.max(...ys) - Math.min(...ys) + 1);
    if (narrow <= 2 && span >= 4 && !oppCanReach) bonus += span * 4.0;
  }
  return bonus;
}

/**
 * Zone claim bonus — reward building toward 2×5 / 5×2 corridors.
 */
function zoneClaimBonus(abs, board, W, H) {
  let bonus = 0;
  const checked = new Set();
  for (const [px, py] of abs) {
    const windows = [];
    for (let i = 0; i < 5; i++) {
      windows.push({x: px-i, y: py,   w: 5, h: 2});
      windows.push({x: px-i, y: py-1, w: 5, h: 2});
    }
    for (let i = 0; i < 2; i++) windows.push({x: px-i, y: py, w: 2, h: 5});
    for (let i = 0; i < 5; i++) windows.push({x: px, y: py-i, w: 2, h: 5});
    for (const {x:zx,y:zy,w:zw,h:zh} of windows) {
      if (zx < 0 || zy < 0 || zx+zw > W || zy+zh > H) continue;
      const key = `${zx},${zy},${zw},${zh}`;
      if (checked.has(key)) continue;
      checked.add(key);
      let allClear = true, emptyCount = 0;
      for (let dy = 0; dy < zh && allClear; dy++)
        for (let dx = 0; dx < zw && allClear; dx++) {
          const cell = board[zy+dy][zx+dx];
          if (cell === null) emptyCount++;
          else if (cell.player !== undefined) allClear = false;
        }
      if (!allClear || emptyCount < 5) continue;
      const inZone = abs.filter(([ax,ay]) => ax>=zx&&ax<zx+zw&&ay>=zy&&ay<zy+zh).length;
      bonus += inZone * 1.8;
    }
  }
  return Math.min(bonus, 15.0);
}

/**
 * Piece efficiency — rewards compactness, penalises isolated cells created.
 */
function pieceEfficiencyScore(abs, simBoard, W, H, ap) {
  let score = 0;
  for (const [x, y] of abs) {
    if (x === 0 || x === W-1) score += 0.8;
    if (y === 0 || y === H-1) score += 0.8;
    for (const [ox, oy] of DIRS) {
      const nx = x+ox, ny = y+oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (simBoard[ny][nx]?.player === ap) score += 0.5;
    }
  }
  for (const [x, y] of abs) {
    for (const [ox, oy] of DIRS) {
      const nx = x+ox, ny = y+oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (simBoard[ny][nx] !== null) continue;
      let emptyN = 0;
      for (const [ox2, oy2] of DIRS) {
        const nnx = nx+ox2, nny = ny+oy2;
        if (nnx < 0 || nny < 0 || nnx >= W || nny >= H) continue;
        if (simBoard[nny][nnx] === null) emptyN++;
      }
      if (emptyN === 0) score -= 8.0;
      else if (emptyN === 1) score -= 2.0;
    }
  }
  return score * 5.0;
}

// ─────────────────────────────────────────────────────────────────────
//  FACTORY
// ─────────────────────────────────────────────────────────────────────

export function createAiEngine({ game, aiPlayer, humanPlayer, aiDifficulty, PENTOMINOES, transformCells }) {

  function movesOnBoard(playerNum, board, boardW, boardH, remaining, placedCount, allowFlip) {
    const pieces = [...(remaining[playerNum] || [])];
    const flipOptions = allowFlip ? [false, true] : [false];
    const moves = [];
    for (const pk of pieces) {
      const baseCells = PENTOMINOES[pk];
      const seenOrients = new Set();
      for (const flip of flipOptions) {
        for (let rot = 0; rot < 4; rot++) {
          const shape = transformCells(baseCells, rot, flip);
          const oKey = shape.map(([x,y])=>`${x},${y}`).join('|');
          if (seenOrients.has(oKey)) continue;
          seenOrients.add(oKey);
          for (let ay = 0; ay < boardH; ay++) {
            for (let ax = 0; ax < boardW; ax++) {
              let valid = true;
              const abs = [];
              for (const [dx, dy] of shape) {
                const x = ax+dx, y = ay+dy;
                if (x < 0 || y < 0 || x >= boardW || y >= boardH || board[y][x] !== null) {
                  valid = false; break;
                }
                abs.push([x, y]);
              }
              if (!valid) continue;
              if (placedCount > 0) {
                let touches = false;
                touchOuter: for (const [x, y] of abs) {
                  for (const [ox, oy] of DIRS) {
                    const nx = x+ox, ny = y+oy;
                    if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH && board[ny][nx] !== null) {
                      touches = true; break touchOuter;
                    }
                  }
                }
                if (!touches) continue;
              }
              moves.push({ pk, rot, flip, ax, ay, abs });
            }
          }
        }
      }
    }
    return moves;
  }

  function getAllValidMoves() {
    const { boardW, boardH, board, placedCount, allowFlip, remaining } = game;
    return movesOnBoard(aiPlayer.value, board, boardW, boardH, remaining, placedCount, allowFlip);
  }

  function countFeasiblePieces(board, boardW, boardH, playerNum, remaining, placedCount, allowFlip) {
    const pieces = remaining[playerNum] || [];
    const flipOptions = allowFlip ? [false, true] : [false];
    let feasible = 0;
    outer: for (const pk of pieces) {
      const baseCells = PENTOMINOES[pk];
      const seenOrients = new Set();
      for (const flip of flipOptions) {
        for (let rot = 0; rot < 4; rot++) {
          const shape = transformCells(baseCells, rot, flip);
          const oKey = shape.map(([x,y])=>`${x},${y}`).join('|');
          if (seenOrients.has(oKey)) continue;
          seenOrients.add(oKey);
          for (let ay = 0; ay < boardH; ay++) {
            for (let ax = 0; ax < boardW; ax++) {
              let valid = true;
              const abs = [];
              for (const [dx, dy] of shape) {
                const x = ax+dx, y = ay+dy;
                if (x < 0 || y < 0 || x >= boardW || y >= boardH || board[y][x] !== null) {
                  valid = false; break;
                }
                abs.push([x, y]);
              }
              if (!valid) continue;
              if (placedCount > 0) {
                let touches = false;
                tO: for (const [x, y] of abs) {
                  for (const [ox, oy] of DIRS) {
                    const nx = x+ox, ny = y+oy;
                    if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH && board[ny][nx] !== null) {
                      touches = true; break tO;
                    }
                  }
                }
                if (!touches) continue;
              }
              feasible++;
              continue outer;
            }
          }
        }
      }
    }
    return feasible;
  }

  function countTotalMoves(board, boardW, boardH, playerNum, remaining, placedCount, allowFlip) {
    return movesOnBoard(playerNum, board, boardW, boardH, remaining, placedCount, allowFlip).length;
  }

  /** Quick score using Voronoi territory for lookahead. */
  function quickScore(simBoard, ap, hp, boardW, boardH) {
    return territoryAdvantage(simBoard, boardW, boardH, ap, hp);
  }

  function simulateOpponentResponse(simBoard, ap, hp, boardW, boardH, remaining, placedCount, allowFlip) {
    const oppMoves = movesOnBoard(hp, simBoard, boardW, boardH, remaining, placedCount, allowFlip);
    if (!oppMoves.length) return quickScore(simBoard, ap, hp, boardW, boardH);
    let worst = Infinity;
    for (const om of oppMoves) {
      const after = simBoard.map(r => [...r]);
      for (const [x, y] of om.abs) after[y][x] = { player: hp, pieceKey: om.pk };
      const s = quickScore(after, ap, hp, boardW, boardH);
      if (s < worst) worst = s;
    }
    return worst;
  }

  // ── Endgame solver: full enumeration when ≤3 pieces remain ─────────
  function endgameSolve(moves) {
    if (!moves.length) return null;
    const { board, boardW, boardH } = game;
    const ap = aiPlayer.value, hp = humanPlayer.value;
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      const sim = board.map(r => [...r]);
      for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
      let aiCells = 0, hpCells = 0;
      for (let y = 0; y < boardH; y++)
        for (let x = 0; x < boardW; x++) {
          const p = sim[y][x]?.player;
          if (p === ap) aiCells++;
          else if (p === hp) hpCells++;
        }
      const regions = floodFillRegions(sim, boardW, boardH);
      const score = (aiCells - hpCells) * 20.0
                  + regionFeasibilityBonus(regions, sim, boardW, boardH, hp)
                  + territoryAdvantage(sim, boardW, boardH, ap, hp) * 4.0;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // ── DUMBIE ─────────────────────────────────────────────────────────
  function movesEasy(moves) {
    if (!moves.length) return null;
    if (Math.random() < 0.80) return moves[Math.floor(Math.random() * moves.length)];
    const { board, boardW, boardH } = game;
    const hp = humanPlayer.value;
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      let s = Math.random() * 2;
      for (const [x, y] of m.abs)
        for (const [ox, oy] of DIRS) {
          const nx = x+ox, ny = y+oy;
          if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
          if (board[ny][nx]?.player === hp) s += 1;
        }
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  // ── ELITE ──────────────────────────────────────────────────────────
  function movesNormal(moves) {
    if (!moves.length) return null;
    const { board, boardW, boardH } = game;
    const ap = aiPlayer.value, hp = humanPlayer.value;
    let best = null, bestScore = -Infinity;
    for (const m of moves) {
      let s = Math.random() * 0.5;
      for (const [x, y] of m.abs) {
        for (const [ox, oy] of DIRS) {
          const nx = x+ox, ny = y+oy;
          if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
          const cell = board[ny][nx];
          if (cell?.player === ap) s += 2.0;
          if (cell?.player === hp) s += 0.8;
        }
        if (x > 0 && x < boardW-1 && y > 0 && y < boardH-1) s += 0.15;
      }
      if (s > bestScore) { bestScore = s; best = m; }
    }
    return best;
  }

  // ── TACTICIAN ─────────────────────────────────────────────────────
  function movesTactician(moves) {
    if (!moves.length) return null;
    const { board, boardW, boardH, remaining } = game;
    const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
    const ap = aiPlayer.value, hp = humanPlayer.value;

    if ((remaining[ap]?.length||0) <= 3 || (remaining[hp]?.length||0) <= 3)
      return endgameSolve(moves);

    // Pass 1: fast adjacency pre-score
    const scored = moves.map(m => {
      let s = Math.random() * 0.10;
      for (const [x, y] of m.abs) {
        for (const [ox, oy] of DIRS) {
          const nx = x+ox, ny = y+oy;
          if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
          const cell = board[ny][nx];
          if (cell?.player === ap) s += 3.0;
          if (cell?.player === hp) s += 2.2;
        }
        for (const [ox, oy] of DIAG) {
          const nx = x+ox, ny = y+oy;
          if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
          if (board[ny][nx]?.player === ap) s += 0.30;
        }
        s += Math.min(x, boardW-1-x, y, boardH-1-y) * 0.25;
      }
      return { m, s };
    });
    scored.sort((a, b) => b.s - a.s);

    // Pass 2: deep region + territory analysis on top-12
    let best = null, bestScore = -Infinity;
    for (const { m } of scored.slice(0, 12)) {
      const sim = board.map(r => [...r]);
      for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
      const regions = floodFillRegions(sim, boardW, boardH);

      let score = territoryAdvantage(sim, boardW, boardH, ap, hp) * 5.0;
      score += regionFeasibilityBonus(regions, sim, boardW, boardH, hp);
      score += pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap) * 0.6;

      for (const [x, y] of m.abs) {
        for (const [ox, oy] of DIRS) {
          const nx = x+ox, ny = y+oy;
          if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
          const cell = board[ny][nx];
          if (cell?.player === ap) score += 3.0;
          if (cell?.player === hp) score += 2.2;
        }
        score += Math.min(x, boardW-1-x, y, boardH-1-y) * 0.25;
      }
      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // ── GRANDMASTER ───────────────────────────────────────────────────
  function movesGrandmaster(moves) {
    if (!moves.length) return null;
    const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
    const ap = aiPlayer.value, hp = humanPlayer.value;
    const humanPieceCount = (remaining[hp] || []).length;

    if ((remaining[ap]?.length||0) <= 3 || (remaining[hp]?.length||0) <= 3)
      return endgameSolve(moves);

    const oppMobilityBefore = countTotalMoves(board, boardW, boardH, hp, remaining, placedCount, allowFlip);

    // Pass 1: Voronoi-based pre-score (not reachableFrom!) for beam pruning
    const scored = moves.map(m => {
      const sim = board.map(r => [...r]);
      for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
      return { m, s: territoryAdvantage(sim, boardW, boardH, ap, hp) };
    });
    scored.sort((a, b) => b.s - a.s);

    let best = null, bestScore = -Infinity;
    for (const { m } of scored.slice(0, 10)) {
      const sim = board.map(r => [...r]);
      for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };

      const remAfter = {
        [ap]: (remaining[ap]||[]).filter(pk => pk !== m.pk),
        [hp]: [...(remaining[hp]||[])],
      };

      // Voronoi territory — the correct metric
      const tAdv = territoryAdvantage(sim, boardW, boardH, ap, hp);
      let score = tAdv * 8.0;

      // Mobility destruction (reduced weight — don't let it override territory)
      const oppMobAfter = countTotalMoves(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
      score += (oppMobilityBefore - oppMobAfter) * 3.0;

      const regions = floodFillRegions(sim, boardW, boardH);
      score += regionFeasibilityBonus(regions, sim, boardW, boardH, hp);
      score += zoneSealBonus(regions, board, sim, boardW, boardH, hp);
      score += zoneClaimBonus(m.abs, sim, boardW, boardH);
      score += frontierScore(sim, boardW, boardH, ap, hp);
      score += pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap);

      let lockedPenalty = 0;
      for (const reg of regions) {
        if (reg.length <= 4)                    score += (5 - reg.length) * 8.0;
        if (reg.length % 5 === 0)               score -= 1.5;
        if (reg.length === 5 * humanPieceCount) lockedPenalty += 3.0;
      }
      score -= lockedPenalty;

      // 1-ply lookahead
      score += simulateOpponentResponse(sim, ap, hp, boardW, boardH, remAfter, placedCount+1, allowFlip) * 0.6;

      // Adjacency (light — territory already captured above)
      for (const [x, y] of m.abs) {
        for (const [ox, oy] of DIRS) {
          const nx = x+ox, ny = y+oy;
          if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
          const cell = board[ny][nx];
          if (cell?.player === hp) score += 3.0;
          if (cell?.player === ap) score += 1.5;
        }
      }

      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // ── LEGENDARY ─────────────────────────────────────────────────────
  // Evaluation formula (prompt weights, adjusted for Voronoi):
  //   voronoiAdvantage*10 + mobilityReduction*3 + infeasibleRegion*12
  //   + frontierControl*4 + zoneSeal*9 + zoneBonus + efficiency*5
  //   + lookahead*6 - exposure*1.5 + ownFeasible*8 - oppFeasible*10
  // ─────────────────────────────────────────────────────────────────
  function movesLegendary(moves) {
    if (!moves.length) return null;
    const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
    const ap = aiPlayer.value, hp = humanPlayer.value;

    if ((remaining[ap]?.length||0) <= 3 || (remaining[hp]?.length||0) <= 3)
      return endgameSolve(moves);

    const oppMobilityBefore = countTotalMoves(board, boardW, boardH, hp, remaining, placedCount, allowFlip);

    // Pass 1: Voronoi territory pre-score — beam of 12 (was 8, wider = fewer good moves pruned)
    const scored = moves.map(m => {
      const sim = board.map(r => [...r]);
      for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
      return { m, s: territoryAdvantage(sim, boardW, boardH, ap, hp) };
    });
    scored.sort((a, b) => b.s - a.s);

    let best = null, bestScore = -Infinity;
    for (const { m } of scored.slice(0, 12)) {
      const sim = board.map(r => [...r]);
      for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };

      const remAfter = {
        [ap]: (remaining[ap]||[]).filter(pk => pk !== m.pk),
        [hp]: [...(remaining[hp]||[])],
      };

      // ── Voronoi territory — primary driver ────────────────────────
      const tAdv = territoryAdvantage(sim, boardW, boardH, ap, hp);

      // ── Mobility destruction (reduced weight) ─────────────────────
      const oppMobAfter = countTotalMoves(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
      const mobilityReduction = oppMobilityBefore - oppMobAfter;

      // ── Region analysis ───────────────────────────────────────────
      const regions = floodFillRegions(sim, boardW, boardH);
      const infeasibleBonus = regionFeasibilityBonus(regions, sim, boardW, boardH, hp);
      const sealBonus       = zoneSealBonus(regions, board, sim, boardW, boardH, hp);
      const zoneBonus       = zoneClaimBonus(m.abs, sim, boardW, boardH);
      const frontierCtrl    = frontierScore(sim, boardW, boardH, ap, hp);
      const efficiency      = pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap);

      // ── Exposure penalty (greatly reduced — don't flee the frontier) ──
      let exposure = 0;
      for (const [x, y] of m.abs)
        for (const [ox, oy] of DIRS) {
          const nx = x+ox, ny = y+oy;
          if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
          if (sim[ny][nx]?.player === hp) exposure++;
        }

      // ── Feasibility count ─────────────────────────────────────────
      const ownFeasible = countFeasiblePieces(sim, boardW, boardH, ap, remAfter, placedCount+1, allowFlip);
      const oppFeasible = countFeasiblePieces(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);

      // ── Depth-2 lookahead: AI → opp best → AI best follow-up ─────
      const oppMoves = movesOnBoard(hp, sim, boardW, boardH, remAfter, placedCount+1, allowFlip);
      let lookaheadValue = 0;
      if (oppMoves.length) {
        let worstScore2 = Infinity, worstBoard = null, worstRem = null;
        for (const om of oppMoves) {
          const afterOpp = sim.map(r => [...r]);
          for (const [x, y] of om.abs) afterOpp[y][x] = { player: hp, pieceKey: om.pk };
          const s = quickScore(afterOpp, ap, hp, boardW, boardH);
          if (s < worstScore2) {
            worstScore2 = s; worstBoard = afterOpp;
            worstRem = { [ap]: [...(remAfter[ap]||[])], [hp]: (remAfter[hp]||[]).filter(pk=>pk!==om.pk) };
          }
        }
        if (worstBoard) {
          const followMoves = movesOnBoard(ap, worstBoard, boardW, boardH, worstRem, placedCount+2, allowFlip);
          let bestFollow = -Infinity;
          for (const fm of followMoves) {
            const afterF = worstBoard.map(r => [...r]);
            for (const [x, y] of fm.abs) afterF[y][x] = { player: ap, pieceKey: fm.pk };
            const s = quickScore(afterF, ap, hp, boardW, boardH);
            if (s > bestFollow) bestFollow = s;
          }
          lookaheadValue = (worstScore2 + (bestFollow > -Infinity ? bestFollow : 0)) * 0.5;
        }
      }

      // ── Final score ───────────────────────────────────────────────
      const score =
          tAdv             * 10.0  // Voronoi territory — primary driver (was 6, now dominant)
        + mobilityReduction *  3.0  // reduced from 8 — mobility alone shouldn't override territory
        + infeasibleBonus           // * 12 internally
        + frontierCtrl              // * 4 internally
        + sealBonus                 // * 9 internally
        + zoneBonus
        + efficiency                // * 5 internally
        + lookaheadValue   *  6.0
        - exposure         *  1.5   // reduced from 6 — stop fleeing the frontier
        + ownFeasible      *  8.0
        - oppFeasible      * 10.0;

      if (score > bestScore) { bestScore = score; best = m; }
    }
    return best;
  }

  // ── Draft picker ───────────────────────────────────────────────────

  function getSynergyTargets(picks, pool) {
    const out = new Set();
    for (const k of picks)
      for (const p of (SYNERGY_PAIRS[k]||[]))
        if (pool.includes(p)) out.add(p);
    return [...out];
  }

  function grandmasterDraftScore(k, aiPicks) {
    let s = (SHAPE_SCORE[k]||2) * 2.0;
    if (!aiPicks.some(p=>PIECE_ROLES.FLEXIBLE.has(p)) && PIECE_ROLES.FLEXIBLE.has(k)) s += 4.0;
    if (!aiPicks.some(p=>PIECE_ROLES.LINEAR.has(p))   && PIECE_ROLES.LINEAR.has(k))   s += 5.0;
    if (!aiPicks.some(p=>PIECE_ROLES.FILLER.has(p))   && PIECE_ROLES.FILLER.has(k))   s += 3.0;
    const blockers = aiPicks.filter(p=>PIECE_ROLES.BLOCKER.has(p)).length;
    if (blockers >= 2 && PIECE_ROLES.BLOCKER.has(k))      s -= 6.0;
    if (PIECE_ROLES.BLOCKER.has(k) && aiPicks.length < 3) s -= 3.0;
    return s;
  }

  function legendarySmallPoolPick(pool, aiPicks, humanPicks) {
    if (pool.length > 4) return null;
    let bestPick = null, bestScore = -Infinity;
    for (const pick of pool) {
      const humanGets = pool.filter(k => k !== pick);
      const humanSetScore = [...humanPicks, ...humanGets].reduce((s, k) => {
        let v = (SHAPE_SCORE[k]||2);
        if (PIECE_ROLES.BLOCKER.has(k)) v -= 1.5;
        return s + v;
      }, 0);
      const score = (SHAPE_SCORE[pick]||2) - humanSetScore * 0.8;
      if (score > bestScore) { bestScore = score; bestPick = pick; }
    }
    return bestPick;
  }

  function pickDraftPiece() {
    const pool = [...game.pool];
    if (!pool.length) return null;
    const diff = aiDifficulty.value;
    const hp = humanPlayer.value, ap = aiPlayer.value;
    const humanPicks = game.picks[hp] || [];
    const aiPicks    = game.picks[ap] || [];

    if (diff === 'dumbie')
      return pool[Math.floor(Math.random()*pool.length)];

    if (diff === 'elite') {
      if (Math.random() < 0.5) return pool[Math.floor(Math.random()*pool.length)];
      const good = pool.filter(k=>VERSATILE_PIECES.has(k));
      return good.length ? good[Math.floor(Math.random()*good.length)] : pool[Math.floor(Math.random()*pool.length)];
    }

    if (diff === 'tactician') {
      const targets = getSynergyTargets(humanPicks, pool);
      if (targets.length && Math.random() < 0.85) return targets[Math.floor(Math.random()*targets.length)];
      const good = pool.filter(k=>VERSATILE_PIECES.has(k));
      if (good.length && Math.random() < 0.80) return good[Math.floor(Math.random()*good.length)];
      const tricky = pool.filter(k=>TRICKY_PIECES.has(k));
      if (tricky.length && Math.random() < 0.55) return tricky[Math.floor(Math.random()*tricky.length)];
      return pool[Math.floor(Math.random()*pool.length)];
    }

    if (diff === 'grandmaster') {
      const targets = getSynergyTargets(humanPicks, pool);
      if (targets.length)
        return targets.reduce((b,k) => grandmasterDraftScore(k,aiPicks) > grandmasterDraftScore(b,aiPicks) ? k : b, targets[0]);
      return pool.reduce((b,k) => grandmasterDraftScore(k,aiPicks) > grandmasterDraftScore(b,aiPicks) ? k : b);
    }

    // Legendary
    const smallPick = legendarySmallPoolPick(pool, aiPicks, humanPicks);
    if (smallPick) return smallPick;
    const targets = getSynergyTargets(humanPicks, pool);
    if (targets.length) {
      return targets.reduce((b,k) => {
        const s  = (SHAPE_SCORE[k]||2)*2 + (UNPAIRABLE.has(k)  ? -5 : 0);
        const bs = (SHAPE_SCORE[b]||2)*2 + (UNPAIRABLE.has(b)  ? -5 : 0);
        return s > bs ? k : b;
      }, targets[0]);
    }
    const humanHasLong    = humanPicks.some(k=>['I','L','Y','N'].includes(k));
    const humanHasBranchy = humanPicks.some(k=>['T','F','Y','X'].includes(k));
    return pool.reduce((b, k) => {
      const score = (p) => {
        let s = (SHAPE_SCORE[p]||2)*2.0;
        if (UNPAIRABLE.has(p))                                  s -= 4.0;
        if (humanHasLong    && ['T','F','X','W','U'].includes(p)) s += 1.0;
        if (humanHasBranchy && ['I','L','P'].includes(p))         s += 2.5;
        if (VERSATILE_PIECES.has(p))                              s += 2.5;
        return s;
      };
      return score(k) > score(b) ? k : b;
    });
  }

  function choosePlacement(moves) {
    const diff = aiDifficulty.value;
    if      (diff === 'dumbie')      return movesEasy(moves);
    else if (diff === 'elite')       return movesNormal(moves);
    else if (diff === 'tactician')   return movesTactician(moves);
    else if (diff === 'grandmaster') return movesGrandmaster(moves);
    else                             return movesLegendary(moves);
  }

  function thinkDelay() {
    const diff = aiDifficulty.value;
    if (diff === 'dumbie')      return 900  + Math.random() * 900;
    if (diff === 'elite')       return 550  + Math.random() * 600;
    if (diff === 'tactician')   return 700  + Math.random() * 500;
    if (diff === 'grandmaster') return 900  + Math.random() * 600;
    /* legendary */             return 1100 + Math.random() * 400;
  }

  return { getAllValidMoves, pickDraftPiece, choosePlacement, thinkDelay };
}
