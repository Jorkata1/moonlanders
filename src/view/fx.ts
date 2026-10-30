import {
  AdditiveBlending,
  CanvasTexture,
  CylinderGeometry,
  DodecahedronGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  RingGeometry,
  SRGBColorSpace,
  Sprite,
  SpriteMaterial,
  Vector3,
  type Scene,
  type Texture,
} from "three";
import { ITEMS, type ItemId } from "../config";
import type { ItemPool } from "./items";
import { flat, glow, mesh } from "./materials";
import { softTexture } from "./textures";

/** How long an item takes to fly between two points; exported so belts can start as it lands. */
export const FLY_SECONDS = 0.32;
const TEXT_SECONDS = 0.9;
const PUFF_SECONDS = 0.7;
const FALL_DROP_HEIGHT = 26;
const FALL_DRIFT = 6;
const TRAIL_DIRECTION = new Vector3(FALL_DRIFT, FALL_DROP_HEIGHT, -FALL_DRIFT).normalize();
const TRAIL_HALF_LENGTH = 2.5;
/** Radius of the soft landing marker under falling ore. */
const MARKER_RADIUS = 0.75;

interface Flight {
  model: Group;
  from: Vector3;
  to: () => Vector3;
  t: number;
}

interface Floater {
  sprite: Sprite;
  t: number;
  origin: Vector3;
}

interface Puff {
  sprite: Sprite;
  t: number;
  velocity: Vector3;
  life: number;
  grow: number;
}

interface FallFx {
  id: number;
  ring: Mesh;
  rock: Mesh;
  trail: Mesh;
  t: number;
  seconds: number;
  color: number;
  x: number;
  z: number;
  y: number;
}

