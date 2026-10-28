import { CatmullRomCurve3, CylinderGeometry, LatheGeometry, Mesh, RepeatWrapping, SphereGeometry, TorusGeometry, TubeGeometry, Vector2, Vector3, type CanvasTexture, type Material } from "three";
import { mesh, surface } from "../materials";
import { canvasTexture } from "../textures";

/** A smooth body of revolution from (radius, height) pairs, bottom to top. */
export function lathe(profile: ReadonlyArray<readonly [number, number]>, material: Material, segments = 32): Mesh {
  return new Mesh(new LatheGeometry(profile.map(([r, y]) => new Vector2(r, y)), segments), material);
}

/** A bent pipe through the given points. */
export function pipe(points: ReadonlyArray<readonly [number, number, number]>, radius: number, material: Material): Mesh {
  const curve = new CatmullRomCurve3(points.map(([x, y, z]) => new Vector3(x, y, z)), false, "centripetal");
  return new Mesh(new TubeGeometry(curve, Math.max(8, points.length * 8), radius, 10), material);
}

/** A ring of bolt heads around a vertical axis. */
export function boltRing(radius: number, y: number, count: number, material: Material, size = 0.03): Mesh[] {
  const geometry = new SphereGeometry(size, 6, 4);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2;
    return mesh(geometry, material, Math.sin(angle) * radius, y, Math.cos(angle) * radius);
  });
}

/** A flat ring band (a short wide cylinder) hugging a round body. */
export function band(radius: number, height: number, y: number, material: Material, segments = 32): Mesh {
  return mesh(new CylinderGeometry(radius, radius, height, segments), material, 0, y, 0);
}

export function ring(radius: number, tube: number, material: Material, segments = 32): Mesh {
  return new Mesh(new TorusGeometry(radius, tube, 8, segments), material).rotateX(Math.PI / 2);
}

/** Painted metal with faint panel seams, rivets and a little wear. */
export function platingTexture(key: string, base: string, seamsX: number, seamsY: number): CanvasTexture {
  const texture = canvasTexture(`v2-plating-${key}`, 256, 256, (ctx) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 900; i += 1) {
      const shade = Math.sin(i * 12.9898) * 43758.5453;
      const t = shade - Math.floor(shade);
      ctx.fillStyle = t > 0.5 ? `rgba(255,255,255,${(t - 0.5) * 0.06})` : `rgba(0,0,0,${t * 0.07})`;
      ctx.fillRect((i * 37) % 256, (i * 91) % 256, 2 + (i % 5), 1 + (i % 3));
    }
    ctx.strokeStyle = "rgba(0,0,0,0.32)";
    ctx.lineWidth = 2;
    for (let i = 1; i < seamsX; i += 1) {
      ctx.beginPath();
      ctx.moveTo((256 / seamsX) * i, 0);
      ctx.lineTo((256 / seamsX) * i, 256);
      ctx.stroke();
    }
    for (let i = 1; i < seamsY; i += 1) {
      ctx.beginPath();
      ctx.moveTo(0, (256 / seamsY) * i);
      ctx.lineTo(256, (256 / seamsY) * i);
      ctx.stroke();
    }
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    for (let x = 0; x < seamsX; x += 1) {
      for (let y = 0; y < seamsY; y += 1) {
        const cx = (256 / seamsX) * x;
        const cy = (256 / seamsY) * y;
        for (const [dx, dy] of [[8, 8], [256 / seamsX - 8, 8], [8, 256 / seamsY - 8], [256 / seamsX - 8, 256 / seamsY - 8]] as const) {
          ctx.beginPath();
          ctx.arc(cx + dx, cy + dy, 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Yellow and black warning stripes. */
export function hazardTexture(): CanvasTexture {
  const texture = canvasTexture("v2-hazard", 128, 32, (ctx) => {
    ctx.fillStyle = "#ffc83d";
    ctx.fillRect(0, 0, 128, 32);
    ctx.fillStyle = "#1d2028";
    for (let x = -32; x < 160; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 32);
      ctx.lineTo(x + 16, 32);
      ctx.lineTo(x + 32, 0);
      ctx.lineTo(x + 16, 0);
      ctx.fill();
    }
  });
  texture.wrapS = RepeatWrapping;
  return texture;
}

/** Soft quilted suit fabric with stitched seams. */
export function fabricTexture(): CanvasTexture {
  const texture = canvasTexture("v2-fabric", 256, 256, (ctx) => {
    ctx.fillStyle = "#f2f4f8";
    ctx.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      const gradient = ctx.createLinearGradient(0, y, 0, y + 32);
      gradient.addColorStop(0, "rgba(0,0,0,0.0)");
      gradient.addColorStop(0.85, "rgba(0,0,0,0.03)");
      gradient.addColorStop(1, "rgba(40,50,70,0.12)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, y, 256, 32);
    }
    ctx.strokeStyle = "rgba(90,100,120,0.35)";
    ctx.setLineDash([3, 3]);
    for (let x = 0; x < 256; x += 64) {
      ctx.beginPath();
      ctx.moveTo(x + 2, 0);
      ctx.lineTo(x + 2, 256);
      ctx.stroke();
    }
  });
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  return texture;
}

/** Shared v2 finishes: softer whites, painted metals with seams, rubber and glass. */
export const FINISH = {
  suit: () => surface({ map: fabricTexture(), color: 0xffffff, roughness: 0.6 }),
  shell: () => surface({ color: 0xf4f6fa, roughness: 0.32, reflective: true, envMapIntensity: 0.5 }),
  orange: () => surface({ color: 0xff7a1f, roughness: 0.38, reflective: true, envMapIntensity: 0.45 }),
  graphite: () => surface({ color: 0x33394a, roughness: 0.5, metalness: 0.5, reflective: true, envMapIntensity: 0.5 }),
  gunmetal: () => surface({ color: 0x5a6274, roughness: 0.38, metalness: 0.75, reflective: true, envMapIntensity: 0.7 }),
  chrome: () => surface({ color: 0xc9d1dc, roughness: 0.18, metalness: 0.95, reflective: true, envMapIntensity: 1.1 }),
  rubber: () => surface({ color: 0x1b1e26, roughness: 0.92 }),
  visor: () => surface({ color: 0xe0a040, roughness: 0.08, metalness: 1, emissive: 0x1a0a00, emissiveIntensity: 0.3, reflective: true, envMapIntensity: 1.1 }),
  glass: () => surface({ color: 0x0d1a2a, roughness: 0.06, metalness: 0.6, reflective: true, envMapIntensity: 1.6 }),
};

