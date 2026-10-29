import {
  AdditiveBlending,
  ConeGeometry,
  DoubleSide,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Points,
  PointsMaterial,
  Scene,
  Sprite,
  SpriteMaterial,
  TubeGeometry,
  Vector3,
  type CanvasTexture,
} from "three";
import { box, surface } from "./materials";
import { rocketModel } from "./rocket";
import { landerModel, type LanderModel } from "./structures";
import { canvasTexture } from "./textures";

const MOON_RADIUS = 60;
const STAR_COUNT = 1600;
const ARC_COUNT = 9;
const DEBRIS_COUNT = 10;

/** The opening in orbit: its own scene with the Moon below, Earth far off, the stricken rocket and the escape pod. */
export interface SpaceMoment {
  /** How badly the jump drive arcs, 0..1. */
  readonly spark: number;
  /** The blowout flash, 0..1. */
  readonly blast: number;
  /** Seconds since the blowout (negative before it): debris flies and the hull trails fire. */
  readonly sinceBlast: number;
  /** Whether the pod's engine is firing. */
  readonly podThrust: boolean;
  /** Direction the hull is moving, for its fire trail to stream behind it. */
  readonly heading: Vector3;
}

export interface SpaceSet {
  readonly scene: Scene;
  /** The rocket hull; it lives in this scene, not the world. */
  readonly ship: Group;
  readonly pod: LanderModel;
  /** Centre of the Moon, for the hull to fall toward. */
  readonly moonCenter: Vector3;
  update(time: number, moment: SpaceMoment): void;
}

