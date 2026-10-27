import { createAudio } from "./audio";
import { createGame } from "./game";
import { createHud } from "./hud";
import { createMoveControls } from "./input";
import { MOON } from "./planets/moon";
import { celebrate, initPlatform, readSave, showRewardedAd, signalLoadingFinished, startGameplay, stopGameplay, writeSave } from "./platform";
import { detectQuality } from "./quality";
import { fromSave, toSave } from "./sim/save";
import { createState, type GameState } from "./sim/state";

const SAVE_KEY = "starhop.save.v1";
const SETTINGS_KEY = "starhop.settings.v1";

type Phase = "menu" | "playing" | "paused" | "complete";

interface Settings {
  muted: boolean;
  introSeen: boolean;
  tutorialDone: boolean;
  tips: string[];
}

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function loadState(): GameState {
  const raw = readSave(SAVE_KEY);
  if (!raw) return createState(MOON);
  try {
    return fromSave(MOON, JSON.parse(raw));
  } catch (error) {
    console.error(JSON.stringify({ scope: "save", action: "parse", message: String(error) }));
    return createState(MOON);
  }
}

function loadSettings(): Settings {
  try {
    const data = JSON.parse(readSave(SETTINGS_KEY) ?? "{}") as Record<string, unknown>;
    return {
      muted: data.muted === true,
      introSeen: data.introSeen === true,
      tutorialDone: data.tutorialDone === true,
      tips: Array.isArray(data.tips) ? data.tips.filter((tip): tip is string => typeof tip === "string") : [],
    };
  } catch (error) {
    console.error(JSON.stringify({ scope: "settings", action: "parse", message: String(error) }));
    return { muted: false, introSeen: false, tutorialDone: false, tips: [] };
  }
}

function hasProgress(state: GameState): boolean {
  return state.stats.earned > 0 || state.unlocked.size > 0 || state.stats.mined.ironOre > 0;
}

async function boot(): Promise<void> {
  await initPlatform();
  let state = loadState();
  const settings = loadSettings();
  let phase: Phase = "menu";
  const quality = detectQuality();
  const isTouch = matchMedia("(pointer: coarse)").matches;

  const canvas = requireElement<HTMLCanvasElement>("view");
  const controls = createMoveControls(canvas, requireElement("joystick"), requireElement("joystick-knob"));
  const hud = createHud();
  const audio = createAudio(settings.muted);
  const startScreen = requireElement<HTMLElement>("start-screen");
  const pauseScreen = requireElement<HTMLElement>("pause-screen");
  const completeScreen = requireElement<HTMLElement>("complete-screen");
  const startButton = requireElement<HTMLButtonElement>("start-button");
  const resetButton = requireElement<HTMLButtonElement>("reset-button");
  const muteButton = requireElement<HTMLButtonElement>("mute-button");

  const save = () => writeSave(SAVE_KEY, JSON.stringify(toSave(state)));
  const saveSettings = () => writeSave(SETTINGS_KEY, JSON.stringify(settings));

  const game = createGame(
    canvas,
    state,
    quality,
    controls,
    hud,
    audio,
    { playIntro: !settings.introSeen && !hasProgress(state), tutorialDone: settings.tutorialDone, seenTips: new Set(settings.tips), touch: isTouch },
    {
      onSave: save,
      onLaunched: () => {
        phase = "complete";
        stopGameplay();
        celebrate();
        game.setRunning(false);
        requireElement("complete-stats").textContent = `${state.stats.earned.toLocaleString("en-US")} credits earned · ${state.stats.mined.ironOre + state.stats.mined.ice} resources mined`;
        completeScreen.hidden = false;
        requireElement<HTMLButtonElement>("replay-button").focus();
      },
      onIntroDone: () => {
        settings.introSeen = true;
        saveSettings();
      },
      onTutorialDone: () => {
        settings.tutorialDone = true;
        saveSettings();
      },
      onTipSeen: (id) => {
        settings.tips.push(id);
        saveSettings();
      },
    },
  );

  function play(): void {
    audio.unlock();
    startScreen.hidden = true;
    pauseScreen.hidden = true;
    phase = "playing";
    game.setRunning(true);
    startGameplay();
  }

  function pause(): void {
    if (phase !== "playing") return;
    phase = "paused";
    game.setRunning(false);
    stopGameplay();
    save();
    pauseScreen.hidden = false;
    requireElement<HTMLButtonElement>("resume-button").focus();
  }

  function startOver(): void {
    state = createState(MOON);
    save();
    window.location.reload();
  }

  function showStart(): void {
    startButton.textContent = hasProgress(state) ? "Continue" : "Start mission";
    resetButton.hidden = !hasProgress(state);
    resetButton.textContent = "New game";
    resetButton.dataset.armed = "false";
    requireElement("controls-hint").textContent = isTouch ? "Drag anywhere to walk. Walk into things to use them." : "WASD or arrow keys to walk (or drag with the mouse). Walk into things to use them. Q drops what's on top of your backpack.";
    startScreen.hidden = false;
    startButton.focus();
  }

  function renderMute(): void {
    const muted = audio.isMuted();
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
    muteButton.dataset.muted = String(muted);
  }

  startButton.addEventListener("click", play);
  resetButton.addEventListener("click", () => {
    if (resetButton.dataset.armed !== "true") {
      resetButton.dataset.armed = "true";
      resetButton.textContent = "Tap again to erase your progress";
      return;
    }
    startOver();
  });
  requireElement<HTMLButtonElement>("resume-button").addEventListener("click", play);
  requireElement<HTMLButtonElement>("replay-button").addEventListener("click", startOver);
  requireElement<HTMLButtonElement>("pause-button").addEventListener("click", pause);
  muteButton.addEventListener("click", () => {
    audio.unlock();
    audio.setMuted(!audio.isMuted());
    settings.muted = audio.isMuted();
    saveSettings();
    renderMute();
  });
  hud.onBuy((key, id) => game.buy(key, id));
  hud.onDrop((item) => game.drop(item));
  hud.onCoachOk(() => game.acknowledgeCoach());
  hud.onSkipIntro(() => game.skipIntro());
  hud.onTurbo(() => {
    void game.requestTurbo(showRewardedAd).then(() => {
      if (phase === "playing") startGameplay();
    });
  });
  window.addEventListener("keydown", (event) => {
    if (event.code === "Escape" && game.inIntro() && phase === "playing") {
      game.skipIntro();
      return;
    }
    if (event.code === "Escape" || event.code === "KeyP") pause();
    if (event.code === "KeyQ" && phase === "playing") game.dropTop();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) pause();
  });
  window.addEventListener("pagehide", save);

  renderMute();
  game.setRunning(false);
  if (state.launched) {
    completeScreen.hidden = false;
    phase = "complete";
    requireElement("complete-stats").textContent = `${state.stats.earned.toLocaleString("en-US")} credits earned on the Moon`;
  } else {
    showStart();
  }
  signalLoadingFinished();
}

boot().catch((error: unknown) => {
  console.error(JSON.stringify({ scope: "boot", message: error instanceof Error ? error.message : String(error) }));
  const fallback = document.getElementById("boot-error");
  if (fallback) fallback.hidden = false;
});
