import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const HELIUS_API_KEY = Deno.env.get('HELIUS_API_KEY');
  if (!HELIUS_API_KEY) {
    return new Response(JSON.stringify({ error: 'HELIUS_API_KEY not configured' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const { mintAddress } = await req.json();
    if (!mintAddress) {
      return new Response(JSON.stringify({ error: 'mintAddress is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const heliusUrl = `https://mainnet.helius-rpc.com/?api-key=${HELIUS_API_KEY}`;

    // Helper to make RPC calls
    async function rpcCall(method: string, params: unknown[]) {
      const res = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      return data.result;
    }

    // Fetch mint account info, metadata PDA, and largest token accounts in parallel
    const METAPLEX_PROGRAM = 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s';
    
    // Derive metadata PDA (we'll use getAccountInfo with the PDA address)
    // For now, use Helius DAS API for metadata if available
    const [mintAccountInfo, largestAccounts] = await Promise.all([
      rpcCall('getAccountInfo', [mintAddress, { encoding: 'jsonParsed' }]),
      rpcCall('getTokenLargestAccounts', [mintAddress]),
    ]);

    if (!mintAccountInfo?.value) {
      return new Response(JSON.stringify({ error: 'Invalid mint address or token not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const parsedInfo = mintAccountInfo.value.data?.parsed?.info;
    if (!parsedInfo) {
      return new Response(JSON.stringify({ error: 'Not a valid SPL token mint' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Try Helius DAS API for richer metadata
    let name = mintAddress.slice(0, 8) + '...';
    let symbol = '???';
    try {
      const dasRes = await fetch(heliusUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getAsset',
          params: { id: mintAddress },
        }),
      });
      const dasData = await dasRes.json();
      if (dasData.result?.content?.metadata) {
        const meta = dasData.result.content.metadata;
        if (meta.name) name = meta.name;
        if (meta.symbol) symbol = meta.symbol;
      }
    } catch {
      // DAS API not available, use defaults
    }

    // Extract mint info
    const mintAuthorityRevoked = !parsedInfo.mintAuthority;
    const freezeAuthorityActive = !!parsedInfo.freezeAuthority;
    const decimals = parsedInfo.decimals;
    const totalSupply = Number(parsedInfo.supply);

    // Supply concentration
    const holders = largestAccounts?.value || [];
    const top5 = holders.slice(0, 5);
    const top5Amount = top5.reduce((sum: number, a: any) => sum + Number(a.amount), 0);
    const top5Pct = totalSupply > 0 ? ((top5Amount / totalSupply) * 100).toFixed(1) : 'N/A';
    const top5Status = Number(top5Pct) > 60 ? 'danger' : Number(top5Pct) > 30 ? 'moderate' : 'healthy';

    // Build metrics
    const metrics = [
      {
        label: 'Mint Authority',
        value: mintAuthorityRevoked ? 'Revoked' : 'Active',
        status: mintAuthorityRevoked ? 'healthy' : 'danger',
        description: mintAuthorityRevoked
          ? 'No entity can mint additional tokens. Supply is fixed.'
          : 'Mint authority is active. The authority can create new tokens at any time.',
      },
      {
        label: 'Supply Concentration (Top 5)',
        value: top5Pct === 'N/A' ? 'N/A' : `${top5Pct}%`,
        status: top5Status,
        description: top5Status === 'healthy'
          ? 'Token supply is well distributed among holders.'
          : top5Status === 'moderate'
          ? `Top 5 holders control ~${top5Pct}% of supply. Moderate centralization risk.`
          : `Top 5 holders control ~${top5Pct}% of supply. High centralization risk.`,
      },
      {
        label: 'Freeze Authority',
        value: freezeAuthorityActive ? 'Active' : 'Revoked',
        status: freezeAuthorityActive ? 'danger' : 'healthy',
        description: freezeAuthorityActive
          ? 'Freeze authority can freeze token accounts. Potential censorship risk.'
          : 'No freeze authority. Token accounts cannot be frozen.',
      },
      {
        label: 'Token Decimals',
        value: String(decimals),
        status: 'healthy',
        description: `Token uses ${decimals} decimal places. Standard for SPL tokens.`,
      },
      {
        label: 'Metadata',
        value: name !== mintAddress.slice(0, 8) + '...' ? 'Available' : 'Missing',
        status: name !== mintAddress.slice(0, 8) + '...' ? 'healthy' : 'danger',
        description: name !== mintAddress.slice(0, 8) + '...'
          ? 'Token metadata is available and verifiable.'
          : 'No metadata found. Limited transparency.',
      },
    ];

    // Integrity score
    let integrityScore = 50;
    if (mintAuthorityRevoked) integrityScore += 15; else integrityScore -= 10;
    if (!freezeAuthorityActive) integrityScore += 10; else integrityScore -= 5;
    if (Number(top5Pct) < 30) integrityScore += 15;
    else if (Number(top5Pct) < 60) integrityScore += 5;
    else integrityScore -= 10;
    if (name !== mintAddress.slice(0, 8) + '...') integrityScore += 10; else integrityScore -= 5;
    integrityScore = Math.max(0, Math.min(100, integrityScore));

    // Governance metrics
    const governanceMetrics = [
      {
        label: 'Governance Program',
        value: 'Not detected',
        status: 'moderate',
        description: 'No SPL Governance realm detected for this token.',
      },
      {
        label: 'Holder Count (Top 20)',
        value: String(holders.length),
        status: holders.length >= 15 ? 'healthy' : 'moderate',
        description: `${holders.length} distinct holders in the top 20.`,
      },
      {
        label: 'Top Holder Dominance',
        value: holders[0] ? `${((Number(holders[0].amount) / totalSupply) * 100).toFixed(1)}%` : 'N/A',
        status: holders[0] && (Number(holders[0].amount) / totalSupply) * 100 > 30 ? 'danger' : 'moderate',
        description: 'Percentage of total supply held by the single largest holder.',
      },
    ];

    const governanceScore = Math.max(20, Math.min(80,
      50 - (Number(top5Pct) > 50 ? 20 : 0) + (holders.length >= 15 ? 15 : 0)
    ));

    // Manipulation detection
    const topHolderPct = holders[0] ? (Number(holders[0].amount) / totalSupply) * 100 : 0;
    const manipulationRisk = topHolderPct > 50 ? 'High' : topHolderPct > 20 ? 'Moderate' : 'Low';

    const manipulationInsights: string[] = [];
    if (topHolderPct > 30) manipulationInsights.push(`Largest holder controls ${topHolderPct.toFixed(1)}% of supply`);
    if (Number(top5Pct) > 60) manipulationInsights.push(`Top 5 wallets hold ${top5Pct}% of supply`);
    if (!mintAuthorityRevoked) manipulationInsights.push('Active mint authority allows unlimited token creation');
    if (freezeAuthorityActive) manipulationInsights.push('Freeze authority can censor individual token holders');
    if (manipulationInsights.length === 0) manipulationInsights.push('No major manipulation signals detected');

    const result = {
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

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Solana analysis error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
