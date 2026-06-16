#!/usr/bin/env node
/**
 * One-click devnet "AUDD" test token bootstrapper.
 *
 * What it does:
 *   1. Loads (or creates) a devnet keypair at ~/.config/solana/id.json
 *   2. Airdrops 2 SOL if balance is low
 *   3. Creates a new SPL mint with 6 decimals (matches mainnet AUDD)
 *   4. Creates your associated token account
 *   5. Mints `--supply` tokens to your wallet (default 1,000,000)
 *   6. Prints the lines to paste into your project .env
 *
 * Usage:
 *   node scripts/create-devnet-audd.mjs               # default 1,000,000 supply
 *   node scripts/create-devnet-audd.mjs --supply 5000 # custom supply
 *   node scripts/create-devnet-audd.mjs --to <PUBKEY> # mint to a different wallet
 */
import { Connection, Keypair, LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import {
  createMint, getOrCreateAssociatedTokenAccount, mintTo,
} from "@solana/spl-token";
import { readFileSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const DECIMALS = 6;
const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, cur, i, arr) => {
    if (cur.startsWith("--")) acc.push([cur.slice(2), arr[i + 1]]);
    return acc;
  }, []),
);
const SUPPLY = Number(args.supply || 1_000_000);
const TO_OVERRIDE = args.to;

const KEYPAIR_PATH = process.env.SOLANA_KEYPAIR || join(homedir(), ".config", "solana", "id.json");

function loadOrCreateKeypair() {
  if (existsSync(KEYPAIR_PATH)) {
    const raw = JSON.parse(readFileSync(KEYPAIR_PATH, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  console.log(`No keypair at ${KEYPAIR_PATH} — generating a new one.`);
  const kp = Keypair.generate();
  mkdirSync(join(homedir(), ".config", "solana"), { recursive: true });
  writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)));
  return kp;
}

async function ensureBalance(connection, payer) {
  const bal = await connection.getBalance(payer.publicKey);
  console.log(`Wallet ${payer.publicKey.toBase58()} — balance: ${(bal / LAMPORTS_PER_SOL).toFixed(3)} SOL`);
  if (bal >= 0.5 * LAMPORTS_PER_SOL) return;
  console.log("Airdropping 2 SOL…");
  try {
    const sig = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction(sig, "confirmed");
  } catch (e) {
    console.warn("Airdrop failed (devnet faucet may be rate-limited).");
    console.warn("Fund manually via https://faucet.solana.com then re-run this script.");
    throw e;
  }
}

(async () => {
  const connection = new Connection("https://api.devnet.solana.com", "confirmed");
  const payer = loadOrCreateKeypair();
  await ensureBalance(connection, payer);

  console.log("Creating SPL mint (6 decimals)…");
  const mint = await createMint(connection, payer, payer.publicKey, null, DECIMALS);
  console.log(`  mint: ${mint.toBase58()}`);

  const receiver = TO_OVERRIDE ? new PublicKey(TO_OVERRIDE) : payer.publicKey;
  console.log(`Creating ATA for ${receiver.toBase58()}…`);
  const ata = await getOrCreateAssociatedTokenAccount(connection, payer, mint, receiver);
  console.log(`  ata: ${ata.address.toBase58()}`);

  const baseUnits = BigInt(SUPPLY) * BigInt(10 ** DECIMALS);
  console.log(`Minting ${SUPPLY.toLocaleString()} tAUDD…`);
  await mintTo(connection, payer, mint, ata.address, payer, baseUnits);

  console.log("\n✅ Done. Add these to your project .env:\n");
  console.log(`VITE_SOLANA_CLUSTER=devnet`);
  console.log(`VITE_SOLANA_RPC_URL=https://api.devnet.solana.com`);
  console.log(`VITE_AUDD_MINT=${mint.toBase58()}`);
  console.log(`VITE_ESCROW_VAULT=<a devnet wallet you control — can be ${payer.publicKey.toBase58()}>\n`);
  console.log("Then restart the dev server. View the mint on Explorer:");
  console.log(`https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);
})().catch((e) => { console.error(e); process.exit(1); });
