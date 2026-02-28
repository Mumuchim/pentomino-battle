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
  // Compute two distance fields (AI and Human) and compare.
  // This avoids bias from contested propagation edge-cases.
  function distFrom(player) {
    const dist = new Array(H * W).fill(Infinity);
    const q = [];
    let qi = 0;

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const p = board[y][x]?.player;
        if (p !== player) continue;
        const k = y * W + x;
        dist[k] = 0;
        q.push([x, y]);
      }
    }

    while (qi < q.length) {
      const [cx, cy] = q[qi++];
      const cd = dist[cy * W + cx];
      for (const [ox, oy] of DIRS) {
        const nx = cx + ox, ny = cy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (board[ny][nx] !== null) continue; // cannot pass through occupied
        const nk = ny * W + nx;
        const nd = cd + 1;
        if (nd < dist[nk]) {
          dist[nk] = nd;
          q.push([nx, ny]);
        }
      }
    }
    return dist;
  }

  const da = distFrom(ap);
  const dh = distFrom(hp);

  let apTerritory = 0, hpTerritory = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (board[y][x] !== null) continue;
      const k = y * W + x;
      const a = da[k], h = dh[k];
      if (!isFinite(a) && !isFinite(h)) continue;
      if (a < h) apTerritory++;
      else if (h < a) hpTerritory++;
      else { apTerritory += 0.5; hpTerritory += 0.5; }
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
  // Score empty cells by adjacency-touch difference.
  // Contested frontier matters: if AI touches a cell more than the opponent, that's influence.
  let net = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (simBoard[y][x] !== null) continue;
      let aiT = 0, hpT = 0;
      for (const [ox, oy] of DIRS) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const p = simBoard[ny][nx]?.player;
        if (p === ap) aiT++;
        else if (p === hp) hpT++;
      }
      if (aiT === 0 && hpT === 0) continue;
      const d = Math.max(-2, Math.min(2, aiT - hpT)); // clip to avoid domination by a few cells
      net += d;
    }
  }
  return net * 3.0;
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

/**
 * Fragmentation penalty.
 * Strongly penalises placing a piece with zero friendly neighbours after
 * the AI already has cells on the board. This is the exact reason the AI
 * was creating isolated orange / pink / white clusters — each one had no
 * connection to the previous, wasting territory and mobility.
 * First two placements (placedCount < 3) are exempt — the board is empty.
 */
function fragmentationPenalty(abs, board, W, H, ap, placedCount) {
  if (placedCount < 3) return 0;
  for (const [x, y] of abs) {
    for (const [ox, oy] of DIRS) {
      const nx = x+ox, ny = y+oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (board[ny][nx]?.player === ap) return 0; // has at least one friendly neighbour
    }
  }
  return -40.0; // fully isolated placement — heavily discourage
}

/**
 * Open territory racing bonus.
 * When a large uncontested empty region exists the AI should race into it,
 * not cluster near its current pieces. Rewards moves whose cells are
 * adjacent to or inside the board's largest empty region.
 * This prevents the "stays in center while player claims the whole right
 * side" pattern seen in the replay.
 */
function openTerritoryBonus(abs, simBoard, W, H) {
  const regions = floodFillRegions(simBoard, W, H);
  if (!regions.length) return 0;

  // Find the largest empty region after simulating this placement
  const largest = regions.reduce((a, b) => b.length > a.length ? b : a, regions[0]);
  if (largest.length < 8) return 0;

  const regSet = new Set(largest.map(([x, y]) => y * W + x));
  let touches = 0;
  for (const [x, y] of abs) {
    if (regSet.has(y * W + x)) { touches += 2; continue; } // inside the region
    for (const [ox, oy] of DIRS) {
      const nx = x+ox, ny = y+oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (regSet.has(ny * W + nx)) { touches++; break; }
    }
  }
  if (touches === 0) return 0;
  // Scale: bigger zone = more urgency; more touching cells = more reward
  return Math.sqrt(largest.length) * touches * 2.2;
}

