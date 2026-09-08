import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { initNativeChrome, isNative, registerPushNotifications } from "@/lib/native";

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

    registerPushNotifications(undefined, (data) => {
      const path = typeof data?.path === "string" ? data.path : undefined;
      if (path) navigate(path);
      else if (typeof data?.escrow_id === "string") navigate(`/escrow/${data.escrow_id}`);
    });

    (async () => {
      try {
        const { App } = await import("@capacitor/app");
        const handle = await App.addListener("appUrlOpen", ({ url }) => {
          try {
            const parsed = new URL(url);
            const target = `${parsed.pathname}${parsed.search}${parsed.hash}`;
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
