export const SoundId = {
  Harvest: 'harvest',
  Deposit: 'deposit',
  Collect: 'collect',
  Pay: 'pay',
  Build: 'build',
  Upgrade: 'upgrade',
  Warning: 'warning',
  Depleted: 'depleted',
  Ready: 'ready',
  Launch: 'launch',
  Click: 'click',
} as const;
export type SoundId = (typeof SoundId)[keyof typeof SoundId];

const MUTE_KEY = 'moonlanders:muted';
const MASTER_VOLUME = 0.35;
/** Rapid-fire sounds (item transfers) are throttled to avoid a buzz. */
const MIN_REPEAT_SECONDS: Partial<Record<SoundId, number>> = {
  harvest: 0.09,
  deposit: 0.06,
  collect: 0.06,
  pay: 0.06,
};

interface ToneSpec {
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly duration: number;
  readonly type?: OscillatorType;
  readonly volume?: number;
  readonly delay?: number;
}

function readMuted(): boolean {
  try {
    return window.localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

/** Tiny Web Audio synth: every effect is generated, so there are no audio files to load. */
export class Sfx {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly lastPlayed = new Map<SoundId, number>();
  private muted = readMuted();

  get isMuted(): boolean {
    return this.muted;
  }

  /** Must be called from a user gesture: browsers block audio until then. */
  unlock(): void {
    try {
      if (!this.context) {
        this.context = new AudioContext();
        this.master = this.context.createGain();
        this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
        this.master.connect(this.context.destination);
      }
      if (this.context.state === 'suspended') void this.context.resume();
    } catch (error) {
      console.warn('[moonlanders] Audio unavailable.', error);
      this.context = null;
    }
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : MASTER_VOLUME;
    try {
      window.localStorage.setItem(MUTE_KEY, muted ? '1' : '0');
    } catch (error) {
      console.warn('[moonlanders] Could not persist mute setting.', error);
    }
  }

  play(id: SoundId): void {
    const context = this.context;
    if (!context || this.muted || context.state !== 'running') return;
    const now = context.currentTime;
    const minGap = MIN_REPEAT_SECONDS[id] ?? 0;
    if (now - (this.lastPlayed.get(id) ?? -Infinity) < minGap) return;
    this.lastPlayed.set(id, now);

    for (const tone of this.tonesFor(id)) this.playTone(context, tone);
    if (id === SoundId.Launch) this.playNoise(context, 3.2);
  }

  private tonesFor(id: SoundId): ToneSpec[] {
    const pitchJitter = 1 + (Math.random() - 0.5) * 0.08;
    switch (id) {
      case SoundId.Harvest:
        return [{ frequency: 180 * pitchJitter, endFrequency: 90, duration: 0.07, type: 'square', volume: 0.12 }];
      case SoundId.Deposit:
      case SoundId.Pay:
        return [{ frequency: 520 * pitchJitter, endFrequency: 380, duration: 0.06, type: 'triangle', volume: 0.2 }];
      case SoundId.Collect:
        return [{ frequency: 660 * pitchJitter, endFrequency: 880, duration: 0.06, type: 'triangle', volume: 0.2 }];
      case SoundId.Build:
        return [523, 659, 784, 1047].map((frequency, index) => ({ frequency, duration: 0.14, type: 'triangle', volume: 0.3, delay: index * 0.08 }));
      case SoundId.Upgrade:
        return [440, 554, 659].map((frequency, index) => ({ frequency, duration: 0.12, type: 'square', volume: 0.15, delay: index * 0.07 }));
      case SoundId.Warning:
        return [0, 0.22].map((delay) => ({ frequency: 880, duration: 0.12, type: 'sawtooth', volume: 0.12, delay }));
      case SoundId.Depleted:
        return [{ frequency: 400, endFrequency: 80, duration: 0.8, type: 'sawtooth', volume: 0.2 }];
      case SoundId.Ready:
        return [784, 988, 1175, 1568].map((frequency, index) => ({ frequency, duration: 0.18, type: 'sine', volume: 0.3, delay: index * 0.1 }));
      case SoundId.Launch:
        return [{ frequency: 60, endFrequency: 220, duration: 3.2, type: 'sawtooth', volume: 0.18 }];
      case SoundId.Click:
        return [{ frequency: 900, duration: 0.03, type: 'square', volume: 0.08 }];
    }
  }

  private playTone(context: AudioContext, tone: ToneSpec): void {
    if (!this.master) return;
    const start = context.currentTime + (tone.delay ?? 0);
    const end = start + tone.duration;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = tone.type ?? 'sine';
    oscillator.frequency.setValueAtTime(tone.frequency, start);
    if (tone.endFrequency) oscillator.frequency.exponentialRampToValueAtTime(tone.endFrequency, end);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(tone.volume ?? 0.2, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, end);
    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(end + 0.02);
  }

  private playNoise(context: AudioContext, duration: number): void {
    if (!this.master) return;
    const buffer = context.createBuffer(1, Math.floor(context.sampleRate * duration), context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 600;
    const gain = context.createGain();
    gain.gain.value = 0.35;
    source.connect(filter).connect(gain).connect(this.master);
    source.start();
  }
}
