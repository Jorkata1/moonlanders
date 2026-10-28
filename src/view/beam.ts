import { AdditiveBlending, BufferAttribute, BufferGeometry, Color, Mesh, MeshBasicMaterial, PointLight, Sprite, SpriteMaterial, Vector3, type Scene } from "three";
import { canvasTexture } from "./textures";

const SEGMENTS = 18;
const SIDES = 6;
const CORE_RADIUS = 0.02;
const HALO_RADIUS = 0.07;
/** How quickly the bend catches up with the drill when the miner moves: lower is floppier. */
const FOLLOW_RATE = 7;
const RETRACT_SECONDS = 0.18;
const CHARGING = new Color(0x6fd8ff);
const CUTTING = new Color(0xff7a2a);
/** How far along the aim the bend's control point sits, as a share of the beam's length. */
const AIM_REACH = 0.45;
/** How much the control point is pulled back toward the straight line, so the curve never hooks. */
const AIM_STRAIGHTEN = 0.35;

/** A flexible cutting beam from a drill tip to the rock: it bends, sways and lags behind the drill. */
export interface Beam {
  /**
   * `power` 0..1 is the drill's warm-up: thin, blue and jittery at first, then thick and orange once locked.
   * `aim` is the drill's pointing direction; the beam leaves the muzzle along it and curves onto the rock.
   */
  show(from: Vector3, to: Vector3, time: number, dt: number, power: number, aim?: Vector3): void;
  /** Pull the beam back into the drill over a moment rather than switching it off. */
  hide(dt: number): void;
}

