// src/lib/pieceStyles.js
// Default "skins": color per piece key.
// Later you can add: skin: "/skins/T.png" etc.
// If skin exists, each block uses that PNG as background-image.

export const PIECE_STYLES = {
  // 🔵 BLUE
  F: { color: "#1D4ED8", skin: null }, // strong blue
  I: { color: "#22D3EE", skin: null }, // bright sky blue ✅

  // 🟢 GREEN
  L: { color: "#15803D", skin: null }, // deep green
  W: { color: "#4ADE80", skin: null }, // vivid light green

  // 🟠 ORANGE / 🟡 YELLOW
  X: { color: "#F97316", skin: null }, // vivid orange ✅
  P: { color: "#FDE047", skin: null }, // saturated yellow ✅

  // 🔴 RED / 🌸 PINK
  V: { color: "#DC2626", skin: null }, // strong red
  U: { color: "#F472B6", skin: null }, // hot pink ✅

  // 🟣 PURPLE
  T: { color: "#8B5CF6", skin: null }, // vivid purple ✅
  Z: { color: "#C084FC", skin: null }, // bright lavender (more visible)

  // ⚫ NEUTRALS (high contrast)
  Y: { color: "#374151", skin: null }, // dark slate gray
  N: { color: "#F3F4F6", skin: null }, // near-white (not dull gray)
};

export function getPieceStyle(pieceKey) {
  return PIECE_STYLES[pieceKey] || { color: "#ffffff", skin: null };
}