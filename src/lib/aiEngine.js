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
  FILLER:   new Set(['Z']),          // S was an alias for Z — removed
  BLOCKER:  new Set(['X','W','F','U']),
};

const VERSATILE_PIECES = new Set(['I','L','T','Y','N','Z','P']);  // removed phantom 'S'
const TRICKY_PIECES    = new Set(['F','W','X','U','V']);
const UNPAIRABLE       = new Set(['X','W','F','U']);
const SHAPE_SCORE      = { I:5, L:5, Y:5, N:4, T:4, Z:4, P:3, W:3, F:2, U:2, X:1, V:2 };  // removed S:4

const SYNERGY_PAIRS = {
  P: ['Z','L','N'], Z: ['P'],        // removed 'S' references — S was a phantom duplicate of Z
  L: ['P','N'], N: ['P','L'],
  I: ['I','L','Y','N','Z'], T: ['Y'], Y: ['T','N'],
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
      let qi = 0;
      visited.add(k);
      while (qi < q.length) {
        const [cx, cy] = q[qi++];   // O(1) index advance instead of O(n) q.shift()
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
        // Only enqueue if not yet visited (Infinity = unvisited)
        if (dist[nk] === Infinity) {
          dist[nk] = cd + 1;
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
    const minX = xs.reduce((a, b) => a < b ? a : b, Infinity);
    const maxX = xs.reduce((a, b) => a > b ? a : b, -Infinity);
    const minY = ys.reduce((a, b) => a < b ? a : b, Infinity);
    const maxY = ys.reduce((a, b) => a > b ? a : b, -Infinity);
    const spanX  = maxX - minX + 1;
    const spanY  = maxY - minY + 1;
    const span   = Math.max(spanX, spanY);
    const narrow = Math.min(spanX, spanY);
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
 * Global AI cluster penalty.
 *
 * fragmentationPenalty (old) only checked if the NEW piece touches a
 * friendly neighbour. This allowed two-step stranding: piece A isolated
 * (caught), but piece B touches piece A (passes!) — both end up marooned
 * far from the main body, as seen in the Grandmaster replay where cyan
 * landed isolated-left, then yellow touched cyan and both drifted away.
 *
 * This function checks the FULL board after placement:
 *   1. Find all AI-occupied cells.
 *   2. BFS from any cell to find the largest connected component.
 *   3. Any AI cell not in that component is "stranded."
 *   4. Penalise hard per stranded cell so clustering is always preferred.
 *
 * Weight: −10 per stranded cell (50 cells stranded = −500, dominant signal).
 */
function aiClusterPenalty(simBoard, W, H, ap) {
  const aiCells = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (simBoard[y][x]?.player === ap) aiCells.push([x, y]);

  if (aiCells.length === 0) return 0;

  // BFS to find each connected component
  const visited = new Set();
  let largestSize = 0;

  for (const [sx, sy] of aiCells) {
    const k0 = sy * W + sx;
    if (visited.has(k0)) continue;
    // New component
    const q = [[sx, sy]];
    visited.add(k0);
    let size = 0;
    let qi = 0;
    while (qi < q.length) {
      const [cx, cy] = q[qi++];
      size++;
      for (const [ox, oy] of DIRS) {
        const nx = cx+ox, ny = cy+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (simBoard[ny][nx]?.player === ap && !visited.has(nk)) {
          visited.add(nk);
          q.push([nx, ny]);
        }
      }
    }
    if (size > largestSize) largestSize = size;
  }

  const strandedCells = aiCells.length - largestSize;
  return strandedCells > 0 ? -(strandedCells * 25.0) : 0;
}

/**
 * Open territory racing bonus — cluster-aware.
 *
 * Previous version rewarded touching the globally largest empty region,
 * which caused the AI to sprint toward the left side even when its main
 * cluster was on the right — exactly the Grandmaster fragmentation replay.
 *
 * New version: find the largest empty region that is actually adjacent to
 * (or reachable within 2 steps from) the AI's main connected component.
 * Only then reward racing into it. This keeps expansion connected.
 */
function openTerritoryBonus(abs, simBoard, W, H, ap, cachedRegions = null) {
  // 1. Find AI's main connected component cells
  const aiCells = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (simBoard[y][x]?.player === ap) aiCells.push([x, y]);

  const mainCluster = new Set();
  if (aiCells.length > 0) {
    const q = [aiCells[0]];
    mainCluster.add(aiCells[0][1] * W + aiCells[0][0]);
    let qi = 0;
    while (qi < q.length) {
      const [cx, cy] = q[qi++];
      for (const [ox, oy] of DIRS) {
        const nx = cx+ox, ny = cy+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const nk = ny * W + nx;
        if (simBoard[ny][nx]?.player === ap && !mainCluster.has(nk)) {
          mainCluster.add(nk); q.push([nx, ny]);
        }
      }
    }
  }

  // 2. Find the largest empty region adjacent to the main cluster (or placement)
  const regions = cachedRegions ?? floodFillRegions(simBoard, W, H);
  if (!regions.length) return 0;

  // Build a set of cells adjacent to main cluster + placement cells
  const nearAnchor = new Set();
  const anchorCells = [...mainCluster].map(k => [k % W, Math.floor(k / W)]);
  for (const [cx, cy] of [...anchorCells, ...abs]) {
    for (const [ox, oy] of DIRS) {
      const nx = cx+ox, ny = cy+oy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H) nearAnchor.add(ny * W + nx);
    }
  }

  // 3. Score only regions touching the anchor
  let bestRegion = null, bestSize = 0;
  for (const reg of regions) {
    if (reg.length < 6) continue;
    const touches = reg.some(([x, y]) => nearAnchor.has(y * W + x));
    if (!touches) continue;
    if (reg.length > bestSize) { bestSize = reg.length; bestRegion = reg; }
  }

  if (!bestRegion) return 0;

  const regSet = new Set(bestRegion.map(([x, y]) => y * W + x));
  let touchCount = 0;
  for (const [x, y] of abs) {
    if (regSet.has(y * W + x)) { touchCount += 2; continue; }
    for (const [ox, oy] of DIRS) {
      const nx = x+ox, ny = y+oy;
      if (nx >= 0 && ny >= 0 && nx < W && ny < H && regSet.has(ny * W + nx)) { touchCount++; break; }
    }
  }
  if (touchCount === 0) return 0;
  return Math.sqrt(bestSize) * touchCount * 2.2;
}

// ═════════════════════════════════════════════════════════════════════
//  ADVANCED STRATEGIC SYSTEMS
//  8 new functions that elevate GM (defensive) and Legendary (aggressive)
//  to near-unbeatable levels by exploiting pentomino's territorial nature.
// ═════════════════════════════════════════════════════════════════════

/**
 * SYSTEM 1: ARTICULATION POINT DETECTION
 *
 * In the empty-space graph, an articulation point is a cell that if removed
 * (by placing a piece there), DISCONNECTS the remaining empty space into two
 * or more independent components. This is the single most powerful strategic
 * concept in territorial pentomino — one piece can split the entire board.
 *
 * Uses standard Tarjan DFS to find all articulation points in O(V+E).
 * Returns a Set of (y*W+x) keys for all articulation points.
 */
function findArticulationPoints(board, W, H) {
  const idxMap = new Map(); // coord key → index in 'empty' array
  const empty = [];
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (board[y][x] === null) { idxMap.set(y * W + x, empty.length); empty.push([x, y]); }

  const n = empty.length;
  if (n === 0) return new Set();

  const adj = Array.from({ length: n }, () => []);
  for (let i = 0; i < n; i++) {
    const [x, y] = empty[i];
    for (const [ox, oy] of DIRS) {
      const nx = x + ox, ny = y + oy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const k = ny * W + nx;
      if (idxMap.has(k)) adj[i].push(idxMap.get(k));
    }
  }

  const disc = new Array(n).fill(-1);
  const low  = new Array(n).fill(0);
  const childCount = new Array(n).fill(0);
  const isAP = new Set(); // indices of articulation points
  let timer = 0;

  // Iterative Tarjan — avoids JS call-stack overflow on large boards.
  // Stack frames: { u, parent, adjIdx }
  const stack = [];
  for (let root = 0; root < n; root++) {
    if (disc[root] !== -1) continue;
    disc[root] = low[root] = timer++;
    stack.push({ u: root, parent: -1, adjIdx: 0 });

    while (stack.length > 0) {
      const top = stack[stack.length - 1];
      const { u } = top;
      let pushed = false;

      while (top.adjIdx < adj[u].length) {
        const v = adj[u][top.adjIdx++];
        if (v === top.parent) continue;

        if (disc[v] === -1) {
          // Tree edge: push child
          childCount[u]++;
          disc[v] = low[v] = timer++;
          stack.push({ u: v, parent: u, adjIdx: 0 });
          pushed = true;
          break;
        } else {
          // Back edge: update low
          low[u] = Math.min(low[u], disc[v]);
        }
      }

      if (!pushed) {
        // All neighbours of u processed — pop and propagate to parent
        stack.pop();
        const p = top.parent;
        if (p === -1) {
          // u is a DFS root: AP iff it has more than one DFS-tree child
          if (childCount[u] > 1) isAP.add(u);
        } else {
          low[p] = Math.min(low[p], low[u]);
          // p is AP if u cannot reach any ancestor of p without passing through p
          if (low[u] >= disc[p]) isAP.add(p);
        }
      }
    }
  }

  // Convert back to coord key set
  const result = new Set();
  for (const i of isAP) result.add(empty[i][1] * W + empty[i][0]);
  return result;
}

/**
 * SYSTEM 1b: ARTICULATION CUT BONUS
 *
 * Rewards placements that cover articulation points of the ORIGINAL board.
 * The more high-value articulation points covered, the larger the bonus.
 * An articulation point that splits a 40-cell space vs one that splits a
 * 10-cell space is weighted by the size of the resulting disconnection.
 */
function articulationCutBonus(abs, preBoard, simBoard, W, H, ap, hp, precomputedAPs = null, cachedSimRegions = null) {
  const aps = precomputedAPs ?? findArticulationPoints(preBoard, W, H);
  if (aps.size === 0) return 0;

  // Compute sim-regions once (reused if multiple AP cells are hit)
  let _regsCache = null;

  let bonus = 0;
  for (const [x, y] of abs) {
    if (!aps.has(y * W + x)) continue;
    // Find regions in simBoard — each is a disconnected component created by this cut
    if (!_regsCache) _regsCache = cachedSimRegions ?? floodFillRegions(simBoard, W, H);
    const regs = _regsCache;
    // Reward proportional to how lopsided the split is: the smaller region that
    // the opponent is locked into is the "damage" done. Ideal split: equal halves.
    if (regs.length >= 2) {
      const sizes = regs.map(r => r.length).sort((a,b) => a - b);
      const minSide = sizes[0];
      // Bonus is huge: splitting board into a 15-cell zone opponent must fill = ~3 pieces constrained
      bonus += minSide * 5.5;
      // Extra if the smaller zone is infeasible (not divisible by 5)
      if (minSide % 5 !== 0) bonus += minSide * 4.0;
    } else {
      // Even covering an AP without splitting (still narrows paths) = modest bonus
      bonus += 15.0;
    }
  }
  return bonus;
}

/**
 * SYSTEM 2: TERRITORY SEAL SCORE
 *
 * Pentomino is territorial — genuinely SEALED regions (empty space completely
 * enclosed by ONE player's pieces + board walls) are gold. The opponent cannot
 * enter them; you fill them with your remaining pieces at leisure.
 *
 * Reward: size × multiplier. Infeasible sealed zones (size % 5 ≠ 0) are even
 * better because the opponent's pieces can't tile them either, but since you
 * sealed them, those dead cells COUNT AS yours in end scoring (opponent
 * literally can't place anywhere inside).
 *
 * This is the purest expression of "territorial pentomino."
 */
function territorySealScore(simBoard, W, H, ap, hp, cachedRegions = null) {
  const regions = cachedRegions ?? floodFillRegions(simBoard, W, H);
  let score = 0;

  for (const reg of regions) {
    let aiEdges = 0, oppEdges = 0, wallEdges = 0;
    for (const [x, y] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { wallEdges++; continue; }
        const p = simBoard[ny][nx]?.player;
        if (p === ap)  aiEdges++;
        else if (p === hp) oppEdges++;
      }
    }

    // Fully sealed by AI + walls = AI territory, opponent can never enter
    if (oppEdges === 0 && (aiEdges + wallEdges) > 0) {
      const infeasible = reg.length % 5 !== 0;
      const pBad = parityImbalance(reg) > 0;
      score += reg.length * 8.0;                       // base: every sealed cell is valuable
      if (infeasible) score += reg.length * 6.0;       // extra: opponent can't tile it
      if (pBad)       score += parityImbalance(reg) * 10.0; // extra: parity trap sealed in
    }

    // Partially contested (AI borders dominate but opp has 1-2 edges): still worth something
    if (oppEdges > 0 && aiEdges > oppEdges * 2) {
      score += reg.length * 1.5;
    }
  }
  return score;
}

/**
 * SYSTEM 3: OPPONENT SHAPE READ
 *
 * Core territorial intelligence: look at the empty regions that exist AFTER
 * our placement and check how many of the opponent's remaining piece shapes
 * can actually FIT inside them.
 *
 * If we can create regions where opponent's pieces geometrically cannot fit,
 * those regions become DEAD SPACE for the opponent — pure territory loss.
 * This goes beyond just counting "moves" to understanding piece GEOMETRY.
 *
 * Returns a "shape denial score" — higher = more opponent pieces are locked out.
 */
function opponentShapeReadScore(simBoard, W, H, hp, remainingHpPieces, placedCount, allowFlip, PENTS, xformFn) {
  const regions = floodFillRegions(simBoard, W, H);
  if (!regions.length || !remainingHpPieces.length) return 0;

  let denialScore = 0;

  for (const reg of regions) {
    if (reg.length < 5) {
      // Regions smaller than 5 = definitely unplaceable for any piece
      // Big bonus if these are adjacent to opponent (they wasted space)
      let oppAdjacent = false;
      for (const [x, y] of reg) {
        for (const [ox, oy] of DIRS) {
          const nx = x+ox, ny = y+oy;
          if (nx<0||ny<0||nx>=W||ny>=H) continue;
          if (simBoard[ny][nx]?.player === hp) { oppAdjacent = true; break; }
        }
        if (oppAdjacent) break;
      }
      if (oppAdjacent) denialScore += (5 - reg.length) * 12.0;
      continue;
    }

    // Build a mini-board of just this region for piece-fit testing
    const regSet = new Set(reg.map(([x,y]) => y*W+x));
    // Bounding box
    const xs = reg.map(([x]) => x), ys = reg.map(([,y]) => y);
    const x0 = xs.reduce((a, b) => a < b ? a : b, Infinity);
    const y0 = ys.reduce((a, b) => a < b ? a : b, Infinity);
    const x1 = xs.reduce((a, b) => a > b ? a : b, -Infinity);
    const y1 = ys.reduce((a, b) => a > b ? a : b, -Infinity);
    const rW = x1-x0+1, rH = y1-y0+1;

    // Check how many opponent pieces CANNOT fit in this region
    let piecesBlocked = 0;
    const flipOptions = allowFlip ? [false, true] : [false];

    for (const pk of remainingHpPieces) {
      const base = PENTS[pk];
      let canFit = false;
      outerPk: for (const flip of flipOptions) {
        for (let rot = 0; rot < 4 && !canFit; rot++) {
          const shape = xformFn(base, rot, flip);
          for (let ay = y0; ay <= y1 && !canFit; ay++) {
            for (let ax = x0; ax <= x1 && !canFit; ax++) {
              let valid = true;
              for (const [dx, dy] of shape) {
                const nx = ax+dx, ny = ay+dy;
                if (!regSet.has(ny*W+nx)) { valid = false; break; }
              }
              if (valid) canFit = true;
            }
          }
        }
      }
      if (!canFit) piecesBlocked++;
    }

    // Proportion of opponent's pieces blocked in this region
    const blockRatio = piecesBlocked / remainingHpPieces.length;
    if (blockRatio > 0.5) denialScore += reg.length * blockRatio * 8.0;
  }

  return denialScore;
}

/**
 * SYSTEM 4: BOARD SPLIT DETECTION
 *
 * The ultimate territory weapon: detect when a move DIVIDES the empty space
 * into two or more components where one component is "claimed" by each player
 * based on Voronoi proximity. If the split creates two zones each clearly
 * dominated by one player, it effectively ENDS the territorial contest —
 * both sides fill their own zone and whoever got more cells wins.
 *
 * Reward moves that create favorable splits (AI gets the larger zone).
 * Penalize moves that create unfavorable splits (opponent gets the larger zone).
 */
function boardSplitBonus(abs, preBoard, simBoard, W, H, ap, hp) {
  const regsBefore = floodFillRegions(preBoard, W, H);
  const regsAfter  = floodFillRegions(simBoard, W, H);

  // Only interesting if we went from 1 region to 2+ regions
  if (regsAfter.length <= regsBefore.length) return 0;

  let bonus = 0;
  for (const reg of regsAfter) {
    if (reg.length < 5) continue;
    // Determine ownership by counting adjacent occupied cells per player
    let aiCells = 0, hpCells = 0;
    for (const [x, y] of reg) {
      // Count occupied neighbors to gauge "ownership"
      let aiN = 0, hpN = 0;
      for (const [ox, oy] of DIRS) {
        const nx=x+ox, ny=y+oy;
        if (nx<0||ny<0||nx>=W||ny>=H) continue;
        const p = simBoard[ny][nx]?.player;
        if (p===ap) aiN++;
        else if (p===hp) hpN++;
      }
      if (aiN > hpN) aiCells++;
      else if (hpN > aiN) hpCells++;
    }

    const size = reg.length;
    if (aiCells > hpCells) {
      // We own this zone: the bigger it is, the better
      bonus += size * 3.5;
      if (size % 5 === 0) bonus += size * 1.5; // we can tile it perfectly
    } else if (hpCells > aiCells) {
      // Opponent owns this zone: smaller = less we give away
      bonus -= size * 1.5;
      if (size % 5 !== 0) bonus += size * 4.0; // infeasible for them = we win it back
    }
  }
  return bonus;
}

/**
 * SYSTEM 5: P1 OPENING THEORY (Center Seam Control)
 *
 * As Player 1 on a 10×6 board, the first move is the ONLY unconstrained
 * placement. The optimal opening places a piece along or near the CENTER SEAM
 * (the horizontal line between rows 2 and 3, or vertical line at x=4/5).
 *
 * GM (defensive): Prefer horizontal seam placement — split the board into
 *   top half (3 rows) and bottom half (3 rows). Defend one half aggressively.
 *
 * Legendary (aggressive): Prefer the exact center cells to maintain maximum
 *   expansion options in ALL four directions for a pincer strategy.
 *
 * Returns a bonus for first-move placements based on strategic value.
 */
/**
 * SYSTEM 5: PIECE-SPECIFIC OPENING BOOK
 *
 * Replaces the naive center-bias with real opening theory derived from the
 * territorial structure of a 10×6 board, scaled for larger boards like 15×8.
 * Key discoveries:
 *
 * ══ P-PIECE ══
 * Best opening: mid-height on either vertical edge (cols 0-1 or 8-9, rows 1-4).
 * The P's compact 2×2+1 body placed flush against a wall creates an INSTANT
 * double threat — empty space above AND below the piece simultaneously.
 * Opponent can only block one direction; you claim the other for free.
 * The board wall acts as a free extra piece backing your territory.
 *
 * ══ U-PIECE ══
 * Best opening: cup-face pointing INWARD against any wall.
 * The U against a wall seals a 1-cell pocket that no piece can ever enter.
 * That cell is permanently your territory. Combined with P, they can wall
 * off a 2×3 = 6-cell zone which is NOT divisible by 5 → infeasibility trap.
 *
 * ══ P + U COMBO ══
 * Together these two pieces can border a 2×3 zone (6 cells ÷ 5 = remainder 1).
 * The opponent can place 1 piece inside but leaves 1 orphan cell behind —
 * that cell is DEAD space. With proper sequencing, the AI wins both the
 * enclosed zone AND forces the opponent's next piece into a bad position.
 *
 * ══ I-PIECE ══
 * Best as a long wall along the top or bottom edge (row 0 or row 5).
 * Pairs with V or L to "cap" the end → clean 2×5 rectangular territory.
 * The I + V cap creates a 10-cell rectangle the AI can tile perfectly
 * while the opponent has no entry point.
 *
 * ══ V / W ══ — Corner anchors. Claim a corner and the two edges radiating
 * from it. Opponent must use 2 pieces to contest what you claimed with 1.
 *
 * ══ L / N ══ — Long-arm-along-edge. The arm claims a row edge; the foot
 * blocks the exit column. Creates a natural "L-shaped territory."
 *
 * ══ T / Y / X / F ══ — Only these pieces truly benefit from center placement.
 * Their branching shape means center = maximum 4-direction expansion.
 *
 * ══ Z / S ══ — Diagonal seam crossers. Place them to straddle the seam
 * diagonally — they naturally create two territories on opposite sides.
 *
 * @param {[number,number][]} abs   - absolute cell coords of the placement
 * @param {string} pieceKey         - which piece this is (P, U, I, T, etc.)
 * @param {number[][]} aiHand       - AI's full remaining piece keys
 * @param {number} W, H             - board dimensions
 * @param {number} placedCount      - 0 = first move, 1 = second move, etc.
 * @param {string} mode             - 'defensive' (GM) or 'aggressive' (Legendary)
 */
function p1OpeningBonus(abs, W, H, placedCount, mode, pieceKey, aiHand) {
  // Opening theory applies for first ~5 moves on 10×6, longer on bigger boards.
  // Scale cutoff by board area relative to baseline 60-cell board.
  const openingCutoff = Math.round(4 * Math.max(1.0, (W * H) / 60));
  if (placedCount > openingCutoff) return 0;

  const cx = (W - 1) / 2;
  const cy = (H - 1) / 2;
  // Radial scale: center bonuses calibrated for 10×6 corner distance (~5 cells).
  // For 15×8 corner distance is ~7.8 — scale threshold accordingly.
  const radialScale = Math.sqrt(W * H / 60);
  const pk = pieceKey || '';
  const hand = aiHand || [];

  let bonus = 0;

  // ── Helper: how many cells are against the board edge ────────────
  const wallCells = abs.filter(([x,y]) => x===0||y===0||x===W-1||y===H-1).length;

  // ── Helper: bounding box ─────────────────────────────────────────
  const xs = abs.map(([x])=>x), ys = abs.map(([,y])=>y);
  const minX = xs.reduce((a, b) => a < b ? a : b, Infinity);
  const maxX = xs.reduce((a, b) => a > b ? a : b, -Infinity);
  const minY = ys.reduce((a, b) => a < b ? a : b, Infinity);
  const maxY = ys.reduce((a, b) => a > b ? a : b, -Infinity);
  const spanX = maxX - minX + 1;
  const spanY = maxY - minY + 1;

  // ── Helper: is piece touching a vertical edge (left/right wall)? ─
  const onLeftEdge  = abs.some(([x])=>x===0);
  const onRightEdge = abs.some(([x])=>x===W-1);
  const onTopEdge   = abs.some(([,y])=>y===0);
  const onBotEdge   = abs.some(([,y])=>y===H-1);
  const onVertEdge  = onLeftEdge || onRightEdge;
  const onHorizEdge = onTopEdge || onBotEdge;

  // ── Helper: does piece straddle the horizontal seam (rows 2-3)? ──
  const spansSeam = abs.some(([,y])=>y<=Math.floor(cy)) && abs.some(([,y])=>y>Math.floor(cy));

  // ── Helper: mid-height range ──────────────────────────────────────
  // "Mid-height" = rows 1-4 for a 6-row board. Avoids the extreme corners.
  const midHeight = abs.every(([,y]) => y >= 1 && y <= H-2);

  // ════════════════════════════════════════════════════════════════
  //  P-PIECE: Mid-height vertical edge = the double-threat opening
  // ════════════════════════════════════════════════════════════════
  if (pk === 'P') {
    if (onVertEdge) {
      // Core P opening: flush against left or right wall at mid-height
      // Creates simultaneous UP zone (rows above) and DOWN zone (rows below)
      bonus += 200.0; // huge base reward for correct edge placement

      // Mid-height bonus: rows 1-4 are best (creates zones in both directions)
      // Row 0 or 5 edge = only one direction to threaten
      if (midHeight) bonus += 80.0;

      // Seam straddling bonus: crosses rows 2-3 = unsplittable by opponent
      if (spansSeam) bonus += 100.0;

      // The "double threat" metric: empty rows ABOVE the piece and BELOW
      // Both must exist for this to be a true fork
      const topOfPiece = minY;
      const botOfPiece = maxY;
      const hasUpThreat   = topOfPiece >= 1; // at least 1 row above
      const hasDownThreat = botOfPiece <= H-2; // at least 1 row below
      if (hasUpThreat && hasDownThreat) bonus += 120.0; // TRUE double threat fork!

      // Wall backing: each cell touching a wall is "free" (wall does the work)
      bonus += wallCells * 25.0;
    } else {
      // P NOT on edge: significant penalty — you're wasting its wall synergy
      bonus -= 80.0;
    }

    // P + U COMBO: if AI hand contains U, reward positioning that sets up
    // a 2×3 = 6-cell infeasibility trap between the two pieces
    if (hand.includes('U')) bonus += 60.0;
  }

  // ════════════════════════════════════════════════════════════════
  //  U-PIECE: Cup-against-wall = guaranteed enclosed cell
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'U') {
    if (onHorizEdge || onVertEdge) {
      bonus += 180.0; // wall placement base

      // Check if the U's "open" end faces the board interior
      // U shape: ■ . ■ / ■ ■ ■ or rotations
      // When against top wall, open end faces down → sealed pocket at top
      // When against bottom wall, open end faces up → sealed pocket at bottom
      if (onHorizEdge) {
        // The enclosed cell is between the two prongs + wall
        // Count if there's a "pocket" (a cell touching 3 walls/pieces)
        for (const [x, y] of abs) {
          for (const [ox, oy] of DIRS) {
            const nx=x+ox, ny=y+oy;
            if (nx<0||ny<0||nx>=W||ny>=H) continue;
            // Is this neighbor NOT in abs (i.e., it's the enclosed pocket cell)?
            if (!abs.some(([ax,ay])=>ax===nx&&ay===ny)) {
              // Count walls around this potential pocket
              let walls = 0;
              for (const [ox2,oy2] of DIRS) {
                const nnx=nx+ox2, nny=ny+oy2;
                if (nnx<0||nny<0||nnx>=W||nny>=H) walls++;
                else if (abs.some(([ax,ay])=>ax===nnx&&ay===nny)) walls++;
              }
              if (walls >= 3) bonus += 150.0; // sealed pocket confirmed!
            }
          }
        }
        bonus += midHeight ? 40.0 : 20.0;
      }

      // P + U COMBO setup: position U near where P was / will be placed
      if (hand.includes('P')) bonus += 80.0;
      bonus += wallCells * 20.0;
    } else {
      bonus -= 60.0; // U not on edge = wasted potential
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  I-PIECE: Long wall along board edge, pairs with V/L for cap
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'I') {
    if (onHorizEdge) {
      // I along top or bottom row = perfect long wall
      bonus += 160.0;
      // Horizontal I (all 5 cells in same row)
      if (spanY === 1 && spanX === 5) bonus += 80.0;
      // V/L cap synergy: if AI has V or L, they can cap the end of the I
      // to create a perfect rectangular territory (2×5 = 10 cells)
      if (hand.includes('V') || hand.includes('L')) bonus += 100.0;
      if (hand.includes('V') && hand.includes('L')) bonus += 60.0; // both = very powerful
    } else if (onVertEdge) {
      // I along left/right side = vertical wall, also strong
      bonus += 120.0;
      if (spanX === 1 && spanY === 5) bonus += 60.0;
      if (hand.includes('V') || hand.includes('L')) bonus += 70.0;
    } else {
      // I in the middle: only beneficial if it straddles the seam exactly
      if (spansSeam && spanX >= 3) bonus += 60.0;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  V-PIECE: Corner anchor — claims corner + two edge radiations
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'V') {
    const inCorner = (onLeftEdge||onRightEdge) && (onTopEdge||onBotEdge);
    if (inCorner) {
      bonus += 200.0; // perfect corner placement
      // V in corner claims two full edge arms — opponent needs 2 pieces to contest
      bonus += wallCells * 30.0;
      // Pairs very well with I: I extends one of V's arms across the board
      if (hand.includes('I')) bonus += 80.0;
    } else if (onVertEdge || onHorizEdge) {
      bonus += 80.0; // edge but not corner — still decent
    } else {
      bonus -= 40.0; // V not on edge: poor opening
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  W-PIECE: Diagonal corner claim — staircase seals a corner zone
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'W') {
    const inCorner = (onLeftEdge||onRightEdge) && (onTopEdge||onBotEdge);
    if (inCorner) {
      bonus += 180.0;
      bonus += wallCells * 25.0;
    } else if (onVertEdge || onHorizEdge) {
      bonus += 70.0;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  L-PIECE: Long arm along edge, foot blocks the column exit
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'L') {
    if (onHorizEdge) {
      bonus += 140.0;
      // L with long arm along top/bottom = strong territorial claim
      if (spanX >= 3 && spanY <= 2) bonus += 60.0;
      // I synergy: I + L = instant large rectangular territory
      if (hand.includes('I')) bonus += 90.0;
      bonus += wallCells * 20.0;
    } else if (onVertEdge) {
      bonus += 100.0;
      if (hand.includes('I') || hand.includes('V')) bonus += 60.0;
      bonus += wallCells * 20.0;
    }
  }

  // ════════════════════════════════════════════════════════════════
  //  N-PIECE: Diagonal seam crosser — spans both sides of seam
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'N') {
    if (spansSeam) {
      bonus += 120.0; // N crossing the seam creates zone on both sides
      if (onVertEdge) bonus += 80.0; // edge N-seam cross = very strong
    }
    if (onVertEdge) bonus += 60.0;
  }

  // ════════════════════════════════════════════════════════════════
  //  T-PIECE: True center piece — 3-direction expansion
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'T') {
    // T genuinely benefits from center — 3 branches reach all directions
    for (const [x,y] of abs) {
      const radial = Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy));
      bonus += Math.max(0, 5.0 * radialScale - radial) * 20.0;
    }
    if (spansSeam) bonus += 80.0;
  }

  // ════════════════════════════════════════════════════════════════
  //  Y / X / F: Center or seam pieces
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'Y' || pk === 'X' || pk === 'F') {
    for (const [x,y] of abs) {
      const radial = Math.sqrt((x-cx)*(x-cx)+(y-cy)*(y-cy));
      bonus += Math.max(0, 4.5 * radialScale - radial) * 18.0;
    }
    if (spansSeam) bonus += 60.0;
  }

  // ════════════════════════════════════════════════════════════════
  //  Z: Diagonal seam straddle (S was a phantom alias — Z handles both chiralities via flip)
  // ════════════════════════════════════════════════════════════════
  else if (pk === 'Z') {
    if (spansSeam) bonus += 100.0;
    if (onVertEdge && spansSeam) bonus += 60.0;
  }

  // ── Mode multipliers ─────────────────────────────────────────────
  // GM plays it safe (full bonus), Legendary amplifies aggressive openings
  if (mode === 'aggressive') {
    // Legendary wants faster territory establishment → amplify double threats
    const doubleThreats = ['P', 'U', 'N', 'Z'];
    if (doubleThreats.includes(pk)) bonus *= 1.3;
  }

  return Math.max(0, bonus);
}

