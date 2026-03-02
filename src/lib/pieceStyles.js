// src/lib/pieceStyles.js
// Three color sets:
//   color       — vibrant holographic colors for new "Crystal Grid" theme
//   glowColor   — softer glow version for drop-shadow effects
//   legacyColor — original bright neon palette for legacy mode
// If skin exists, each block uses that PNG as background-image.

export const PIECE_STYLES = {
  //         new crystal          glow (for CSS)       legacy neon
  F: { color: "#9D6FFF", glow: "#7C5CFF", legacyColor: "#7C5CFF", skin: null }, // violet
  I: { color: "#22D3EE", glow: "#06B6D4", legacyColor: "#4CC9F0", skin: null }, // cyan
  L: { color: "#F87171", glow: "#EF4444", legacyColor: "#FF3B3B", skin: null }, // red
  P: { color: "#FCD34D", glow: "#EAB308", legacyColor: "#FFD166", skin: null }, // yellow
  N: { color: "#CBD5E1", glow: "#94A3B8", legacyColor: "#E6E6E6", skin: null }, // silver
  T: { color: "#C084FC", glow: "#A855F7", legacyColor: "#9B5DE5", skin: null }, // purple
  U: { color: "#F472B6", glow: "#EC4899", legacyColor: "#F15BB5", skin: null }, // pink
  V: { color: "#60A5FA", glow: "#3B82F6", legacyColor: "#00A6FB", skin: null }, // blue
  W: { color: "#34D399", glow: "#10B981", legacyColor: "#00F5A0", skin: null }, // emerald
  X: { color: "#FB923C", glow: "#F97316", legacyColor: "#FFCBA4", skin: null }, // orange
  Y: { color: "#FBBF24", glow: "#F59E0B", legacyColor: "#FB8500", skin: null }, // amber
  Z: { color: "#FB7185", glow: "#F43F5E", legacyColor: "#EF476F", skin: null }, // rose
};

/**
 * @param {string} pieceKey
 * @param {boolean} [legacy=false]  pass true in legacy-visuals mode
 */
export function getPieceStyle(pieceKey, legacy = false) {
  const s = PIECE_STYLES[pieceKey] || { color: "#818CF8", glow: "#6366F1", legacyColor: "#ffffff", skin: null };
  return {
    color: legacy ? s.legacyColor : s.color,
    glow: s.glow,
    skin: s.skin,
  };
}