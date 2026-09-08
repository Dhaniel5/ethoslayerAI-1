import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.p53f285367b5f43f390625f2c04d540c4",
  appName: "EthosLayer",
  webDir: "dist",
  // Hot-reload from the hosted preview while developing on a device.
  // Remove or comment out the `server` block to bundle the local `dist` build.
  server: {
    url: "https://53f28536-7b5f-43f3-9062-5f2c04d540c4.lovableproject.com?forceHideBadge=true",
    cleartext: true,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
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