function glowMap() {
  return canvasTexture("beam-glow", 64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(0.25, "rgba(255, 220, 170, 0.8)");
    gradient.addColorStop(1, "rgba(255, 140, 60, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

/** A tube whose centre line is rewritten every frame; the index buffer is built once. */
function tube(material: MeshBasicMaterial): { mesh: Mesh; write(points: readonly Vector3[], radius: (t: number) => number): void } {
  const geometry = new BufferGeometry();
  const positions = new Float32Array((SEGMENTS + 1) * SIDES * 3);
  geometry.setAttribute("position", new BufferAttribute(positions, 3));
  const indices: number[] = [];
  for (let i = 0; i < SEGMENTS; i += 1) {
    for (let j = 0; j < SIDES; j += 1) {
      const a = i * SIDES + j;
      const b = i * SIDES + ((j + 1) % SIDES);
      const c = (i + 1) * SIDES + j;
      const d = (i + 1) * SIDES + ((j + 1) % SIDES);
      indices.push(a, c, b, b, c, d);
    }
  }
  geometry.setIndex(indices);
  const mesh = new Mesh(geometry, material);
  mesh.frustumCulled = false;
  const tangent = new Vector3();
  const normal = new Vector3();
  const binormal = new Vector3();
  const up = new Vector3(0, 1, 0);
  return {
    mesh,
    write(points, radius) {
      for (let i = 0; i <= SEGMENTS; i += 1) {
        const p = points[i] as Vector3;
        tangent.subVectors(points[Math.min(SEGMENTS, i + 1)] as Vector3, points[Math.max(0, i - 1)] as Vector3).normalize();
        normal.crossVectors(tangent, Math.abs(tangent.y) > 0.95 ? binormal.set(1, 0, 0) : up).normalize();
        binormal.crossVectors(tangent, normal).normalize();
        const r = radius(i / SEGMENTS);
        for (let j = 0; j < SIDES; j += 1) {
          const angle = (j / SIDES) * Math.PI * 2;
          const k = (i * SIDES + j) * 3;
          positions[k] = p.x + (normal.x * Math.cos(angle) + binormal.x * Math.sin(angle)) * r;
          positions[k + 1] = p.y + (normal.y * Math.cos(angle) + binormal.y * Math.sin(angle)) * r;
          positions[k + 2] = p.z + (normal.z * Math.cos(angle) + binormal.z * Math.sin(angle)) * r;
        }
      }
      (geometry.getAttribute("position") as BufferAttribute).needsUpdate = true;
    },
  };
}

export function createBeam(scene: Scene, withLight: boolean): Beam {
  const coreMaterial = new MeshBasicMaterial({ color: 0xfff4e0, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  const haloMaterial = new MeshBasicMaterial({ color: CUTTING, transparent: true, opacity: 0.45, blending: AdditiveBlending, depthWrite: false });
  const core = tube(coreMaterial);
  const halo = tube(haloMaterial);
  const hotspot = new Sprite(new SpriteMaterial({ map: glowMap(), transparent: true, blending: AdditiveBlending, depthWrite: false }));
  const light = withLight ? new PointLight(0xff8a3a, 0, 3, 2) : null;
  for (const object of [core.mesh, halo.mesh, hotspot]) {
    object.visible = false;
    scene.add(object);
  }
  if (light) scene.add(light);

  const points = Array.from({ length: SEGMENTS + 1 }, () => new Vector3());
  const lastFrom = new Vector3();
  const lastTo = new Vector3();
  const lag = new Vector3();
  const control = new Vector3();
  const side = new Vector3();
  const lastAim = new Vector3();
  const middle = new Vector3();
  const direction = new Vector3();
  let hasAim = false;
  let visible = false;
  let retract = 0;
  let lastPower = 0;
  let lastTime = 0;

  /** Quadratic curve from `from` to `to` bent through `control`, with a travelling ripple. */
  function trace(from: Vector3, to: Vector3, reach: number, time: number, ripple: number): void {
    side.subVectors(to, from).cross(control.set(0, 1, 0)).normalize();
    const length = from.distanceTo(to);
    middle.lerpVectors(from, to, 0.5);
    middle.y += length * 0.12;
    control.copy(middle);
    // Follow the muzzle only as far as it points at the rock; a drill turned away never makes the beam loop back.
    const facing = hasAim && length > 0 ? Math.max(0, lastAim.dot(direction.subVectors(to, from).divideScalar(length))) : 0;
    if (facing > 0) {
      direction.copy(from).addScaledVector(lastAim, length * AIM_REACH).lerp(middle, AIM_STRAIGHTEN);
      control.lerp(direction, facing);
    }
    control.add(lag);
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const t = (i / SEGMENTS) * reach;
      const u = 1 - t;
      const p = points[i] as Vector3;
      p.set(u * u * from.x + 2 * u * t * control.x + t * t * to.x, u * u * from.y + 2 * u * t * control.y + t * t * to.y, u * u * from.z + 2 * u * t * control.z + t * t * to.z);
      // A ripple runs along the beam; it is pinned at both ends so the beam never kinks.
      const wave = Math.sin(t * 14 - time * 26) * Math.sin(Math.PI * Math.min(1, t)) * ripple;
      p.addScaledVector(side, wave);
      p.y += wave * 0.6;
    }
  }

  function draw(time: number, power: number, reach: number): void {
    const flicker = 1 + Math.sin(time * 60) * 0.18;
    const thickness = (0.35 + power * 0.65) * flicker;
    core.write(points, (t) => CORE_RADIUS * thickness * (1 - t * 0.3));
    halo.write(points, (t) => HALO_RADIUS * thickness * (0.75 + Math.sin(t * Math.PI) * 0.35));
    haloMaterial.color.copy(CHARGING).lerp(CUTTING, power);
    haloMaterial.opacity = 0.25 + power * 0.25;
    for (const object of [core.mesh, halo.mesh]) object.visible = true;
    hotspot.visible = reach > 0.98;
    hotspot.position.copy(points[SEGMENTS] as Vector3);
    hotspot.scale.setScalar((0.2 + power * 0.3 + Math.sin(time * 45) * 0.08) * thickness);
    if (light) {
      light.position.copy(points[SEGMENTS] as Vector3).add(new Vector3(0, 0.25, 0));
      light.color.copy(CHARGING).lerp(CUTTING, power);
      light.intensity = (0.8 + power * 2 + Math.sin(time * 37) * 0.6) * reach;
    }
  }

  return {
    show(from, to, time, dt, power, aim) {
      hasAim = aim !== undefined;
      if (aim) lastAim.copy(aim).normalize();
      // The bend lags behind the drill's movement, then springs straight again.
      if (visible) lag.addScaledVector(lastFrom.sub(from), 1.2);
      lag.multiplyScalar(Math.max(0, 1 - dt * FOLLOW_RATE));
      lag.y = Math.min(lag.y, 0.4);
      visible = true;
      retract = RETRACT_SECONDS;
      lastFrom.copy(from);
      lastTo.copy(to);
      lastPower = power;
      lastTime = time;
      trace(from, to, 1, time, 0.02 + (1 - power) * 0.09);
      draw(time, power, 1);
    },
    hide(dt) {
      if (!visible) return;
      retract -= dt;
      lastTime += dt;
      if (retract <= 0) {
        visible = false;
        lag.set(0, 0, 0);
        for (const object of [core.mesh, halo.mesh, hotspot]) object.visible = false;
        if (light) light.intensity = 0;
        return;
      }
      const reach = Math.max(0.02, retract / RETRACT_SECONDS);
      trace(lastFrom, lastTo, reach, lastTime, 0.03);
      draw(lastTime, lastPower, reach);
    },
  };
}
