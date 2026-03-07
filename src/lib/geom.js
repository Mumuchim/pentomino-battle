// src/lib/geom.js

export function rotate90(cells) {
  // (x, y) -> (y, -x)
  return cells.map(([x, y]) => [y, -x]);
}

export function flipX(cells) {
  // mirror horizontally: (x, y) -> (-x, y)
  return cells.map(([x, y]) => [-x, y]);
}

export function normalize(cells) {
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);

  const shifted = cells.map(([x, y]) => [x - minX, y - minY]);
  shifted.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  return shifted;
}

export function transformCells(baseCells, rotation = 0, flipped = false) {
  let out = baseCells;

  // rotate n times
  for (let i = 0; i < (rotation % 4 + 4) % 4; i++) {
    out = rotate90(out);
  }

  if (flipped) out = flipX(out);

  return normalize(out);
}

export function boundsOf(cells) {
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  return {
    w: Math.max(...xs) + 1,
    h: Math.max(...ys) + 1,
  };
}

// Fix 2 & 11 — Shared canonical implementations to avoid duplication between
// game.js and aiEngine.js. Both modules import from here so a single fix
// propagates everywhere.

const _DIRS = [[1,0],[-1,0],[0,1],[0,-1]];

/**
 * Validate whether placing `shape` (array of [dx,dy] offsets) at anchor
 * [anchorX, anchorY] is legal on `board`.
 * Returns the absolute cell array [[x,y]…] if valid, or null if not.
 */
export function validatePlacement(board, shape, anchorX, anchorY, boardW, boardH, placedCount) {
  const abs = [];
  for (const [dx, dy] of shape) {
    const x = anchorX + dx, y = anchorY + dy;
    if (x < 0 || y < 0 || x >= boardW || y >= boardH) return null;
    if (board[y][x] !== null) return null;
    abs.push([x, y]);
  }
  // First piece may go anywhere
  if (placedCount === 0) return abs;
  // Subsequent pieces must touch an existing piece edge-to-edge
  for (const [x, y] of abs) {
    for (const [ox, oy] of _DIRS) {
      const nx = x + ox, ny = y + oy;
      if (nx >= 0 && ny >= 0 && nx < boardW && ny < boardH && board[ny][nx] !== null)
        return abs;
    }
  }
  return null;
}

/**
 * Return all unique orientations (rotation × flip) of a piece, normalised to
 * min x/y = 0, deduplicated by canonical key.
 */
export function uniqOrientations(baseCells, allowFlip = true) {
  const seen = new Set();
  const outs = [];
  const flips = allowFlip ? [false, true] : [false];
  for (const f of flips) {
    for (let r = 0; r < 4; r++) {
      const cells = transformCells(baseCells, r, f);
      let minX = Infinity, minY = Infinity;
      for (const [x, y] of cells) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
      }
      const norm = cells
        .map(([x, y]) => [x - minX, y - minY])
        .sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
      const key = norm.map(([x, y]) => `${x},${y}`).join('|');
      if (!seen.has(key)) { seen.add(key); outs.push(norm); }
    }
  }
  return outs;
}