function textTexture(text: string, color: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D canvas is not available for floating text");
  ctx.font = "700 64px 'Chakra Petch', 'Trebuchet MS', sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 10;
  ctx.strokeStyle = "rgba(6, 8, 20, 0.85)";
  ctx.strokeText(text, 128, 50);
  ctx.fillStyle = color;
  ctx.fillText(text, 128, 50);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

function puffTexture(): Texture {
  return softTexture("fx-puff", 64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255, 255, 255, 1)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

export interface Effects {
  flyItem(item: ItemId, from: Vector3, to: () => Vector3): void;
  floatText(text: string, color: string, at: Vector3): void;
  dust(at: Vector3, count: number, color?: number): void;
  sparks(at: Vector3, color: number, count: number): void;
  /** Rock chips that fly off a deposit being drilled and bounce on the ground. */
  chips(at: Vector3, glowColor: number, rockColor: number, count: number): void;
  /** A chunk of ore streaks down toward a landing marker. */
  oreFall(id: number, item: ItemId, x: number, z: number, groundY: number, seconds: number): void;
  oreLand(id: number): void;
  update(dt: number): void;
}

export function createEffects(scene: Scene, pool: ItemPool): Effects {
  const flights: Flight[] = [];
  const floaters: Floater[] = [];
  const puffs: Puff[] = [];
  const falls: FallFx[] = [];
  const chipList: Array<{ mesh: Mesh; velocity: Vector3; life: number; floor: number }> = [];
  const chipGeometry = new DodecahedronGeometry(0.045, 0);
  const textCache = new Map<string, CanvasTexture>();
  const puffMap = puffTexture();
  const rockGeometry = new DodecahedronGeometry(0.42, 0);
  const trailGeometry = new CylinderGeometry(0.05, 0.5, 5, 10, 1, true);
  const trailMaterial = new MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.55, blending: AdditiveBlending, depthWrite: false });

  function spawnPuff(at: Vector3, color: number, velocity: Vector3, life: number, size: number, grow: number, additive: boolean): void {
    const material = new SpriteMaterial({ map: puffMap, color, transparent: true, depthWrite: false, blending: additive ? AdditiveBlending : NormalBlending });
    const sprite = new Sprite(material);
    sprite.position.copy(at);
    sprite.scale.setScalar(size);
    scene.add(sprite);
    puffs.push({ sprite, t: 0, velocity, life, grow });
  }

  const effects: Effects = {
    flyItem(item, from, to) {
      const model = pool.take(item);
      model.position.copy(from);
      scene.add(model);
      flights.push({ model, from: from.clone(), to, t: 0 });
    },
    floatText(text, color, at) {
      const key = `${text}|${color}`;
      const texture = textCache.get(key) ?? textTexture(text, color);
      textCache.set(key, texture);
      const sprite = new Sprite(new SpriteMaterial({ map: texture, transparent: true, depthWrite: false, depthTest: false }));
      sprite.scale.set(1.3, 0.49, 1);
      sprite.renderOrder = 20;
      sprite.position.copy(at);
      scene.add(sprite);
      floaters.push({ sprite, t: 0, origin: at.clone() });
    },
    dust(at, count, color = 0xb9bccb) {
      for (let i = 0; i < count; i += 1) {
        const angle = Math.random() * Math.PI * 2;
        const speed = 0.6 + Math.random() * 1.4;
        spawnPuff(at, color, new Vector3(Math.cos(angle) * speed, 0.4 + Math.random() * 0.8, Math.sin(angle) * speed), PUFF_SECONDS + Math.random() * 0.4, 0.35, 1.6, false);
      }
    },
    chips(at, glowColor, rockColor, count) {
      for (let i = 0; i < count; i += 1) {
        const piece = mesh(chipGeometry, i === 0 ? glow(glowColor, 1.6) : flat(rockColor, 0.9));
        piece.position.copy(at);
        piece.scale.setScalar(0.7 + Math.random() * 0.8);
        scene.add(piece);
        const angle = Math.random() * Math.PI * 2;
        chipList.push({ mesh: piece, velocity: new Vector3(Math.cos(angle) * 1.6, 1.8 + Math.random() * 1.6, Math.sin(angle) * 1.6), life: 0.9 + Math.random() * 0.4, floor: at.y - 0.33 });
      }
    },
    sparks(at, color, count) {
      for (let i = 0; i < count; i += 1) {
        const v = new Vector3(Math.random() - 0.5, Math.random() * 0.9 + 0.3, Math.random() - 0.5).multiplyScalar(3);
        spawnPuff(at, color, v, 0.35 + Math.random() * 0.2, 0.14, -0.2, true);
      }
    },
    oreFall(id, item, x, z, groundY, seconds) {
      const color = ITEMS[item].color;
      const ring = new Mesh(new RingGeometry(MARKER_RADIUS * 0.82, MARKER_RADIUS, 40), new MeshBasicMaterial({ color, transparent: true, opacity: 0.5, depthWrite: false }));
      ring.add(new Mesh(new RingGeometry(0, MARKER_RADIUS * 0.82, 40), new MeshBasicMaterial({ color, transparent: true, opacity: 0.12, depthWrite: false })));
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(x, groundY + 0.06, z);
      const rock = mesh(rockGeometry, flat(0x3a3440, 0.9));
      const core = mesh(rockGeometry, glow(color, 1.6));
      core.scale.setScalar(0.85);
      core.rotation.y = 0.6;
      core.position.y = -0.05;
      rock.add(core);
      rock.position.set(x + FALL_DRIFT, groundY + FALL_DROP_HEIGHT, z - FALL_DRIFT);
      const trail = new Mesh(trailGeometry, trailMaterial);
      scene.add(ring, rock, trail);
      falls.push({ id, ring, rock, trail, t: 0, seconds, color, x, z, y: groundY });
    },
    oreLand(id) {
      const index = falls.findIndex((f) => f.id === id);
      const fx = falls[index];
      if (!fx) return;
      falls.splice(index, 1);
      scene.remove(fx.ring, fx.rock, fx.trail);
      fx.ring.traverse((part) => {
        if (part instanceof Mesh) {
          part.geometry.dispose();
          (part.material as MeshBasicMaterial).dispose();
        }
      });
      const at = new Vector3(fx.x, fx.y + 0.3, fx.z);
      effects.dust(at, 14, 0x9a96a8);
      effects.sparks(at, fx.color, 14);
    },
    update(dt) {
      for (let i = flights.length - 1; i >= 0; i -= 1) {
        const flight = flights[i] as Flight;
        flight.t += dt / FLY_SECONDS;
        const target = flight.to();
        const t = Math.min(1, flight.t);
        flight.model.position.lerpVectors(flight.from, target, t);
        flight.model.position.y += Math.sin(t * Math.PI) * 1.2;
        flight.model.rotation.y += dt * 9;
        if (flight.t >= 1) {
          pool.give(flight.model);
          flights.splice(i, 1);
        }
      }
      for (let i = floaters.length - 1; i >= 0; i -= 1) {
        const floater = floaters[i] as Floater;
        floater.t += dt / TEXT_SECONDS;
        floater.sprite.position.set(floater.origin.x, floater.origin.y + floater.t * 1.2, floater.origin.z);
        floater.sprite.material.opacity = Math.min(1, (1 - floater.t) * 2.5);
        if (floater.t >= 1) {
          scene.remove(floater.sprite);
          floater.sprite.material.dispose();
          floaters.splice(i, 1);
        }
      }
      for (let i = puffs.length - 1; i >= 0; i -= 1) {
        const puff = puffs[i] as Puff;
        puff.t += dt;
        const k = puff.t / puff.life;
        puff.sprite.position.addScaledVector(puff.velocity, dt);
        puff.velocity.multiplyScalar(1 - dt * 2.5);
        puff.sprite.scale.multiplyScalar(1 + puff.grow * dt);
        puff.sprite.material.opacity = Math.max(0, 1 - k) * 0.7;
        if (k >= 1) {
          scene.remove(puff.sprite);
          puff.sprite.material.dispose();
          puffs.splice(i, 1);
        }
      }
      for (let i = chipList.length - 1; i >= 0; i -= 1) {
        const chip = chipList[i] as (typeof chipList)[number];
        chip.life -= dt;
        chip.velocity.y -= 9 * dt;
        chip.mesh.position.addScaledVector(chip.velocity, dt);
        chip.mesh.rotation.x += dt * 8;
        if (chip.mesh.position.y < chip.floor) {
          chip.mesh.position.y = chip.floor;
          chip.velocity.multiplyScalar(0.4);
          chip.velocity.y = Math.abs(chip.velocity.y) * 0.5;
        }
        if (chip.life <= 0) {
          scene.remove(chip.mesh);
          chipList.splice(i, 1);
        }
      }
      for (const fx of falls) {
        fx.t += dt / fx.seconds;
        const t = Math.min(1, fx.t);
        const fall = t * t * t;
        fx.rock.position.set(fx.x + FALL_DRIFT * (1 - fall), fx.y + 0.4 + (FALL_DROP_HEIGHT - 0.4) * (1 - fall), fx.z - FALL_DRIFT * (1 - fall));
        fx.rock.rotation.x += dt * 4;
        // The trail points back along the fall direction, wide end at the rock.
        fx.trail.position.copy(fx.rock.position).addScaledVector(TRAIL_DIRECTION, TRAIL_HALF_LENGTH);
        fx.trail.lookAt(fx.trail.position.clone().add(TRAIL_DIRECTION));
        fx.trail.rotateX(Math.PI / 2);
        const pulse = 0.25 + Math.sin(fx.t * 18) * 0.08 + t * 0.45;
        (fx.ring.material as MeshBasicMaterial).opacity = pulse;
        fx.ring.scale.setScalar(1.15 - t * 0.15);
      }
    },
  };
  return effects;
}
