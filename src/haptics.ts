/** Short phone vibrations for big moments. Silently does nothing where vibration is unsupported. */

let enabled = true;

export function setVibrationEnabled(next: boolean): void {
  enabled = next;
}

export function isVibrationEnabled(): boolean {
  return enabled;
}

/** Vibrate for `pattern` milliseconds (or an on/off pattern), if the device and the player allow it. */
export function vibrate(pattern: number | readonly number[]): void {
  if (!enabled || typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  try {
    navigator.vibrate(typeof pattern === "number" ? pattern : [...pattern]);
  } catch (error) {
    console.error(JSON.stringify({ scope: "haptics", message: String(error) }));
  }
}
