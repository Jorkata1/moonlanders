import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from "three";

const WIDTH = 512;
const HEIGHT = 160;
const DISPLAY_FONT = "'Chakra Petch', 'Trebuchet MS', system-ui, sans-serif";

export type LabelTone = "neutral" | "money" | "ready" | "warning";

const TONES: Record<LabelTone, { fill: string; accent: string }> = {
  neutral: { fill: "rgba(12, 16, 32, 0.82)", accent: "#4de3ff" },
  money: { fill: "rgba(12, 16, 32, 0.86)", accent: "#ffd25a" },
  ready: { fill: "rgba(10, 40, 30, 0.86)", accent: "#5df2a0" },
  warning: { fill: "rgba(60, 14, 14, 0.88)", accent: "#ff6b5a" },
};

export interface Label {
  readonly sprite: Sprite;
  set(title: string, detail?: string, tone?: LabelTone): void;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A floating world label that always faces the camera. Redraws only when its text changes. */
export function createLabel(width = 3.4): Label {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available for labels");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(width, width * (HEIGHT / WIDTH), 1);
  sprite.renderOrder = 10;
  sprite.center.set(0.5, 0);
  let lastKey = "";

  function set(title: string, detail = "", tone: LabelTone = "neutral"): void {
    const key = `${title}|${detail}|${tone}`;
    if (key === lastKey || !ctx) return;
    lastKey = key;
    const colors = TONES[tone];
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.font = `700 52px ${DISPLAY_FONT}`;
    const titleWidth = ctx.measureText(title).width;
    ctx.font = `600 40px ${DISPLAY_FONT}`;
    const detailWidth = detail ? ctx.measureText(detail).width : 0;
    const boxWidth = Math.min(WIDTH - 8, Math.max(titleWidth, detailWidth) + 56);
    const boxHeight = detail ? 132 : 84;
    const left = (WIDTH - boxWidth) / 2;
    const top = HEIGHT - boxHeight - 14;
    roundedRect(ctx, left, top, boxWidth, boxHeight, 22);
    ctx.fillStyle = colors.fill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = colors.accent;
    ctx.stroke();
    // Little pointer under the box, towards the thing being labelled.
    ctx.beginPath();
    ctx.moveTo(WIDTH / 2 - 14, HEIGHT - 14);
    ctx.lineTo(WIDTH / 2 + 14, HEIGHT - 14);
    ctx.lineTo(WIDTH / 2, HEIGHT);
    ctx.fillStyle = colors.accent;
    ctx.fill();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#f4f7ff";
    ctx.font = `700 52px ${DISPLAY_FONT}`;
    ctx.fillText(title, WIDTH / 2, top + 44, WIDTH - 40);
    if (detail) {
      ctx.fillStyle = colors.accent;
      ctx.font = `600 40px ${DISPLAY_FONT}`;
      ctx.fillText(detail, WIDTH / 2, top + 96, WIDTH - 40);
    }
    texture.needsUpdate = true;
  }

  return { sprite, set };
}

/** Flat ground decal drawn on a canvas, e.g. pad icons. */
export function decalTexture(draw: (ctx: CanvasRenderingContext2D, size: number) => void, size = 256): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available for decals");
  draw(ctx, size);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

export function iconDecal(icon: string, ring: string, fill: string): CanvasTexture {
  return decalTexture((ctx, size) => {
    const c = size / 2;
    ctx.beginPath();
    ctx.arc(c, c, c - 6, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.lineWidth = 12;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.setLineDash([18, 14]);
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(c, c, c - 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = ring;
    ctx.font = `700 ${Math.round(size * 0.36)}px ${DISPLAY_FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(icon, c, c + 6);
  });
}
