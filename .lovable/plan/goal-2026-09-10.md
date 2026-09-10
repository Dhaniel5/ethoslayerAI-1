## Goal
Make the installed iOS and Android builds open EthosLayer itself, not a Lovable preview or authentication screen, and make the phone view feel like an installed app.

## Changes
1. Rebuild the web bundle and sync it into both native projects so each contains its own app files and Capacitor configuration.
2. Confirm no native configuration points to a Lovable preview URL; keep public web links only where an external wallet must open them.
3. Refine phone-only navigation and first-screen spacing for safe areas and touch use, while leaving desktop unchanged.
4. Verify the bundled native files, mobile browser rendering, and launch configuration.

## Technical details
- Keep `webDir: "dist"` and no `server.url` in Capacitor configuration.
- Run the existing Capacitor sync workflow to populate Android assets and the iOS public bundle.
- Preserve existing routes, backend behavior, escrow logic, and wallet transfer logic.