function moonTexture(): CanvasTexture {
  return canvasTexture("space-moon", 1024, 512, (ctx) => {
    ctx.fillStyle = "#8d8f9e";
    ctx.fillRect(0, 0, 1024, 512);
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i += 1) {
      ctx.fillStyle = `rgba(60,62,78,${0.25 + random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(random() * 1024, random() * 512, 40 + random() * 140, 20 + random() * 70, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 600; i += 1) {
      const x = random() * 1024;
      const y = random() * 512;
      const r = 1 + random() ** 3 * 22;
      const crater = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      crater.addColorStop(0, "rgba(40,40,50,0.5)");
      crater.addColorStop(0.8, "rgba(80,80,95,0.25)");
      crater.addColorStop(1, "rgba(230,230,240,0.5)");
      ctx.fillStyle = crater;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function puffTexture(): CanvasTexture {
  return canvasTexture("space-puff", 64, 64, (ctx) => {
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
  });
}

function stars(): Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions.set([r * Math.cos(theta) * 900, u * 900, r * Math.sin(theta) * 900], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return new Points(geometry, new PointsMaterial({ color: 0xffffff, size: 1.6, sizeAttenuation: false }));
}

/** Blue-white electric arcs crawling over the failing jump drive. */
function arcs(): Mesh[] {
  const material = new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  return Array.from({ length: ARC_COUNT }, (_, i) => {
    const angle = (i / ARC_COUNT) * Math.PI * 2 + Math.sin(i * 7.3);
    const points = Array.from({ length: 7 }, (__, k) => {
      const a = angle + k * 0.18;
      const r = 1.2 + Math.sin(i * 3.1 + k * 2.3) * 0.18 + k * 0.08;
      return new Vector3(Math.sin(a) * r, 0.75 + Math.sin(i + k * 1.7) * 0.25 + k * 0.06, Math.cos(a) * r);
    });
    return new Mesh(new TubeGeometry(new CatmullRomCurve3(points), 24, 0.025, 4), material);
  });
}

/** Bright at the nozzle, orange in the middle, gone at the tip; drawn bottom-up so uv 0 is the nozzle. */
function flameTexture(): CanvasTexture {
  return canvasTexture("space-flame", 32, 128, (ctx) => {
    const gradient = ctx.createLinearGradient(0, 128, 0, 0);
    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(0.18, "rgba(255,236,170,0.95)");
    gradient.addColorStop(0.5, "rgba(255,140,50,0.6)");
    gradient.addColorStop(1, "rgba(255,90,30,0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 128);
  });
}

export interface Flame {
  readonly root: Group;
  /** Flicker and show or hide the flame. */
  set(on: boolean, time: number): void;
}

/** A soft rocket flame along -y from its origin: an outer glow and a white-hot core, both fading to nothing. */
export function flame(length: number, radius: number): Flame {
  const root = new Group();
  const material = (opacity: number) => new MeshBasicMaterial({ map: flameTexture(), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const outer = new Mesh(new ConeGeometry(radius, length, 20, 1, true).rotateX(Math.PI).translate(0, -length / 2, 0), material(0.85));
  const core = new Mesh(new ConeGeometry(radius * 0.45, length * 0.55, 16, 1, true).rotateX(Math.PI).translate(0, (-length * 0.55) / 2, 0), material(1));
  root.add(outer, core);
  return {
    root,
    set(on, time) {
      root.visible = on;
      if (!on) return;
      const flicker = 1 + Math.sin(time * 41) * 0.06 + Math.sin(time * 67) * 0.05;
      outer.scale.set(1, flicker, 1);
      core.scale.set(1, 2 - flicker, 1);
    },
  };
}

const TRAIL_PUFFS = 22;

/** Fire, then smoke, streaming behind the falling hull in world space. */
function fireTrail(scene: Scene): (from: Vector3, back: Vector3, age: number) => void {
  const puffs = Array.from({ length: TRAIL_PUFFS }, (_, i) => {
    const hot = i < 7;
    const material = new SpriteMaterial({ map: puffTexture(), color: hot ? 0xffa64a : 0x8d8894, transparent: true, depthWrite: false, opacity: 0 });
    if (hot) material.blending = AdditiveBlending;
    const sprite = new Sprite(material);
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  });
  return (from, back, age) => {
    puffs.forEach((puff, i) => {
      puff.visible = age > 0;
      if (!puff.visible) return;
      const t = i / (TRAIL_PUFFS - 1);
      const spacing = 0.35 + Math.min(age, 4) * 0.12;
      puff.position.copy(from).addScaledVector(back, i * spacing).add(new Vector3(Math.sin(i * 2.3 + age) * t * 0.4, Math.cos(i * 1.7) * t * 0.3, 0));
      puff.scale.setScalar(0.9 + t * 3.2);
      puff.material.opacity = Math.min(1, age * 2) * (i < 7 ? 0.9 - t * 1.2 : 0.55 * (1 - t));
    });
  };
}

export function createSpaceSet(): SpaceSet {
  const scene = new Scene();
  scene.background = new Color(0x020308);
  scene.add(stars());
  const moonCenter = new Vector3(10, -95, -110);
  const moon = new Mesh(new IcosahedronGeometry(MOON_RADIUS, 6), new MeshStandardMaterial({ map: moonTexture(), roughness: 1 }));
  moon.position.copy(moonCenter);
  const earth = new Mesh(new IcosahedronGeometry(14, 5), new MeshStandardMaterial({ color: 0x2d6cc0, emissive: 0x16305a, emissiveIntensity: 0.4, roughness: 0.6 }));
  earth.position.set(-170, 90, -420);
  earth.add(new Mesh(new IcosahedronGeometry(14.8, 5), new MeshBasicMaterial({ color: 0x7fc0ff, transparent: true, opacity: 0.2, depthWrite: false })));
  const sun = new DirectionalLight(0xfff0dc, 2.4);
  sun.position.set(-80, 60, 120);
  scene.add(moon, earth, sun, new HemisphereLight(0x8a9cff, 0x000000, 0.15));

  const rocket = rocketModel();
  for (let i = 0; i < 30; i += 1) rocket.setBuild(0.25, false, i / 30, 1 / 30);
  const ship = rocket.ship;
  ship.removeFromParent();
  ship.position.set(0, 0, 0);
  rocket.flame.visible = false;
  const engine = flame(3.2, 0.55);
  engine.root.position.y = -0.6;
  ship.add(engine.root);
  const arcMeshes = arcs();
  ship.add(...arcMeshes);
  const trail = fireTrail(scene);
  const flash = new Sprite(new SpriteMaterial({ map: puffTexture(), color: 0xbff4ff, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
  flash.position.set(0, 0.8, 0);
  ship.add(flash);
  scene.add(ship);

  // Hull plates and sparks thrown off by the blowout.
  const debris = Array.from({ length: DEBRIS_COUNT }, (_, i) => {
    const piece = box(0.2 + (i % 3) * 0.1, 0.04, 0.16, surface({ color: i % 4 === 0 ? 0xff7a1f : 0xe8ebf0, roughness: 0.5 }), 0, 0, 0, 0.01);
    const angle = (i / DEBRIS_COUNT) * Math.PI * 2;
    // Thrown outward from just outside the hull, so nothing starts inside it.
    piece.userData.direction = new Vector3(Math.sin(angle), 0.35 + Math.cos(i * 1.3) * 0.3, Math.cos(angle)).normalize();
    piece.userData.speed = 1.4 + (i % 4) * 0.35;
    piece.visible = false;
    scene.add(piece);
    return piece;
  });

  const pod = landerModel();
  pod.flame.visible = false;
  const podEngine = flame(2.2, 0.38);
  podEngine.root.position.y = 0.2;
  pod.root.add(podEngine.root);
  scene.add(pod.root);
  const drive = new Vector3();

  return {
    scene,
    ship,
    pod,
    moonCenter,
    update(time, { spark, blast, sinceBlast, podThrust, heading }) {
      arcMeshes.forEach((arc, i) => {
        // Arcs crackle on and off; the worse the drive, the more of them at once.
        arc.visible = spark > 0 && Math.sin(time * (23 + i * 7) + i * 2.1) > 1 - spark * 1.6;
      });
      flash.material.opacity = blast;
      flash.scale.setScalar(2 + blast * 9);
      engine.set(sinceBlast < 0, time);
      podEngine.set(podThrust, time);
      ship.localToWorld(drive.set(0, 0.75, 0));
      trail(drive, heading.clone().negate(), sinceBlast);
      for (const piece of debris) {
        piece.visible = sinceBlast > 0;
        if (!piece.visible) continue;
        const direction = piece.userData.direction as Vector3;
        piece.position.copy(drive).addScaledVector(direction, 1.4 + (piece.userData.speed as number) * sinceBlast);
        piece.rotation.set(sinceBlast * 4, sinceBlast * 3, 0);
      }
    },
  };
}
