import { createAudio } from "./audio";
import { setVibrationEnabled } from "./haptics";
import { createGame, type Game } from "./game";
import { createHud } from "./hud";
import { createMoveControls } from "./input";
import { PLANETS } from "./planets";
import { celebrate, initPlatform, readSave, showRewardedAd, signalLoadingFinished, startGameplay, stopGameplay, writeSave } from "./platform";
import { detectQuality } from "./quality";
import { completeText, renderRoute, startEyebrow, startText, totalMined } from "./screens";
import { restoreGame, toSave } from "./sim/save";
import { arrivalSeen, loadSettings, SETTINGS_KEY } from "./settings";
import { createState, type GameState } from "./sim/state";
import { startNextPlanet } from "./sim/travel";

const SAVE_KEY = "starhop.save.v1";

type Phase = "menu" | "playing" | "paused" | "complete";

function requireElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing element #${id}`);
  return element as T;
}

function firstPlanetState(): GameState {
  const first = PLANETS[0];
  if (!first) throw new Error("No planets defined");
  return createState(first);
}

/** Load the saved game; a save made right after lift-off continues on the next planet. */
function loadState(): GameState {
  const raw = readSave(SAVE_KEY);
  if (!raw) return firstPlanetState();
  try {
    const state = restoreGame(JSON.parse(raw));
    return state.launched ? (startNextPlanet(state) ?? state) : state;
  } catch (error) {
    console.error(JSON.stringify({ scope: "save", action: "parse", message: String(error) }));
    return firstPlanetState();
  }
}

function hasProgress(state: GameState): boolean {
  return state.built.size > 0 || totalMined(state) > 0;
}

