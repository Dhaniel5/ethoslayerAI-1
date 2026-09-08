// Native (Capacitor) helpers. Every function is a safe no-op on the web,
// so the existing browser build and Netlify deploy behave exactly as before.

import { Capacitor } from "@capacitor/core";

export const isNative = () => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const nativePlatform = () => {
  try {
    return Capacitor.getPlatform();
  } catch {
    return "web";
  }
};

/** Status bar + splash screen styling to match the EthosLayer brand. */
export async function initNativeChrome() {
  if (!isNative()) return;
  try {
    const { StatusBar, Style } = await import("@capacitor/status-bar");
    await StatusBar.setStyle({ style: Style.Dark });
    if (nativePlatform() === "android") {
      await StatusBar.setBackgroundColor({ color: "#080d17" });
    }
  } catch {
    /* plugin unavailable */
  }
  try {
    const { SplashScreen } = await import("@capacitor/splash-screen");
    await SplashScreen.hide();
  } catch {
    /* plugin unavailable */
  }
}

/* ------------------------------------------------------------------ */
/* Secure storage: Capacitor Preferences natively, localStorage on web */
/* ------------------------------------------------------------------ */

export async function secureSet(key: string, value: string) {
  if (isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.set({ key, value });
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage blocked */
  }
}

export async function secureGet(key: string): Promise<string | null> {
  if (isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      const { value } = await Preferences.get({ key });
      return value ?? null;
    } catch {
      /* fall through */
    }
  }
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function secureRemove(key: string) {
  if (isNative()) {
    try {
      const { Preferences } = await import("@capacitor/preferences");
      await Preferences.remove({ key });
      return;
    } catch {
      /* fall through */
    }
  }
  try {
    localStorage.removeItem(key);
  } catch {
    /* storage blocked */
  }
}

/* ------------------------------------------------------------------ */
/* Biometric unlock (optional extra layer in front of existing auth)   */
/* ------------------------------------------------------------------ */

export const BIOMETRIC_PREF_KEY = "ethoslayer.biometric.enabled";

type BiometricModule = {
  NativeBiometric: {
    isAvailable: () => Promise<{ isAvailable: boolean }>;
    verifyIdentity: (opts: Record<string, unknown>) => Promise<void>;
  };
};

async function loadBiometric(): Promise<BiometricModule | null> {
  if (!isNative()) return null;
  try {
    // Optional plugin: install with `npm i capacitor-native-biometric` before
    // building natively. Absent on web, so this import stays dynamic.
    return (await import(/* @vite-ignore */ "capacitor-native-biometric")) as unknown as BiometricModule;
  } catch {
    return null;
  }
}

export async function biometricAvailable(): Promise<boolean> {
  const mod = await loadBiometric();
  if (!mod) return false;
  try {
    const res = await mod.NativeBiometric.isAvailable();
    return !!res.isAvailable;
  } catch {
    return false;
  }
}

/** Returns true when unlocked (or when biometrics aren't applicable). */
export async function biometricUnlock(reason = "Unlock EthosLayer"): Promise<boolean> {
  const mod = await loadBiometric();
  if (!mod) return true;
  try {
    await mod.NativeBiometric.verifyIdentity({
      reason,
      title: "EthosLayer",
      subtitle: "Confirm it's you",
    });
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/* Push notifications scaffolding (escrow status updates)              */
/* ------------------------------------------------------------------ */

export const PUSH_TOKEN_KEY = "ethoslayer.push.token";

export async function registerPushNotifications(
  onToken?: (token: string) => void,
  onNotificationTap?: (data: Record<string, unknown>) => void,
) {
  if (!isNative()) return;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    let perm = await PushNotifications.checkPermissions();
    if (perm.receive !== "granted") perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return;

    await PushNotifications.addListener("registration", async (token) => {
      await secureSet(PUSH_TOKEN_KEY, token.value);
      onToken?.(token.value);
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", (action) => {
      onNotificationTap?.((action.notification.data ?? {}) as Record<string, unknown>);
    });
    await PushNotifications.register();
  } catch {
    /* plugin unavailable */
  }
}
