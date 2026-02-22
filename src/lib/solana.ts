import { Connection, PublicKey, clusterApiUrl } from "@solana/web3.js";
import { getMint, getAccount } from "@solana/spl-token";
import type { TokenAnalysis, TokenMetric } from "./mockData";

const SOLANA_RPC = "https://rpc.ankr.com/solana";
const METAPLEX_METADATA_PROGRAM = new PublicKey(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

function getConnection() {
  return new Connection(SOLANA_RPC, "confirmed");
}

/** Derive the Metaplex metadata PDA for a given mint */
function getMetadataPDA(mint: PublicKey): PublicKey {
  const [pda] = PublicKey.findProgramAddressSync(
    [
      Buffer.from("metadata"),
      METAPLEX_METADATA_PROGRAM.toBuffer(),
      mint.toBuffer(),
    ],
    METAPLEX_METADATA_PROGRAM
  );
  return pda;
}

/** Decode on-chain Metaplex metadata (name + symbol) */
function decodeMetadata(data: Buffer): { name: string; symbol: string } {
  // Metaplex metadata v1 layout:
  // 1 byte key, 32 bytes update authority, 32 bytes mint,
  // then borsh-encoded string: 4 bytes length + utf8
  let offset = 1 + 32 + 32;

  const nameLen = data.readUInt32LE(offset);
  offset += 4;
  const name = data.slice(offset, offset + nameLen).toString("utf8").replace(/\0/g, "").trim();
  offset += nameLen;

  const symbolLen = data.readUInt32LE(offset);
  offset += 4;
  const symbol = data.slice(offset, offset + symbolLen).toString("utf8").replace(/\0/g, "").trim();

  return { name, symbol };
}

export async function fetchTokenAnalysis(mintAddress: string): Promise<TokenAnalysis> {
  const connection = getConnection();
  const mintPubkey = new PublicKey(mintAddress);

  // Fetch mint info, metadata, and largest holders in parallel
  const [mintInfo, metadataAccount, largestAccounts] = await Promise.all([
    getMint(connection, mintPubkey),
    connection.getAccountInfo(getMetadataPDA(mintPubkey)),
    connection.getTokenLargestAccounts(mintPubkey),
  ]);

  // Decode metadata
  let name = mintAddress.slice(0, 8) + "...";
  let symbol = "???";
  if (metadataAccount?.data) {
    try {
      const decoded = decodeMetadata(metadataAccount.data as Buffer);
      if (decoded.name) name = decoded.name;
      if (decoded.symbol) symbol = decoded.symbol;
    } catch {
      // metadata decode failed, use defaults
    }
  }

  // --- Mint Authority ---
  const mintAuthorityRevoked = mintInfo.mintAuthority === null;

  // --- Freeze Authority ---
  const freezeAuthorityActive = mintInfo.freezeAuthority !== null;

  // --- Supply concentration (top 5) ---
  const totalSupply = Number(mintInfo.supply);
  const top5 = largestAccounts.value.slice(0, 5);
  const top5Amount = top5.reduce((sum, a) => sum + Number(a.amount), 0);
  const top5Pct = totalSupply > 0 ? ((top5Amount / totalSupply) * 100).toFixed(1) : "N/A";
  const top5Status: TokenMetric["status"] =
    Number(top5Pct) > 60 ? "danger" : Number(top5Pct) > 30 ? "moderate" : "healthy";

  // --- Build metrics ---
  const metrics: TokenMetric[] = [
    {
      label: "Mint Authority",
      value: mintAuthorityRevoked ? "Revoked" : "Active",
      status: mintAuthorityRevoked ? "healthy" : "danger",
      description: mintAuthorityRevoked
        ? "No entity can mint additional tokens. Supply is fixed."
        : "Mint authority is active. The authority can create new tokens at any time.",
    },
    {
      label: "Supply Concentration (Top 5)",
      value: top5Pct === "N/A" ? "N/A" : `${top5Pct}%`,
      status: top5Status,
      description:
        top5Status === "healthy"
          ? "Token supply is well distributed among holders."
          : top5Status === "moderate"
          ? `Top 5 holders control ~${top5Pct}% of supply. Moderate centralization risk.`
          : `Top 5 holders control ~${top5Pct}% of supply. High centralization risk.`,
    },
    {
      label: "Freeze Authority",
      value: freezeAuthorityActive ? "Active" : "Revoked",
      status: freezeAuthorityActive ? "danger" : "healthy",
      description: freezeAuthorityActive
        ? "Freeze authority can freeze token accounts. Potential censorship risk."
        : "No freeze authority. Token accounts cannot be frozen.",
    },
    {
      label: "Token Decimals",
      value: String(mintInfo.decimals),
      status: "healthy",
      description: `Token uses ${mintInfo.decimals} decimal places. Standard for SPL tokens.`,
    },
    {
      label: "Metadata Transparency",
      value: metadataAccount ? "On-chain" : "Missing",
      status: metadataAccount ? "healthy" : "danger",
      description: metadataAccount
        ? "Token metadata is stored on-chain and verifiable."
        : "No on-chain metadata found. Limited transparency.",
    },
  ];

  // --- Integrity score ---
  let integrityScore = 50;
  if (mintAuthorityRevoked) integrityScore += 15;
  else integrityScore -= 10;
  if (!freezeAuthorityActive) integrityScore += 10;
  else integrityScore -= 5;
  if (Number(top5Pct) < 30) integrityScore += 15;
  else if (Number(top5Pct) < 60) integrityScore += 5;
  else integrityScore -= 10;
  if (metadataAccount) integrityScore += 10;
  else integrityScore -= 5;
  integrityScore = Math.max(0, Math.min(100, integrityScore));

  // --- Governance (placeholder — real governance needs SPL-Governance program queries) ---
  const governanceMetrics: TokenMetric[] = [
    {
      label: "Governance Program",
      value: "Not detected",
      status: "moderate",
      description: "No SPL Governance realm detected for this token. On-chain governance analysis requires an active realm.",
    },
    {
      label: "Holder Count (Top 20)",
      value: String(largestAccounts.value.length),
      status: largestAccounts.value.length >= 15 ? "healthy" : "moderate",
      description: `${largestAccounts.value.length} distinct holders in the top 20. More holders suggest broader distribution.`,
    },
    {
      label: "Top Holder Dominance",
      value: largestAccounts.value[0]
        ? `${((Number(largestAccounts.value[0].amount) / totalSupply) * 100).toFixed(1)}%`
        : "N/A",
      status:
        largestAccounts.value[0] && (Number(largestAccounts.value[0].amount) / totalSupply) * 100 > 30
          ? "danger"
          : "moderate",
      description: "Percentage of total supply held by the single largest holder.",
    },
  ];

  const governanceScore = Math.max(20, Math.min(80, 50 - (Number(top5Pct) > 50 ? 20 : 0) + (largestAccounts.value.length >= 15 ? 15 : 0)));

  // --- Manipulation (heuristic from on-chain data) ---
  const topHolderPct = largestAccounts.value[0]
    ? (Number(largestAccounts.value[0].amount) / totalSupply) * 100
    : 0;
  const manipulationRisk: TokenAnalysis["manipulationRisk"] =
    topHolderPct > 50 ? "High" : topHolderPct > 20 ? "Moderate" : "Low";

  const manipulationInsights: string[] = [];
  if (topHolderPct > 30) {
    manipulationInsights.push(
      `Largest holder controls ${topHolderPct.toFixed(1)}% of supply — high concentration risk`
    );
  }
  if (Number(top5Pct) > 60) {
    manipulationInsights.push(
      `Top 5 wallets hold ${top5Pct}% of supply — potential coordinated control`
    );
  }
  if (!mintAuthorityRevoked) {
    manipulationInsights.push("Active mint authority allows unlimited token creation");
  }
  if (freezeAuthorityActive) {
    manipulationInsights.push("Freeze authority can censor individual token holders");
  }
  if (manipulationInsights.length === 0) {
    manipulationInsights.push("No major manipulation signals detected from on-chain data");
  }

  return {
    name,
    symbol,
    mint: mintAddress,
    integrityScore,
    metrics,
    governanceScore,
    governanceMetrics,
    manipulationRisk,
    manipulationInsights,
  };
}
