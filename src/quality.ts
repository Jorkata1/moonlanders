/** Picks render settings once at start-up so phones stay smooth and desktops get the full look. */

export interface Quality {
  readonly tier: "high" | "low";
  readonly pixelRatio: number;
  readonly shadowLights: number;
  readonly shadowMapSize: number;
  readonly bloom: boolean;
  readonly msaaSamples: number;
}

const HIGH_MAX_PIXEL_RATIO = 1.75;
const LOW_MAX_PIXEL_RATIO = 1.25;
const LOW_MEMORY_GB = 4;
const LOW_CORE_COUNT = 4;

function isLowEndDevice(): boolean {
  const coarse = matchMedia("(pointer: coarse)").matches;
  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  const cores = navigator.hardwareConcurrency;
  return coarse || (memory !== undefined && memory <= LOW_MEMORY_GB) || (cores > 0 && cores <= LOW_CORE_COUNT);
}

export function detectQuality(): Quality {
  const dpr = window.devicePixelRatio || 1;
  if (isLowEndDevice()) {
    return { tier: "low", pixelRatio: Math.min(dpr, LOW_MAX_PIXEL_RATIO), shadowLights: 1, shadowMapSize: 1024, bloom: false, msaaSamples: 0 };
  }
  return { tier: "high", pixelRatio: Math.min(dpr, HIGH_MAX_PIXEL_RATIO), shadowLights: 3, shadowMapSize: 2048, bloom: true, msaaSamples: 4 };
}
