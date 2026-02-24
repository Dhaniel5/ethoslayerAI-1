import type { TokenAnalysis } from "./mockData";

export interface ScoreComponent {
  label: string;
  weight: number; // percentage
  status: "Safe" | "Warning" | "Risk";
  explanation: string;
  contribution: number; // actual points contributed
}

export interface ScoreBreakdown {
  label: string;
  total: number;
  components: ScoreComponent[];
}

function statusFromMetric(s: "healthy" | "moderate" | "danger"): "Safe" | "Warning" | "Risk" {
  return s === "healthy" ? "Safe" : s === "moderate" ? "Warning" : "Risk";
}

export function getIntegrityBreakdown(a: TokenAnalysis): ScoreBreakdown {
  const find = (l: string) => a.metrics.find((m) => m.label.toLowerCase().includes(l.toLowerCase()));

  const mint = find("mint authority");
  const supply = find("supply concentration") || find("concentration");
  const freeze = find("freeze") || find("upgrade");
  const metadata = find("metadata");
  const decimals = find("decimal");

  const components: ScoreComponent[] = [
    {
      label: "Mint Authority Status",
      weight: 25,
      status: statusFromMetric(mint?.status || "danger"),
      explanation: mint?.description || "Unable to determine mint authority status.",
      contribution: mint?.status === "healthy" ? 25 : mint?.status === "moderate" ? 15 : 5,
    },
    {
      label: "Supply Concentration",
      weight: 25,
      status: statusFromMetric(supply?.status || "moderate"),
      explanation: supply?.description || "Supply concentration data unavailable.",
      contribution: supply?.status === "healthy" ? 25 : supply?.status === "moderate" ? 15 : 5,
    },
    {
      label: "Upgrade / Freeze Authority",
      weight: 20,
      status: statusFromMetric(freeze?.status || "moderate"),
      explanation: freeze?.description || "Authority status could not be verified.",
      contribution: freeze?.status === "healthy" ? 20 : freeze?.status === "moderate" ? 12 : 4,
    },
    {
      label: "Token Age & History",
      weight: 15,
      status: "Warning",
      explanation: "On-chain token age analysis is under development.",
      contribution: 8,
    },
    {
      label: "Metadata Transparency",
      weight: 15,
      status: statusFromMetric(metadata?.status || "danger"),
      explanation: metadata?.description || "Metadata transparency could not be assessed.",
      contribution: metadata?.status === "healthy" ? 15 : metadata?.status === "moderate" ? 9 : 3,
    },
  ];

  return { label: "Token Integrity Score", total: a.integrityScore, components };
}

export function getGovernanceBreakdown(a: TokenAnalysis): ScoreBreakdown {
  const find = (l: string) => a.governanceMetrics.find((m) => m.label.toLowerCase().includes(l.toLowerCase()));

  const program = find("governance program") || find("program");
  const holders = find("holder count") || find("holder");
  const dominance = find("dominance") || find("top holder");

  const components: ScoreComponent[] = [
    {
      label: "Governance Program Detected",
      weight: 30,
      status: statusFromMetric(program?.status || "moderate"),
      explanation: program?.description || "No governance program detected on-chain.",
      contribution: program?.status === "healthy" ? 30 : program?.status === "moderate" ? 18 : 6,
    },
    {
      label: "Holder Distribution",
      weight: 30,
      status: statusFromMetric(holders?.status || "moderate"),
      explanation: holders?.description || "Holder distribution data is limited.",
      contribution: holders?.status === "healthy" ? 30 : holders?.status === "moderate" ? 18 : 6,
    },
    {
      label: "Top Holder Dominance",
      weight: 25,
      status: statusFromMetric(dominance?.status || "moderate"),
      explanation: dominance?.description || "Top holder data unavailable.",
      contribution: dominance?.status === "healthy" ? 25 : dominance?.status === "moderate" ? 15 : 5,
    },
    {
      label: "Participation Rate",
      weight: 15,
      status: "Warning",
      explanation: "DAO participation data requires governance program integration.",
      contribution: 8,
    },
  ];

  return { label: "Governance Health Score", total: a.governanceScore, components };
}

export function getManipulationBreakdown(a: TokenAnalysis): ScoreBreakdown {
  const riskScore = a.manipulationRisk === "Low" ? 85 : a.manipulationRisk === "Moderate" ? 50 : 20;

  const components: ScoreComponent[] = [
    {
      label: "Wallet Clustering",
      weight: 35,
      status: a.manipulationRisk === "Low" ? "Safe" : a.manipulationRisk === "Moderate" ? "Warning" : "Risk",
      explanation: a.manipulationInsights[0] || "No wallet clustering detected.",
      contribution: a.manipulationRisk === "Low" ? 35 : a.manipulationRisk === "Moderate" ? 20 : 7,
    },
    {
      label: "Liquidity Patterns",
      weight: 30,
      status: a.manipulationRisk === "High" ? "Risk" : "Warning",
      explanation: a.manipulationInsights[1] || "Liquidity patterns appear normal.",
      contribution: a.manipulationRisk === "Low" ? 30 : a.manipulationRisk === "Moderate" ? 18 : 6,
    },
    {
      label: "Social Sentiment Correlation",
      weight: 20,
      status: "Warning",
      explanation: a.manipulationInsights[2] || "Social sentiment tracking is under development.",
      contribution: 10,
    },
    {
      label: "Volume Anomalies",
      weight: 15,
      status: a.manipulationRisk === "Low" ? "Safe" : "Warning",
      explanation: "Volume anomaly detection provides early manipulation warnings.",
      contribution: a.manipulationRisk === "Low" ? 15 : 8,
    },
  ];

  return { label: "Manipulation Risk Score", total: riskScore, components };
}
