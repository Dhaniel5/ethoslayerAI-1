# EthosLayer — Native mobile (iOS / Android) build

The web app is unchanged. Native support is additive via Capacitor.

## One-time setup (on your own machine)

1. Export the project to GitHub and `git pull` it locally.
2. `npm install`
3. Do not open the Lovable preview URL in Chrome/Safari and treat its home-screen shortcut as the native app.
4. `npx cap add ios` and/or `npx cap add android` (only if that platform folder is not already present)
5. `npm run build`
6. `npx cap sync`
7. `npx cap run ios` (needs a Mac + Xcode) or `npx cap run android` (needs Android Studio)

After every `git pull`, run `npm run build && npx cap sync`.

`capacitor.config.ts` has no `server` configuration or remote URL. Installed builds always open
the bundled EthosLayer app from `dist`, rather than a Lovable preview or browser
authentication screen.

If the phone displays a Chrome or Safari address bar, that is the website or a
browser shortcut, not the native Capacitor app. Uninstall that shortcut and the
old test app, then install the newly built app from Xcode or Android Studio.

## Plugins installed

| Plugin | Used for |
| --- | --- |
| `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, `@capacitor/android` | native shell |
| `@capacitor/app` | deep links (`appUrlOpen`) for shareable `/escrow/:id` links |
| `@capacitor/status-bar` | brand-colored status bar |
| `@capacitor/splash-screen` | launch screen |
| `@capacitor/preferences` | native key/value storage (localStorage fallback on web) |
| `@capacitor/push-notifications` | escrow status push scaffolding |
| `@capacitor/keyboard` | on-screen keyboard behaviour |

Optional, install locally only if you want biometric unlock:
`npm i capacitor-native-biometric` — `src/lib/native.ts` already loads it
dynamically and no-ops when it isn't present.

## Deep links (payee escrow links)

Universal / App Links must be registered natively:

- **iOS:** Xcode → Signing & Capabilities → Associated Domains →
  `applinks:ethoslayer.lovable.app`, and host
  `/.well-known/apple-app-site-association` on that domain.
- **Android:** add an `intent-filter` for `https://ethoslayer.lovable.app` with
  `android:autoVerify="true"` in `AndroidManifest.xml`, and host
  `/.well-known/assetlinks.json`.

If the app isn't installed the link opens the web app as it does today.

## Icons & splash

Drop `icon.png` (1024×1024) and `splash.png` (2732×2732) in `resources/` and run
`npx @capacitor/assets generate` to produce all iOS/Android sizes.
