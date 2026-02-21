// src/lib/pieceStyles.js
// Default "skins": color per piece key.
// Later you can add: skin: "/skins/T.png" etc.
// If skin exists, each block uses that PNG as background-image.

export const PIECE_STYLES = {
  F: { color: "#7C5CFF", skin: null },
  I: { color: "#4CC9F0", skin: null },
  L: { color: "#ff0000", skin: null },
  P: { color: "#FFD166", skin: null },
  N: { color: "#f4f4f4", skin: null },
  T: { color: "#9B5DE5", skin: null },
  U: { color: "#F15BB5", skin: null },
  V: { color: "#00BBF9", skin: null },
  W: { color: "#00F5D4", skin: null },
  X: { color: "#FEE440", skin: null },
  Y: { color: "#FB8500", skin: null },
  Z: { color: "#EF476F", skin: null },
};

export function getPieceStyle(pieceKey) {
  return PIECE_STYLES[pieceKey] || { color: "#ffffff", skin: null };
}