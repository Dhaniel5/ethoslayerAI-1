import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.p53f285367b5f43f390625f2c04d540c4",
  appName: "EthosLayer",
  webDir: "dist",
  // The installed app runs the bundled `dist` build — no remote URL.
  // For live-reload during development only, run:
  //   npx cap run ios --live-reload  (or android)
  // Do NOT re-add a `server.url` pointing at the Lovable preview: an installed
  // app would then just load a website and break offline/native behaviour.
  server: {
    androidScheme: "https",
    iosScheme: "https",
  },
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
