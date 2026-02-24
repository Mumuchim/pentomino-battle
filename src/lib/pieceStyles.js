// src/lib/pieceStyles.js
// Default "skins": color per piece key.
// Later you can add: skin: "/skins/T.png" etc.
// If skin exists, each block uses that PNG as background-image.

export const PIECE_STYLES = {
  F: { color: "#7C5CFF", skin: null }, // violet (kept)
  I: { color: "#4CC9F0", skin: null }, // sky blue (kept)

  L: { color: "#FF3B3B", skin: null }, // cleaner bright red
  P: { color: "#FFD166", skin: null }, // warm yellow (kept)

  N: { color: "#E6E6E6", skin: null }, // soft light gray (not pure white)

  T: { color: "#9B5DE5", skin: null }, // purple (kept)
  U: { color: "#F15BB5", skin: null }, // pink (kept)

  V: { color: "#00A6FB", skin: null }, // deeper blue (distinct from I)
  W: { color: "#00F5A0", skin: null }, // neon mint green

  X: { color: "#FFCBA4", skin: null }, // 🍑 PEACH ⭐
  Y: { color: "#FB8500", skin: null }, // orange (kept)

  Z: { color: "#EF476F", skin: null }, // raspberry red (kept)
};

export function getPieceStyle(pieceKey) {
  return PIECE_STYLES[pieceKey] || { color: "#ffffff", skin: null };
}