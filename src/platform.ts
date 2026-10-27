/**
 * Thin wrapper over the CrazyGames SDK v3. Every call is a safe no-op when the SDK
 * is absent (local play, the preview build), so game code never branches on platform.
 */

interface AdCallbacks {
  adStarted?: () => void;
  adFinished?: () => void;
  adError?: (error: unknown) => void;
}

interface CrazyGamesSdk {
  init(): Promise<void>;
  environment?: "local" | "crazygames" | "disabled";
  game: {
    gameplayStart(): void;
    gameplayStop(): void;
    happytime(): void;
    loadingStart?(): void;
    loadingStop?(): void;
  };
  ad: {
    requestAd(type: "midgame" | "rewarded", callbacks: AdCallbacks): void;
  };
  data?: {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
  };
}

declare global {
  interface Window {
    CrazyGames?: { SDK: CrazyGamesSdk };
  }
}

let sdk: CrazyGamesSdk | null = null;
let isGameplayActive = false;

function logPlatformError(action: string, error: unknown): void {
  console.error(JSON.stringify({ scope: "platform", action, message: error instanceof Error ? error.message : String(error) }));
}

export async function initPlatform(): Promise<void> {
  const candidate = window.CrazyGames?.SDK;
  if (!candidate) return;
  try {
    await candidate.init();
    sdk = candidate.environment === "disabled" ? null : candidate;
  } catch (error) {
    logPlatformError("init", error);
    sdk = null;
  }
}

export function signalLoadingFinished(): void {
  try {
    sdk?.game.loadingStop?.();
  } catch (error) {
    logPlatformError("loadingStop", error);
  }
}

export function startGameplay(): void {
  if (isGameplayActive) return;
  isGameplayActive = true;
  try {
    sdk?.game.gameplayStart();
  } catch (error) {
    logPlatformError("gameplayStart", error);
  }
}

export function stopGameplay(): void {
  if (!isGameplayActive) return;
  isGameplayActive = false;
  try {
    sdk?.game.gameplayStop();
  } catch (error) {
    logPlatformError("gameplayStop", error);
  }
}

export function celebrate(): void {
  try {
    sdk?.game.happytime();
  } catch (error) {
    logPlatformError("happytime", error);
  }
}

/** Resolves once the ad has finished, failed, or was never available. Never rejects. */
export function showMidgameAd(): Promise<void> {
  const active = sdk;
  if (!active) return Promise.resolve();
  return new Promise((resolve) => {
    try {
      active.ad.requestAd("midgame", {
        adFinished: () => resolve(),
        adError: (error) => {
          logPlatformError("midgameAd", error);
          resolve();
        },
      });
    } catch (error) {
      logPlatformError("midgameAd", error);
      resolve();
    }
  });
}

/**
 * Rewarded ad. Resolves true when the player watched it to the end. Without the SDK
 * (local preview) the reward is granted so the feature can be tried.
 */
export function showRewardedAd(): Promise<boolean> {
  const active = sdk;
  if (!active) return Promise.resolve(true);
  return new Promise((resolve) => {
    try {
      active.ad.requestAd("rewarded", {
        adStarted: () => stopGameplay(),
        adFinished: () => resolve(true),
        adError: (error) => {
          logPlatformError("rewardedAd", error);
          resolve(false);
        },
      });
    } catch (error) {
      logPlatformError("rewardedAd", error);
      resolve(false);
    }
  });
}

/** Save storage: the SDK's synced data module on CrazyGames, localStorage elsewhere. */
export function readSave(key: string): string | null {
  try {
    return sdk?.data ? sdk.data.getItem(key) : window.localStorage.getItem(key);
  } catch (error) {
    logPlatformError("readSave", error);
    return null;
  }
}

export function writeSave(key: string, value: string): void {
  try {
    if (sdk?.data) sdk.data.setItem(key, value);
    else window.localStorage.setItem(key, value);
  } catch (error) {
    logPlatformError("writeSave", error);
  }
}
