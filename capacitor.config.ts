import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.p53f285367b5f43f390625f2c04d540c4",
  appName: "EthosLayer",
  webDir: "dist",
  // No `server` configuration is allowed here. Native releases must always
  // load the app files copied into the iOS/Android package from `dist`.
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 700,
      backgroundColor: "#080d17",
      showSpinner: false,
      androidScaleType: "CENTER_CROP",
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
  ios: {
    contentInset: "always",
  },
};

export default config;
