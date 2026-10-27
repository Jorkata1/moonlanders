import type { Vec2 } from './planets/types';

/** Playable area radius around the base, in world units. */
export const WORLD_RADIUS = 34;

export const PLAYER_RADIUS = 0.45;

/** Seconds between units harvested by hand from a deposit. */
export const HARVEST_INTERVAL = 0.36;
/** Seconds between single-item transfers to/from machines and pads. */
export const TRANSFER_INTERVAL = 0.075;

export const MACHINE_BODY_RADIUS = 1.45;
export const MACHINE_INTERACT_RADIUS = 2.75;
export const MACHINE_INPUT_CAPACITY = 20;
export const MACHINE_OUTPUT_CAPACITY = 24;
export const MACHINE_MAX_LEVEL = 3;
/** Each level above 1 adds this fraction of base production speed. */
export const MACHINE_SPEED_PER_LEVEL = 0.6;
/** Processors at or above this level pull input automatically from their feeder. */
export const AUTO_FEED_MIN_LEVEL = 2;
export const AUTO_FEED_INTERVAL = 0.6;

export const PAD_RADIUS = 1.0;
export const UPGRADE_PAD_OFFSET: Vec2 = { x: 2.4, z: 2.4 };

/** Recycler bin that discards unwanted backpack items, relative to the rocket. */
export const RECYCLER_OFFSET: Vec2 = { x: 4.2, z: -1.2 };
export const RECYCLER_RADIUS = 0.9;

export const ROCKET_BODY_RADIUS = 1.5;
export const ROCKET_INTERACT_RADIUS = 3.0;
export const STATION_BODY_RADIUS = 0.95;
/** Suit upgrade pads, relative to the suit station: capacity, speed, oxygen. */
export const SUIT_PAD_OFFSETS: readonly Vec2[] = [
  { x: -1.4, z: 2.6 },
  { x: 1.0, z: 2.9 },
  { x: 3.0, z: 1.2 },
];

export const OXYGEN_DRAIN_PER_SECOND = 1;
export const OXYGEN_REFILL_PER_SECOND = 22;
export const OXYGEN_LOW_RATIO = 0.3;

export const AUTOSAVE_INTERVAL_SECONDS = 5;
/** Frame delta cap so a backgrounded tab does not simulate a huge jump. */
export const MAX_FRAME_DT = 0.1;
export const LAUNCH_DURATION_SECONDS = 3.4;

/** Camera yaw around the Y axis; 45° gives the classic isometric framing. */
export const CAMERA_YAW = Math.PI / 4;
