/**
 * Phantom/Solflare "app-to-app" deeplink Connect protocol.
 *
 * Neither wallet's standard wallet-adapter works inside our native Capacitor
 * WebView: the browser-extension adapters (`@solana/wallet-adapter-phantom`,
 * `-solflare`) need an injected `window.solana`/`window.solflare` that only
 * exists in a real browser or the wallet's own in-app browser, and Solana
 * Mobile Wallet Adapter's JS transport refuses to run outside a recognized
 * mobile browser (it throws "This browser appears to be incompatible with
 * mobile wallet adapter").
 *
 * The protocol both wallets actually support for native/non-browser apps is
 * documented at https://docs.phantom.com/phantom-deeplinks and
 * https://docs.solflare.com/solflare/technical/deeplinks — a dapp generates
 * an ephemeral x25519 keypair, opens a `connect` deeplink, and the wallet
 * redirects straight back into the app (via our own `ethoslayer://` custom
 * scheme — already registered in AndroidManifest.xml for escrow share
 * links) with an encrypted payload containing the connected public key and
 * a session token. Subsequent signing requests follow the same
 * encrypt → deeplink → redirect-back → decrypt shape.
 *
 * This never has the app "browse" to a hosted copy of itself (the earlier,
 * broken approach) — everything round-trips through the OS's own intent
 * system via a custom URI scheme, so there's no dependency on any website
 * being live.
 */

import { App } from "@capacitor/app";
import {
  BaseSignerWalletAdapter,
  WalletConnectionError,
  WalletDisconnectionError,
  WalletNotConnectedError,
  WalletReadyState,
  WalletSignTransactionError,
  type WalletName,
} from "@solana/wallet-adapter-base";
import { PublicKey, Transaction } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { isNative } from "@/lib/native";

/** The live, reachable production build — safe to send wallets to for
 * metadata/session validation. Never point this at a preview URL that can
 * go stale or unpublished. */
export const PUBLIC_APP_URL = "https://ethoslayers.netlify.app";

const REDIRECT_HOST = {
  connect: "wallet-connect",
  sign: "wallet-sign",
  disconnect: "wallet-disconnect",
} as const;

function redirectUrl(host: string) {
  return `ethoslayer://${host}`;
}

/** True for any deeplink our own wallet adapters are waiting on — lets
 * NativeBootstrap's router skip these instead of treating them as an
 * in-app route to navigate to. */
export function isWalletCallbackUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "ethoslayer:" && Object.values(REDIRECT_HOST).includes(parsed.host as (typeof REDIRECT_HOST)[keyof typeof REDIRECT_HOST]);
  } catch {
    return false;
  }
}

interface PendingConnect {
  resolve: (publicKey: PublicKey) => void;
  reject: (err: Error) => void;
}
interface PendingSign {
  resolve: (tx: Transaction) => void;
  reject: (err: Error) => void;
}

type ClusterName = "mainnet-beta" | "devnet" | "testnet";

interface DeeplinkWalletConfig {
  name: WalletName;
  url: string;
  icon: string;
  connectBase: string; // e.g. "https://phantom.app/ul/v1"
  cluster: ClusterName;
}

/**
 * One listener per adapter instance, registered lazily on first connect and
 * kept for the adapter's lifetime — Capacitor's App plugin happily supports
 * multiple independent `appUrlOpen` listeners at once (one per wallet here),
 * each filtering to the redirects it cares about and ignoring the rest.
 */
export class DeeplinkWalletAdapter extends BaseSignerWalletAdapter {
  name: WalletName;
  url: string;
  icon: string;
  readyState: WalletReadyState = isNative() ? WalletReadyState.Loadable : WalletReadyState.Unsupported;
  supportedTransactionVersions = new Set(["legacy" as const]);

  publicKey: PublicKey | null = null;
  connecting = false;

