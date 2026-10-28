import { PLANETS } from "./planets";
import { readSave } from "./platform";

export const SETTINGS_KEY = "starhop.settings.v1";

/** Player preferences and one-time flags, kept apart from the game save so "New game" keeps them. */
export interface Settings {
  muted: boolean;
  /** Ambient soundtrack; on unless the player turned it off. */
  music: boolean;
  /** Phone vibration on big moments; on unless the player turned it off. */
  vibration: boolean;
  /** The Moon's opening cinematic has been watched. */
  introSeen: boolean;
  /** Planets (other than the Moon) whose arrival cinematic has been watched. */
  arrivals: string[];
  tutorialDone: boolean;
  tips: string[];
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

export function loadSettings(): Settings {
  try {
    const data = JSON.parse(readSave(SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
    return {
      muted: data.muted === true,
      music: data.music !== false,
      vibration: data.vibration !== false,
      introSeen: data.introSeen === true,
      arrivals: strings(data.arrivals),
      tutorialDone: data.tutorialDone === true,
      tips: strings(data.tips),
    };
  } catch (error) {
    console.error(JSON.stringify({ scope: "settings", action: "parse", message: String(error) }));
    return { muted: false, music: true, vibration: true, introSeen: false, arrivals: [], tutorialDone: false, tips: [] };
  }
}

export function arrivalSeen(settings: Settings, planetId: string): boolean {
  return planetId === PLANETS[0]?.id ? settings.introSeen : settings.arrivals.includes(planetId);
}