/**
 * COMBO SYNERGY: Detect if AI pieces in hand can create infeasibility traps
 * together on subsequent moves. Reward setups that enable these combos.
 *
 * Known powerful combos:
 *
 * 1) P + U → 2×3 INFEASIBILITY TRAP (6 cells, not ÷ by 5)
 *    P creates one side of the 2×3 box; U "caps" it.
 *    The resulting 6-cell interior cannot be tiled → dead for opponent.
 *
 * 2) I + V → RECTANGULAR TERRITORY (2×5 = 10 cells)
 *    I claims entire top/bottom row; V or L caps one end.
 *    Creates a 2×5 = 10 cell region the AI can tile PERFECTLY (2 pieces).
 *
 * 3) I + L → CORNER LOCK (similar to I+V but L's foot seals the exit)
 *
 * 4) V + V → DOUBLE CORNER DOMINANCE
 *    Two V-pieces in opposite corners claim both ends of a row/column.
 *
 * This function scores how well the CURRENT placement sets up these combos.
 */
function comboSetupBonus(abs, simBoard, W, H, ap, hp, aiHandKeys, placedCount, cachedRegions = null) {
  if (placedCount > 6) return 0; // combos only matter early

  // Compute regions once and reuse across all three combo checks
  const _lazyRegions = () => cachedRegions ?? floodFillRegions(simBoard, W, H);
  let _regionsComputed = null;
  const getRegions = () => { if (!_regionsComputed) _regionsComputed = _lazyRegions(); return _regionsComputed; };

  let bonus = 0;

  // ── COMBO 1: P + U → 2×3 infeasibility trap setup ────────────────
  // Check if our placement creates a region of size 6 adjacent to our piece
  // that the opponent cannot tile (6 % 5 ≠ 0)
  if (aiHandKeys.includes('U') || aiHandKeys.includes('P')) {
    const regions = getRegions();
    for (const reg of regions) {
      if (reg.length !== 6) continue; // exactly 6 = infeasible for pentominoes!
      // Is this region enclosed by our piece on at least 2 sides?
      let aiEdges = 0;
      for (const [x,y] of reg) {
        for (const [ox,oy] of DIRS) {
          const nx=x+ox, ny=y+oy;
          if (nx<0||ny<0||nx>=W||ny>=H) continue;
          if (simBoard[ny][nx]?.player === ap) aiEdges++;
        }
      }
      if (aiEdges >= 2) {
        bonus += 180.0; // 6-cell zone adjacent to us = potential infeasibility trap!
        // Extra if it's 2×3 shaped (the ideal trap)
        const regXs = reg.map(([x])=>x), regYs = reg.map(([,y])=>y);
        const rW = regXs.reduce((a,b)=>a>b?a:b,-Infinity) - regXs.reduce((a,b)=>a<b?a:b,Infinity) + 1;
        const rH = regYs.reduce((a,b)=>a>b?a:b,-Infinity) - regYs.reduce((a,b)=>a<b?a:b,Infinity) + 1;
        if ((rW===2&&rH===3)||(rW===3&&rH===2)) bonus += 120.0;
      }
    }
  }

  // ── COMBO 2: I + V/L → rectangular territory ─────────────────────
  // Check if our placement creates a clean 2×N region we can later tile
  if (aiHandKeys.includes('I') && (aiHandKeys.includes('V') || aiHandKeys.includes('L'))) {
    // Look for empty regions near our piece with width = 2 and length ≥ 5
    const regions = getRegions();
    for (const reg of regions) {
      if (reg.length < 10 || reg.length > 15) continue;
      const regXs = reg.map(([x])=>x), regYs = reg.map(([,y])=>y);
      const rW = regXs.reduce((a,b)=>a>b?a:b,-Infinity) - regXs.reduce((a,b)=>a<b?a:b,Infinity) + 1;
      const rH = regYs.reduce((a,b)=>a>b?a:b,-Infinity) - regYs.reduce((a,b)=>a<b?a:b,Infinity) + 1;
      const isRectangular = rW*rH === reg.length; // no holes
      if (isRectangular && (rW===2||rH===2) && reg.length%5===0) {
        // Perfect rectangular zone, divisible by 5, width 2 = I+L/V can tile it
        let aiEdges = 0;
        for (const [x,y] of reg) {
          for (const [ox,oy] of DIRS) {
            const nx=x+ox, ny=y+oy;
            if (nx<0||ny<0||nx>=W||ny>=H) continue;
            if (simBoard[ny][nx]?.player === ap) aiEdges++;
          }
        }
        if (aiEdges >= 2) bonus += reg.length * 10.0; // size * value
      }
    }
  }

  // ── COMBO 3: Small infeasible regions (size 1-4) near opponent ───
  // Creating tiny pockets next to opponent cells means they must waste a piece
  const regions = getRegions();
  for (const reg of regions) {
    if (reg.length >= 5) continue; // only small ones
    let oppAdjacent = false;
    for (const [x,y] of reg) {
      for (const [ox,oy] of DIRS) {
        const nx=x+ox, ny=y+oy;
        if (nx<0||ny<0||nx>=W||ny>=H) continue;
        if (simBoard[ny][nx]?.player === hp) { oppAdjacent = true; break; }
      }
      if (oppAdjacent) break;
    }
    // Small infeasible zone NEXT TO opponent = they can't escape it
    if (oppAdjacent && reg.length % 5 !== 0) bonus += (5 - reg.length) * 20.0;
  }

  return bonus;
}