async function boot(): Promise<void> {
  await initPlatform();
  // Opening the game with #cuts reviews the intro cut by cut, on a fresh Moon, without touching the saved game.
  const reviewIntro = window.location.hash === "#cuts";
  let state = reviewIntro ? firstPlanetState() : loadState();
  const settings = loadSettings();
  let phase: Phase = "menu";
  const quality = detectQuality();
  const isTouch = matchMedia("(pointer: coarse)").matches;

  const canvas = requireElement<HTMLCanvasElement>("view");
  const controls = createMoveControls(canvas, requireElement("joystick"), requireElement("joystick-knob"));
  const hud = createHud();
  const audio = createAudio(settings.muted, settings.music);
  setVibrationEnabled(settings.vibration);
  const startScreen = requireElement<HTMLElement>("start-screen");
  const pauseScreen = requireElement<HTMLElement>("pause-screen");
  const completeScreen = requireElement<HTMLElement>("complete-screen");
  const startButton = requireElement<HTMLButtonElement>("start-button");
  const resetButton = requireElement<HTMLButtonElement>("reset-button");
  const muteButton = requireElement<HTMLButtonElement>("mute-button");
  const musicButton = requireElement<HTMLButtonElement>("music-button");
  const musicSetting = requireElement<HTMLButtonElement>("music-setting");
  const vibrationSetting = requireElement<HTMLButtonElement>("vibration-setting");

  const save = () => {
    if (!reviewIntro) writeSave(SAVE_KEY, JSON.stringify(toSave(state)));
  };
  const saveSettings = () => {
    if (!reviewIntro) writeSave(SETTINGS_KEY, JSON.stringify(settings));
  };

  function showComplete(): void {
    phase = "complete";
    const text = completeText(state);
    requireElement("complete-eyebrow").textContent = text.eyebrow;
    requireElement("complete-text").textContent = text.text;
    requireElement("complete-stats").textContent = text.stats;
    completeScreen.hidden = false;
    requireElement<HTMLButtonElement>("replay-button").focus();
  }

  /** After lift-off: land on the next planet, or show the end screen if there is none yet. */
  function travelOn(): void {
    const next = startNextPlanet(state);
    if (!next) {
      stopGameplay();
      celebrate();
      game.setRunning(false);
      showComplete();
      return;
    }
    // Called from inside the old game's frame; swap planets once that frame has finished.
    queueMicrotask(() => {
      game.setRunning(false);
      game.dispose();
      state = next;
      save();
      hud.flash();
      game = buildGame();
      game.setRunning(true);
    });
  }

  function buildGame(): Game {
    audio.setMood(state.planet.music);
    canvas.setAttribute("aria-label", `Starhop: your astronaut on ${state.planet.phrase}, seen from above`);
    return createGame(
      canvas,
      state,
      quality,
      controls,
      hud,
      audio,
      { playIntro: reviewIntro || (!arrivalSeen(settings, state.planet.id) && !hasProgress(state)), reviewIntro, tutorialDone: settings.tutorialDone, seenTips: new Set(settings.tips), touch: isTouch },
      {
        onSave: save,
        onLaunched: travelOn,
        onIntroDone: () => {
          if (state.planet.id === PLANETS[0]?.id) settings.introSeen = true;
          else if (!settings.arrivals.includes(state.planet.id)) settings.arrivals.push(state.planet.id);
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
  }

  let game = buildGame();

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
    state = firstPlanetState();
    save();
    window.location.reload();
  }

  function showStart(): void {
    requireElement("start-eyebrow").textContent = startEyebrow(state.planet);
    requireElement("start-text").textContent = startText(state.planet);
    renderRoute(requireElement("planet-row"), state.planet);
    const progressed = hasProgress(state) || state.planet.id !== PLANETS[0]?.id;
    startButton.textContent = reviewIntro ? "Review intro cuts" : progressed ? "Continue" : "Start mission";
    resetButton.hidden = !progressed;
    resetButton.textContent = "New game";
    resetButton.dataset.armed = "false";
    requireElement("controls-hint").textContent = isTouch ? "Drag anywhere to walk. Walk into things to use them." : "WASD or arrow keys to walk (or drag with the mouse). Walk into things to use them. Q drops what's on top of your backpack.";
    startScreen.hidden = false;
    startButton.focus();
  }

  function renderSound(): void {
    const muted = audio.isMuted();
    muteButton.setAttribute("aria-pressed", String(muted));
    muteButton.setAttribute("aria-label", muted ? "Turn sound on" : "Mute sound");
    muteButton.dataset.muted = String(muted);
    const music = audio.isMusicOn();
    musicButton.setAttribute("aria-pressed", String(music));
    musicButton.setAttribute("aria-label", music ? "Turn music off" : "Turn music on");
    musicButton.dataset.on = String(music);
    musicSetting.setAttribute("aria-checked", String(music));
    vibrationSetting.setAttribute("aria-checked", String(settings.vibration));
  }

  function toggleMusic(): void {
    audio.unlock();
    audio.setMusic(!audio.isMusicOn());
    settings.music = audio.isMusicOn();
    saveSettings();
    renderSound();
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
    renderSound();
  });
  musicButton.addEventListener("click", toggleMusic);
  musicSetting.addEventListener("click", toggleMusic);
  // Desktop Chrome reports vibration support too, so only offer the switch on touch devices.
  vibrationSetting.hidden = !isTouch || typeof navigator.vibrate !== "function";
  vibrationSetting.addEventListener("click", () => {
    settings.vibration = !settings.vibration;
    setVibrationEnabled(settings.vibration);
    saveSettings();
    renderSound();
  });
  hud.onOrder((key, id) => game.order(key, id));
  hud.onToggle((key) => game.toggle(key));
  hud.onDrop((item) => game.drop(item));
  hud.onCoachOk(() => game.acknowledgeCoach());
  hud.onSkipIntro(() => game.skipIntro());
  hud.onTurbo(() => {
    const watchAd = async (): Promise<boolean> => {
      audio.setDucked(true);
      try {
        return await showRewardedAd();
      } finally {
        audio.setDucked(false);
      }
    };
    void game.requestTurbo(watchAd).then(() => {
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

  renderSound();
  game.setRunning(false);
  if (state.launched) showComplete();
  else showStart();
  signalLoadingFinished();
}

boot().catch((error: unknown) => {
  console.error(JSON.stringify({ scope: "boot", message: error instanceof Error ? error.message : String(error) }));
  const fallback = document.getElementById("boot-error");
  if (fallback) fallback.hidden = false;
});
