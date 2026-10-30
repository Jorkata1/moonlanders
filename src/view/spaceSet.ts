import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Color,
  ConeGeometry,
  DirectionalLight,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  HemisphereLight,
  IcosahedronGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PointLight,
  Points,
  PointsMaterial,
  RingGeometry,
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
const STAR_COUNT = 2400;
const ARC_COUNT = 9;
const DEBRIS_COUNT = 18;
const FIREBALL_PUFFS = 16;
const SMOKE_PUFFS = 14;
const SPARK_COUNT = 260;
const PYRO_PUFFS = 8;
/**
 * Peak brightness of the blast's light. Far brighter and phones overflow their half-float render
 * targets, which the bloom then smears across the screen as coloured blocks.
 */
const BLAST_LIGHT = 30;
/** Where on the hull the jump drive sits, in the ship's own space, and its ring's radius. */
const DRIVE_HEIGHT = 0.75;
const DRIVE_RING = 1.12;

/** One moment of the orbit sequence, as the intro timeline sees it. */
export interface SpaceMoment {
  /** How badly the jump drive arcs, 0..1. */
  readonly spark: number;
  /** Seconds since the blowout (negative before it). */
  readonly sinceBlast: number;
  /** Seconds since the pod's bolts blew (negative before). */
  readonly sinceEject: number;
  /** Whether the main engine is still burning. */
  readonly engine: boolean;
  /** How hard the pod's engine burns, 0..1. */
  readonly podThrust: number;
  /** Direction the hull is moving, for its fire trail to stream behind it. */
  readonly heading: Vector3;
  /** The hull's velocity, which the fireball keeps drifting with. */
  readonly shipVelocity: Vector3;
  /** Where the camera is, so the shockwave ring always reads as a circle, never edge-on. */
  readonly viewer: Vector3;
}

export interface SpaceSet {
  readonly scene: Scene;
  /** The rocket hull; it lives in this scene, not the world. */
  readonly ship: Group;
  readonly pod: LanderModel;
  /** Centre of the Moon, for the hull and the pod to fall toward. */
  readonly moonCenter: Vector3;
  readonly moonRadius: number;
  update(time: number, moment: SpaceMoment): void;
}