/**
 * SYSTEM 6: DEFENSIVE WALL SCORE (Grandmaster)
 *
 * GM's strategy is territorial defense: create a continuous "wall" of pieces
 * that separates the board into zones and guards the AI's claimed territory.
 *
 * This measures how much the new piece EXTENDS or COMPLETES an existing wall:
 * - Reward pieces that connect to 2+ existing AI pieces (wall extension)
 * - Reward pieces whose border creates a long continuous edge
 * - Reward pieces that "close off" a zone (create a concave boundary)
 * - Penalize pieces that leave "holes" in the wall the opponent can slip through
 */
function defensiveWallScore(abs, simBoard, W, H, ap, hp) {
  let score = 0;

  // Count how many AI neighbors each new cell has (wall thickness)
  let totalAiNeighbors = 0;
  let exposedToOpp = 0;
  for (const [x, y] of abs) {
    let aiN = 0;
    for (const [ox, oy] of DIRS) {
      const nx=x+ox, ny=y+oy;
      if (nx<0||ny<0||nx>=W||ny>=H) continue;
      const p = simBoard[ny][nx]?.player;
      if (p===ap) aiN++;
      if (p===hp) exposedToOpp++;
    }
    totalAiNeighbors += aiN;
  }

  // A good wall extends existing territory without exposing too much to opponent
  score += totalAiNeighbors * 6.0;
  score -= exposedToOpp * 3.0;

  // Measure how much of the piece's PERIMETER faces empty space "behind" our lines
  // (i.e., empty space on the AI's side = territory we're enclosing)
  const aiCells = new Set();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (simBoard[y][x]?.player === ap) aiCells.add(y*W+x);

  // Count empty cells adjacent to our new piece that are "enclosed" by existing AI
  for (const [x, y] of abs) {
    for (const [ox, oy] of DIRS) {
      const nx=x+ox, ny=y+oy;
      if (nx<0||ny<0||nx>=W||ny>=H) continue;
      if (simBoard[ny][nx] !== null) continue;
      // Is this empty cell "inside" our territory? Check if it's surrounded by AI on 3+ sides
      let aiSurrounding = 0;
      for (const [ox2, oy2] of DIRS) {
        const nnx=nx+ox2, nny=ny+oy2;
        if (nnx<0||nny<0||nnx>=W||nny>=H) { aiSurrounding++; continue; }
        if (simBoard[nny][nnx]?.player === ap) aiSurrounding++;
      }
      if (aiSurrounding >= 3) score += 8.0; // nearly enclosed cell = wall is working
      if (aiSurrounding >= 2) score += 3.0;
    }
  }

  // Reward if the piece spans the board's "danger axis" (y=2 or y=3 for 6-tall board)
  const centerY = Math.floor(H / 2);
  const spansSeam = abs.some(([,y]) => y === centerY - 1) && abs.some(([,y]) => y === centerY);
  if (spansSeam) score += 30.0; // spanning the seam = wall cuts across the board!

  return score;
}