// ─────────────────────────────────────────────────────────────────────
//  FACTORY
// ─────────────────────────────────────────────────────────────────────

export function createAiEngine({ game, aiPlayer, humanPlayer, aiDifficulty, PENTOMINOES, transformCells }) {
  // ── Caches (speed + stronger search) ─────────────────────────────
  const _moveCache = new Map();
  const _moveCountCache = new Map();
  const _feasibleCache = new Map();

  function _boardSig(board, W, H) {
    // 60-char signature: '.' empty, '1' player1, '2' player2 (others treated as 'X')
    let s = '';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cell = board[y][x];
        if (cell === null) s += '.';
        else if (cell?.player === 1) s += '1';
        else if (cell?.player === 2) s += '2';
        else s += 'X';
      }
    }
    return s;
  }

  function _remKey(remaining, playerNum) {
    return (remaining[playerNum] || []).slice().sort().join('');
  }

  function _mkKey(prefix, playerNum, board, W, H, remaining, placedCount, allowFlip) {
    return prefix + '|' + playerNum + '|' + placedCount + '|' + (allowFlip ? 1 : 0) + '|' + _remKey(remaining, playerNum) + '|' + _boardSig(board, W, H);
  }


  function movesOnBoard(playerNum, board, boardW, boardH, remaining, placedCount, allowFlip) {
    const _key = _mkKey('moves', playerNum, board, boardW, boardH, remaining, placedCount, allowFlip);
    const _cached = _moveCache.get(_key);
    if (_cached) return _cached;

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
    _moveCache.set(_key, moves);
    return moves;
  }

  function getAllValidMoves() {
    const { boardW, boardH, board, placedCount, allowFlip, remaining } = game;
    return movesOnBoard(aiPlayer.value, board, boardW, boardH, remaining, placedCount, allowFlip);
  }

  function countFeasiblePieces(board, boardW, boardH, playerNum, remaining, placedCount, allowFlip) {
    const _k = _mkKey('feasible', playerNum, board, boardW, boardH, remaining, placedCount, allowFlip);
    const _c = _feasibleCache.get(_k);
    if (_c !== undefined) return _c;
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
    _feasibleCache.set(_k, feasible);
    return feasible;
  }

  function countTotalMoves(board, boardW, boardH, playerNum, remaining, placedCount, allowFlip) {
    const _k = _mkKey('movecount', playerNum, board, boardW, boardH, remaining, placedCount, allowFlip);
    const _c = _moveCountCache.get(_k);
    if (_c !== undefined) return _c;
    const v = movesOnBoard(playerNum, board, boardW, boardH, remaining, placedCount, allowFlip).length;
    _moveCountCache.set(_k, v);
    return v;
  }

  /** Quick score (used for lookahead pruning). */
