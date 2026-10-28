// Review build: every animation frame advances exactly 1/30 s and the loop can be held on a frame,
// so a headless browser can screenshot cinematics at exact moments however slowly it renders.
const STEP_MS = 1000 / 30;

interface SteppedWindow {
  __frames: number;
  /** The loop stops advancing once this many frames have run. */
  __holdAt: number;
}

const stepped = window as unknown as Window & SteppedWindow;
stepped.__frames = 0;
stepped.__holdAt = Number.POSITIVE_INFINITY;
const nativeFrame = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
  const wait = (): number =>
    nativeFrame(() => {
      if (stepped.__frames >= stepped.__holdAt) {
        wait();
        return;
      }
      stepped.__frames += 1;
      callback(stepped.__frames * STEP_MS);
    });
  return wait();
};

// `?spawn=x,z` puts the player somewhere specific on every planet (saves don't store the position).
const spawn = new URLSearchParams(window.location.search).get("spawn");

// Imported dynamically so the patch above is in place before the game starts its loop.
import("../src/planets")
  .then(({ PLANETS }) => {
    const [x, z] = (spawn ?? "").split(",").map(Number);
    if (spawn && Number.isFinite(x) && Number.isFinite(z)) for (const planet of PLANETS) (planet as { spawn: { x: number; z: number } }).spawn = { x: x as number, z: z as number };
    return import("../src/main");
  })
  .catch((error: unknown) => console.error(JSON.stringify({ scope: "stepped-entry", message: String(error) })));