/**
 * SYSTEM 7: PINCER / COMBO ATTACK SCORE (Legendary)
 *
 * Aggressive Legendary strategy: identify moves that create MULTIPLE simultaneous
 * territorial threats that the opponent cannot all defend in one move.
 *
 * A "pincer" occurs when our placement creates two separate dangerous zones:
 * - Zone A: territory we're about to claim if opponent doesn't respond
 * - Zone B: different territory also under threat
 * → Opponent can only defend one; we take the other.
 *
 * This is the pentomino equivalent of a chess "fork."
 */
function pincerAttackScore(abs, simBoard, W, H, ap, hp, cachedRegions = null) {
  const regions = cachedRegions ?? floodFillRegions(simBoard, W, H);
  if (regions.length < 2) return 0;

  // Find regions that are "threatened" by our new piece
  // (adjacent to our new cells but not yet claimed)
  const absCellSet = new Set(abs.map(([x,y]) => y*W+x));

  const threatenedZones = [];
  for (const reg of regions) {
    if (reg.length < 5 || reg.length > 35) continue;
    let adjacentToNewPiece = false;
    let aiTouches = 0, hpTouches = 0;

    for (const [x,y] of reg) {
      for (const [ox,oy] of DIRS) {
        const nx=x+ox, ny=y+oy;
        if (nx<0||ny<0||nx>=W||ny>=H) continue;
        if (absCellSet.has(ny*W+nx)) adjacentToNewPiece = true;
        const p = simBoard[ny][nx]?.player;
        if (p===ap) aiTouches++;
        if (p===hp) hpTouches++;
      }
    }

    // A threatened zone: adjacent to our new piece AND we border it more than opponent
    if (adjacentToNewPiece && aiTouches >= hpTouches) {
      threatenedZones.push({ size: reg.length, aiTouches, hpTouches });
    }
  }

  if (threatenedZones.length < 2) return 0;

  // Score based on number and size of simultaneous threats
  let score = 0;
  for (const zone of threatenedZones) {
    const urgency = zone.size <= 10 ? 2.0 : 1.0; // small zones are more urgent threats
    score += zone.size * urgency * 4.0;
  }

  // Multiplier for TRUE fork: 2+ meaningful threats
  if (threatenedZones.length >= 2) score *= 1.5;
  if (threatenedZones.length >= 3) score *= 1.3;

  return Math.min(score, 120.0); // cap to avoid dominating
}

/**
 * SYSTEM 8: DYNAMIC WEIGHT ADJUSTMENT
 *
 * Adjust evaluation weights based on current game state:
 * - If AI is AHEAD: become more defensive (lock in the lead)
 * - If AI is BEHIND: become more aggressive (take risks to catch up)
 * - Early game: prioritize territory expansion and seam control
 * - Late game: prioritize infeasibility and opponent piece denial
 *
 * Returns a weights object used by the evaluators.
 */
function getDynamicWeights(board, W, H, ap, hp, placedCount, totalPieces) {
  const t = voronoiTerritory(board, W, H, ap, hp);
  const lead = t.ap - t.hp; // positive = AI winning
  const progress = Math.min(1.0, placedCount / Math.max(totalPieces * 2, 1));

  // Scale territory thresholds relative to board size.
  // Baseline is the standard 10×6 = 60 cell board.
  // 15×8 = 120 cells → thresholds double so "lead > 8" becomes "lead > 16".
  const boardScale = Math.max(1.0, (W * H) / 60);
  const comfortThresh = 8  * boardScale;
  const slightThresh  = 4  * boardScale;

  // Aggression factor: 1.0 = neutral, >1 = more aggressive, <1 = more defensive
  let aggression;
  if (lead > comfortThresh)       aggression = 0.6;  // comfortable lead → defend
  else if (lead > slightThresh)   aggression = 0.8;  // slight lead → cautious
  else if (lead < -comfortThresh) aggression = 1.5;  // losing badly → all-out attack
  else if (lead < -slightThresh)  aggression = 1.2;  // slight deficit → press
  else                             aggression = 1.0;  // even → balanced

  // Game phase weights
  const earlyBoost   = progress < 0.3 ? 1.4 : 1.0; // territory matters more early
  const lateBoost    = progress > 0.6 ? 1.5 : 1.0; // piece denial matters more late

  return { aggression, lead, progress, earlyBoost, lateBoost };
}

// ═════════════════════════════════════════════════════════════════════
//  KEY PIECE RESERVATION SYSTEM
//
//  Legendary (and Grandmaster) should NOT blindly use whatever piece
//  scores best right now. Some pieces are "closers" — they uniquely fit
//  a territory zone the AI is building toward, and spending them early
//  means that zone can never be perfectly sealed later.
//
//  The system works in three layers:
//
//  1. identifyKeyPieces()      — for each piece in hand, compute a
//     "reservation score" based on how uniquely it fits remaining AI zones.
//     Critical (only piece that fits a zone) → very high score.
//     Key (few pieces fit) → medium score.
//     Expendable (many alternatives) → low score.
//
//  2. pieceReservationPenalty() — penalises using a high-reservation-
//     score piece when expendable alternatives exist.
//     Penalty fades to zero in the endgame (≤3 pieces) when there are
//     no more choices.
//
//  3. sealingFinisherBonus()   — the "last move" mechanic.
//     If placing this piece NOW would COMPLETE a zone seal (close off a
//     region entirely), give a massive bonus. This is what makes Legendary
//     hold a piece until the board is ready, then slam it home.
// ═════════════════════════════════════════════════════════════════════

/**
 * Score each piece in hand by how important it is to SAVE for later.
 * Higher score = more critical to reserve.
 *
 * Returns Map<pieceKey, number>
 */
function identifyKeyPieces(hand, board, W, H, ap, allowFlip, PENTS, xformFn) {
  const scores = new Map();
  for (const pk of hand) scores.set(pk, 0);
  if (hand.length <= 3) return scores; // endgame: no point reserving

  const regions = floodFillRegions(board, W, H);
  const flipOptions = allowFlip ? [false, true] : [false];

  for (const reg of regions) {
    // Only care about regions adjacent to AI territory (zones we're contesting)
    if (reg.length < 5 || reg.length > 25) continue;
    let aiAdjacent = false;
    for (const [x, y] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (board[ny][nx]?.player === ap) { aiAdjacent = true; break; }
      }
      if (aiAdjacent) break;
    }
    if (!aiAdjacent) continue;

    const regSet = new Set(reg.map(([x, y]) => y * W + x));
    const fittingPieces = [];

    for (const pk of hand) {
      let canFit = false;
      outer: for (const flip of flipOptions) {
        for (let rot = 0; rot < 4; rot++) {
          const shape = xformFn(PENTS[pk], rot, flip);
          for (const [bx, by] of reg) {
            let valid = true;
            for (const [dx, dy] of shape) {
              if (!regSet.has((by + dy) * W + (bx + dx))) { valid = false; break; }
            }
            if (valid) { canFit = true; break outer; }
          }
        }
      }
      if (canFit) fittingPieces.push(pk);
    }

    if (fittingPieces.length === 0) continue;

    // Zone value: larger and infeasible zones are worth more
    const infeasibleBonus = reg.length % 5 !== 0 ? 1.8 : 1.0;
    const zoneValue = reg.length * infeasibleBonus;

    if (fittingPieces.length === 1) {
      // CRITICAL: only one piece can close this zone — must be saved
      scores.set(fittingPieces[0], scores.get(fittingPieces[0]) + zoneValue * 7.0);
    } else if (fittingPieces.length === 2) {
      // KEY: very few alternatives
      for (const pk of fittingPieces) scores.set(pk, scores.get(pk) + zoneValue * 3.0);
    } else if (fittingPieces.length <= 4) {
      // USEFUL: some reservation value
      for (const pk of fittingPieces) scores.set(pk, scores.get(pk) + zoneValue * 1.2);
    }
  }

  // Inherent endgame value — some pieces are universally better closers
  const inherentValue = {
    I: 22, P: 20, L: 18, Y: 17, N: 15, V: 16, T: 13,
    Z: 11, W: 9, F: 7, U: 7, X: 5,
  };
  for (const pk of hand) {
    scores.set(pk, scores.get(pk) + (inherentValue[pk] || 5));
  }

  // Merge explicit zone-closure reservation — pieces needed to tile owned zones get a big boost
  const closureExtra = zoneClosureReservation(hand, board, W, H, ap, undefined, allowFlip, PENTS, xformFn);
  for (const pk of hand) {
    scores.set(pk, scores.get(pk) + (closureExtra.get(pk) || 0));
  }

  return scores;
}

/**
 * Penalises using a key/critical piece when expendable alternatives exist.
 * Returns a negative number (penalty) or 0.
 *
 * Threshold lowered from 20 → 13 so L/Y/V/N class pieces are also protected,
 * not just I/P. This makes the AI genuinely hold its closers until the right moment.
 */
function pieceReservationPenalty(pk, hand, keyScores, piecesPlaced, totalHandSize) {
  if (hand.length <= 3) return 0; // endgame — must use everything
  const myScore = keyScores.get(pk) || 0;
  if (myScore < 13) return 0; // not a key piece (lowered from 20)

  // Are there pieces with meaningfully lower reservation scores?
  const expendableAlts = hand.filter(k => k !== pk && (keyScores.get(k) || 0) < myScore * 0.55);
  if (expendableAlts.length === 0) return 0; // no alternatives, must use it

  // Penalty fades as game progresses (early = big penalty, late = zero)
  const progress = Math.min(1.0, piecesPlaced / Math.max(totalHandSize * 2, 1));
  const earlyFactor = Math.max(0, 1.0 - progress * 1.6);
  if (earlyFactor <= 0) return 0;

  return -(myScore * earlyFactor * 4.5); // increased multiplier from 3.8 → 4.5
}

/**
 * SEALING FINISHER BONUS — the "last move" mechanic.
 *
 * If placing this piece NOW completely seals a zone (creates a region
 * with zero opponent-accessible entry points), give a massive reward.
 * This is what makes Legendary hold pieces then snap them home at the
 * perfect moment to close territory.
 *
 * Different from territorySealScore: that measures if a zone is already
 * sealed in the sim. This specifically rewards moves that TRANSITION a
 * zone from open → sealed in a single placement.
 */