function quickScore(simBoard, ap, hp, boardW, boardH) {
  // Territory is the primary signal; frontier and open-zone adjacency
  // are boosted so the beam doesn't prune away right-side expansion moves.
  const t = territoryAdvantage(simBoard, boardW, boardH, ap, hp);
  const regs = floodFillRegions(simBoard, boardW, boardH);
  const trap = regionFeasibilityBonus(regs, simBoard, boardW, boardH, hp);
  const fr = frontierScore(simBoard, boardW, boardH, ap, hp);

  // Open zone signal: largest empty region size (AI wants large open zones
  // to still be available — means it's expanding rather than clustering)
  const largest = regs.length ? regs.reduce((a,b)=>b.length>a.length?b:a, regs[0]) : null;
  const openZone = largest ? largest.length * 0.08 : 0;

  return t * 6.0 + trap * 0.12 + fr * 0.55 + openZone;
}

  function simulateOpponentResponse(simBoard, ap, hp, boardW, boardH, remaining, placedCount, allowFlip) {
  const oppMoves = movesOnBoard(hp, simBoard, boardW, boardH, remaining, placedCount, allowFlip);
  if (!oppMoves.length) return quickScore(simBoard, ap, hp, boardW, boardH);

  // Beam prune opponent replies by quickScore (from opponent POV => minimize AI score).
  const beamN = Math.min(18, oppMoves.length);
  const scored = oppMoves.map(m => {
    const after = simBoard.map(r => [...r]);
    for (const [x, y] of m.abs) after[y][x] = { player: hp, pieceKey: m.pk };
    // AI perspective: opponent wants this as low as possible.
    return { m, s: quickScore(after, ap, hp, boardW, boardH) };
  }).sort((a,b)=>a.s-b.s);

  let worst = Infinity;
  for (const { m } of scored.slice(0, beamN)) {
    const after = simBoard.map(r => [...r]);
    for (const [x, y] of m.abs) after[y][x] = { player: hp, pieceKey: m.pk };
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

// ── ELITE ──────────────────────────────────────────────────────────
function movesNormal(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
  const ap = aiPlayer.value, hp = humanPlayer.value;

  // Mildly smarter than random: adjacency + small territory + small trap awareness.
  let best = null, bestScore = -Infinity;
  const oppMobBefore = countTotalMoves(board, boardW, boardH, hp, remaining, placedCount, allowFlip);

  for (const m of moves) {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };

    let s = 0;
    // adjacency
    for (const [x, y] of m.abs) {
      for (const [ox, oy] of DIRS) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        const cell = board[ny][nx];
        if (cell?.player === ap) s += 2.0;
        if (cell?.player === hp) s += 1.0;
      }
    }

    // small territory + frontier
    s += territoryAdvantage(sim, boardW, boardH, ap, hp) * 2.5;
    s += frontierScore(sim, boardW, boardH, ap, hp) * 0.35;

    // avoid blunders that create tiny dead pockets
    const regs = floodFillRegions(sim, boardW, boardH);
    s += regionFeasibilityBonus(regs, sim, boardW, boardH, hp) * 0.25;

    // slight mobility pressure
    const remAfter = {
      [ap]: (remaining[ap]||[]).filter(pk => pk !== m.pk),
      [hp]: [...(remaining[hp]||[])],
    };
    const oppMobAfter = countTotalMoves(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    s += (oppMobBefore - oppMobAfter) * 0.35;

    // light compactness
    s += pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap) * 0.12;

    // keep a little variety (elite isn't perfect)
    s += Math.random() * 0.25;

    if (s > bestScore) { bestScore = s; best = m; }
  }
  return best;
}

  // ── TACTICIAN ─────────────────────────────────────────────────────

