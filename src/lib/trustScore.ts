// EthosLayer Trust Scoring (heuristic, ready for AI/on-chain enrichment)
// Modular: swap `computeWalletRisk` with an async backend call later.

export type TrustLevel = "low" | "medium" | "high";

export interface TrustResult {
  score: number; // 0-100
  level: TrustLevel;
  factors: { label: string; impact: "positive" | "negative" | "neutral"; detail: string }[];
}

const SOLANA_ADDR_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export function isValidSolanaAddress(addr: string): boolean {
  return SOLANA_ADDR_RE.test(addr.trim());
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Deterministic pseudo-risk for a wallet — replace with real chain analytics later.
export function computeWalletRisk(addr: string): number {
  if (!isValidSolanaAddress(addr)) return 30;
  const seed = hashCode(addr);
  return 55 + (seed % 45); // 55–99
}

export interface ScoreInputs {
  payer: string;
  receiver: string;
  amount: number;
  hasMilestones: boolean;
  hasDescription: boolean;
  hasExpiry: boolean;
}

export function computeTrustScore(i: ScoreInputs): TrustResult {
  const factors: TrustResult["factors"] = [];
  let score = 60;

  const payerOk = isValidSolanaAddress(i.payer);
  const receiverOk = isValidSolanaAddress(i.receiver);

  if (payerOk) {
    const r = computeWalletRisk(i.payer);
    score += (r - 70) * 0.2;
    factors.push({
      label: "Payer wallet reputation",
      impact: r > 75 ? "positive" : "neutral",
      detail: `On-chain heuristics suggest a ${r > 75 ? "healthy" : "limited"} history for this address.`,
    });
  } else {
    score -= 20;
    factors.push({ label: "Payer address", impact: "negative", detail: "Invalid Solana address format." });
  }

  if (receiverOk) {
    const r = computeWalletRisk(i.receiver);
    score += (r - 70) * 0.2;
    factors.push({
      label: "Receiver wallet reputation",
      impact: r > 75 ? "positive" : "neutral",
      detail: `On-chain heuristics suggest a ${r > 75 ? "healthy" : "limited"} history for this address.`,
    });
  } else {
    score -= 20;
    factors.push({ label: "Receiver address", impact: "negative", detail: "Invalid Solana address format." });
  }

  if (payerOk && receiverOk && i.payer.trim() === i.receiver.trim()) {
    score -= 25;
    factors.push({
      label: "Self-transfer pattern",
      impact: "negative",
      detail: "Payer and receiver are identical — this can indicate wash activity.",
    });
  }

  if (i.amount > 50000) {
    score -= 8;
    factors.push({
      label: "Large settlement amount",
      impact: "negative",
      detail: "Amounts above 50,000 AUDD warrant additional verification.",
    });
  } else if (i.amount > 0) {
    factors.push({
      label: "Reasonable amount",
      impact: "neutral",
      detail: `${i.amount.toLocaleString()} AUDD is within standard escrow ranges.`,
    });
  }

  if (i.hasMilestones) {
    score += 8;
    factors.push({
      label: "Milestone-based release",
      impact: "positive",
      detail: "Funds release incrementally, reducing counterparty risk.",
    });
  }
  if (i.hasDescription) {
    score += 4;
    factors.push({
      label: "Documented agreement",
      impact: "positive",
      detail: "A written description improves dispute resolution clarity.",
    });
  }
  if (i.hasExpiry) {
    score += 3;
    factors.push({
      label: "Expiry configured",
      impact: "positive",
      detail: "An expiry date prevents indefinite fund lockup.",
    });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));
  const level: TrustLevel = score >= 75 ? "high" : score >= 50 ? "medium" : "low";
  return { score, level, factors };
}

export function suggestSaferTerms(r: TrustResult, i: ScoreInputs): string[] {
  const tips: string[] = [];
  if (r.level === "low") tips.push("Consider splitting the payment into milestones to limit exposure.");
  if (!i.hasMilestones && i.amount > 5000) tips.push("Add 2–3 milestones for amounts above 5,000 AUDD.");
  if (!i.hasExpiry) tips.push("Set an expiry date so funds aren't locked indefinitely.");
  if (!i.hasDescription) tips.push("Document the agreement to make disputes easier to resolve.");
  if (r.level === "high" && tips.length === 0) tips.push("Terms look solid. You can safely proceed.");
  return tips;
}
