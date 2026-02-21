const buzz = new Audio(new URL("../assets/buzz.wav", import.meta.url));

export function playBuzz() {
  try {
    buzz.currentTime = 0;
    buzz.play().catch(() => {});
  } catch {
    // ignore
  }
}