function moonTexture(): CanvasTexture {
  return canvasTexture("space-moon-hd", 2048, 1024, (ctx) => {
    ctx.fillStyle = "#8d8f9e";
    ctx.fillRect(0, 0, 2048, 1024);
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    // Dark maria first, then craters of every size on top.
    for (let i = 0; i < 34; i += 1) {
      ctx.fillStyle = `rgba(58,60,76,${0.22 + random() * 0.3})`;
      ctx.beginPath();
      ctx.ellipse(random() * 2048, random() * 1024, 80 + random() * 260, 40 + random() * 130, random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 1600; i += 1) {
      const x = random() * 2048;
      const y = random() * 1024;
      const r = 1.5 + random() ** 3 * 40;
      const crater = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
      crater.addColorStop(0, "rgba(40,40,50,0.5)");
      crater.addColorStop(0.75, "rgba(80,80,95,0.2)");
      crater.addColorStop(0.92, "rgba(225,225,235,0.22)");
      crater.addColorStop(1, "rgba(225,225,235,0)");
      ctx.fillStyle = crater;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    // Fine regolith grain so the surface never looks flat up close.
    for (let i = 0; i < 60000; i += 1) {
      ctx.fillStyle = random() < 0.5 ? "rgba(30,30,40,0.12)" : "rgba(240,240,250,0.1)";
      ctx.fillRect(random() * 2048, random() * 1024, 2, 2);
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

/** A lumpy, billowing puff for fire and smoke, so the fireball doesn't read as soft dots. */
function billowTexture(): CanvasTexture {
  return canvasTexture("space-billow", 128, 128, (ctx) => {
    let seed = 11;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 26; i += 1) {
      const angle = random() * Math.PI * 2;
      const reach = random() * 30;
      const x = 64 + Math.cos(angle) * reach;
      const y = 64 + Math.sin(angle) * reach;
      const r = 14 + random() * 22;
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, "rgba(255,255,255,0.55)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, 128, 128);
    }
  });
}

function stars(): Points {
  const positions = new Float32Array(STAR_COUNT * 3);
  const colors = new Float32Array(STAR_COUNT * 3);
  const tint = new Color();
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const u = Math.random() * 2 - 1;
    const theta = Math.random() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    positions.set([r * Math.cos(theta) * 1500, u * 1500, r * Math.sin(theta) * 1500], i * 3);
    // Mostly faint white, a few blue and warm ones.
    const pick = Math.random();
    tint.set(pick < 0.12 ? 0xa8c4ff : pick < 0.2 ? 0xffd9a8 : 0xffffff).multiplyScalar(0.35 + Math.random() ** 2 * 0.9);
    colors.set([tint.r, tint.g, tint.b], i * 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new Float32BufferAttribute(colors, 3));
  return new Points(geometry, new PointsMaterial({ size: 1.8, sizeAttenuation: false, vertexColors: true }));
}

/** Blue-white electric arcs jumping between the segments of the failing jump drive ring, hugging it. */
function arcs(): Mesh[] {
  const material = new MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.95, blending: AdditiveBlending, depthWrite: false });
  let seed = 3;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: ARC_COUNT }, (_, i) => {
    const angle = (i / ARC_COUNT) * Math.PI * 2 + random() * 0.4;
    // A jagged zig-zag along the ring, never more than a hand's width off its surface.
    const points = Array.from({ length: 8 }, (__, k) => {
      const a = angle + k * 0.07;
      const r = DRIVE_RING + 0.02 + random() * 0.1;
      return new Vector3(Math.sin(a) * r, DRIVE_HEIGHT + (k % 2 === 0 ? 1 : -1) * (0.04 + random() * 0.14), Math.cos(a) * r);
    });
    return new Mesh(new TubeGeometry(new CatmullRomCurve3(points, false, "catmullrom", 0.1), 32, 0.016, 4), material);
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
  /** Flicker and show or hide the flame; `power` stretches it, 0..1. */
  set(on: boolean, time: number, power?: number): void;
}

/** A soft rocket flame along -y from its origin: an outer glow, a white-hot core and a halo at the nozzle. */
export function flame(length: number, radius: number): Flame {
  const root = new Group();
  const material = (opacity: number) => new MeshBasicMaterial({ map: flameTexture(), transparent: true, opacity, blending: AdditiveBlending, depthWrite: false, side: DoubleSide });
  const outer = new Mesh(new ConeGeometry(radius, length, 20, 1, true).rotateX(Math.PI).translate(0, -length / 2, 0), material(0.85));
  const core = new Mesh(new ConeGeometry(radius * 0.45, length * 0.55, 16, 1, true).rotateX(Math.PI).translate(0, (-length * 0.55) / 2, 0), material(1));
  const halo = new Sprite(new SpriteMaterial({ map: puffTexture(), color: 0xffb070, transparent: true, opacity: 0.8, depthWrite: false, blending: AdditiveBlending }));
  halo.scale.setScalar(radius * 3);
  halo.position.y = -radius * 0.3;
  root.add(outer, core, halo);
  return {
    root,
    set(on, time, power = 1) {
      root.visible = on && power > 0.01;
      if (!root.visible) return;
      const flicker = 1 + Math.sin(time * 41) * 0.06 + Math.sin(time * 67) * 0.05;
      outer.scale.set(1, flicker * (0.4 + power * 0.6), 1);
      core.scale.set(1, (2 - flicker) * (0.4 + power * 0.6), 1);
      halo.scale.setScalar(radius * (2 + power * 2) * flicker);
    },
  };
}

const TRAIL_PUFFS = 26;

/** Fire, then smoke, streaming behind the falling hull in world space. */
function fireTrail(scene: Scene): (from: Vector3, back: Vector3, age: number) => void {
  const puffs = Array.from({ length: TRAIL_PUFFS }, (_, i) => {
    const hot = i < 8;
    const material = new SpriteMaterial({ map: billowTexture(), color: hot ? 0xffa64a : 0x5d5862, transparent: true, depthWrite: false, opacity: 0 });
    if (hot) material.blending = AdditiveBlending;
    const sprite = new Sprite(material);
    sprite.visible = false;
    scene.add(sprite);
    return sprite;
  });
  return (from, back, age) => {
    puffs.forEach((puff, i) => {
      puff.visible = age > 0.3;
      if (!puff.visible) return;
      const t = i / (TRAIL_PUFFS - 1);
      const spacing = 0.3 + Math.min(age, 5) * 0.16;
      puff.position.copy(from).addScaledVector(back, i * spacing).add(new Vector3(Math.sin(i * 2.3 + age) * t * 0.6, Math.cos(i * 1.7 + age * 0.7) * t * 0.5, Math.sin(i * 0.9) * t * 0.4));
      puff.scale.setScalar(0.8 + t * 4.2);
      puff.material.rotation = i * 1.3 + age * 0.2;
      const growIn = Math.min(1, (age - 0.3) * 1.5);
      puff.material.opacity = growIn * (i < 8 ? 0.95 - t * 1.4 : 0.6 * (1 - t));
    });
  };
}

interface Burst {
  readonly sprite: Sprite;
  readonly direction: Vector3;
  readonly reach: number;
  readonly size: number;
  readonly delay: number;
}

/** Random unit vector, with a seeded generator so the explosion looks the same every time. */
function scatter(random: () => number): Vector3 {
  const u = random() * 2 - 1;
  const theta = random() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  return new Vector3(r * Math.cos(theta), u, r * Math.sin(theta));
}

/**
 * The blowout: a white-hot flash, a rolling fireball that cools from yellow to deep red,
 * dark smoke that lingers, a shockwave ring, a spray of sparks and tumbling hull plates.
 */
function explosion(scene: Scene): (origin: Vector3, drift: Vector3, viewer: Vector3, age: number) => void {
  let seed = 31;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const root = new Group();
  root.visible = false;
  scene.add(root);

  const flash = new Sprite(new SpriteMaterial({ map: puffTexture(), color: 0xeaf8ff, transparent: true, depthWrite: false, blending: AdditiveBlending }));
  root.add(flash);
  const light = new PointLight(0xffb070, 0, 40, 1.2);
  root.add(light);

  const fire: Burst[] = Array.from({ length: FIREBALL_PUFFS }, (_, i) => {
    const sprite = new Sprite(new SpriteMaterial({ map: billowTexture(), color: 0xffffff, transparent: true, depthWrite: false, blending: AdditiveBlending }));
    root.add(sprite);
    return { sprite, direction: scatter(random), reach: 1.5 + random() * 3.2, size: 2.2 + random() * 2.6, delay: (i % 4) * 0.025 };
  });
  const smoke: Burst[] = Array.from({ length: SMOKE_PUFFS }, () => {
    const sprite = new Sprite(new SpriteMaterial({ map: billowTexture(), color: 0x2c2830, transparent: true, depthWrite: false }));
    root.add(sprite);
    return { sprite, direction: scatter(random), reach: 2.4 + random() * 4, size: 3.5 + random() * 3, delay: 0.12 + random() * 0.25 };
  });

  // Thin, crisp rings: a wide band reads as a fog sheet, not a shockwave.
  const ringMaterial = (color: number) => new MeshBasicMaterial({ color, transparent: true, depthWrite: false, blending: AdditiveBlending, side: DoubleSide });
  const ring = new Mesh(new RingGeometry(0.95, 1, 128, 1), ringMaterial(0xffd2a0));
  const ringOuter = new Mesh(new RingGeometry(0.975, 1, 128, 1), ringMaterial(0x9fd8ff));
  root.add(ring, ringOuter);

  const sparkPositions = new Float32Array(SPARK_COUNT * 3);
  const sparkGeometry = new BufferGeometry();
  sparkGeometry.setAttribute("position", new Float32BufferAttribute(sparkPositions, 3));
  const sparkMaterial = new PointsMaterial({ color: 0xffc070, size: 0.09, transparent: true, depthWrite: false, blending: AdditiveBlending });
  const sparks = new Points(sparkGeometry, sparkMaterial);
  sparks.frustumCulled = false;
  root.add(sparks);
  const sparkVelocity = Array.from({ length: SPARK_COUNT }, () => scatter(random).multiplyScalar(5 + random() ** 2 * 22));

  const debris = Array.from({ length: DEBRIS_COUNT }, (_, i) => {
    const big = i % 5 === 0;
    const piece = box(big ? 0.55 : 0.18 + random() * 0.25, 0.05, big ? 0.4 : 0.14 + random() * 0.18, surface({ color: i % 4 === 0 ? 0xff7a1f : i % 3 === 0 ? 0x3a3d48 : 0xe8ebf0, roughness: 0.5 }), 0, 0, 0, 0.01);
    // Big plates burn as they tumble away.
    if (big) {
      const ember = new Sprite(new SpriteMaterial({ map: puffTexture(), color: 0xff8a3a, transparent: true, opacity: 0.9, depthWrite: false, blending: AdditiveBlending }));
      ember.scale.setScalar(0.9);
      piece.add(ember);
    }
    root.add(piece);
    return { piece, direction: scatter(random), speed: 1.6 + random() * 5, spin: new Vector3(random() * 8 - 4, random() * 8 - 4, random() * 8 - 4) };
  });

  const center = new Vector3();
  const spot = new Vector3();
  const color = new Color();
  const hot = new Color(0xfff3c8);
  const warm = new Color(0xff8a2a);
  const cool = new Color(0x5a1408);

  return (origin, drift, viewer, age) => {
    root.visible = age >= 0 && age < 9;
    if (!root.visible) return;
    center.copy(origin).addScaledVector(drift, age);

    // The flash is over in a blink; its light lingers a little on the hull.
    const blink = Math.max(0, 1 - age / 0.35);
    flash.position.copy(center);
    flash.scale.setScalar(3 + Math.min(1, age / 0.08) * 22);
    flash.material.opacity = blink * blink;
    light.position.copy(center);
    light.intensity = BLAST_LIGHT * Math.max(0, 1 - age / 1.6) ** 2;

    for (const puff of fire) {
      const t = Math.max(0, age - puff.delay);
      const push = 1 - Math.exp(-t * 3.2);
      puff.sprite.position.copy(center).addScaledVector(puff.direction, puff.reach * push);
      puff.sprite.scale.setScalar(puff.size * (0.35 + push * 1.25));
      puff.sprite.material.rotation = puff.reach * 2 + t * 0.4;
      // White-hot, then orange, then a deep red as it burns out.
      const cooling = Math.min(1, t / 1.8);
      color.copy(hot).lerp(warm, Math.min(1, cooling * 2.2)).lerp(cool, Math.max(0, cooling * 1.6 - 0.6));
      puff.sprite.material.color.copy(color);
      puff.sprite.material.opacity = t <= 0 ? 0 : Math.min(0.8, t * 20) * Math.max(0, 1 - t / 2.6);
    }
    for (const puff of smoke) {
      const t = Math.max(0, age - puff.delay);
      const push = 1 - Math.exp(-t * 1.1);
      puff.sprite.position.copy(center).addScaledVector(puff.direction, puff.reach * push);
      puff.sprite.scale.setScalar(puff.size * (0.5 + push * 1.4));
      puff.sprite.material.rotation = puff.size + t * 0.15;
      puff.sprite.material.opacity = t <= 0 ? 0 : Math.min(0.75, t * 1.5) * Math.max(0, 1 - t / 8);
    }

    // The ring faces the camera and races outward, thinning as it goes.
    for (const [mesh, reach, life] of [[ring, 7, 1.1], [ringOuter, 10, 0.8]] as const) {
      mesh.position.copy(center);
      mesh.lookAt(viewer);
      const k = Math.min(1, age / life);
      mesh.scale.setScalar(0.4 + (1 - (1 - k) ** 3) * reach);
      (mesh.material as MeshBasicMaterial).opacity = age > life ? 0 : 0.7 * (1 - k) ** 1.5;
    }

    sparkVelocity.forEach((velocity, i) => {
      // Sparks start just outside the blast and slow very little in vacuum.
      spot.copy(center).addScaledVector(velocity, 0.08 + age * 0.85);
      sparkPositions.set([spot.x, spot.y, spot.z], i * 3);
    });
    sparkGeometry.attributes.position!.needsUpdate = true;
    sparkMaterial.opacity = Math.max(0, 1 - age / 1.8);
    sparks.visible = age < 1.8;

    for (const { piece, direction, speed, spin } of debris) {
      piece.position.copy(center).addScaledVector(direction, 0.9 + speed * age);
      piece.rotation.set(spin.x * age, spin.y * age, spin.z * age);
    }
  };
}

/** Small white jets and puffs where the pod's explosive bolts fire. */
function pyroPuffs(scene: Scene): (at: Vector3, out: Vector3, age: number) => void {
  let seed = 5;
  const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const puffs = Array.from({ length: PYRO_PUFFS }, () => {
    const sprite = new Sprite(new SpriteMaterial({ map: billowTexture(), color: 0xe6e8f0, transparent: true, depthWrite: false, opacity: 0 }));
    sprite.visible = false;
    scene.add(sprite);
    return { sprite, spread: scatter(random).multiplyScalar(0.8), speed: 1 + random() * 2.5 };
  });
  const spot = new Vector3();
  return (at, out, age) => {
    for (const { sprite, spread, speed } of puffs) {
      sprite.visible = age >= 0 && age < 1.6;
      if (!sprite.visible) continue;
      spot.copy(out).add(spread).normalize();
      sprite.position.copy(at).addScaledVector(spot, (1 - Math.exp(-age * 3)) * speed);
      sprite.scale.setScalar(0.4 + age * 1.6);
      sprite.material.opacity = Math.max(0, 0.85 - age * 0.55);
    }
  };
}

export function createSpaceSet(): SpaceSet {
  const scene = new Scene();
  scene.background = new Color(0x020308);
  scene.add(stars());
  const moonCenter = new Vector3(10, -95, -110);
  const moon = new Mesh(new IcosahedronGeometry(MOON_RADIUS, 7), new MeshStandardMaterial({ map: moonTexture(), roughness: 1 }));
  moon.position.copy(moonCenter);
  // A faint rim of scattered light keeps the Moon's dark side from vanishing into space.
  const moonRim = new Mesh(new IcosahedronGeometry(MOON_RADIUS * 1.012, 6), new MeshBasicMaterial({ color: 0x6f7cae, transparent: true, opacity: 0.08, depthWrite: false, side: DoubleSide, blending: AdditiveBlending }));
  moonRim.position.copy(moonCenter);
  const earth = new Mesh(new IcosahedronGeometry(14, 5), new MeshStandardMaterial({ color: 0x2d6cc0, emissive: 0x16305a, emissiveIntensity: 0.4, roughness: 0.6 }));
  earth.position.set(-170, 90, -420);
  earth.add(new Mesh(new IcosahedronGeometry(14.8, 5), new MeshBasicMaterial({ color: 0x7fc0ff, transparent: true, opacity: 0.2, depthWrite: false })));
  const sun = new DirectionalLight(0xfff0dc, 2.6);
  sun.position.set(-80, 60, 120);
  scene.add(moon, moonRim, earth, sun, new HemisphereLight(0x8a9cff, 0x000000, 0.18));

  const rocket = rocketModel();
  for (let i = 0; i < 30; i += 1) rocket.setBuild(0.25, false, i / 30, 1 / 30);
  const ship = rocket.ship;
  ship.removeFromParent();
  ship.position.set(0, 0, 0);
  rocket.flame.visible = false;
  const engine = flame(4.2, 0.6);
  engine.root.position.y = -0.6;
  ship.add(engine.root);
  const engineLight = new PointLight(0xffa050, 0, 18, 1.8);
  engineLight.position.y = -1.6;
  ship.add(engineLight);
  const arcMeshes = arcs();
  ship.add(...arcMeshes);
  // The arcs throw flickering blue light over the hull.
  const arcLight = new PointLight(0x8fdcff, 0, 9, 1.6);
  arcLight.position.y = DRIVE_HEIGHT + 0.4;
  ship.add(arcLight);
  const trail = fireTrail(scene);
  const blowout = explosion(scene);
  const pyro = pyroPuffs(scene);
  scene.add(ship);

  const pod = landerModel();
  pod.flame.visible = false;
  const podEngine = flame(2.8, 0.42);
  podEngine.root.position.y = 0.15;
  pod.root.add(podEngine.root);
  const podLight = new PointLight(0xffa050, 0, 10, 1.8);
  podLight.position.y = -0.6;
  pod.root.add(podLight);
  scene.add(pod.root);

  const drive = new Vector3();
  const blastOrigin = new Vector3();
  const blastDrift = new Vector3();
  const podRelease = new Vector3();
  const podOut = new Vector3();
  let blasted = false;
  let ejected = false;

  return {
    scene,
    ship,
    pod,
    moonCenter,
    moonRadius: MOON_RADIUS,
    update(time, { spark, sinceBlast, sinceEject, engine: burning, podThrust, heading, shipVelocity, viewer }) {
      arcMeshes.forEach((arc, i) => {
        // Arcs crackle on and off; the worse the drive, the more of them at once.
        arc.visible = sinceBlast < 0 && spark > 0 && Math.sin(time * (23 + i * 7) + i * 2.1) > 1 - spark * 1.6;
      });
      const lit = arcMeshes.filter((arc) => arc.visible).length;
      arcLight.intensity = lit * 6 * (0.6 + Math.random() * 0.4);
      engine.set(burning, time, burning ? 1 - spark * 0.35 * Math.random() : 0);
      engineLight.intensity = burning ? 12 + Math.sin(time * 37) * 2 : 0;
      podEngine.set(podThrust > 0, time, podThrust);
      podLight.intensity = podThrust * 10;

      ship.localToWorld(drive.set(0, DRIVE_HEIGHT, 0));
      if (sinceBlast >= 0 && !blasted) {
        blasted = true;
        blastOrigin.copy(drive);
        blastDrift.copy(shipVelocity).multiplyScalar(0.85);
      }
      if (sinceBlast < 0) blasted = false;
      blowout(blastOrigin, blastDrift, viewer, blasted ? sinceBlast : -1);
      trail(drive, heading.clone().negate(), sinceBlast);

      if (sinceEject >= 0 && !ejected) {
        ejected = true;
        podRelease.copy(pod.root.position);
        podOut.copy(pod.root.position).sub(drive).setLength(1);
      }
      if (sinceEject < 0) ejected = false;
      pyro(podRelease, podOut, ejected ? sinceEject : -1);
    },
  };
}
