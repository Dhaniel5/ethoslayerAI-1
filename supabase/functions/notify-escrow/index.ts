// Sends an escrow lifecycle push notification to both parties.
// Called by the app right after an escrow is funded on-chain.

import { createClient } from "npm:@supabase/supabase-js@2.45.0";
import { notifyEscrow, type EscrowPushKind } from "../_shared/push.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const KINDS: EscrowPushKind[] = ["funded", "released", "settled"];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Missing Authorization header");

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: userRes, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userRes.user) throw new Error("Unauthorized");

    const payload = await req.json().catch(() => ({}));
    const escrowId = typeof payload?.escrow_id === "string" ? payload.escrow_id : "";
    const kind = payload?.kind as EscrowPushKind;
    if (!escrowId) throw new Error("escrow_id is required");
    if (!KINDS.includes(kind)) throw new Error("Invalid notification kind");

    const { data: escrow, error: eErr } = await serviceClient
      .from("escrows")
      .select("id, user_id, payee_user_id, amount_audd")
      .eq("id", escrowId)
      .maybeSingle();
    if (eErr || !escrow) throw new Error("Escrow not found");

    const isParty =
      escrow.user_id === userRes.user.id || escrow.payee_user_id === userRes.user.id;
    if (!isParty) throw new Error("Forbidden");

    await notifyEscrow(serviceClient, {
      kind,
      escrowId: escrow.id,
      amount: escrow.amount_audd,
      userIds: [escrow.user_id, escrow.payee_user_id],
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("notify-escrow error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
