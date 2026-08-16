// EthosLayer Resolution Assistant — neutral, decision-support only.
// It never decides a winner and never moves funds.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FALLBACK = {
  summary: "Not enough information yet to summarise this dispute. Add evidence or a message to continue.",
  keyFacts: [] as string[],
  obligations: [] as string[],
  evidenceSummary: "No evidence has been submitted yet.",
  options: [] as string[],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );

    const { data: userRes } = await supabase.auth.getUser();
    if (!userRes?.user) throw new Error("Unauthorized");

    const { dispute_id } = await req.json();
    if (!dispute_id) throw new Error("dispute_id is required");

    const { data: dispute } = await supabase.from("disputes").select("*").eq("id", dispute_id).maybeSingle();
    if (!dispute) throw new Error("Dispute not found");

    const { data: escrow } = await supabase.from("escrows").select("*").eq("id", dispute.escrow_id).maybeSingle();
    if (!escrow) throw new Error("Escrow not found");
    if (escrow.user_id !== userRes.user.id && escrow.payee_user_id !== userRes.user.id) {
      throw new Error("Forbidden");
    }

    const [{ data: milestones }, { data: messages }, { data: evidence }, { data: events }] = await Promise.all([
      supabase.from("escrow_milestones").select("title, amount_audd, approved, position").eq("escrow_id", escrow.id).order("position"),
      supabase.from("dispute_messages").select("author_role, body, created_at").eq("dispute_id", dispute_id).order("created_at").limit(60),
      supabase.from("dispute_evidence").select("submitted_by_role, kind, file_name, link_url, description, created_at").eq("dispute_id", dispute_id).order("created_at").limit(40),
      supabase.from("escrow_events").select("event_type, amount_audd, note, created_at").eq("escrow_id", escrow.id).order("created_at").limit(40),
    ]);

    const key = Deno.env.get("LOVABLE_API_KEY");
    if (!key) {
      return new Response(JSON.stringify({ analysis: FALLBACK }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const context = {
      dispute: { ref: dispute.ref, status: dispute.status, reason: dispute.reason, opened_by_role: dispute.opened_by_role, opened_at: dispute.created_at },
      agreement: { description: escrow.description, amount_audd: escrow.amount_audd, token: escrow.token_label ?? "AUDD", condition_type: escrow.condition_type },
      milestones: milestones ?? [],
      messages: messages ?? [],
      evidence: evidence ?? [],
      escrow_events: events ?? [],
    };

    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
      body: JSON.stringify({
        model: "google/gemini-3.6-flash",
        messages: [
          {
            role: "system",
            content:
              "You are the EthosLayer Resolution Assistant for an escrow dispute. You are strictly neutral: never declare a winner, never assign fault unless the evidence is unambiguous, never recommend moving funds automatically. You provide decision support for two humans. Plain English, no jargon, no financial advice. Respond with JSON only.",
          },
          {
            role: "user",
            content:
              `Analyse this dispute and return JSON with keys: summary (2-3 sentences, neutral), keyFacts (array of short strings), obligations (array of short strings describing what the agreement required of each party), evidenceSummary (short paragraph), options (array of 3-4 fair, mutually-agreeable resolution options phrased as suggestions).\n\nDATA:\n` +
              JSON.stringify(context),
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      const status = res.status === 429 || res.status === 402 ? res.status : 500;
      return new Response(JSON.stringify({ error: text, analysis: FALLBACK }), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const json = await res.json();
    let analysis = FALLBACK;
    try {
      analysis = { ...FALLBACK, ...JSON.parse(json.choices?.[0]?.message?.content ?? "{}") };
    } catch (_e) { /* keep fallback */ }

    return new Response(JSON.stringify({ analysis }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("dispute-assistant error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
