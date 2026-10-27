export const RESOURCE_IDS = [
  'regolith',
  'ice',
  'metal',
  'fuel',
  'ironOre',
  'silica',
  'steel',
  'silicon',
  'circuit',
  'brine',
  'crystal',
  'hydrogen',
  'lens',
  'warpCore',
] as const;

export type ResourceId = (typeof RESOURCE_IDS)[number];

/** Sparse resource counts. Missing keys mean zero. */
export type ResourceBag = Partial<Record<ResourceId, number>>;

export interface ResourceInfo {
  readonly name: string;
  readonly color: number;
}

export const RESOURCES: Readonly<Record<ResourceId, ResourceInfo>> = {
  regolith: { name: 'Regolith', color: 0xa39e94 },
  ice: { name: 'Ice', color: 0x9fe3ff },
  metal: { name: 'Metal Plate', color: 0xdfe5ee },
  fuel: { name: 'Rocket Fuel', color: 0xff8c2a },
  ironOre: { name: 'Iron Ore', color: 0xb5532f },
  silica: { name: 'Silica Sand', color: 0xf0d58c },
  steel: { name: 'Steel', color: 0x8193ad },
  silicon: { name: 'Silicon', color: 0x6a63e8 },
  circuit: { name: 'Circuit', color: 0x2fcf7a },
  brine: { name: 'Brine Ice', color: 0x7fe0d2 },
  crystal: { name: 'Crystal', color: 0xd36cff },
  hydrogen: { name: 'Hydrogen', color: 0x4a86ff },
  lens: { name: 'Focus Lens', color: 0xfff27a },
  warpCore: { name: 'Warp Core', color: 0xff4fa3 },
};

const RESOURCE_ID_SET: ReadonlySet<string> = new Set(RESOURCE_IDS);

export function isResourceId(value: unknown): value is ResourceId {
  return typeof value === 'string' && RESOURCE_ID_SET.has(value);
}

export function resourceName(id: ResourceId): string {
  return RESOURCES[id].name;
}

export function resourceColorCss(id: ResourceId): string {
  return `#${RESOURCES[id].color.toString(16).padStart(6, '0')}`;
}
