export interface TokenMetric {
  label: string;
  value: string;
  status: "healthy" | "moderate" | "danger";
  description: string;
}

export interface TokenAnalysis {
  name: string;
  symbol: string;
  mint: string;
  integrityScore: number;
  metrics: TokenMetric[];
  governanceScore: number;
  governanceMetrics: TokenMetric[];
  manipulationRisk: "Low" | "Moderate" | "High";
  manipulationInsights: string[];
}

export const DEMO_TOKEN: TokenAnalysis = {
  name: "Solana Governance Token",
  symbol: "SGT",
  mint: "7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
  integrityScore: 78,
  metrics: [
    {
      label: "Mint Authority",
      value: "Revoked",
      status: "healthy",
      description: "No entity can mint additional tokens. Supply is fixed.",
    },
    {
      label: "Supply Concentration (Top 5)",
      value: "34.2%",
      status: "moderate",
      description: "Top 5 holders control ~34% of supply. Moderate centralization risk.",
    },
    {
      label: "Upgrade Authority",
      value: "Active",
      status: "danger",
      description: "Contract can be upgraded by the authority. Potential for unilateral changes.",
    },
    {
      label: "Liquidity Lock",
      value: "Locked (12 months)",
      status: "healthy",
      description: "Liquidity is locked for 12 months. Reduces rug-pull risk.",
    },
    {
      label: "Metadata Transparency",
      value: "Full",
      status: "healthy",
      description: "Token metadata is complete and verifiable on-chain.",
    },
  ],
  governanceScore: 62,
  governanceMetrics: [
    {
      label: "Voter Participation",
      value: "18.4%",
      status: "danger",
      description: "Low quorum = governance capture risk. Decisions may not represent community.",
    },
    {
      label: "Vote Power Concentration",
      value: "Top 3 = 52%",
      status: "moderate",
      description: "A small group holds majority voting power.",
    },
    {
      label: "Treasury Control",
      value: "Multi-sig (3/5)",
      status: "healthy",
      description: "Treasury requires 3 of 5 signers. Reasonable distribution.",
    },
    {
      label: "Proposal Frequency",
      value: "2.1/month",
      status: "moderate",
      description: "Moderate activity. More proposals could indicate healthier governance.",
    },
  ],
  manipulationRisk: "Moderate",
  manipulationInsights: [
    "3 clustered wallets accumulated 8.2% of supply in the last 72 hours",
    "Liquidity increased 340% in the past 48 hours without matching social growth",
    "Social mention spike detected — 12x baseline — low correlation with on-chain activity",
  ],
};

export function getScoreColor(score: number): "healthy" | "moderate" | "danger" {
  if (score >= 70) return "healthy";
  if (score >= 40) return "moderate";
  return "danger";
}

export function getStatusColor(status: "healthy" | "moderate" | "danger") {
  switch (status) {
    case "healthy": return "text-healthy";
    case "moderate": return "text-moderate";
    case "danger": return "text-danger";
  }
}

export function getStatusBg(status: "healthy" | "moderate" | "danger") {
  switch (status) {
    case "healthy": return "bg-healthy/10 border-healthy/30";
    case "moderate": return "bg-moderate/10 border-moderate/30";
    case "danger": return "bg-danger/10 border-danger/30";
  }
}
