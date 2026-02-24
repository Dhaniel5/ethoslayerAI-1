// Ethos preference system — stored in localStorage

export const ETHOS_VALUES = [
  { id: "decentralization", label: "Decentralization", description: "Prefer tokens with distributed ownership and no centralized control." },
  { id: "transparency", label: "Transparency", description: "Prefer tokens with complete metadata and verifiable on-chain data." },
  { id: "fair-distribution", label: "Fair Token Distribution", description: "Prefer tokens where supply is not concentrated among few wallets." },
  { id: "active-governance", label: "Active Governance", description: "Prefer tokens with healthy voter participation and proposal activity." },
  { id: "long-term", label: "Long-Term Sustainability", description: "Prefer tokens with locked liquidity and revoked mint authority." },
] as const;

export type EthosId = (typeof ETHOS_VALUES)[number]["id"];

const STORAGE_KEY = "ethoslayer_ethos_prefs";
const ONBOARDING_KEY = "ethoslayer_onboarding_done";

export function getEthosPrefs(): Record<EthosId, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return Object.fromEntries(ETHOS_VALUES.map((v) => [v.id, false])) as Record<EthosId, boolean>;
}

export function saveEthosPrefs(prefs: Record<EthosId, boolean>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
}

export function isOnboardingDone(): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === "true";
}

export function markOnboardingDone() {
  localStorage.setItem(ONBOARDING_KEY, "true");
}
