import { AdditiveBlending, Box3, Group, Mesh, MeshBasicMaterial, TorusGeometry, Vector3, type Object3D, type Scene } from "three";
import { PADS } from "../config";
import type { BuildKind, PlanetDef, Point } from "../planets/types";
import { orderLabel, orderProgress, orderSite } from "../sim/orders";
import { buildDef, distance, type GameState, type OrderState } from "../sim/state";
import type { HologramIcon } from "./holograms";
import { createMaterialsBoard } from "./materialsBoard";
import { createPad } from "./pads";

const BOARD_HEIGHT = 1.9;
const SCAN_SECONDS = 2.2;
/** The scan ring hugs the ghost's footprint, within these radii. */
const SCAN_MIN_RADIUS = 0.8;
const SCAN_MAX_RADIUS = 1.8;
const BUILD_ICONS: Record<BuildKind, HologramIcon> = { workbench: "wrench", machine: "gear", machineUpgrade: "gear", robot: "robot", drone: "drone", drill: "drill", jumpDrive: "rocket" };

export interface OrderSiteView {
  sync(state: GameState, time: number): void;
}

function iconFor(state: GameState, order: OrderState): HologramIcon {
  if (order.kind === "suit") return "suit";
  const build = buildDef(state.planet, order.targetId);
  if (order.kind === "stage") return build?.kind === "drone" ? "drone" : "robot";
  return build ? BUILD_ICONS[build.kind] : "build";
}

/**
 * The active order: a see-through ghost of what is being built where it will stand, and a pad
 * with a board listing every material and how much has arrived.
 */
export function createOrderSite(scene: Scene, planet: PlanetDef, place: (object: Object3D, point: Point) => void, modelOf: (buildId: string) => Object3D | null): OrderSiteView {
  const ghostMaterial = new MeshBasicMaterial({ color: 0x4de3ff, transparent: true, opacity: 0.3, blending: AdditiveBlending, depthWrite: false });
  const scanMaterial = new MeshBasicMaterial({ color: 0x9ff4ff, transparent: true, opacity: 0.7, blending: AdditiveBlending, depthWrite: false });
  const pads = new Map<HologramIcon, ReturnType<typeof createPad>>();
  const board = createMaterialsBoard();
  board.sprite.position.y = BOARD_HEIGHT;
  let ghost: Group | null = null;
  const scan = new Mesh(new TorusGeometry(1, 0.03, 6, 48), scanMaterial);
  scan.rotation.x = Math.PI / 2;
  let ghostHeight = 1;
  let key = "";

  function padFor(icon: HologramIcon) {
    const existing = pads.get(icon);
    if (existing) return existing;
    const pad = createPad("pay", PADS.radius, 2.4, true, icon);
    pad.root.visible = false;
    scene.add(pad.root);
    pads.set(icon, pad);
    return pad;
  }

  function clearGhost(): void {
    ghost?.removeFromParent();
    scan.removeFromParent();
    ghost = null;
  }

  /** A hologram copy of the build's own model, if it has one. */
  function makeGhost(order: OrderState): void {
    clearGhost();
    if (order.kind !== "build") return;
    const build = buildDef(planet, order.targetId);
    const source = build && build.kind !== "jumpDrive" && build.kind !== "machineUpgrade" ? modelOf(build.id) : null;
    if (!build || !source) return;
    const copy = source.clone(true);
    copy.visible = true;
    copy.scale.setScalar(1);
    copy.traverse((object) => {
      object.visible = true;
      if (object instanceof Mesh) {
        object.material = ghostMaterial;
        object.castShadow = false;
        object.receiveShadow = false;
      }
      if (object.type === "Sprite" || object.type === "PointLight") object.visible = false;
    });
    ghost = new Group();
    ghost.add(copy);
    place(copy, build);
    const bounds = new Box3().setFromObject(copy);
    const size = bounds.getSize(new Vector3());
    ghostHeight = Math.max(0.6, size.y);
    scan.scale.setScalar(Math.min(SCAN_MAX_RADIUS, Math.max(SCAN_MIN_RADIUS, Math.max(size.x, size.z) * 0.55)));
    scan.position.set((bounds.min.x + bounds.max.x) / 2, bounds.min.y, (bounds.min.z + bounds.max.z) / 2);
    scan.userData.base = bounds.min.y;
    ghost.add(scan);
    scene.add(ghost);
  }

  return {
    sync(state, time) {
      const order = state.order;
      const nextKey = order ? `${order.kind}:${order.targetId}` : "";
      if (nextKey !== key) {
        key = nextKey;
        for (const pad of pads.values()) pad.root.visible = false;
        board.sprite.removeFromParent();
        if (order) {
          const pad = padFor(iconFor(state, order));
          pad.root.visible = true;
          place(pad.root, orderSite(state, order));
          pad.root.add(board.sprite);
          makeGhost(order);
        } else {
          clearGhost();
        }
      }
      if (!order) return;
      const pad = padFor(iconFor(state, order));
      const rows = orderProgress(state);
      const needed = rows.reduce((sum, row) => sum + row.needed, 0);
      const delivered = rows.reduce((sum, row) => sum + Math.min(row.delivered, row.needed), 0);
      pad.setProgress(needed > 0 ? delivered / needed : 1);
      pad.setActive(distance(state.player, orderSite(state, order)) <= PADS.radius, time);
      board.set(orderLabel(state, order), rows);
      ghostMaterial.opacity = 0.22 + Math.sin(time * 3) * 0.06 + (needed > 0 ? (delivered / needed) * 0.2 : 0);
      if (ghost) scan.position.y = (scan.userData.base as number) + ((time / SCAN_SECONDS) % 1) * ghostHeight;
    },
  };
}