  private connectBase: string;
  private cluster: ClusterName;
  private dappKeyPair: nacl.BoxKeyPair | null = null;
  private sharedSecret: Uint8Array | null = null;
  private session: string | null = null;
  private pendingConnect: PendingConnect | null = null;
  private pendingSign: PendingSign | null = null;
  private listenerHandle: { remove: () => void } | null = null;

  constructor(cfg: DeeplinkWalletConfig) {
    super();
    this.name = cfg.name;
    this.url = cfg.url;
    this.icon = cfg.icon;
    this.connectBase = cfg.connectBase;
    this.cluster = cfg.cluster;
  }

  private async ensureListener() {
    if (this.listenerHandle) return;
    const handle = await App.addListener("appUrlOpen", ({ url }) => this.handleRedirect(url));
    this.listenerHandle = handle;
  }

  private handleRedirect(urlStr: string) {
    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      return;
    }
    if (parsed.protocol !== "ethoslayer:") return;
    const params = parsed.searchParams;
    const errorMessage = params.get("errorMessage");
    const errorCode = params.get("errorCode");

    if (parsed.host === REDIRECT_HOST.connect && this.pendingConnect) {
      const { resolve, reject } = this.pendingConnect;
      this.pendingConnect = null;
      if (errorCode) {
        reject(new WalletConnectionError(errorMessage ?? `Connection request rejected (${errorCode})`));
        return;
      }
      try {
        const walletPubkeyB58 =
          params.get("phantom_encryption_public_key") ?? params.get("solflare_encryption_public_key");
        const nonceB58 = params.get("nonce");
        const dataB58 = params.get("data");
        if (!walletPubkeyB58 || !nonceB58 || !dataB58 || !this.dappKeyPair) {
          throw new Error("Malformed connect response");
        }
        const sharedSecret = nacl.box.before(bs58.decode(walletPubkeyB58), this.dappKeyPair.secretKey);
        const decrypted = nacl.box.open.after(bs58.decode(dataB58), bs58.decode(nonceB58), sharedSecret);
        if (!decrypted) throw new Error("Could not decrypt connect response");
        const payload = JSON.parse(new TextDecoder().decode(decrypted)) as {
          public_key: string;
          session: string;
        };
        this.sharedSecret = sharedSecret;
        this.session = payload.session;
        this.publicKey = new PublicKey(payload.public_key);
        resolve(this.publicKey);
      } catch (err) {
        reject(err instanceof Error ? err : new WalletConnectionError());
      }
      return;
    }

