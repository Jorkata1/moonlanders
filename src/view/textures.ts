import { CanvasTexture, DataTexture, LinearFilter, LinearMipmapLinearFilter, RepeatWrapping, RGBAFormat, SRGBColorSpace, type Texture } from "three";

const cache = new Map<string, CanvasTexture>();
const softCache = new Map<string, DataTexture>();
const WHITE = [255, 255, 255] as const;

/**
 * A soft shape for glows, smoke, flames and dust: drawn on a canvas like any other texture, but
 * uploaded as plain pixels that are all pure white (or `tint`'s colour at that spot, u and v from the
 * bottom-left) with only their transparency taken from the drawing. Safari dithers canvas gradients
 * and un-premultiplies the canvas on upload, which turns the faint edges of a soft shape into bright
 * random red, green and blue specks; keeping only the alpha leaves nothing for it to scramble.
 */
export function softTexture(key: string, width: number, height: number, draw: (ctx: CanvasRenderingContext2D) => void, tint?: (u: number, v: number) => readonly [number, number, number]): Texture {
  const cached = softCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas is not available for textures");
  draw(ctx);
  const source = ctx.getImageData(0, 0, width, height).data;
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    // Rows bottom-up, the way a canvas texture is uploaded, so v = 0 is the drawing's bottom edge.
    const row = height - 1 - y;
    for (let x = 0; x < width; x += 1) {
      const [r, g, b] = tint ? tint(x / (width - 1), y / (height - 1)) : WHITE;
      const at = (y * width + x) * 4;
      data[at] = r;
      data[at + 1] = g;
      data[at + 2] = b;
      data[at + 3] = source[(row * width + x) * 4 + 3]!;
    }
  }
  const texture = new DataTexture(data, width, height, RGBAFormat);
  texture.colorSpace = SRGBColorSpace;
  texture.magFilter = LinearFilter;
  texture.minFilter = LinearMipmapLinearFilter;
  texture.generateMipmaps = true;
  texture.needsUpdate = true;
  softCache.set(key, texture);
  return texture;
}

/** The colour at `t` (0..1) along a list of [position, r, g, b] stops. */
export function gradientAt(stops: readonly (readonly [number, number, number, number])[], t: number): [number, number, number] {
  const next = stops.findIndex(([at]) => at >= t);
  if (next <= 0) {
    const stop = stops[next === 0 ? 0 : stops.length - 1]!;
    return [stop[1], stop[2], stop[3]];
  }
  const a = stops[next - 1]!;
  const b = stops[next]!;
  const k = (t - a[0]) / (b[0] - a[0]);
  return [a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k, a[3] + (b[3] - a[3]) * k];
}

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


/** A normal map from the regolith pattern: grains and pits catch the low sun. */
export function regolithNormalTexture(repeat: number): CanvasTexture {
  const source = regolithTexture(1).image as HTMLCanvasElement;
  const size = source.width;
  const input = (source.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, size, size).data;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  const out = ctx.createImageData(size, size);
  const h = (x: number, y: number) => (input[(((y + size) % size) * size + ((x + size) % size)) * 4] ?? 0) / 255;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 3;
      const dy = (h(x, y + 1) - h(x, y - 1)) * 3;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      out.data[i] = ((-dx / len) * 0.5 + 0.5) * 255;
      out.data[i + 1] = ((dy / len) * 0.5 + 0.5) * 255;
      out.data[i + 2] = ((1 / len) * 0.5 + 0.5) * 255;
      out.data[i + 3] = 255;
    }
  }
  ctx.putImageData(out, 0, 0);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  return texture;
}
