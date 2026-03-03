// Gracefully handle missing audio file — buzz.wav may not be present in all builds.
let buzz = null;
try {
  buzz = new Audio(new URL("../assets/buzz.wav", import.meta.url));
  buzz.preload = "auto";
} catch {
  // File missing or Audio not supported — playBuzz will be a no-op
}

export function playBuzz() {
  if (!buzz) return;
  try {
    buzz.currentTime = 0;
    buzz.play().catch(() => {});
  } catch {
    // ignore
  }
}