import { BufferAttribute, BufferGeometry, Color, FogExp2, Points, PointsMaterial, type Scene } from "three";
import type { PlanetDef } from "../planets/types";
import type { GameState } from "../sim/state";

const BASE_FOG_DENSITY = 0.016;
const STORM_FOG_DENSITY = 0.042;
const WARNING_INTENSITY = 0.3;
const FADE_PER_SECOND = 0.6;
const PARTICLE_COUNT = 900;
const FIELD_HALF_WIDTH = 16;
const FIELD_HEIGHT = 6;
const WIND = { x: 11, z: 3.5 } as const;

export interface StormView {
  sync(state: GameState, dt: number, time: number): void;
  /** 0 when calm, 1 at the height of a storm. */
  intensity(): number;
}

/**
 * Dust storms: fog thickens and turns the colour of the planet's dust, and a cloud of grains
 * streams past the player. Planets without storms keep their normal fog and pay nothing.
 */
export function createStormView(scene: Scene, planet: PlanetDef): StormView {
  const fog = new FogExp2(planet.palette.fog, BASE_FOG_DENSITY);
  const sky = new Color(planet.palette.sky);
  scene.fog = fog;
  scene.background = sky.clone();
  let level = 0;
  if (!planet.storms) return { sync: () => undefined, intensity: () => 0 };

  const baseFog = new Color(planet.palette.fog);
  const dust = new Color(planet.palette.dust);
  const dustSky = dust.clone().multiplyScalar(0.55);
  const positions = new Float32Array(PARTICLE_COUNT * 3);
  for (let i = 0; i < PARTICLE_COUNT; i += 1) {
    positions[i * 3] = (Math.random() * 2 - 1) * FIELD_HALF_WIDTH;
    positions[i * 3 + 1] = Math.random() * FIELD_HEIGHT;
    positions[i * 3 + 2] = (Math.random() * 2 - 1) * FIELD_HALF_WIDTH;
  }
  const geometry = new BufferGeometry();
  const attribute = new BufferAttribute(positions, 3);
  geometry.setAttribute("position", attribute);
  const material = new PointsMaterial({ color: dust, size: 0.14, transparent: true, opacity: 0, depthWrite: false });
  const grains = new Points(geometry, material);
  grains.frustumCulled = false;
  grains.visible = false;
  scene.add(grains);

  function wrap(value: number, half: number): number {
    if (value > half) return value - half * 2;
    if (value < -half) return value + half * 2;
    return value;
  }

  return {
    sync(state, dt, time) {
      const target = state.storm.phase === "raging" ? 1 : state.storm.phase === "warning" ? WARNING_INTENSITY : 0;
      level += Math.sign(target - level) * Math.min(Math.abs(target - level), dt * FADE_PER_SECOND);
      fog.density = BASE_FOG_DENSITY + level * (STORM_FOG_DENSITY - BASE_FOG_DENSITY);
      fog.color.copy(baseFog).lerp(dust, level);
      (scene.background as Color).copy(sky).lerp(dustSky, level);

      grains.visible = level > 0.01;
      if (!grains.visible) return;
      material.opacity = level * 0.85;
      grains.position.set(state.player.x, 0, state.player.z);
      const gust = 0.75 + Math.sin(time * 1.7) * 0.25;
      for (let i = 0; i < PARTICLE_COUNT; i += 1) {
        const k = i * 3;
        positions[k] = wrap((positions[k] ?? 0) + WIND.x * gust * dt, FIELD_HALF_WIDTH);
        positions[k + 1] = ((positions[k + 1] ?? 0) + Math.sin(time * 3 + i) * dt * 0.6 + FIELD_HEIGHT) % FIELD_HEIGHT;
        positions[k + 2] = wrap((positions[k + 2] ?? 0) + WIND.z * gust * dt, FIELD_HALF_WIDTH);
      }
      attribute.needsUpdate = true;
    },
    intensity: () => level,
  };
}
