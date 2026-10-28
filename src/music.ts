/** Procedural ambient soundtrack: slow pad chords, a low drone and sparse echoing bell notes. No audio files. */

import type { PlanetDef } from "./planets/types";

export type MusicMood = PlanetDef["music"];

interface Mood {
  /** Chords as MIDI note numbers; one plays per bar. */
  readonly chords: readonly (readonly number[])[];
  /** Notes the bells pick from. */
  readonly bells: readonly number[];
  /** Pad brightness: low-pass cutoff in Hz. */
  readonly cutoff: number;
  /** Chance that a bell plays on each beat. */
  readonly bellChance: number;
}

const MOODS: Record<MusicMood, Mood> = {
  // A minor, open and floaty.
  moon: {
    chords: [[57, 60, 64, 67, 71], [53, 57, 60, 64], [48, 52, 55, 59, 64], [55, 59, 62, 64]],
    bells: [69, 72, 74, 76, 79, 81, 84],
    cutoff: 1100,
    bellChance: 0.32,
  },
  // D minor, lower and dustier.
  mars: {
    chords: [[50, 53, 57, 64], [46, 50, 53, 57], [43, 46, 50, 53], [45, 50, 52, 57]],
    bells: [62, 65, 67, 69, 72, 74],
    cutoff: 720,
    bellChance: 0.26,
  },
};

const BAR_SECONDS = 9.6;
const BEATS_PER_BAR = 6;
const LOOKAHEAD_SECONDS = 1.2;
const SCHEDULE_MS = 300;
const PAD_LEVEL = 0.05;
const DRONE_LEVEL = 0.07;
const BELL_LEVEL = 0.05;
const MUSIC_LEVEL = 0.55;
const FADE_SECONDS = 1.5;

function frequency(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export interface Music {
  setEnabled(enabled: boolean): void;
  setMood(mood: MusicMood): void;
}

/** Starts the scheduler on `ctx`; everything plays into `destination` through its own fader. */
export function createMusic(ctx: AudioContext, destination: AudioNode, enabled: boolean, initialMood: MusicMood): Music {
  const fader = ctx.createGain();
  fader.gain.value = enabled ? MUSIC_LEVEL : 0;
  fader.connect(destination);

  // A long feedback echo gives the bells their sense of space.
  const echo = ctx.createDelay(2);
  echo.delayTime.value = BAR_SECONDS / BEATS_PER_BAR / 1.5;
  const feedback = ctx.createGain();
  feedback.gain.value = 0.42;
  const echoTone = ctx.createBiquadFilter();
  echoTone.type = "lowpass";
  echoTone.frequency.value = 2200;
  echo.connect(echoTone).connect(feedback).connect(echo);
  echoTone.connect(fader);

  let mood = MOODS[initialMood];
  let on = enabled;
  let bar = 0;
  let nextBarAt = ctx.currentTime + 0.2;
  let lastBell = -1;

  function voice(type: OscillatorType, hz: number, detune: number, start: number, end: number, output: AudioNode): void {
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = hz;
    osc.detune.value = detune;
    osc.connect(output);
    osc.start(start);
    osc.stop(end);
  }

  function pad(notes: readonly number[], start: number): void {
    const length = BAR_SECONDS * 1.25;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(mood.cutoff * 0.6, start);
    filter.frequency.linearRampToValueAtTime(mood.cutoff, start + length * 0.5);
    filter.frequency.linearRampToValueAtTime(mood.cutoff * 0.6, start + length);
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.linearRampToValueAtTime(PAD_LEVEL, start + 3);
    envelope.gain.setValueAtTime(PAD_LEVEL, start + length - 4);
    envelope.gain.linearRampToValueAtTime(0.0001, start + length);
    filter.connect(envelope).connect(fader);
    for (const note of notes) {
      voice("triangle", frequency(note), -6, start, start + length, filter);
      voice("sine", frequency(note), 7, start, start + length, filter);
    }
    const root = notes[0] ?? 45;
    const drone = ctx.createGain();
    drone.gain.setValueAtTime(0.0001, start);
    drone.gain.linearRampToValueAtTime(DRONE_LEVEL, start + 2.5);
    drone.gain.setValueAtTime(DRONE_LEVEL, start + length - 3);
    drone.gain.linearRampToValueAtTime(0.0001, start + length);
    drone.connect(fader);
    voice("sine", frequency(root - 12), 0, start, start + length, drone);
  }

  function bell(start: number): void {
    // Avoid repeating the same note twice in a row; it sounds like a stuck key.
    let index = Math.floor(Math.random() * mood.bells.length);
    if (index === lastBell) index = (index + 1) % mood.bells.length;
    lastBell = index;
    const note = mood.bells[index] ?? 72;
    const envelope = ctx.createGain();
    envelope.gain.setValueAtTime(0.0001, start);
    envelope.gain.exponentialRampToValueAtTime(BELL_LEVEL, start + 0.02);
    envelope.gain.exponentialRampToValueAtTime(0.0001, start + 2.8);
    envelope.connect(fader);
    envelope.connect(echo);
    voice("sine", frequency(note), 0, start, start + 3, envelope);
    voice("sine", frequency(note + 12), 4, start, start + 1.2, envelope);
  }

  function schedule(): void {
    if (!on || ctx.state !== "running") return;
    // After a pause or a suspended tab, start the next bar from now instead of firing a backlog.
    if (nextBarAt < ctx.currentTime) nextBarAt = ctx.currentTime + 0.2;
    while (nextBarAt < ctx.currentTime + LOOKAHEAD_SECONDS) {
      const chord = mood.chords[bar % mood.chords.length] ?? [];
      pad(chord, nextBarAt);
      for (let beat = 1; beat < BEATS_PER_BAR; beat += 1) {
        if (Math.random() < mood.bellChance) bell(nextBarAt + (beat * BAR_SECONDS) / BEATS_PER_BAR);
      }
      bar += 1;
      nextBarAt += BAR_SECONDS;
    }
  }

  window.setInterval(() => {
    try {
      schedule();
    } catch (error) {
      console.error(JSON.stringify({ scope: "music", message: String(error) }));
      on = false;
    }
  }, SCHEDULE_MS);

  return {
    setEnabled(next) {
      on = next;
      fader.gain.setTargetAtTime(on ? MUSIC_LEVEL : 0, ctx.currentTime, FADE_SECONDS / 3);
    },
    setMood(next) {
      mood = MOODS[next];
    },
  };
}
