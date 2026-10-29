import {
  AdditiveBlending,
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
export interface SpaceSet {
  readonly scene: Scene;
  /** The rocket hull; it lives in this scene, not the world. */
  readonly ship: Group;
  readonly pod: LanderModel;
  /** Where the Moon's surface would be hit falling from the ship, for the camera to frame. */
  readonly moonCenter: Vector3;
  /**
   * `spark` 0..1 is how badly the jump drive arcs, `blast` 0..1 the blowout flash, `burning`
   * whether the hull trails fire, `debris` seconds since the blowout (negative before it).
   */
  update(time: number, spark: number, blast: number, burning: boolean, debris: number): void;
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

/** A trail of puffs from `from` along `direction`, growing and fading. */
function plume(from: Vector3, direction: Vector3, count: number, length: number, color: number, size: number, opacity: number): Group {
  const group = new Group();
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1);
    const material = new SpriteMaterial({ map: puffTexture(), color, transparent: true, opacity: opacity * (1 - t * 0.8), depthWrite: false, blending: AdditiveBlending });
    const sprite = new Sprite(material);
    sprite.position.copy(from).addScaledVector(direction, t * length).add(new Vector3(Math.sin(i * 2.3) * t * 0.5, 0, Math.cos(i * 1.7) * t * 0.5));
    sprite.scale.setScalar(size * (0.6 + t * 2.2));
    group.add(sprite);
  }
  return group;
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
  rocket.flame.visible = true;
  rocket.flame.scale.set(1.4, 2.2, 1.4);
  const arcMeshes = arcs();
  ship.add(...arcMeshes);
  const fire = plume(new Vector3(0, -1.4, 0), new Vector3(0, -1, 0), 14, 9, 0xff8a3a, 1.1, 0.85);
  ship.add(fire);
  const flash = new Sprite(new SpriteMaterial({ map: puffTexture(), color: 0xbff4ff, transparent: true, opacity: 0, depthWrite: false, blending: AdditiveBlending }));
  flash.position.set(0, 0.8, 0);
  ship.add(flash);
  scene.add(ship);

  // Hull plates and sparks thrown off by the blowout.
  const debris = Array.from({ length: DEBRIS_COUNT }, (_, i) => {
    const piece = box(0.2 + (i % 3) * 0.1, 0.04, 0.16, surface({ color: i % 4 === 0 ? 0xff7a1f : 0xe8ebf0, roughness: 0.5 }), 0, 0, 0, 0.01);
    const angle = (i / DEBRIS_COUNT) * Math.PI * 2;
    piece.userData.velocity = new Vector3(Math.sin(angle) * 1.6, 0.6 + Math.cos(i * 1.3) * 0.8, Math.cos(angle) * 1.6);
    piece.visible = false;
    scene.add(piece);
    return piece;
  });

  const pod = landerModel();
  pod.flame.visible = true;
  pod.root.visible = false;
  scene.add(pod.root);

  return {
    scene,
    ship,
    pod,
    moonCenter,
    update(time, spark, blast, burning, debrisAge) {
      arcMeshes.forEach((arc, i) => {
        // Arcs crackle on and off; the worse the drive, the more of them at once.
        arc.visible = spark > 0 && Math.sin(time * (23 + i * 7) + i * 2.1) > 1 - spark * 1.6;
      });
      flash.material.opacity = blast;
      flash.scale.setScalar(2 + blast * 9);
      fire.visible = burning;
      rocket.flame.visible = !burning;
      for (const piece of debris) {
        piece.visible = debrisAge > 0;
        if (!piece.visible) continue;
        piece.position.copy(ship.position).addScaledVector(piece.userData.velocity as Vector3, debrisAge).add(new Vector3(0, 0.8, 0));
        piece.rotation.set(debrisAge * 4, debrisAge * 3, 0);
      }
    },
  };
}
