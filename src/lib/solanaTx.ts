// Real AUDD SPL transfers + confirmation polling.
import {
  Connection,
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import {
  createAssociatedTokenAccountInstruction,
  createTransferCheckedInstruction,
  getAssociatedTokenAddress,
  getAccount,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AUDD_DECIMALS, AUDD_MINT, explorerTxUrl } from "./solanaConfig";

export interface SignAndSend {
  publicKey: PublicKey;
  signTransaction: (tx: Transaction) => Promise<Transaction>;
}

function uiAmountToBase(amount: number): bigint {
  // Avoid float precision: convert via string with fixed decimals.
  const [whole, frac = ""] = amount.toFixed(AUDD_DECIMALS).split(".");
  const padded = (frac + "0".repeat(AUDD_DECIMALS)).slice(0, AUDD_DECIMALS);
  return BigInt(whole.replace("-", "")) * BigInt(10 ** AUDD_DECIMALS) + BigInt(padded || 0);
}

/** Build an AUDD transfer transaction from `signer` → `destinationOwner`. */
export async function buildAuddTransfer(
  connection: Connection,
  signer: PublicKey,
  destinationOwner: PublicKey,
  amount: number,
): Promise<Transaction> {
  if (!AUDD_MINT) throw new Error("AUDD mint is not configured.");

  const fromAta = await getAssociatedTokenAddress(AUDD_MINT, signer);
  const toAta = await getAssociatedTokenAddress(AUDD_MINT, destinationOwner);

  const ixs: TransactionInstruction[] = [];

  // Ensure receiver ATA exists; payer of rent = signer.
  try {
    await getAccount(connection, toAta);
  } catch {
    ixs.push(
      createAssociatedTokenAccountInstruction(signer, toAta, destinationOwner, AUDD_MINT),
    );
  }

  ixs.push(
    createTransferCheckedInstruction(
      fromAta,
      AUDD_MINT,
      toAta,
      signer,
      uiAmountToBase(amount),
      AUDD_DECIMALS,
      [],
      TOKEN_PROGRAM_ID,
    ),
  );

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  const tx = new Transaction({ feePayer: signer, blockhash, lastValidBlockHeight }).add(...ixs);
  return tx;
}

export async function sendAuddTransfer(
  connection: Connection,
  signer: SignAndSend,
  destinationOwner: PublicKey,
  amount: number,
): Promise<string> {
  const tx = await buildAuddTransfer(connection, signer.publicKey, destinationOwner, amount);
  const signed = await signer.signTransaction(tx);
  const sig = await connection.sendRawTransaction(signed.serialize(), {
    skipPreflight: false,
    maxRetries: 3,
  });
  return sig;
}

/** Poll `getSignatureStatuses` until confirmed/finalized or timeout (default 60s). */
export async function confirmSignature(
  connection: Connection,
  signature: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<"confirmed" | "finalized"> {
  const { timeoutMs = 60_000, intervalMs = 1_500 } = opts;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const { value } = await connection.getSignatureStatuses([signature], {
      searchTransactionHistory: true,
    });
    const status = value?.[0];
    if (status?.err) throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err)}`);
    if (status?.confirmationStatus === "confirmed" || status?.confirmationStatus === "finalized") {
      return status.confirmationStatus;
    }
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Confirmation timed out. Track it: ${explorerTxUrl(signature)}`);
}
