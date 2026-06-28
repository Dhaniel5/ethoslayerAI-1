## Goal

Make "Connect Wallet" work on phones. Today the project only registers `PhantomWalletAdapter`, which is the **desktop browser extension**. On a phone there is no extension, so the button does nothing useful — the user has to be inside Phantom's in-app browser for it to work. We will fix this by adding the **Solana Mobile Wallet Adapter** plus mobile deeplink fallbacks, so the Connect button works from any normal mobile browser (Safari/Chrome) and bounces the user into their wallet app to approve.

## What changes

### 1. Add wallet packages
Install these into the existing wallet-adapter setup:

- `@solana-mobile/wallet-adapter-mobile` — official Solana Mobile Wallet Adapter; handles Android association + iOS deeplinks under one adapter.
- `@solana/wallet-adapter-solflare` — popular alternative; its adapter supports a mobile deeplink fallback when no extension is detected.
- (keep `@solana/wallet-adapter-phantom` — still used on desktop)

### 2. Update `src/providers/SolanaWalletProvider.tsx`

Register adapters conditionally:

```text
wallets = [
  new SolanaMobileWalletAdapter({
    appIdentity: { name: "EthosLayer", uri: window.location.origin, icon: "/favicon.ico" },
    authorizationResultCache: createDefaultAuthorizationResultCache(),
    cluster: SOLANA_CLUSTER,
    chain: SOLANA_CLUSTER === "mainnet-beta" ? "solana:mainnet" : "solana:devnet",
    onWalletNotFound: createDefaultWalletNotFoundHandler(),
  }),
  new PhantomWalletAdapter(),
  new SolflareWalletAdapter({ network: SOLANA_CLUSTER }),
]
```

Solana Mobile Wallet Adapter auto-activates on Android. On iOS it falls back to the wallet's own deeplink, and Phantom/Solflare adapters expose their own mobile deeplink behavior when no extension is present.

### 3. Better mobile UX in `WalletConnectButton.tsx`

- Detect mobile + absence of `window.phantom?.solana`.
- If detected and the user picks Phantom from the modal but it isn't installed, show a toast with a "Open in Phantom" button that links to:
  `https://phantom.app/ul/browse/<encoded current URL>?ref=<encoded origin>`
  This deeplinks them into Phantom's in-app browser pre-loaded on our site, where the extension-style connection works.
- Same fallback path for Solflare via its `https://solflare.com/ul/v1/browse/...` URL.

### 4. Polyfills / Vite config sanity check

Mobile Wallet Adapter pulls in some Node-style globals. Verify `vite.config.ts` already defines `global: "globalThis"` and the `Buffer` shim used by the existing Solana code. If missing, add them — otherwise the bundle errors on phones.

### 5. No backend or business-logic changes

- Escrow creation, release, edge functions, AUDD transfer logic are untouched.
- The vault address, RPC config, and `useWallet()` consumer code (`CreateEscrowDialog`, release flows) keep working — they only see "a connected wallet" regardless of how the user got there.

## Out of scope

- Building a true native app via Capacitor (separate, much larger effort).
- Adding WalletConnect — Solana Mobile Wallet Adapter already covers the same ground for Solana wallets.
- Any visual/theming changes to the wallet modal beyond what wallet-adapter-react-ui ships.

## How to verify after build

1. Open the preview on a phone (no Phantom extension). Tap **Connect Wallet** → modal lists Phantom / Solflare / Mobile Wallet Adapter. Picking Phantom on iOS deeplinks into the Phantom app and returns connected; on Android, Mobile Wallet Adapter handles it natively.
2. Open on desktop with Phantom extension installed → still connects via the extension, no regression.
3. Connected wallet address appears in the header and auto-fills the payer field in **Create Escrow**, exactly as it does today.