import { supabase } from "@/integrations/supabase/client";
import { isNative, nativePlatform, PUSH_TOKEN_KEY, secureGet } from "@/lib/native";

/** Store this phone's push token against the signed-in account. */
export async function saveDeviceToken(token: string) {
  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId || !token) return;
  await (supabase as any)
    .from("device_tokens")
    .upsert(
      { user_id: userId, token, platform: nativePlatform(), updated_at: new Date().toISOString() },
      { onConflict: "user_id,token" },
    );
}

export type PushStatus = {
  native: boolean;
  platform: string;
  permission: "granted" | "denied" | "prompt" | "unavailable";
  token: string | null;
  registeredInCloud: boolean;
};

export async function getPushStatus(): Promise<PushStatus> {
  const base: PushStatus = {
    native: isNative(),
    platform: nativePlatform(),
    permission: "unavailable",
    token: null,
    registeredInCloud: false,
  };
  if (!isNative()) return base;

  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.checkPermissions();
    base.permission = (perm.receive as PushStatus["permission"]) ?? "prompt";
  } catch {
    base.permission = "unavailable";
  }

  base.token = await secureGet(PUSH_TOKEN_KEY);

  if (base.token) {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      const { count } = await (supabase as any)
        .from("device_tokens")
        .select("id", { count: "exact", head: true })
        .eq("user_id", data.user.id)
        .eq("token", base.token);
      base.registeredInCloud = (count ?? 0) > 0;
    }
  }
  return base;
}

/** Ask for permission again (e.g. from the profile screen). */
export async function requestPushPermission(): Promise<boolean> {
  if (!isNative()) return false;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== "granted") return false;
    await PushNotifications.register();
    return true;
  } catch {
    return false;
  }
}
