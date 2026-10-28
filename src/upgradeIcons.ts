/** Line icons for panel cards (24×24, stroked like the HUD's other icons). */

import type { SuitUpgradeId } from "./config";
import type { BuildKind } from "./planets/types";

export type UpgradeIcon = "boots" | "backpack" | "drill" | "oxygen" | "bench" | "furnace" | "robot" | "drone" | "rig" | "flask" | "rocket" | "stage";

const PATHS: Record<UpgradeIcon, string> = {
  boots: '<path d="M7 3h5v9l6 2a3 3 0 0 1 2 3v2H4V3z"/><path d="M4 15h16"/><path d="M2 21l2-2"/><path d="M6 21l2-2"/>',
  backpack: '<path d="M6 8a6 6 0 0 1 12 0v12H6z"/><path d="M9 4V3h6v1"/><path d="M9 14h6v6H9z"/>',
  drill: '<path d="M3 10h9l3-3h3v10h-3l-3-3H3z"/><path d="M18 12h4"/><path d="M6 14v6"/>',
  oxygen: '<rect x="7" y="6" width="10" height="16" rx="5"/><path d="M12 2v4"/><path d="M9 2h6"/><path d="M10 13h4"/>',
  bench: '<path d="M3 11h18v3H3z"/><path d="M5 14v6"/><path d="M19 14v6"/><path d="M8 11V6h8v5"/>',
  furnace: '<path d="M5 21V8l7-5 7 5v13z"/><circle cx="12" cy="14" r="3"/><path d="M17 3v4"/>',
  robot: '<rect x="5" y="8" width="14" height="10" rx="2"/><path d="M12 4v4"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M7 18v3"/><path d="M17 18v3"/>',
  drone: '<circle cx="12" cy="12" r="3"/><circle cx="5" cy="5" r="2.5"/><circle cx="19" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="m7 7 3 3"/><path d="m17 7-3 3"/><path d="m7 17 3-3"/><path d="m17 17-3-3"/>',
  rig: '<path d="M3 18h12v3H3z"/><path d="M5 18v-6h6v6"/><path d="M11 13l7-5"/><path d="m18 8 3 2-2 3"/>',
  flask: '<path d="M9 3h6"/><path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7 15h10"/>',
  rocket: '<path d="M12 2c3 3 4 7 4 11l-4 4-4-4c0-4 1-8 4-11z"/><circle cx="12" cy="10" r="1.5"/><path d="M8 13l-3 3 2 2"/><path d="M16 13l3 3-2 2"/><path d="M11 20l1 2 1-2"/>',
  stage: '<path d="m6 13 6-6 6 6"/><path d="m6 19 6-6 6 6"/>',
};

export function upgradeIconSvg(icon: UpgradeIcon): string {
  return `<svg class="upgrade-icon" viewBox="0 0 24 24" aria-hidden="true">${PATHS[icon]}</svg>`;
}

export const SUIT_ICONS: Record<SuitUpgradeId, UpgradeIcon> = { mining: "drill", capacity: "backpack", oxygen: "oxygen", speed: "boots" };

export function buildIcon(kind: BuildKind, machineId?: string): UpgradeIcon {
  switch (kind) {
    case "workbench":
      return "bench";
    case "machine":
    case "machineUpgrade":
      return machineId === "smelter" ? "furnace" : "flask";
    case "robot":
      return "robot";
    case "drone":
      return "drone";
    case "drill":
      return "rig";
    case "jumpDrive":
      return "rocket";
  }
}
