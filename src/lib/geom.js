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