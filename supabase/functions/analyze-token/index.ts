// Token risk analysis: Jupiter price data + Lovable AI risk report.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const INSUFFICIENT = {
  riskLevel: "Caution",
  summary: "Insufficient data — proceed with caution.",
  details: ["No reliable market data was found for this token."],
  recommendation: "Verify the mint address independently before accepting this escrow.",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { mintAddress, label } = await req.json();
    if (!mintAddress) {
      return new Response(JSON.stringify({ error: "mintAddress required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let priceData: unknown = null;
    try {
      const r = await fetch(`https://price.jup.ag/v4/price?ids=${encodeURIComponent(mintAddress)}`);
      if (r.ok) {
        const j = await r.json();
        priceData = j?.data?.[mintAddress] ?? null;
      }
    } catch (_) {
      priceData = null;
    }

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ analysis: INSUFFICIENT, priceData }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You are an AI risk analyst for EthosLayer, a programmable escrow protocol on Solana. Analyze token data and produce a clear plain-English risk report to protect the payee. Respond with JSON only.",
          },
          {
            role: "user",
            content: `Analyze this token for escrow safety:
Token: ${label || mintAddress}
Mint: ${mintAddress}
Price data: ${priceData ? JSON.stringify(priceData) : "unavailable"}

Return a JSON object with:
- riskLevel: "Safe" | "Caution" | "High Risk"
- summary: one sentence verdict
- details: 3-5 short bullet point strings
- recommendation: one sentence advice for the payee
If the price data is unavailable, set summary to "Insufficient data — proceed with caution."`,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      const status = res.status === 429 || res.status === 402 ? res.status : 500;
      return new Response(JSON.stringify({ error: text, analysis: INSUFFICIENT }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    let analysis = INSUFFICIENT;
    try {
      analysis = JSON.parse(json.choices?.[0]?.message?.content ?? "");
    } catch (_) {
      analysis = INSUFFICIENT;
    }

    return new Response(JSON.stringify({ analysis, priceData }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e), analysis: INSUFFICIENT }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