function sealingFinisherBonus(abs, preBoard, simBoard, W, H, ap, hp) {
  // Find regions that were borderline-open before, but sealed after
  const regsBefore = floodFillRegions(preBoard, W, H);
  const regsAfter  = floodFillRegions(simBoard, W, H);

  // Build a set of all AI cells after placement
  const aiCellsAfter = new Set();
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++)
      if (simBoard[y][x]?.player === ap) aiCellsAfter.add(y * W + x);

  let bonus = 0;

  for (const regAfter of regsAfter) {
    if (regAfter.length < 5) continue;

    // Was this region bordered by opponent BEFORE our move?
    let oppBorderedBefore = false;
    for (const [x, y] of regAfter) {
      for (const [ox, oy] of DIRS) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (preBoard[ny][nx]?.player === hp) { oppBorderedBefore = true; break; }
      }
      if (oppBorderedBefore) break;
    }
    if (!oppBorderedBefore) continue;

    // Is this region NOW sealed by AI only (no opponent borders)?
    let oppBorderedAfter = false;
    let aiBordersAfter = 0;
    for (const [x, y] of regAfter) {
      for (const [ox, oy] of DIRS) {
        const nx = x+ox, ny = y+oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { aiBordersAfter++; continue; }
        const p = simBoard[ny][nx]?.player;
        if (p === ap) aiBordersAfter++;
        else if (p === hp) { oppBorderedAfter = true; break; }
      }
      if (oppBorderedAfter) break;
    }

    if (!oppBorderedAfter && aiBordersAfter > 0) {
      // SEALED! This move just closed off a zone.
      const infeasible = regAfter.length % 5 !== 0;
      const parityTrap = parityImbalance(regAfter) > 0;
      bonus += regAfter.length * 18.0;                      // base: each sealed cell is valuable
      if (infeasible) bonus += regAfter.length * 14.0;      // opponent can't tile it
      if (parityTrap) bonus += parityImbalance(regAfter) * 20.0; // parity trap locked in
    }
  }

  return bonus;
}

/**
 * Mirror war weight multiplier.
 * On a 15×8 board the territory numbers are ~2× larger, and the strategy
 * shifts: corners matter more, seam theory applies but with wider seam,
 * and piece reservation is even more critical (12 pieces each, longer game).
 */
function isMirrorWar(W, H) { return W === 15 && H === 8; }

function getMirrorWarWeights(baseWeights) {
  if (!baseWeights._isMW) return baseWeights; // identity if not mirror war
  return {
    ...baseWeights,
    territory:  baseWeights.territory  * 0.85, // Voronoi numbers are larger, scale down slightly
    seal:       baseWeights.seal       * 1.4,  // sealing is even more important
    articulate: baseWeights.articulate * 1.5,  // board splits have huge impact on big board
    cluster:    baseWeights.cluster    * 1.3,  // isolation is catastrophic on big board
    opening:    baseWeights.opening    * 0.8,  // opening theory still applies on 15×8, just softer
  };
}

/**
 * ZONE-CLOSURE RESERVATION
 *
 * Identifies which pieces in the AI's hand are NEEDED to tile AI-owned
 * sealed (or near-sealed) zones. Returns a per-piece "closure score" —
 * higher = more essential to save for the endgame.
 *
 * Unlike identifyKeyPieces (which looks at all empty regions), this
 * specifically targets zones that:
 *   a) Are fully or nearly enclosed by AI pieces + board walls, AND
 *   b) Have size that exactly matches a combination of AI's remaining pieces.
 *
 * When a zone of exactly N*5 cells exists and only K pieces can tile it,
 * those K pieces must be reserved. Using them elsewhere breaks the seal.
 *
 * Returns Map<pieceKey, number> — extra reservation bonus to add to keyScores.
 */
function zoneClosureReservation(hand, board, W, H, ap, hp, allowFlip, PENTS, xformFn) {
  const extra = new Map();
  for (const pk of hand) extra.set(pk, 0);
  if (hand.length <= 2) return extra; // endgame: no point

  const regions = floodFillRegions(board, W, H);
  const flipOptions = allowFlip ? [false, true] : [false];

  for (const reg of regions) {
    const sz = reg.length;
    if (sz < 5 || sz > hand.length * 5) continue;   // can't be filled by remaining pieces
    if (sz % 5 !== 0) continue;                      // must be tileable

    // Is this region "owned" by AI? Count border occupants.
    let aiEdges = 0, hpEdges = 0, wallEdges = 0;
    for (const [x, y] of reg) {
      for (const [ox, oy] of DIRS) {
        const nx = x + ox, ny = y + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) { wallEdges++; continue; }
        const p = board[ny][nx]?.player;
        if (p === ap)  aiEdges++;
        else if (p === hp) hpEdges++;
      }
    }

    // Only care about AI-dominated zones (opponent has no border access)
    if (hpEdges > 0) continue;           // opponent can still enter → not our zone
    if (aiEdges + wallEdges === 0) continue; // totally open → skip

    // Build regSet for fast lookup
    const regSet = new Set(reg.map(([x, y]) => y * W + x));

    // Find which pieces in hand can fit in this region
    const fitting = [];
    for (const pk of hand) {
      let canFit = false;
      outerFit: for (const flip of flipOptions) {
        for (let rot = 0; rot < 4; rot++) {
          const shape = xformFn(PENTS[pk], rot, flip);
          for (const [bx, by] of reg) {
            let valid = true;
            for (const [dx, dy] of shape) {
              if (!regSet.has((by + dy) * W + (bx + dx))) { valid = false; break; }
            }
            if (valid) { canFit = true; break outerFit; }
          }
        }
      }
      if (canFit) fitting.push(pk);
    }

    if (fitting.length === 0) continue;

    // Urgency: zone that needs exactly as many pieces as can fit = critical closure
    const piecesNeeded = sz / 5;
    const urgencyMult = fitting.length <= piecesNeeded
      ? 8.0   // CRITICAL: only barely enough pieces to close this zone
      : fitting.length <= piecesNeeded * 2
        ? 4.0  // KEY: limited options
        : 1.5; // USEFUL: several options exist

    const zoneValue = sz * urgencyMult;
    for (const pk of fitting) {
      extra.set(pk, extra.get(pk) + zoneValue);
    }
  }
  return extra;
}

// ─────────────────────────────────────────────────────────────────────
//  FACTORY
// ─────────────────────────────────────────────────────────────────────

