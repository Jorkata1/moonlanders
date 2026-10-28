/** Line icons for upgrade cards (24×24, stroked like the HUD's other icons). */

export type UpgradeIcon = "boots" | "backpack" | "drill" | "oxygen" | "speed" | "cargo" | "haggle";

const PATHS: Record<UpgradeIcon, string> = {
  boots: '<path d="M7 3h5v9l6 2a3 3 0 0 1 2 3v2H4V3z"/><path d="M4 15h16"/><path d="M2 21l2-2"/><path d="M6 21l2-2"/>',
  backpack: '<path d="M6 8a6 6 0 0 1 12 0v12H6z"/><path d="M9 4V3h6v1"/><path d="M9 14h6v6H9z"/>',
  drill: '<path d="M3 10h9l3-3h3v10h-3l-3-3H3z"/><path d="M18 12h4"/><path d="M6 14v6"/>',
  oxygen: '<rect x="7" y="6" width="10" height="16" rx="5"/><path d="M12 2v4"/><path d="M9 2h6"/><path d="M10 13h4"/>',
  speed: '<path d="M4 18a8 8 0 1 1 16 0"/><path d="m12 18 4-6"/><path d="M8 12.5 7 11.5"/>',
  cargo: '<path d="M3 7l9-4 9 4v10l-9 4-9-4z"/><path d="M3 7l9 4 9-4"/><path d="M12 11v10"/>',
  haggle: '<path d="M3 12V3h9l9 9-9 9z"/><circle cx="7.5" cy="7.5" r="1.5"/><path d="m10 16 6-6"/>',
};

export function upgradeIconSvg(icon: UpgradeIcon): string {
  return `<svg class="upgrade-icon" viewBox="0 0 24 24" aria-hidden="true">${PATHS[icon]}</svg>`;
}

export const WORKSHOP_ICONS: Record<"speed" | "capacity" | "mining" | "oxygen", UpgradeIcon> = { speed: "boots", capacity: "backpack", mining: "drill", oxygen: "oxygen" };
export const ROBOT_ICONS: Record<"speed" | "capacity" | "mining", UpgradeIcon> = { speed: "speed", capacity: "cargo", mining: "drill" };
export const DRONE_ICONS: Record<"speed" | "capacity" | "haggle", UpgradeIcon> = { speed: "speed", capacity: "cargo", haggle: "haggle" };
