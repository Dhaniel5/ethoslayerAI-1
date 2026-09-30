import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { initNativeChrome, isNative, registerPushNotifications } from "@/lib/native";
import { isWalletCallbackUrl } from "@/lib/deeplinkWallet";

/**
 * Push notifications require a Firebase project wired up on Android
 * (a real android/app/google-services.json). Without it, calling
 * PushNotifications.register() throws a native "Default FirebaseApp is
 * not initialized" exception that crashes the whole app a couple of
 * seconds after launch — before the user can do anything.
 *
 * Flip this to true once google-services.json is added to android/app/
 * and the Firebase Android app's package name matches capacitor.config's
 * appId (app.lovable.p53f285367b5f43f390625f2c04d540c4).
 */
const PUSH_NOTIFICATIONS_ENABLED = false;

/**
 * Runs native-only setup: status bar/splash styling, deep-link routing for
 * shareable escrow links, and push-notification registration.
 * On the web every call is a no-op.
 */
const NativeBootstrap = () => {
  const navigate = useNavigate();

  useEffect(() => {
    if (!isNative()) return;
    let removeListener: (() => void) | undefined;

    initNativeChrome();

    if (PUSH_NOTIFICATIONS_ENABLED) {
      registerPushNotifications(async (token) => {
        try {
          const { saveDeviceToken } = await import("@/lib/push");
          await saveDeviceToken(token);
        } catch {
          /* not signed in yet — the profile screen can link it later */
        }
      }, (data) => {
        const path = typeof data?.path === "string" ? data.path : undefined;
        if (path) navigate(path);
        else if (typeof data?.escrow_id === "string") navigate(`/escrow/${data.escrow_id}`);
      });
    }

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", ({ url }) => {
          if (isWalletCallbackUrl(url)) return; // handled by the wallet adapter's own listener
          try {
            const parsed = new URL(url);
            // ethoslayer://escrow/<id> puts "escrow" in the host, https links
            // from the website put the whole route in the pathname.
            const isScheme = parsed.protocol === "ethoslayer:";
            const path = isScheme
              ? `/${parsed.host}${parsed.pathname}`.replace(/\/+$/, "")
              : parsed.pathname;
            const target = `${path}${parsed.search}${parsed.hash}`;
            if (target && target !== "/") navigate(target);
          } catch {
            /* malformed url */
          }
        });
        removeListener = () => handle.remove();
      } catch {
        /* plugin unavailable */
      }
    })();

    return () => removeListener?.();
  }, [navigate]);

  return null;
};

export default NativeBootstrap;
