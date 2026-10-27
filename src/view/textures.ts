import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from "three";

const cache = new Map<string, CanvasTexture>();

/** Draw a texture once on a canvas and reuse it by key; the game ships no image files. */
export function canvasTexture(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void): CanvasTexture {
  const cached = cache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available for textures");
  draw(ctx);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  cache.set(key, texture);
  return texture;
}

/** Deterministic pseudo-random sequence, so textures look identical on every load. */
export function seeded(seed: number): () => number {
  let state = seed * 9301 + 49297;
  return () => {
    state = (state * 16807) % 2147483647;
    return state / 2147483647;
  };
}

/** Brushed metal with fine streaks and a few panel seams, for machine bodies. */
export function panelTexture(key: string, base: string, seams: number): CanvasTexture {
  return canvasTexture(key, 256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    const random = seeded(key.length * 17);
    for (let i = 0; i < 700; i += 1) {
      ctx.fillStyle = `rgba(255, 255, 255, ${random() * 0.05})`;
      ctx.fillRect(0, random() * 256, 256, 1);
      ctx.fillStyle = `rgba(0, 0, 0, ${random() * 0.05})`;
      ctx.fillRect(0, random() * 256, 256, 1);
    }
    ctx.strokeStyle = "rgba(0, 0, 0, 0.35)";
    ctx.lineWidth = 2;
    for (let i = 1; i < seams; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, (i * 256) / seams);
      ctx.lineTo(256, (i * 256) / seams);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    for (let i = 0; i < seams; i += 1) {
      for (const x of [10, 246]) {
        ctx.beginPath();
        ctx.arc(x, (i * 256) / seams + 12, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}

function grainHash(x: number, z: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

/** Fine regolith grain plus tiny craterlets, tiled across the ground. */
export function regolithTexture(repeat: number): CanvasTexture {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available for the ground texture");
  ctx.fillStyle = "#c8c8c8";
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < 26000; i += 1) {
    const tone = 150 + grainHash(i, 0.3) * 100;
    ctx.fillStyle = `rgba(${tone}, ${tone}, ${tone}, 0.5)`;
    ctx.fillRect(grainHash(i, 1.1) * size, grainHash(i, 2.2) * size, 1 + grainHash(i, 3.3) * 2, 1 + grainHash(i, 4.4) * 2);
  }
  for (let i = 0; i < 70; i += 1) {
    const x = grainHash(i, 5.5) * size;
    const y = grainHash(i, 6.6) * size;
    const r = 3 + grainHash(i, 7.7) ** 2 * 18;
    const bowl = ctx.createRadialGradient(x - r * 0.2, y - r * 0.2, 0, x, y, r);
    bowl.addColorStop(0, "rgba(90, 90, 90, 0.55)");
    bowl.addColorStop(0.8, "rgba(120, 120, 120, 0.25)");
    bowl.addColorStop(1, "rgba(235, 235, 235, 0.45)");
    ctx.fillStyle = bowl;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 8;
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