    if (parsed.host === REDIRECT_HOST.sign && this.pendingSign) {
      const { resolve, reject } = this.pendingSign;
      this.pendingSign = null;
      if (errorCode) {
        reject(new WalletSignTransactionError(errorMessage ?? `Signing rejected (${errorCode})`));
        return;
      }
      try {
        const nonceB58 = params.get("nonce");
        const dataB58 = params.get("data");
        if (!nonceB58 || !dataB58 || !this.sharedSecret) throw new Error("Malformed sign response");
        const decrypted = nacl.box.open.after(bs58.decode(dataB58), bs58.decode(nonceB58), this.sharedSecret);
        if (!decrypted) throw new Error("Could not decrypt sign response");
        const payload = JSON.parse(new TextDecoder().decode(decrypted)) as { transaction: string };
        resolve(Transaction.from(bs58.decode(payload.transaction)));
      } catch (err) {
        reject(err instanceof Error ? err : new WalletSignTransactionError());
      }
    }
  }

  async connect(): Promise<void> {
    if (this.connected || this.connecting) return;
    if (!isNative()) throw new WalletConnectionError("Only supported inside the native app");
    this.connecting = true;
    try {
      await this.ensureListener();
      this.dappKeyPair = nacl.box.keyPair();
      const params = new URLSearchParams({
        dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
        cluster: this.cluster,
        app_url: PUBLIC_APP_URL,
        redirect_link: redirectUrl(REDIRECT_HOST.connect),
      });
      const publicKey = await new Promise<PublicKey>((resolve, reject) => {
        this.pendingConnect = { resolve, reject };
        window.location.href = `${this.connectBase}/connect?${params.toString()}`;
      });
      this.emit("connect", publicKey);
    } catch (err) {
      const e = err instanceof Error ? err : new WalletConnectionError();
      this.emit("error", e as never);
      throw e;
    } finally {
      this.connecting = false;
    }
  }

  async disconnect(): Promise<void> {
    this.publicKey = null;
    this.sharedSecret = null;
    this.session = null;
    this.dappKeyPair = null;
    try {
      this.listenerHandle?.remove();
    } catch {
      /* ignore */
    }
    this.listenerHandle = null;
    this.emit("disconnect");
  }

  async signTransaction<T extends Transaction>(transaction: T): Promise<T> {
    if (!this.publicKey || !this.sharedSecret || !this.dappKeyPair || !this.session) {
      throw new WalletNotConnectedError();
    }
    const serialized = transaction.serialize({ requireAllSignatures: false, verifySignatures: false });
    const nonce = nacl.randomBytes(24);
    const body = new TextEncoder().encode(
      JSON.stringify({ transaction: bs58.encode(serialized), session: this.session }),
    );
    const encrypted = nacl.box.after(body, nonce, this.sharedSecret);
    const params = new URLSearchParams({
      dapp_encryption_public_key: bs58.encode(this.dappKeyPair.publicKey),
      nonce: bs58.encode(nonce),
      redirect_link: redirectUrl(REDIRECT_HOST.sign),
      payload: bs58.encode(encrypted),
    });
    const signed = await new Promise<Transaction>((resolve, reject) => {
      this.pendingSign = { resolve, reject };
      window.location.href = `${this.connectBase}/signTransaction?${params.toString()}`;
    });
    return signed as T;
  }
}

const PHANTOM_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNCAzNCIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjM0IiBoZWlnaHQ9IjM0IiByeD0iMTciIGZpbGw9IiNBQjlGRjIiLz48cGF0aCBkPSJNMjguODggMTcuMDNoLTMuMDVhOC44NCA4Ljg0IDAgMCAwLTguODItOC44MiA4Ljg0IDguODQgMCAwIDAtOC44MyA4LjgzdjguODJoLjAyYTguODQgOC44NCAwIDAgMCA4LjgxIDguODEgOC44NCA4Ljg0IDAgMCAwIDguODEtOC44MWguMDJ2LTguODNoMy4wNHoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=";
const SOLFLARE_ICON =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAzNCAzNCIgZmlsbD0ibm9uZSI+PHJlY3Qgd2lkdGg9IjM0IiBoZWlnaHQ9IjM0IiByeD0iMTciIGZpbGw9IiNGRkJEMkUiLz48cGF0aCBkPSJNMTcgN2wzLjA5IDYuMjZMMjcgMTQuMjdsLTUgNC44N0wyMy4xOCAyNiAxNyAyMi43NCAxMC44MiAyNiAxMiAxOS4xNGwtNS00Ljg3IDYuOTEtMS4wMXoiIGZpbGw9IiNmZmYiLz48L3N2Zz4=";

export function createPhantomDeeplinkAdapter(cluster: ClusterName) {
  return new DeeplinkWalletAdapter({
    name: "Phantom" as WalletName,
    url: "https://phantom.app",
    icon: PHANTOM_ICON,
    connectBase: "https://phantom.app/ul/v1",
    cluster,
  });
}

export function createSolflareDeeplinkAdapter(cluster: ClusterName) {
  return new DeeplinkWalletAdapter({
    name: "Solflare" as WalletName,
    url: "https://solflare.com",
    icon: SOLFLARE_ICON,
    connectBase: "https://solflare.com/ul/v1",
    cluster,
  });
}