export function createAiEngine({ game, aiPlayer, humanPlayer, aiDifficulty, PENTOMINOES, transformCells, getDraftHistory }) {
  // Fallback if not provided (e.g. tests)
  const _getDraftHistory = typeof getDraftHistory === 'function' ? getDraftHistory : () => [];
  // ── Caches (speed + stronger search) ─────────────────────────────
  const _moveCache = new Map();
  const _moveCountCache = new Map();
  const _feasibleCache = new Map();

  // Evict oldest entries when a cache exceeds this size.
  // A Mirror War game has ~24 placements; each turn generates many unique board states.
  // Without eviction these Maps grow unboundedly, leaking memory across the session.
  const CACHE_MAX = 400;
  function _evict(map) {
    if (map.size <= CACHE_MAX) return;
    // Delete the first (oldest) entry — Map preserves insertion order
    map.delete(map.keys().next().value);
  }

  // ── FORK FOLLOW-THROUGH STATE (Legendary only) ────────────────────
  // After Legendary creates a fork (two simultaneous threats), we store
  // the threatened zones here. On the NEXT Legendary move, we check which
  // zone the opponent left open and reward claiming it.
  //
  // Structure:
  //   _forkState.zones        = [ Set<cellKey>, Set<cellKey> ]  ← the two threatened zones
  //   _forkState.boardSig     = string  ← board signature at time of fork
  //   _forkState.placedCount  = number  ← move index when fork was created
  //   _forkState.zoneScores   = [ number, number ]  ← value of each zone
  let _forkState = null;

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
    _evict(_moveCache);
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
              // Bounds + overlap check
              let valid = true;
              for (const [dx, dy] of shape) {
                const x = ax+dx, y = ay+dy;
                if (x < 0 || y < 0 || x >= boardW || y >= boardH || board[y][x] !== null) {
                  valid = false; break;
                }
              }
              if (!valid) continue;
              // Touch check (inline — no need to build an abs array)
              if (placedCount > 0) {
                let touches = false;
                tO: for (const [dx, dy] of shape) {
                  const px = ax+dx, py = ay+dy;
                  for (const [ox, oy] of DIRS) {
                    const nx = px+ox, ny = py+oy;
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
    _evict(_feasibleCache);
    return feasible;
  }

  function countTotalMoves(board, boardW, boardH, playerNum, remaining, placedCount, allowFlip) {
    const _k = _mkKey('movecount', playerNum, board, boardW, boardH, remaining, placedCount, allowFlip);
    const _c = _moveCountCache.get(_k);
    if (_c !== undefined) return _c;
    const v = movesOnBoard(playerNum, board, boardW, boardH, remaining, placedCount, allowFlip).length;
    _moveCountCache.set(_k, v);
    _evict(_moveCountCache);
    return v;
  }

  /** Quick score (used for lookahead pruning). 🔥 SUPERCHARGED weights for GM/Legendary beam quality. */
function quickScore(simBoard, ap, hp, boardW, boardH) {
  const t = territoryAdvantage(simBoard, boardW, boardH, ap, hp);
  const regs = floodFillRegions(simBoard, boardW, boardH);
  const trap = regionFeasibilityBonus(regs, simBoard, boardW, boardH, hp);
  const fr = frontierScore(simBoard, boardW, boardH, ap, hp);
  const largest = regs.length ? regs.reduce((a,b)=>b.length>a.length?b:a, regs[0]) : null;
  const openZone = largest ? largest.length * 0.18 : 0; // 🔥 was 0.08
  // 🔥 Cluster penalty dominates beam filter more strongly (was 0.8)
  const cluster = aiClusterPenalty(simBoard, boardW, boardH, ap);
  return t * 10.0 + trap * 0.22 + fr * 0.9 + openZone + cluster * 1.5; // 🔥 all weights boosted
}

/**
 * Connectivity-first beam selection.
 *
 * The previous approach sorted ALL moves by quickScore and took the top N.
 * Disconnected moves (placing far from the main cluster) could score high
 * on territory and pass the beam even with cluster penalties, because
 * territory × 16 easily overwhelms -50 from a stranded piece.
 *
 * This function structurally enforces connectivity:
 *   1. Separate moves into "connected" (touches AI's existing cells) and "disconnected".
 *   2. Score and sort both groups by quickScore.
 *   3. Fill the beam from connected first. Only add disconnected moves to pad
 *      out the beam if there aren't enough connected candidates.
 *
 * Result: a disconnected move can only enter the beam if the AI genuinely
 * has no good connected options — i.e. it's truly the first piece (empty board)
 * or the AI is completely surrounded.
 */
function connectivityBeam(moves, board, boardW, boardH, ap, hp, beamSize) {
  if (!moves.length) return [];

  // Find AI's current occupied cells
  const aiOccupied = new Set();
  for (let y = 0; y < boardH; y++)
    for (let x = 0; x < boardW; x++)
      if (board[y][x]?.player === ap) aiOccupied.add(y * boardW + x);

  const connected = [];
  const disconnected = [];

  for (const m of moves) {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };
    const qs = quickScore(sim, ap, hp, boardW, boardH);

    // First piece: no existing AI cells, all placements are "connected"
    let touches = aiOccupied.size === 0;
    if (!touches) {
      outer: for (const [x, y] of m.abs) {
        for (const [ox, oy] of DIRS) {
          const nx = x+ox, ny = y+oy;
          if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH && aiOccupied.has(ny * boardW + nx)) {
            touches = true; break outer;
          }
        }
      }
    }
    if (touches) connected.push({ m, s: qs });
    else disconnected.push({ m, s: qs });
  }

  connected.sort((a,b) => b.s - a.s);
  disconnected.sort((a,b) => b.s - a.s);

  // Fill beam: connected first, then disconnected only to pad remaining slots
  const beam = connected.slice(0, beamSize);
  if (beam.length < beamSize) {
    beam.push(...disconnected.slice(0, beamSize - beam.length));
  }
  return beam;
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


  // ── Endgame solver: territory-precise evaluation for closing moves ──
  // Smarter than greedy: rewards sealing moves and penalises wasting
  // key pieces on suboptimal positions. Used when AI has ≤ threshold pieces.
  function endgameSolve(moves) {
    if (!moves.length) return null;
    const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
    const ap = aiPlayer.value, hp = humanPlayer.value;
    const diff = aiDifficulty.value;
    const aiHand = remaining[ap] || [];

    // For Legendary/Grandmaster, pre-compute key piece scores so the endgame
    // solver still respects piece reservation even in the closing phase.
    const useReservation = (diff === 'legendary' || diff === 'grandmaster') && aiHand.length > 3;
    const keyPiecesEG = useReservation
      ? identifyKeyPieces(aiHand, board, boardW, boardH, ap, allowFlip, PENTOMINOES, transformCells)
      : null;

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

      // Core endgame score: cells on board + territory + infeasibility pressure
      let score = (aiCells - hpCells) * 22.0
                + regionFeasibilityBonus(regions, sim, boardW, boardH, hp) * 1.4
                + territoryAdvantage(sim, boardW, boardH, ap, hp) * 6.0
                + aiClusterPenalty(sim, boardW, boardH, ap) * 1.5;

      // SEALING FINISHER: big bonus for completing a zone seal
      // This is the most important endgame signal — close the door
      score += sealingFinisherBonus(m.abs, board, sim, boardW, boardH, ap, hp) * 3.8;  // was 2.8

      // Territory seal score: reward regions already sealed by AI
      score += territorySealScore(sim, boardW, boardH, ap, hp) * 1.8;  // was 1.2

      // Zone seal transitions: reward cutting off opponent from open regions
      score += zoneSealBonus(regions, board, sim, boardW, boardH, hp) * 2.0;  // was 1.5

      // Piece reservation: even in endgame, avoid wasting key pieces if alternatives exist
      if (keyPiecesEG) {
        const totalHandSizeEG = aiHand.length;
        score += pieceReservationPenalty(m.pk, aiHand, keyPiecesEG, placedCount, totalHandSizeEG) * 1.2;
      }

      // 1-ply lookahead: check opponent's best response
      if (diff === 'legendary' || diff === 'grandmaster') {
        const remAfterEG = {
          [ap]: aiHand.filter(pk => pk !== m.pk),
          [hp]: [...(remaining[hp] || [])],
        };
        const oppMovesEG = movesOnBoard(hp, sim, boardW, boardH, remAfterEG, placedCount+1, allowFlip);
        if (oppMovesEG.length > 0) {
          // Find opponent's best response and penalise if it's very strong
          let worstResponseScore = Infinity;
          const oppBeamEG = Math.min(12, oppMovesEG.length);
          for (const om of oppMovesEG.slice(0, oppBeamEG)) {
            const afterOpp = sim.map(r => [...r]);
            for (const [x, y] of om.abs) afterOpp[y][x] = { player: hp, pieceKey: om.pk };
            const s = quickScore(afterOpp, ap, hp, boardW, boardH);
            if (s < worstResponseScore) worstResponseScore = s;
          }
          score += worstResponseScore * 0.45;
        }
      }

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

  // Pass 1: connectivity-first beam — connected moves always ranked above disconnected
  // Scale beam down on larger boards (Mirror War 15×8 has ~2x the moves of 10×6)
  // to keep evaluation time reasonable on the main thread.
  const tacBeam = isMirrorWar(boardW, boardH) ? 16 : 26;
  const prescored = connectivityBeam(moves, board, boardW, boardH, ap, hp, tacBeam);

  let best = null, bestScore = -Infinity;
  for (const { m } of prescored) {
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
    score += openTerritoryBonus(m.abs, sim, boardW, boardH, ap);           // race open zones
    score += aiClusterPenalty(sim, boardW, boardH, ap); // no isolated clusters

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
// 🔥 SUPERCHARGED + 8 NEW STRATEGIC SYSTEMS
// Strategy: DEFENSIVE TERRITORIAL CONTROL
//   - P1 opening seam strategy
//   - Articulation point coverage (board splitting)
//   - Territory sealing (enclosed zones)
//   - Defensive wall building
//   - Opponent shape read (geometry denial)
//   - Dynamic weight adjustment (protect lead / close gaps)
function movesGrandmaster(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
  const ap = aiPlayer.value, hp = humanPlayer.value;
  const humanPieceCount = (remaining[hp] || []).length;
  const aiPieceCount    = (remaining[ap] || []).length;
  const totalPieces     = humanPieceCount + aiPieceCount;

  // Endgame solver kicks in early — precise solver handles endgame perfectly
  const _mwGM = isMirrorWar(boardW, boardH);
  const endgameThreshold = _mwGM ? 9 : 7; // mirror war has more pieces, kick in later
  if (aiPieceCount <= endgameThreshold || humanPieceCount <= endgameThreshold) return endgameSolve(moves);

  // Dynamic weights based on current territory lead
  const dw = getDynamicWeights(board, boardW, boardH, ap, hp, placedCount, totalPieces);

  // ── KEY PIECE RESERVATION ─────────────────────────────────────────
  // Identify closers (pieces that uniquely seal territory zones) so we
  // don't spend them early when expendable alternatives exist.
  // Also merges explicit zone-closure scores (pieces needed to tile owned zones).
  const keyPiecesGM = identifyKeyPieces(
    remaining[ap] || [], board, boardW, boardH, ap, allowFlip, PENTOMINOES, transformCells
  );

  // ── ZONE-CLOSURE EXTRA: pieces that fit AI-sealed territories get boosted ──
  const closureGM = zoneClosureReservation(
    remaining[ap] || [], board, boardW, boardH, ap, hp, allowFlip, PENTOMINOES, transformCells
  );
  for (const [pk, v] of closureGM) {
    keyPiecesGM.set(pk, (keyPiecesGM.get(pk) || 0) + v * 1.5);
  }

  const oppMobilityBefore = countTotalMoves(board, boardW, boardH, hp, remaining, placedCount, allowFlip);
  const oppFeasibleBefore = countFeasiblePieces(board, boardW, boardH, hp, remaining, placedCount, allowFlip);

  // Wide connectivity-first beam
  // Reduced for Mirror War (15×8) — the larger board means ~2x more moves to score,
  // so we cap the beam to avoid multi-second main thread blocks.
  const gmBeam = _mwGM ? 30 : 50;
  const prescored = connectivityBeam(moves, board, boardW, boardH, ap, hp, gmBeam);

  // ── Pre-compute articulation points ONCE outside the beam loop ──────
  // findArticulationPoints runs a full Tarjan DFS — O(V+E) on empty-cell graph.
  // Computing it per-candidate (inside the loop) was 30–50× wasteful since
  // the PRE-move board doesn't change between candidates.
  const _preAPs = findArticulationPoints(board, boardW, boardH);

  let best = null, bestScore = -Infinity;
  for (const { m } of prescored) {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };

    const remAfter = {
      [ap]: (remaining[ap]||[]).filter(pk => pk !== m.pk),
      [hp]: [...(remaining[hp]||[])],
    };

    // ── CORE EVALUATION ──────────────────────────────────────────────
    const tAdv   = territoryAdvantage(sim, boardW, boardH, ap, hp);
    const regions = floodFillRegions(sim, boardW, boardH);

    let score = tAdv * 28.0 * dw.earlyBoost;

    // Mobility destruction
    const oppMobAfter = countTotalMoves(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    score += (oppMobilityBefore - oppMobAfter) * 12.0;

    score += regionFeasibilityBonus(regions, sim, boardW, boardH, hp) * 2.5 * dw.lateBoost;
    score += zoneSealBonus(regions, board, sim, boardW, boardH, hp) * 2.0;
    score += zoneClaimBonus(m.abs, sim, boardW, boardH) * 2.0;
    score += frontierScore(sim, boardW, boardH, ap, hp) * 2.0;
    score += pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap) * 2.0;
    score += openTerritoryBonus(m.abs, sim, boardW, boardH, ap, regions) * 2.0;
    score += aiClusterPenalty(sim, boardW, boardH, ap) * 2.0;

    // Region-size penalties
    let lockedPenalty = 0;
    for (const reg of regions) {
      if (reg.length <= 4)                    score += (5 - reg.length) * 16.0;
      if (reg.length % 5 === 0)               score -= 2.4;
      if (reg.length === 5 * humanPieceCount) lockedPenalty += 5.0;
    }
    score -= lockedPenalty;

    // Feasibility pressure
    const ownFeasible = countFeasiblePieces(sim, boardW, boardH, ap, remAfter, placedCount+1, allowFlip);
    const oppFeasible = countFeasiblePieces(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    score += ownFeasible      * 18.0;
    score -= oppFeasible      * 24.0;
    score += (oppFeasibleBefore - oppFeasible) * 22.0 * dw.lateBoost;

    // ── NEW SYSTEM 1: P1 OPENING — Piece-Specific Opening Book ──────
    // Each piece has an ideal first-move placement based on its shape.
    // P/U → mid-height edge (double threat). I → edge wall. V/W → corner.
    // T/Y/X → center. Pass the actual piece key for correct theory.
    score += p1OpeningBonus(m.abs, boardW, boardH, placedCount, 'defensive',
      m.pk, remAfter[ap]) * 2.5;

    // ── NEW SYSTEM 2: ARTICULATION POINT COVERAGE ────────────────────
    // Placing on board "choke points" splits the empty space into separate zones.
    // GM uses this defensively: cut off opponent's expansion path.
    score += articulationCutBonus(m.abs, board, sim, boardW, boardH, ap, hp, _preAPs, regions) * 1.8;

    // ── NEW SYSTEM 3: TERRITORY SEALING ──────────────────────────────
    // Reward creating fully enclosed zones that only AI can fill.
    // Infeasible sealed zones are extra valuable (opponent's pieces can't enter).
    score += territorySealScore(sim, boardW, boardH, ap, hp) * 1.5;

    // ── NEW SYSTEM 4: DEFENSIVE WALL BUILDING ────────────────────────
    // GM builds continuous walls along the center seam and board edges.
    // Measures wall quality: thickness, seam spanning, enclosed cells.
    score += defensiveWallScore(m.abs, sim, boardW, boardH, ap, hp) * 1.6;

    // ── NEW SYSTEM 5: BOARD SPLIT DETECTION ──────────────────────────
    // Detect if this move divides the empty space into components.
    // If AI owns the larger component, this is game-winning.
    score += boardSplitBonus(m.abs, board, sim, boardW, boardH, ap, hp) * 2.0;

    // ── NEW SYSTEM 6: OPPONENT SHAPE READ (late-game weight) ─────────
    // Check if the regions we create are geometrically unfit for opponent pieces.
    // Apply more strongly in mid/late game when pieces are known.
    // Mirror War raises the threshold: expensive piece-fitting only after 40% progress.
    if (dw.progress > (_mwGM ? 0.4 : 0.2)) {
      score += opponentShapeReadScore(
        sim, boardW, boardH, hp, remAfter[hp], placedCount+1, allowFlip, PENTOMINOES, transformCells
      ) * dw.lateBoost * 1.2;
    }

    // ── NEW SYSTEM 7: COMBO SETUP BONUS ──────────────────────────────
    // Reward moves that set up P+U infeasibility traps, I+V rectangles, etc.
    // The most powerful territorial combos in the game.
    score += comboSetupBonus(m.abs, sim, boardW, boardH, ap, hp, remAfter[ap], placedCount, regions) * 1.8;

    // ── KEY PIECE RESERVATION (Grandmaster) ───────────────────────────
    // Penalise spending a "closer" piece early when expendable alternatives
    // exist. Let the GM hold its I/P/L for the perfect sealing moment.
    score += pieceReservationPenalty(m.pk, remaining[ap] || [], keyPiecesGM, placedCount, aiPieceCount) * 1.6;

    // ── SEALING FINISHER BONUS ────────────────────────────────────────
    // If this placement COMPLETES a zone seal (transitions open → sealed),
    // give a large bonus — this is the "snap it home" moment.
    score += sealingFinisherBonus(m.abs, board, sim, boardW, boardH, ap, hp) * 2.2;

    // ── 3-PLY MINIMAX LOOKAHEAD ───────────────────────────────────────
    const oppMoves = movesOnBoard(hp, sim, boardW, boardH, remAfter, placedCount+1, allowFlip);
    let lookaheadValue = 0;
    if (oppMoves.length) {
      const oppBeam = Math.min(_mwGM ? 12 : 25, oppMoves.length);
      const oppScored = oppMoves.map(om => {
        const afterOpp = sim.map(r => [...r]);
        for (const [x, y] of om.abs) afterOpp[y][x] = { player: hp, pieceKey: om.pk };
        return { om, s: quickScore(afterOpp, ap, hp, boardW, boardH) };
      }).sort((a,b)=>a.s-b.s);

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
          const followBeam = Math.min(_mwGM ? 12 : 25, followMoves.length);
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

            // PLY 4 opponent counter
            const oppReply2 = movesOnBoard(hp, afterF, boardW, boardH,
              { [ap]: (worstRem[ap]||[]).filter(pk=>pk!==fm.pk), [hp]: [...(worstRem[hp]||[])] },
              placedCount+3, allowFlip);
            if (oppReply2.length) {
              const r2scores = oppReply2.slice(0, _mwGM ? 4 : 8).map(r2m => {
                const afterR2 = afterF.map(row=>[...row]);
                for (const [x,y] of r2m.abs) afterR2[y][x] = { player: hp, pieceKey: r2m.pk };
                return quickScore(afterR2, ap, hp, boardW, boardH);
              }).sort((a,b)=>a-b);
              const worstReply2 = r2scores[0] ?? Infinity;
              if (worstReply2 < bestFollow) bestFollow = (bestFollow + worstReply2) * 0.5;
            }
          }
          lookaheadValue = (bestFollow + worstS) * 0.5;
        } else {
          lookaheadValue = worstS;
        }
      }
    }
    score += lookaheadValue * 16.0;

    // ── DYNAMIC WEIGHT ADJUSTMENT ─────────────────────────────────────
    // If leading: scale down aggression (lock the lead).
    // If trailing: scale up pressure.
    score *= (dw.aggression < 1.0) ? (0.85 + dw.aggression * 0.15) : 1.0;

    if (score > bestScore) { bestScore = score; best = m; }
  }
  return best;
}


  // ── LEGENDARY ─────────────────────────────────────────────────────

  // ─────────────────────────────────────────────────────────────────
  //  FORK FOLLOW-THROUGH ENGINE
  //  Two functions that work together across turns:
  //
  //  recordForkState()   — called AFTER Legendary places a forking piece.
  //                        Captures the two threatened zones so we remember
  //                        what we threatened.
  //
  //  detectOpenForkZone() — called at the START of Legendary's NEXT turn.
  //                         Looks at the current board and finds which of
  //                         the two forked zones the opponent LEFT OPEN
  //                         (didn't defend). Returns that zone's cells.
  //
  //  forkFollowThroughBonus() — given a candidate move, scores how much
  //                             it expands INTO the open (abandoned) zone.
  // ─────────────────────────────────────────────────────────────────

  /**
   * Called right after Legendary places a forking piece.
   * Scans the board for the two (or more) threatened zones created by
   * the placement and stores them in _forkState.
   *
   * A "threatened zone" is an empty region that:
   *  - Is adjacent to our new piece
   *  - Is NOT yet dominated by the opponent
   *  - Is large enough to matter (≥ 5 cells)
   */
  function recordForkState(abs, boardAfterMove, W, H, ap, hp, placedCount) {
    _forkState = null; // reset

    const regions = floodFillRegions(boardAfterMove, W, H);
    const absCellSet = new Set(abs.map(([x, y]) => y * W + x));

    const threatenedZones = [];

    for (const reg of regions) {
      if (reg.length < 5) continue;

      // Does this region touch our new piece?
      let touchesNewPiece = false;
      for (const [x, y] of reg) {
        for (const [ox, oy] of DIRS) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          if (absCellSet.has(ny * W + nx)) { touchesNewPiece = true; break; }
        }
        if (touchesNewPiece) break;
      }
      if (!touchesNewPiece) continue;

      // Count AI vs opponent borders on this region
      let aiTouches = 0, hpTouches = 0;
      for (const [x, y] of reg) {
        for (const [ox, oy] of DIRS) {
          const nx = x + ox, ny = y + oy;
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const p = boardAfterMove[ny][nx]?.player;
          if (p === ap) aiTouches++;
          else if (p === hp) hpTouches++;
        }
      }

      // A threatened zone: we border it more than (or equal to) the opponent
      if (aiTouches >= hpTouches) {
        const zoneSet = new Set(reg.map(([x, y]) => y * W + x));
        // Compute zone value: size + infeasibility bonus
        const infeasible = reg.length % 5 !== 0;
        const value = reg.length * 3.0 + (infeasible ? reg.length * 2.0 : 0);
        threatenedZones.push({ cells: zoneSet, size: reg.length, value, cellList: reg });
      }
    }

    // Only store if we have 2+ distinct threatened zones (real fork)
    if (threatenedZones.length >= 2) {
      // Sort by value descending — top 2 are the "fork arms"
      threatenedZones.sort((a, b) => b.value - a.value);
      _forkState = {
        zones:       threatenedZones.slice(0, 2),
        placedCount: placedCount,
        boardSig:    _boardSig(boardAfterMove, W, H),
      };
    }
  }

  /**
   * Called at the START of Legendary's next turn (after opponent moved).
   *
   * Determines which of the two forked zones the opponent did NOT defend:
   *   - A zone is "defended" if the opponent placed a piece inside it or
   *     directly adjacent to it on their last move.
   *   - The zone that was NOT defended is the "open zone" — we must claim it.
   *
   * Returns { openZone: Set<cellKey>, value: number } or null if no fork active.
   */
  function detectOpenForkZone() {
    if (!_forkState) return null;

    const { board, boardW, boardH } = game;
    const hp = humanPlayer.value;

    // Staleness check: if too many moves have passed, the fork is moot
    const currentPlaced = game.placedCount || 0;
    if (currentPlaced > _forkState.placedCount + 3) {
      _forkState = null;
      return null;
    }

    // For each fork zone, check if the opponent has recently placed INTO it
    // or directly adjacent to it (i.e., "defended" it)
    const zoneStatuses = _forkState.zones.map(zone => {
      let oppCellsInsideZone = 0;
      let oppCellsAdjacentToZone = 0;

      for (let y = 0; y < boardH; y++) {
        for (let x = 0; x < boardW; x++) {
          if (board[y][x]?.player !== hp) continue;
          const key = y * boardW + x;

          if (zone.cells.has(key)) {
            // Opponent placed INSIDE our threatened zone → defended it
            oppCellsInsideZone++;
          } else {
            // Check if this opponent cell is adjacent to the zone
            for (const [ox, oy] of DIRS) {
              const nx = x + ox, ny = y + oy;
              if (nx < 0 || ny < 0 || nx >= boardW || ny >= boardH) continue;
              if (zone.cells.has(ny * boardW + nx)) { oppCellsAdjacentToZone++; break; }
            }
          }
        }
      }

      const defended = oppCellsInsideZone >= 2 || (oppCellsInsideZone >= 1 && oppCellsAdjacentToZone >= 2);
      return { zone, defended, oppCellsInside: oppCellsInsideZone };
    });

    // Find which zone is LEAST defended (the open one we should claim)
    const openZoneStatus = zoneStatuses
      .filter(s => !s.defended)
      .sort((a, b) => b.zone.value - a.zone.value)[0];

    if (!openZoneStatus) {
      // Both zones were defended — fork worked both ways somehow, or it's stale
      _forkState = null;
      return null;
    }

    return {
      openZone:  openZoneStatus.zone.cells,
      zoneCells: openZoneStatus.zone.cellList,
      value:     openZoneStatus.zone.value,
      size:      openZoneStatus.zone.size,
    };
  }

  /**
   * Scores how much a candidate move expands INTO the open fork zone.
   *
   * Three tiers of reward:
   *  1. Cells placed DIRECTLY INSIDE the open zone      → max reward
   *  2. Cells placed ADJACENT to the open zone          → medium reward (establishes border)
   *  3. Move cuts off opponent's last entry into zone   → high reward (seals it)
   *
   * @param {[number,number][]} abs       candidate move cells
   * @param {object} openFork             result from detectOpenForkZone()
   * @param {number[][]} simBoard         board after this placement
   * @param {number} W, H                 board dimensions
   * @param {number} ap, hp               player numbers
   */
  function forkFollowThroughBonus(abs, openFork, simBoard, W, H, ap, hp) {
    if (!openFork) return 0;

    const { openZone, zoneCells, value, size } = openFork;
    let bonus = 0;

    // Tier 1: cells placed INSIDE the zone (directly claiming threatened territory)
    let cellsInsideZone = 0;
    for (const [x, y] of abs) {
      if (openZone.has(y * W + x)) cellsInsideZone++;
    }
    bonus += cellsInsideZone * (value / size) * 40.0;

    // Tier 2: cells placed ADJACENT to the zone (establishing a strong border)
    let cellsAdjacentToZone = 0;
    for (const [x, y] of abs) {
      if (openZone.has(y * W + x)) continue; // already counted in tier 1
      for (const [ox, oy] of DIRS) {
        const nx = x + ox, ny = y + oy;
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && openZone.has(ny * W + nx)) {
          cellsAdjacentToZone++;
          break;
        }
      }
    }
    bonus += cellsAdjacentToZone * (value / size) * 15.0;

    // Tier 3: SEALING bonus — if the move blocks the opponent's ONLY entry into zone
    // Count how many empty cells adjacent to the zone are accessible AFTER this move
    let zoneEntryPoints = 0;
    for (const [zx, zy] of zoneCells) {
      for (const [ox, oy] of DIRS) {
        const nx = zx + ox, ny = zy + oy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (simBoard[ny][nx] !== null) continue; // occupied after our move
        if (!openZone.has(ny * W + nx)) { // outside zone but empty = entry point
          // Is this entry cell accessible by opponent?
          let oppCanReach = false;
          for (const [ox2, oy2] of DIRS) {
            const nnx = nx + ox2, nny = ny + oy2;
            if (nnx < 0 || nny < 0 || nnx >= W || nny >= H) continue;
            if (simBoard[nny][nnx]?.player === hp) { oppCanReach = true; break; }
          }
          if (oppCanReach) zoneEntryPoints++;
        }
      }
    }
    // Very few entry points = zone nearly sealed = massive sealing bonus
    if (zoneEntryPoints === 0) bonus += size * 25.0; // fully sealed!
    else if (zoneEntryPoints <= 2) bonus += size * 12.0; // nearly sealed
    else if (zoneEntryPoints <= 4) bonus += size * 5.0;  // narrowing

    // Big flat bonus just for entering the zone at all (commitment signal)
    if (cellsInsideZone > 0) {
      bonus += value * 2.5;
      // After claiming, clear the fork state (follow-through initiated)
      _forkState = null;
    }

    return bonus;
  }



