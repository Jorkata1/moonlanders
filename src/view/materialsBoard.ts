import { CanvasTexture, SRGBColorSpace, Sprite, SpriteMaterial } from "three";
import { ITEMS } from "../config";
import type { MaterialProgress } from "../sim/orders";

const WIDTH = 512;
const ROW_HEIGHT = 58;
const HEADER = 74;
const PADDING = 18;
const MAX_ROWS = 4;
const HEIGHT = HEADER + ROW_HEIGHT * MAX_ROWS + PADDING * 2;
const FONT = "'Chakra Petch', 'Trebuchet MS', system-ui, sans-serif";
const ACCENT = "#4de3ff";
const DONE = "#5df2a0";

export interface MaterialsBoard {
  readonly sprite: Sprite;
  set(title: string, rows: readonly MaterialProgress[]): void;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, "0")}`;
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

/** Floating board over a build hologram: what is being built, and each material's progress bar. */
export function createMaterialsBoard(width = 2.6): MaterialsBoard {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available for boards");
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, fog: false }));
  sprite.scale.set(width, width * (HEIGHT / WIDTH), 1);
  sprite.renderOrder = 10;
  sprite.center.set(0.5, 0);
  let lastKey = "";

  return {
    sprite,
    set(title, rows) {
      const key = `${title}|${rows.map((r) => `${r.item}:${r.delivered}/${r.needed}`).join(",")}`;
      if (key === lastKey) return;
      lastKey = key;
      const shown = rows.slice(0, MAX_ROWS);
      const boxHeight = HEADER + ROW_HEIGHT * shown.length + PADDING;
      const top = HEIGHT - boxHeight;
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      roundedRect(ctx, 4, top, WIDTH - 8, boxHeight - 4, 24);
      ctx.fillStyle = "rgba(10, 16, 34, 0.86)";
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = ACCENT;
      ctx.stroke();
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillStyle = "#f4f7ff";
      ctx.font = `700 46px ${FONT}`;
      ctx.fillText(title.toUpperCase(), WIDTH / 2, top + 42, WIDTH - 40);
      shown.forEach((row, i) => {
        const y = top + HEADER + i * ROW_HEIGHT + ROW_HEIGHT / 2 - 6;
        const done = row.delivered >= row.needed;
        ctx.fillStyle = hex(ITEMS[row.item].color);
        ctx.beginPath();
        ctx.arc(46, y, 14, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.textAlign = "left";
        ctx.fillStyle = "#dfe6ff";
        ctx.font = `600 32px ${FONT}`;
        ctx.fillText(ITEMS[row.item].plural, 74, y - 6, 220);
        ctx.textAlign = "right";
        ctx.fillStyle = done ? DONE : "#f4f7ff";
        ctx.font = `700 34px ${FONT}`;
        ctx.fillText(`${row.delivered}/${row.needed}`, WIDTH - 30, y - 6);
        // Progress bar under each row.
        const barLeft = 74;
        const barWidth = WIDTH - 30 - barLeft;
        ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
        ctx.fillRect(barLeft, y + 16, barWidth, 7);
        ctx.fillStyle = done ? DONE : ACCENT;
        ctx.fillRect(barLeft, y + 16, barWidth * Math.min(1, row.delivered / Math.max(1, row.needed)), 7);
      });
      texture.needsUpdate = true;
    },
  };
}
