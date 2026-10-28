/** Tiny synthesised sound kit — no audio files to load or license. */

import { createMusic, type Music, type MusicMood } from "./music";

export type Cue = "mine" | "pickup" | "drop" | "coin" | "pay" | "build" | "error" | "warning" | "impact" | "alarm" | "objective" | "upgrade" | "launch" | "wind" | "thud";

interface Tone {
  frequency: number;
  endFrequency?: number;
  duration: number;
  type: OscillatorType;
  gain: number;
  delay?: number;
}

const CUES: Record<Cue, Tone[]> = {
  mine: [{ frequency: 900, endFrequency: 1400, duration: 0.05, type: "square", gain: 0.035 }],
  pickup: [{ frequency: 520, endFrequency: 820, duration: 0.07, type: "triangle", gain: 0.14 }],
  drop: [{ frequency: 360, endFrequency: 240, duration: 0.07, type: "triangle", gain: 0.16 }],
  coin: [
    { frequency: 1318, duration: 0.06, type: "triangle", gain: 0.1 },
    { frequency: 1975, duration: 0.12, type: "triangle", gain: 0.1, delay: 0.05 },
  ],
  pay: [{ frequency: 740, endFrequency: 780, duration: 0.04, type: "sine", gain: 0.08 }],
  build: [
    { frequency: 392, duration: 0.12, type: "triangle", gain: 0.16 },
    { frequency: 523, duration: 0.12, type: "triangle", gain: 0.16, delay: 0.1 },
    { frequency: 784, duration: 0.3, type: "triangle", gain: 0.16, delay: 0.2 },
  ],
  error: [{ frequency: 170, duration: 0.14, type: "square", gain: 0.05 }],
  warning: [
    { frequency: 880, endFrequency: 660, duration: 0.18, type: "sawtooth", gain: 0.06 },
    { frequency: 880, endFrequency: 660, duration: 0.18, type: "sawtooth", gain: 0.06, delay: 0.25 },
  ],
  impact: [{ frequency: 120, endFrequency: 40, duration: 0.6, type: "sawtooth", gain: 0.22 }],
  thud: [{ frequency: 95, endFrequency: 45, duration: 0.28, type: "sine", gain: 0.2 }],
  alarm: [
    { frequency: 660, duration: 0.12, type: "square", gain: 0.06 },
    { frequency: 660, duration: 0.12, type: "square", gain: 0.06, delay: 0.2 },
    { frequency: 660, duration: 0.12, type: "square", gain: 0.06, delay: 0.4 },
  ],
  objective: [
    { frequency: 659, duration: 0.1, type: "sine", gain: 0.14 },
    { frequency: 988, duration: 0.22, type: "sine", gain: 0.14, delay: 0.09 },
  ],
  upgrade: [
    { frequency: 523, endFrequency: 1046, duration: 0.25, type: "triangle", gain: 0.14 },
  ],
  launch: [{ frequency: 70, endFrequency: 30, duration: 3.5, type: "sawtooth", gain: 0.25 }],
  wind: [
    { frequency: 110, endFrequency: 190, duration: 1.4, type: "sawtooth", gain: 0.05 },
    { frequency: 190, endFrequency: 90, duration: 1.6, type: "sawtooth", gain: 0.04, delay: 1.2 },
  ],
};

export interface AudioKit {
  unlock(): void;
  play(cue: Cue): void;
  setHum(level: number): void;
  setMuted(muted: boolean): void;
  readonly isMuted: () => boolean;
  setMusic(on: boolean): void;
  readonly isMusicOn: () => boolean;
  setMood(mood: MusicMood): void;
  /** Silence everything while an ad plays, without touching the player's own settings. */
  setDucked(ducked: boolean): void;
}

const MASTER_LEVEL = 0.8;

export function createAudio(initiallyMuted: boolean, initiallyMusic: boolean): AudioKit {
  let context: AudioContext | null = null;
  let master: GainNode | null = null;
  let humGain: GainNode | null = null;
  let music: Music | null = null;
  let muted = initiallyMuted;
  let musicOn = initiallyMusic;
  let ducked = false;
  let mood: MusicMood = "moon";

  function applyMaster(): void {
    if (context && master) master.gain.setTargetAtTime(muted || ducked ? 0 : MASTER_LEVEL, context.currentTime, 0.05);
  }

  function startHum(ctx: AudioContext, destination: AudioNode): GainNode {
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (Math.random() < 0.02 ? 1 : 0.35);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 420;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(destination);
    source.start();
    return gain;
  }

  function unlock(): void {
    if (context) {
      if (context.state === "suspended") context.resume().catch((error: unknown) => console.warn(String(error)));
      return;
    }
    try {
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = muted || ducked ? 0 : MASTER_LEVEL;
      master.connect(context.destination);
      humGain = startHum(context, master);
      music = createMusic(context, master, musicOn, mood);
    } catch (error) {
      console.warn(JSON.stringify({ scope: "audio", message: String(error) }));
      context = null;
    }
  }

  function play(cue: Cue): void {
    if (!context || !master || muted || ducked) return;
    const now = context.currentTime;
    for (const tone of CUES[cue]) {
      const start = now + (tone.delay ?? 0);
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = tone.type;
      osc.frequency.setValueAtTime(tone.frequency, start);
      if (tone.endFrequency) osc.frequency.exponentialRampToValueAtTime(tone.endFrequency, start + tone.duration);
      gain.gain.setValueAtTime(tone.gain, start);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.duration);
      osc.connect(gain).connect(master);
      osc.start(start);
      osc.stop(start + tone.duration + 0.02);
    }
  }

  return {
    unlock,
    play,
    setHum(level: number) {
      if (!context || !humGain) return;
      humGain.gain.setTargetAtTime(Math.min(0.05, level * 0.025), context.currentTime, 0.3);
    },
    setMuted(next: boolean) {
      muted = next;
      applyMaster();
    },
    isMuted: () => muted,
    setMusic(next: boolean) {
      musicOn = next;
      music?.setEnabled(next);
    },
    isMusicOn: () => musicOn,
    setMood(next: MusicMood) {
      mood = next;
      music?.setMood(next);
    },
    setDucked(next: boolean) {
      ducked = next;
      applyMaster();
    },
  };
}