// ── LEGENDARY ─────────────────────────────────────────────────────
// 🔥 SUPERCHARGED + 8 NEW STRATEGIC SYSTEMS
// Strategy: AGGRESSIVE PINCER & COMBO ATTACKS
//   - P1 opening center domination
//   - Articulation point splitting (board division)
//   - Pincer/fork detection (simultaneous two-zone threats)
//   - Opponent shape read (geometry denial)
//   - Board split exploitation
//   - Territory sealing with infeasibility traps
//   - Dynamic aggression (press when even, all-out when behind)
function movesLegendary(moves) {
  if (!moves.length) return null;
  const { board, boardW, boardH, remaining, placedCount, allowFlip } = game;
  const ap = aiPlayer.value, hp = humanPlayer.value;
  const aiPieceCount    = (remaining[ap] || []).length;
  const humanPieceCount = (remaining[hp] || []).length;
  const totalPieces     = aiPieceCount + humanPieceCount;

  // Endgame solver kicks in extremely early
  // Mirror war has 12 pieces each — kick in earlier so the solver handles closing
  const _mwLeg = isMirrorWar(boardW, boardH);
  const legEndgameThreshold = _mwLeg ? 10 : 8;
  if (aiPieceCount <= legEndgameThreshold || humanPieceCount <= legEndgameThreshold) return endgameSolve(moves);

  // Dynamic weights: Legendary is AGGRESSIVE by default
  const dw = getDynamicWeights(board, boardW, boardH, ap, hp, placedCount, totalPieces);
  const aggressiveMultiplier = Math.max(1.0, dw.aggression);

  // ── KEY PIECE RESERVATION (Legendary) ─────────────────────────────
  // Legendary explicitly plans which pieces to save as closers.
  // It uses expendable pieces first and snaps key pieces home at the
  // precise moment to seal territory — the "last move" strategy.
  const keyPiecesLeg = identifyKeyPieces(
    remaining[ap] || [], board, boardW, boardH, ap, allowFlip, PENTOMINOES, transformCells
  );

  // ── ZONE-CLOSURE EXTRA: pieces needed to tile AI-owned zones are heavily protected ──
  const closureLeg = zoneClosureReservation(
    remaining[ap] || [], board, boardW, boardH, ap, hp, allowFlip, PENTOMINOES, transformCells
  );
  for (const [pk, v] of closureLeg) {
    keyPiecesLeg.set(pk, (keyPiecesLeg.get(pk) || 0) + v * 2.0);  // Legendary protects harder
  }

  // ── FORK FOLLOW-THROUGH: detect if we have an open zone to claim ──
  // This is the most important signal: if we forked last turn and the
  // opponent didn't defend one zone, we MUST go claim it now.
  const openFork = detectOpenForkZone();
  const followThroughUrgency = openFork
    ? Math.min(4.0, 1.0 + openFork.size / 10.0) // larger open zone = more urgent
    : 0;

  const oppMobilityBefore = countTotalMoves(board, boardW, boardH, hp, remaining, placedCount, allowFlip);
  const oppFeasibleBefore = countFeasiblePieces(board, boardW, boardH, hp, remaining, placedCount, allowFlip);

  // Widest beam — explore more options than any other difficulty
  // Reduced for Mirror War to prevent multi-second UI freezes on the main thread.
  const legBeam = _mwLeg ? 36 : 60;
  const prescored = connectivityBeam(moves, board, boardW, boardH, ap, hp, legBeam);

  // ── Pre-compute articulation points ONCE outside the beam loop ──────
  const _preAPs = findArticulationPoints(board, boardW, boardH);

  let best = null, bestScore = -Infinity;
  let bestMove = null; // track for fork recording after selection
  for (const { m } of prescored) {
    const sim = board.map(r => [...r]);
    for (const [x, y] of m.abs) sim[y][x] = { player: ap, pieceKey: m.pk };

    const remAfter = {
      [ap]: (remaining[ap]||[]).filter(pk => pk !== m.pk),
      [hp]: [...(remaining[hp]||[])],
    };

    // ── CORE EVALUATION ──────────────────────────────────────────────
    const tAdv    = territoryAdvantage(sim, boardW, boardH, ap, hp);
    const regions = floodFillRegions(sim, boardW, boardH);

    const infeasibleBonus = regionFeasibilityBonus(regions, sim, boardW, boardH, hp);
    const sealBonus       = zoneSealBonus(regions, board, sim, boardW, boardH, hp);
    const zoneBonus       = zoneClaimBonus(m.abs, sim, boardW, boardH);
    const frontierCtrl    = frontierScore(sim, boardW, boardH, ap, hp);
    const efficiency      = pieceEfficiencyScore(m.abs, sim, boardW, boardH, ap);

    let exposure = 0;
    for (const [x, y] of m.abs)
      for (const [ox, oy] of DIRS) {
        const nx=x+ox, ny=y+oy;
        if (nx<0||ny<0||nx>=boardW||ny>=boardH) continue;
        if (sim[ny][nx]?.player === hp) exposure++;
      }

    const oppMobAfter       = countTotalMoves(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    const mobilityReduction = oppMobilityBefore - oppMobAfter;
    const ownFeasible       = countFeasiblePieces(sim, boardW, boardH, ap, remAfter, placedCount+1, allowFlip);
    const oppFeasible       = countFeasiblePieces(sim, boardW, boardH, hp, remAfter, placedCount+1, allowFlip);
    const feasibleReduction = oppFeasibleBefore - oppFeasible;

    const blunderPenalty = ownFeasible <= 2 ? -240.0 : ownFeasible <= 4 ? -60.0 : ownFeasible <= 6 ? -15.0 : 0;

    // ── NEW SYSTEM 1: P1 OPENING — Piece-Specific Opening Book ───────
    // Legendary uses the same opening book but amplifies double-threat pieces.
    // P on edge = fork attack. U against wall = guaranteed sealed cell.
    // I + V/L = rectangular territory lock.
    const openingBonus = p1OpeningBonus(m.abs, boardW, boardH, placedCount, 'aggressive',
      m.pk, remAfter[ap]);

    // ── NEW SYSTEM 2: ARTICULATION POINT ATTACK ───────────────────────
    const apBonus = articulationCutBonus(m.abs, board, sim, boardW, boardH, ap, hp, _preAPs, regions);

    // ── NEW SYSTEM 3: PINCER / FORK ATTACK ───────────────────────────
    const pincerBonus = pincerAttackScore(m.abs, sim, boardW, boardH, ap, hp, regions);

    // ── NEW SYSTEM 4: BOARD SPLIT EXPLOITATION ────────────────────────
    const splitBonus = boardSplitBonus(m.abs, board, sim, boardW, boardH, ap, hp);

    // ── NEW SYSTEM 5: TERRITORY SEALING ──────────────────────────────
    const sealTerritoryBonus = territorySealScore(sim, boardW, boardH, ap, hp, regions);

    // ── NEW SYSTEM 6: OPPONENT SHAPE READ ────────────────────────────
    // Mirror War raises the threshold to 35% progress before running the
    // expensive piece-fitting scan (saves ~40% of shape-read calls early game).
    const shapeReadBonus = dw.progress > (_mwLeg ? 0.35 : 0.15)
      ? opponentShapeReadScore(
          sim, boardW, boardH, hp, remAfter[hp], placedCount+1, allowFlip, PENTOMINOES, transformCells
        ) * aggressiveMultiplier
      : 0;

    // ── FORK FOLLOW-THROUGH: CLAIM THE OPEN ZONE ─────────────────────
    // If we forked last turn and the opponent left a zone undefended,
    // this is the most urgent move available. Score it heavily.
    // followThroughUrgency scales with zone size (bigger zone = more urgent).
    // The forkFollowThroughBonus itself handles tier 1/2/3 rewards.
    const followThrough = openFork
      ? forkFollowThroughBonus(m.abs, openFork, sim, boardW, boardH, ap, hp) * followThroughUrgency
      : 0;

    // ── 3-PLY MINIMAX LOOKAHEAD (wide beam) ──────────────────────────
    const oppMoves = movesOnBoard(hp, sim, boardW, boardH, remAfter, placedCount+1, allowFlip);
    let lookaheadValue = 0;
    if (oppMoves.length) {
      const oppBeam = Math.min(_mwLeg ? 14 : 35, oppMoves.length);
      const oppScored = oppMoves.map(om => {
        const afterOpp = sim.map(r => [...r]);
        for (const [x, y] of om.abs) afterOpp[y][x] = { player: hp, pieceKey: om.pk };
        return { om, s: quickScore(afterOpp, ap, hp, boardW, boardH) };
      }).sort((a,b)=>a.s-b.s);

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
          const followBeam = Math.min(_mwLeg ? 14 : 35, followMoves.length);
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

            const oppReply2 = movesOnBoard(hp, afterF, boardW, boardH,
              { [ap]: (worstRem[ap]||[]).filter(pk=>pk!==fm.pk), [hp]: [...(worstRem[hp]||[])] },
              placedCount+3, allowFlip);
            if (oppReply2.length) {
              const r2scores = oppReply2.slice(0, _mwLeg ? 4 : 10).map(r2m => {
                const afterR2 = afterF.map(row=>[...row]);
                for (const [x,y] of r2m.abs) afterR2[y][x] = { player: hp, pieceKey: r2m.pk };
                return quickScore(afterR2, ap, hp, boardW, boardH);
              }).sort((a,b)=>a-b);
              const worstReply2 = r2scores[0] ?? Infinity;
              if (worstReply2 < bestFollow) bestFollow = (bestFollow + worstReply2) * 0.5;
            }
          }
          lookaheadValue = (bestFollow + worstS) * 0.5;
        } else {
          lookaheadValue = worstS;
        }
      }
    }

    // ── FINAL SCORE: AGGRESSIVE TERRITORIAL COMBO ────────────────────
    let score =
        tAdv               * 32.0
      + mobilityReduction   * 12.0
      + feasibleReduction   * 28.0
      + infeasibleBonus     *  2.0
      + sealBonus           *  2.0
      + zoneBonus           *  2.0
      + frontierCtrl        *  2.0
      + efficiency          *  2.0
      + lookaheadValue      * 20.0
      - exposure            *  1.5
      + ownFeasible         * 22.0
      - oppFeasible         * 32.0
      + openTerritoryBonus(m.abs, sim, boardW, boardH, ap, regions) * 2.0
      + aiClusterPenalty(sim, boardW, boardH, ap) * 2.0
      + blunderPenalty
      + openingBonus        *  3.0   // piece-specific opening theory
      + apBonus             *  2.5   // choke-point splitting
      + pincerBonus         *  2.8   // fork creation
      + splitBonus          *  2.0   // board division
      + sealTerritoryBonus  *  1.8   // poison zone creation
      + shapeReadBonus      *  1.5   // geometry denial
      + comboSetupBonus(m.abs, sim, boardW, boardH, ap, hp, remAfter[ap], placedCount, regions) * 2.2
      + followThrough       *  3.5   // ← FORK FOLLOW-THROUGH: claim the open zone
      // ── KEY PIECE RESERVATION ─────────────────────────────────────
      // Penalise using closers early. Legendary consciously saves its
      // best sealing pieces and deploys them at the decisive moment.
      + pieceReservationPenalty(m.pk, remaining[ap] || [], keyPiecesLeg, placedCount, aiPieceCount) * 2.5
      // ── SEALING FINISHER ──────────────────────────────────────────
      // Massive bonus when THIS placement completes a zone seal.
      // This is the "snap the I-piece home" / "close the door" moment.
      + sealingFinisherBonus(m.abs, board, sim, boardW, boardH, ap, hp) * 3.0;

    // Dynamic aggression: when behind, amplify offensive signals
    if (aggressiveMultiplier > 1.0) {
      const aggressiveSignals = pincerBonus + apBonus + splitBonus + mobilityReduction * 3.0;
      score += aggressiveSignals * (aggressiveMultiplier - 1.0) * 8.0;
    }

    if (score > bestScore) { bestScore = score; best = m; bestMove = { m, sim }; }
  }

  // ── RECORD FORK STATE for next turn ──────────────────────────────
  // After selecting the best move, check if it created a fork (pincerScore > 0).
  // If so, store the threatened zones so next turn we can claim the open one.
  if (bestMove) {
    const { m, sim } = bestMove;
    const forkCheck = pincerAttackScore(m.abs, sim, boardW, boardH, ap, hp);
    if (forkCheck > 0) {
      // This move created a fork — record the threatened zones
      recordForkState(m.abs, sim, boardW, boardH, ap, hp, placedCount + 1);
    } else if (_forkState && !openFork) {
      // Had a fork state but no open zone found this turn — clear stale state
      _forkState = null;
    }
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

// Legendary (deterministic counter-draft + history-aware pick denial)
// 1) If small pool, brute the last picks.
const smallPick = legendarySmallPoolPick(pool, aiPicks, humanPicks);
if (smallPick) return smallPick;

// 2) Load pick history — last 10 AI games — to know human's favourite pieces.
//    Pieces taken in more games → higher denial priority.
const draftHistory = _getDraftHistory();
const pickFreq = {}; // pieceKey → count of games it was picked in
for (const entry of draftHistory) {
  for (const pk of (entry.humanPicks || [])) {
    pickFreq[pk] = (pickFreq[pk] || 0) + 1;
  }
}
const maxFreq = Math.max(1, ...Object.values(pickFreq));

// 3) Score every option by: deny human synergy, improve AI role coverage,
//    counter historical favourites, and avoid giving yourself too many blockers.
const humanTargetsBefore = getSynergyTargets(humanPicks, pool).length;

function legendaryDraftScore(pick) {
  // 🔥 Base shape score boosted (was 2.6)
  let s = (SHAPE_SCORE[pick] || 2) * 4.0;

  // 🔥 Direct synergy denial massively boosted (was 8.0)
  for (const hpPick of humanPicks) {
    if ((SYNERGY_PAIRS[hpPick] || []).includes(pick)) s += 16.0;
  }

  // deny: reduce synergy targets still available to human
  const poolAfter = pool.filter(k => k !== pick);
  const targetsAfter = getSynergyTargets(humanPicks, poolAfter).length;
  // 🔥 Synergy denial boosted (was 3.0)
  s += (humanTargetsBefore - targetsAfter) * 6.0;

  // 🔥 HISTORY DENIAL: boosted (was 12.0)
  const historyWeight = Math.min(1.0, draftHistory.length / 5);
  const freq = pickFreq[pick] || 0;
  s += (freq / maxFreq) * 20.0 * historyWeight;

  // role coverage
  if (!aiPicks.some(p=>PIECE_ROLES.FLEXIBLE.has(p)) && PIECE_ROLES.FLEXIBLE.has(pick)) s += 7.0;
  if (!aiPicks.some(p=>PIECE_ROLES.LINEAR.has(p))   && PIECE_ROLES.LINEAR.has(pick))   s += 8.0;
  if (!aiPicks.some(p=>PIECE_ROLES.FILLER.has(p))   && PIECE_ROLES.FILLER.has(pick))   s += 5.0;

  // too many blockers = self-harm
  const blockers = aiPicks.filter(p=>PIECE_ROLES.BLOCKER.has(p)).length;
  if (PIECE_ROLES.BLOCKER.has(pick) && blockers >= 1) s -= 8.0;
  if (PIECE_ROLES.BLOCKER.has(pick) && aiPicks.length < 3) s -= 5.0;

  if (VERSATILE_PIECES.has(pick)) s += 4.0;   // 🔥 was 2.5
  if (UNPAIRABLE.has(pick)) s -= 6.0;          // 🔥 was 4.5

  // if human is leaning long/branchy, grab counters
  const humanHasLong    = humanPicks.some(k=>['I','L','Y','N'].includes(k));
  const humanHasBranchy = humanPicks.some(k=>['T','F','Y','X'].includes(k));
  if (humanHasLong    && ['T','F','X','W','U'].includes(pick)) s += 3.0;
  if (humanHasBranchy && ['I','L','P'].includes(pick))         s += 4.0;

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

    // ✅ LEGENDARY — adaptive delay based on game state.
    //    Early game (high impact): slower and more deliberate.
    //    Mid game: standard thoughtful pause.
    //    Endgame (≤5 pieces left): faster — the solver is deterministic, no need to fake thinking.
    const placed = game.placedCount || 0;
    const remaining = Math.min(
      (game.remaining?.[aiPlayer.value]?.length || 6),
      (game.remaining?.[humanPlayer.value]?.length || 6)
    );
    if (game.phase === 'draft') return 900 + Math.random() * 400;
    if (remaining <= 3)  return 400  + Math.random() * 300;  // endgame: fast
    if (remaining <= 5)  return 700  + Math.random() * 400;  // late: moderate
    if (placed   <= 2)   return 1400 + Math.random() * 500;  // opening: very deliberate
    if (placed   <= 5)   return 1100 + Math.random() * 400;  // early mid: deliberate
    return               1000 + Math.random() * 400;         // mid game: standard
  }

  return { getAllValidMoves, pickDraftPiece, choosePlacement, thinkDelay };
}
