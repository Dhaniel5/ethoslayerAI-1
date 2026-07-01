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
  TokenAccountNotFoundError,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { AUDD_DECIMALS, AUDD_MINT, explorerTxUrl, SOLANA_RPC_ENDPOINTS } from "./solanaConfig";

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

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try { return JSON.stringify(err); } catch { return "Unknown Solana RPC error"; }
}

function isRetryableRpcError(err: unknown): boolean {
  const message = describeError(err).toLowerCase();
  return (
    message.includes("403") ||
    message.includes("429") ||
    message.includes("500") ||
    message.includes("502") ||
    message.includes("503") ||
    message.includes("504") ||
    message.includes("access forbidden") ||
    message.includes("failed to fetch") ||
    message.includes("network") ||
    message.includes("timeout")
  );
}

function connectionCandidates(primary: Connection): Connection[] {
  const endpoints = Array.from(new Set([primary.rpcEndpoint, ...SOLANA_RPC_ENDPOINTS].filter(Boolean)));
  return endpoints.map((endpoint) =>
    endpoint === primary.rpcEndpoint ? primary : new Connection(endpoint, "confirmed"),
  );
}

async function withRpcFallback<T>(
  primary: Connection,
  action: string,
  run: (connection: Connection) => Promise<T>,
): Promise<T> {
  const errors: string[] = [];
  const candidates = connectionCandidates(primary);

  for (const candidate of candidates) {
    try {
      return await run(candidate);
    } catch (err) {
      errors.push(`${candidate.rpcEndpoint}: ${describeError(err)}`);
      if (!isRetryableRpcError(err)) throw err;
    }
  }

  throw new Error(
    `${action} failed because the Solana RPC endpoint rejected the request. Tried ${errors.join(" | ")}`,
  );
}

async function buildAuddTransferOnConnection(
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
  } catch (err) {
    if (isRetryableRpcError(err)) throw err;
    if (!(err instanceof TokenAccountNotFoundError)) throw err;
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

  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash("confirmed");
  const tx = new Transaction({ feePayer: signer, blockhash, lastValidBlockHeight }).add(...ixs);
  return tx;
}

/** Build an AUDD transfer transaction from `signer` → `destinationOwner`. */
export async function buildAuddTransfer(
  connection: Connection,
  signer: PublicKey,
  destinationOwner: PublicKey,
  amount: number,
): Promise<Transaction> {
  return withRpcFallback(connection, "Building AUDD transfer", (candidate) =>
    buildAuddTransferOnConnection(candidate, signer, destinationOwner, amount),
  );
}

export async function sendAuddTransfer(
  connection: Connection,
  signer: SignAndSend,
  destinationOwner: PublicKey,
  amount: number,
): Promise<string> {
  return withRpcFallback(connection, "Sending AUDD transfer", async (candidate) => {
    const tx = await buildAuddTransferOnConnection(candidate, signer.publicKey, destinationOwner, amount);
    const signed = await signer.signTransaction(tx);
    return candidate.sendRawTransaction(signed.serialize(), {
      skipPreflight: false,
      maxRetries: 3,
    });
  });
}

/** Poll `getSignatureStatuses` until confirmed/finalized or timeout (default 60s). */
export async function confirmSignature(
  connection: Connection,
  signature: string,
  opts: { timeoutMs?: number; intervalMs?: number } = {},
): Promise<"confirmed" | "finalized"> {
  return withRpcFallback(connection, "Confirming AUDD transfer", async (candidate) => {
    const { timeoutMs = 60_000, intervalMs = 1_500 } = opts;
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const { value } = await candidate.getSignatureStatuses([signature], {
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
  });
}