// ── TACTICIAN ─────────────────────────────────────────────────────
function movesTactician(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
  const ap = aiPlayer.value, hp = humanPlayer.value;

  // Expanded endgame threshold (was ≤3, now ≤4 — catches more closing situations)
  if ((remaining[ap]?.length||0) <= 4 || (remaining[hp]?.length||0) <= 4)
    return endgameSolve(moves);

  const oppMobBefore     = countTotalMoves(board, boardW, boardH, hp, remaining, placedCount, allowFlip);
  const oppFeasibleBefore = countFeasiblePieces(board, boardW, boardH, hp, remaining, placedCount, allowFlip);

  // Pass 1: territory-based prescore — wider beam catches more tactical shots
  const prescored = moves.map(m => {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
    return { m, s: quickScore(sim, ap, hp, boardW, boardH) };
  }).sort((a,b)=>b.s-a.s);

  let best = null, bestScore = -Infinity;
  for (const { m } of prescored.slice(0, 26)) {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };

    const remAfter = {
      [ap]: (remaining[ap]||[]).filter(pk => pk !== m.pk),
      [hp]: [...(remaining[hp]||[])],
    };

    const regs = floodFillRegions(sim, boardW, boardH);

    let score = 0;
    score += territoryAdvantage(sim, boardW, boardH, ap, hp) * 10.0;  // was 7.0
    score += regionFeasibilityBonus(regs, sim, boardW, boardH, hp) * 1.1;
    score += zoneSealBonus(regs, board, sim, boardW, boardH, hp);      // was MISSING
    score += zoneClaimBonus(m.abs, sim, boardW, boardH) * 0.9;
    score += frontierScore(sim, boardW, boardH, ap, hp) * 0.7;
    score += pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap) * 0.8;
    score += openTerritoryBonus(m.abs, sim, boardW, boardH);           // race open zones
    score += fragmentationPenalty(m.abs, board, boardW, boardH, ap, placedCount); // no isolated clusters

    // Mobility pressure — significantly stronger
    const oppMobAfter = countTotalMoves(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    score += (oppMobBefore - oppMobAfter) * 2.8;  // was 1.2

    // Feasibility pressure — was completely missing in Tactician
    const oppFeasible = countFeasiblePieces(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    score -= oppFeasible * 5.0;
    score += (oppFeasibleBefore - oppFeasible) * 8.0;

    // 1-ply lookahead — weight lifted from 0.35 to 0.7 (was near-zero, now meaningful)
    score += simulateOpponentResponse(sim, ap, hp, boardW, boardH, remAfter, placedCount+1, allowFlip) * 0.7;

    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}

  // ── GRANDMASTER ───────────────────────────────────────────────────

// ── GRANDMASTER ───────────────────────────────────────────────────
function movesGrandmaster(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
  const ap = aiPlayer.value, hp = humanPlayer.value;
  const humanPieceCount = (remaining[hp] || []).length;

  // Expanded endgame — was ≤3, now ≤4
  if ((remaining[ap]?.length||0) <= 4 || (remaining[hp]?.length||0) <= 4)
    return endgameSolve(moves);

  const oppMobilityBefore = countTotalMoves(board, boardW, boardH, hp, remaining, placedCount, allowFlip);
  // Feasibility baseline — was completely missing in Grandmaster
  const oppFeasibleBefore = countFeasiblePieces(board, boardW, boardH, hp, remaining, placedCount, allowFlip);

  // Wider beam — was 18, now 22
  const prescored = moves.map(m => {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
    return { m, s: quickScore(sim, ap, hp, boardW, boardH) };
  }).sort((a,b)=>b.s-a.s);

  let best = null, bestScore = -Infinity;
  for (const { m } of prescored.slice(0, 22)) {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };

    const remAfter = {
      [ap]: (remaining[ap]||[]).filter(pk => pk !== m.pk),
      [hp]: [...(remaining[hp]||[])],
    };

    const tAdv = territoryAdvantage(sim, boardW, boardH, ap, hp);
    let score = tAdv * 14.0;  // was 11.0

    // Mobility destruction — slightly stronger
    const oppMobAfter = countTotalMoves(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    score += (oppMobilityBefore - oppMobAfter) * 5.5;  // was 4.0

    const regions = floodFillRegions(sim, boardW, boardH);
    score += regionFeasibilityBonus(regions, sim, boardW, boardH, hp) * 1.1;
    score += zoneSealBonus(regions, board, sim, boardW, boardH, hp);
    score += zoneClaimBonus(m.abs, sim, boardW, boardH);
    score += frontierScore(sim, boardW, boardH, ap, hp);
    score += pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap);
    score += openTerritoryBonus(m.abs, sim, boardW, boardH);           // race open zones
    score += fragmentationPenalty(m.abs, board, boardW, boardH, ap, placedCount); // no isolated clusters

    // locked / clean-region penalties
    let lockedPenalty = 0;
    for (const reg of regions) {
      if (reg.length <= 4)                    score += (5 - reg.length) * 8.0;
      if (reg.length % 5 === 0)               score -= 1.2;
      if (reg.length === 5 * humanPieceCount) lockedPenalty += 2.5;
    }
    score -= lockedPenalty;

    // Feasibility pressure — was entirely absent, now a core signal
    const ownFeasible = countFeasiblePieces(sim, boardW, boardH, ap, remAfter, placedCount+1, allowFlip);
    const oppFeasible = countFeasiblePieces(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    const feasibleReduction = oppFeasibleBefore - oppFeasible;
    score += ownFeasible      *  7.0;
    score -= oppFeasible      * 12.0;
    score += feasibleReduction * 10.0;

    // Depth-2 minimax — was 1-ply × 0.8, now full 2-ply (narrower beams than Legendary)
    const oppMoves = movesOnBoard(hp, sim, boardW, boardH, remAfter, placedCount+1, allowFlip);
    let lookaheadValue = 0;
    if (oppMoves.length) {
      const oppBeam = Math.min(12, oppMoves.length);
      const oppScored = oppMoves.map(om => {
        const afterOpp = sim.map(r => [...r]);
        for (const [x, y] of om.abs) afterOpp[y][x] = { player: hp, pieceKey: om.pk };
        return { om, s: quickScore(afterOpp, ap, hp, boardW, boardH) };
      }).sort((a,b)=>a.s-b.s);  // opponent wants AI score as low as possible

      let worstBoard = null, worstRem = null, worstS = Infinity;
      for (const { om } of oppScored.slice(0, oppBeam)) {
        const afterOpp = sim.map(r => [...r]);
        for (const [x, y] of om.abs) afterOpp[y][x] = { player: hp, pieceKey: om.pk };
        const s = quickScore(afterOpp, ap, hp, boardW, boardH);
        if (s < worstS) {
          worstS = s;
          worstBoard = afterOpp;
          worstRem = { [ap]: [...(remAfter[ap]||[])], [hp]: (remAfter[hp]||[]).filter(pk=>pk!==om.pk) };
        }
      }

      if (worstBoard) {
        const followMoves = movesOnBoard(ap, worstBoard, boardW, boardH, worstRem, placedCount+2, allowFlip);
        if (followMoves.length) {
          const followBeam = Math.min(12, followMoves.length);
          const followScored = followMoves.map(fm => {
            const afterF = worstBoard.map(r => [...r]);
            for (const [x, y] of fm.abs) afterF[y][x] = { player: ap, pieceKey: fm.pk };
            return { fm, s: quickScore(afterF, ap, hp, boardW, boardH) };
          }).sort((a,b)=>b.s-a.s);

          let bestFollow = -Infinity;
          for (const { fm } of followScored.slice(0, followBeam)) {
            const afterF = worstBoard.map(r => [...r]);
            for (const [x, y] of fm.abs) afterF[y][x] = { player: ap, pieceKey: fm.pk };
            const s = quickScore(afterF, ap, hp, boardW, boardH);
            if (s > bestFollow) bestFollow = s;
          }
          lookaheadValue = (bestFollow + worstS) * 0.5;
        } else {
          lookaheadValue = worstS;
        }
      }
    }
    score += lookaheadValue * 7.0;

    // early-game center pressure
    if (placedCount < 4) {
      let cd = 0;
      for (const [x,y] of m.abs) cd += (Math.abs(x - (boardW-1)/2) + Math.abs(y - (boardH-1)/2));
      score -= cd * 0.10;
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

// ── LEGENDARY ─────────────────────────────────────────────────────
// Goal: almost unbeatable. Deterministic, trap-aware, deeper beam + stronger minimax.
function movesLegendary(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
  const ap = aiPlayer.value, hp = humanPlayer.value;

  if ((remaining[ap]?.length||0) <= 4 || (remaining[hp]?.length||0) <= 4)
    return endgameSolve(moves);

  const oppMobilityBefore = countTotalMoves(board, boardW, boardH, hp, remaining, placedCount, allowFlip);
  const oppFeasibleBefore = countFeasiblePieces(board, boardW, boardH, hp, remaining, placedCount, allowFlip);

  // Beam prune by quickScore (wider beam => fewer tactical misses)
  const prescored = moves.map(m => {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
    return { m, s: quickScore(sim, ap, hp, boardW, boardH) };
  }).sort((a,b)=>b.s-a.s);

  let best = null, bestScore = -Infinity;
  for (const { m } of prescored.slice(0, 24)) {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };

    const remAfter = {
      [ap]: (remaining[ap]||[]).filter(pk => pk !== m.pk),
      [hp]: [...(remaining[hp]||[])],
    };

    const tAdv = territoryAdvantage(sim, boardW, boardH, ap, hp);
    const regions = floodFillRegions(sim, boardW, boardH);

    const infeasibleBonus = regionFeasibilityBonus(regions, sim, boardW, boardH, hp);
    const sealBonus       = zoneSealBonus(regions, board, sim, boardW, boardH, hp);
    const zoneBonus       = zoneClaimBonus(m.abs, sim, boardW, boardH);
    const frontierCtrl    = frontierScore(sim, boardW, boardH, ap, hp);
    const efficiency      = pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap);

    // exposure (small penalty only)
    let exposure = 0;
    for (const [x, y] of m.abs) {
      for (const [ox, oy] of DIRS) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
        if (sim[ny][nx]?.player === hp) exposure++;
      }
    }

    // mobility + feasibility pressure
    const oppMobAfter = countTotalMoves(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    const mobilityReduction = oppMobilityBefore - oppMobAfter;

    const ownFeasible = countFeasiblePieces(sim, boardW, boardH, ap, remAfter, placedCount+1, allowFlip);
    const oppFeasible = countFeasiblePieces(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    const feasibleReduction = oppFeasibleBefore - oppFeasible;

    // Depth-2 minimax, trap-aware (beam pruned)
    const oppMoves = movesOnBoard(hp, sim, boardW, boardH, remAfter, placedCount+1, allowFlip);
    let lookaheadValue = 0;
    if (oppMoves.length) {
      const oppBeam = Math.min(18, oppMoves.length);
      const oppScored = oppMoves.map(om => {
        const afterOpp = sim.map(r => [...r]);
        for (const [x, y] of om.abs) afterOpp[y][x] = { player: hp, pieceKey: om.pk };
        return { om, s: quickScore(afterOpp, ap, hp, boardW, boardH) };
      }).sort((a,b)=>a.s-b.s); // opponent wants minimal AI score

      // pick worst (for AI) opponent reply from top oppBeam
      let worstBoard = null, worstRem = null, worstS = Infinity;
      for (const { om } of oppScored.slice(0, oppBeam)) {
        const afterOpp = sim.map(r => [...r]);
        for (const [x, y] of om.abs) afterOpp[y][x] = { player: hp, pieceKey: om.pk };
        const s = quickScore(afterOpp, ap, hp, boardW, boardH);
        if (s < worstS) {
          worstS = s;
          worstBoard = afterOpp;
          worstRem = { [ap]: [...(remAfter[ap]||[])], [hp]: (remAfter[hp]||[]).filter(pk=>pk!==om.pk) };
        }
      }

      if (worstBoard) {
        const followMoves = movesOnBoard(ap, worstBoard, boardW, boardH, worstRem, placedCount+2, allowFlip);
        if (followMoves.length) {
          const followBeam = Math.min(18, followMoves.length);
          const followScored = followMoves.map(fm => {
            const afterF = worstBoard.map(r => [...r]);
            for (const [x, y] of fm.abs) afterF[y][x] = { player: ap, pieceKey: fm.pk };
            return { fm, s: quickScore(afterF, ap, hp, boardW, boardH) };
          }).sort((a,b)=>b.s-a.s);

          let bestFollow = -Infinity;
          for (const { fm } of followScored.slice(0, followBeam)) {
            const afterF = worstBoard.map(r => [...r]);
            for (const [x, y] of fm.abs) afterF[y][x] = { player: ap, pieceKey: fm.pk };
            const s = quickScore(afterF, ap, hp, boardW, boardH);
            if (s > bestFollow) bestFollow = s;
          }
          lookaheadValue = (bestFollow + worstS) * 0.5;
        } else {
          lookaheadValue = worstS;
        }
      }
    }

    // Final evaluation (stronger than your previous)
    let score =
        tAdv              * 16.0
      + mobilityReduction  *  5.0
      + feasibleReduction  * 14.0
      + infeasibleBonus
      + sealBonus
      + zoneBonus
      + frontierCtrl
      + efficiency
      + lookaheadValue     *  9.0
      - exposure           *  1.0
      + ownFeasible        * 10.0
      - oppFeasible        * 16.0
      + openTerritoryBonus(m.abs, sim, boardW, boardH)
      + fragmentationPenalty(m.abs, board, boardW, boardH, ap, placedCount);

    // Early-game: claim center / reduce symmetry (prevents easy human steering)
    if (placedCount < 4) {
      let cd = 0;
      for (const [x,y] of m.abs) cd += (Math.abs(x - (boardW-1)/2) + Math.abs(y - (boardH-1)/2));
      score -= cd * 0.12;
    }

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

// Legendary (deterministic counter-draft)
// 1) If small pool, brute the last picks.
const smallPick = legendarySmallPoolPick(pool, aiPicks, humanPicks);
if (smallPick) return smallPick;

// 2) Score every option by: deny human synergy, improve AI role coverage, and avoid giving yourself too many blockers.
const humanTargetsBefore = getSynergyTargets(humanPicks, pool).length;

function legendaryDraftScore(pick) {
  let s = (SHAPE_SCORE[pick] || 2) * 2.6;

  // deny: direct partner deny is huge
  for (const hpPick of humanPicks) {
    if ((SYNERGY_PAIRS[hpPick] || []).includes(pick)) s += 8.0;
  }

  // deny: reduce the number of synergy targets still available to human
  const poolAfter = pool.filter(k => k !== pick);
  const targetsAfter = getSynergyTargets(humanPicks, poolAfter).length;
  s += (humanTargetsBefore - targetsAfter) * 3.0;

  // role coverage (AI wants a balanced kit)
  if (!aiPicks.some(p=>PIECE_ROLES.FLEXIBLE.has(p)) && PIECE_ROLES.FLEXIBLE.has(pick)) s += 5.0;
  if (!aiPicks.some(p=>PIECE_ROLES.LINEAR.has(p))   && PIECE_ROLES.LINEAR.has(pick))   s += 5.5;
  if (!aiPicks.some(p=>PIECE_ROLES.FILLER.has(p))   && PIECE_ROLES.FILLER.has(pick))   s += 3.5;

  // too many blockers = self-harm (but still deny if needed)
  const blockers = aiPicks.filter(p=>PIECE_ROLES.BLOCKER.has(p)).length;
  if (PIECE_ROLES.BLOCKER.has(pick) && blockers >= 1) s -= 6.0;
  if (PIECE_ROLES.BLOCKER.has(pick) && aiPicks.length < 3) s -= 3.0;

  // prefer versatile shapes early
  if (VERSATILE_PIECES.has(pick)) s += 2.5;
  if (UNPAIRABLE.has(pick)) s -= 4.5;

  // if human is leaning long/branchy, grab counters
  const humanHasLong    = humanPicks.some(k=>['I','L','Y','N'].includes(k));
  const humanHasBranchy = humanPicks.some(k=>['T','F','Y','X'].includes(k));
  if (humanHasLong    && ['T','F','X','W','U'].includes(pick)) s += 1.2;
  if (humanHasBranchy && ['I','L','P'].includes(pick))         s += 2.0;

  return s;
}

return pool.reduce((best, k) => legendaryDraftScore(k) > legendaryDraftScore(best) ? k : best, pool[0]);
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
