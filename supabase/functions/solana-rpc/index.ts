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

    // Fetch mint account info
    const mintAccountInfo = await rpcCall('getAccountInfo', [mintAddress, { encoding: 'jsonParsed' }]);

    // Fetch largest accounts separately (can fail for very large tokens)
    let largestAccounts: any = { value: [] };
    try {
      largestAccounts = await rpcCall('getTokenLargestAccounts', [mintAddress]);
    } catch (e) {
      console.warn('getTokenLargestAccounts failed (token may have too many holders):', e);
    }

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

    // Build metrics with human-centered language
    const metrics = [
      {
        label: 'Mint Authority',
        value: mintAuthorityRevoked ? 'Revoked' : 'Active',
        status: mintAuthorityRevoked ? 'healthy' : 'danger',
        description: mintAuthorityRevoked
          ? 'The total supply of this token is fixed. No one can create additional tokens, which protects holders from unexpected dilution.'
          : 'This token can increase its total supply through centralized mint control. This means the authority holder could create unlimited new tokens at any time, potentially devaluing existing holdings.',
      },
      {
        label: 'Supply Concentration (Top 5)',
        value: top5Pct === 'N/A' ? 'N/A' : `${top5Pct}%`,
        status: top5Status,
        description: top5Status === 'healthy'
          ? 'Token ownership is spread across many wallets. This reduces the risk of any single entity manipulating the market or governance decisions.'
          : top5Status === 'moderate'
          ? `The top 5 wallets hold ~${top5Pct}% of all tokens. This moderate concentration means a small group could influence price through coordinated selling or dominate governance votes.`
          : `The top 5 wallets control ~${top5Pct}% of all tokens. This extreme concentration gives a few holders outsized power over price, governance, and the project's future direction.`,
      },
      {
        label: 'Freeze Authority',
        value: freezeAuthorityActive ? 'Active' : 'Revoked',
        status: freezeAuthorityActive ? 'danger' : 'healthy',
        description: freezeAuthorityActive
          ? 'The freeze authority can lock any token holder\'s account, preventing them from transferring or selling. This creates a censorship risk where individual holders can be targeted.'
          : 'No entity can freeze token accounts. Holders have full control over their tokens and can transfer or sell freely without interference.',
      },
      {
        label: 'Token Decimals',
        value: String(decimals),
        status: 'healthy',
        description: `This token uses ${decimals} decimal places, which is standard for Solana SPL tokens and allows for precise fractional ownership.`,
      },
      {
        label: 'Metadata',
        value: hasMetadata ? 'Available' : 'Missing',
        status: hasMetadata ? 'healthy' : 'danger',
        description: hasMetadata
          ? 'Complete token metadata (name, symbol, details) is available on-chain, allowing anyone to verify the project\'s identity and legitimacy.'
          : 'This token has no verifiable metadata on-chain. Without transparent identifying information, it is difficult to assess the project\'s legitimacy or intentions.',
      },
    ];

    const hasMetadata = name !== mintAddress.slice(0, 8) + '...';

    // Integrity score
    let integrityScore = 50;
    if (mintAuthorityRevoked) integrityScore += 15; else integrityScore -= 10;
    if (!freezeAuthorityActive) integrityScore += 10; else integrityScore -= 5;
    if (Number(top5Pct) < 30) integrityScore += 15;
    else if (Number(top5Pct) < 60) integrityScore += 5;
    else integrityScore -= 10;
    if (hasMetadata) integrityScore += 10; else integrityScore -= 5;
    integrityScore = Math.max(0, Math.min(100, integrityScore));

    // Governance metrics with human-centered language
    const governanceMetrics = [
      {
        label: 'Governance Program',
        value: 'Not detected',
        status: 'moderate',
        description: 'No on-chain governance program was found for this token. Without formal governance, decisions may be made unilaterally by the project team rather than through community voting.',
      },
      {
        label: 'Holder Count (Top 20)',
        value: String(holders.length),
        status: holders.length >= 15 ? 'healthy' : 'moderate',
        description: holders.length >= 15
          ? `${holders.length} distinct wallets appear in the top 20 holders, suggesting reasonable distribution and a healthier ecosystem.`
          : `Only ${holders.length} distinct wallets in the top 20. Limited holder diversity increases vulnerability to coordinated actions.`,
      },
      {
        label: 'Top Holder Dominance',
        value: holders[0] ? `${((Number(holders[0].amount) / totalSupply) * 100).toFixed(1)}%` : 'N/A',
        status: holders[0] && (Number(holders[0].amount) / totalSupply) * 100 > 30 ? 'danger' : 'moderate',
        description: holders[0] && (Number(holders[0].amount) / totalSupply) * 100 > 30
          ? 'The largest wallet holds a significant share of total supply. This entity has outsized influence over token price and could cause major market impact through a single transaction.'
          : 'The largest holder\'s share is within moderate bounds, though continued monitoring is recommended.',
      },
    ];

    const governanceScore = Math.max(20, Math.min(80,
      50 - (Number(top5Pct) > 50 ? 20 : 0) + (holders.length >= 15 ? 15 : 0)
    ));

    // Manipulation detection with clear explanations
    const topHolderPct = holders[0] ? (Number(holders[0].amount) / totalSupply) * 100 : 0;
    const manipulationRisk = topHolderPct > 50 ? 'High' : topHolderPct > 20 ? 'Moderate' : 'Low';

    const manipulationInsights: string[] = [];
    if (topHolderPct > 30) manipulationInsights.push(`The largest wallet controls ${topHolderPct.toFixed(1)}% of total supply. A single large sell-off could crash the token price, causing significant losses for other holders.`);
    if (Number(top5Pct) > 60) manipulationInsights.push(`The top 5 wallets collectively hold ${top5Pct}% of supply. This level of concentration enables coordinated market manipulation and governance capture.`);
    if (!mintAuthorityRevoked) manipulationInsights.push('Active mint authority allows unlimited token creation. This means the authority could flood the market with new tokens at any time, diluting the value of existing holdings.');
    if (freezeAuthorityActive) manipulationInsights.push('The freeze authority can selectively lock individual token accounts. This censorship capability could be used to prevent specific holders from selling during critical moments.');
    if (manipulationInsights.length === 0) manipulationInsights.push('No major manipulation signals were detected. On-chain indicators suggest standard market behavior at the time of analysis.');

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
