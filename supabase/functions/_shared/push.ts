// Shared push-notification sender for escrow lifecycle events.
// Delivery goes through the Lovable connector gateway to Firebase Cloud
// Messaging (FCM HTTP v1), which covers both Android and iOS (APNs via FCM).
//
// Required secrets: LOVABLE_API_KEY (managed) + FIREBASE_MESSAGING_API_KEY
// (created when the Firebase Cloud Messaging connection is linked).
// When the connection is missing this module logs and no-ops, so escrow
// releases never fail because of notifications.

const GATEWAY_URL = "https://connector-gateway.lovable.dev/firebase_messaging";

export type EscrowPushKind = "funded" | "released" | "settled";

type PushInput = {
  kind: EscrowPushKind;
  escrowId: string;
  amount?: number | null;
  userIds: (string | null | undefined)[];
  note?: string | null;
};

function copy(kind: EscrowPushKind, amount?: number | null, note?: string | null) {
  const amt = amount != null ? `${amount} AUDD` : "Funds";
  switch (kind) {
    case "funded":
      return { title: "Escrow funded", body: `${amt} is locked in the EthosLayer vault.` };
    case "released":
      return { title: "Escrow released", body: note || `${amt} has been paid out to the receiver.` };
    case "settled":
      return { title: "Dispute settled", body: note || `${amt} has been distributed per the accepted resolution.` };
  }
}

/** Best-effort push to every device belonging to the given users. */
export async function notifyEscrow(serviceClient: any, input: PushInput): Promise<void> {
  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    const connectionKey = Deno.env.get("FIREBASE_MESSAGING_API_KEY");
    if (!lovableKey || !connectionKey) {
      console.log("push skipped: Firebase Cloud Messaging is not connected");
      return;
    }

    const userIds = Array.from(new Set(input.userIds.filter(Boolean))) as string[];
    if (userIds.length === 0) return;

    const { data: devices } = await serviceClient
      .from("device_tokens")
      .select("id, token")
      .in("user_id", userIds);
    if (!devices || devices.length === 0) return;

    const { title, body } = copy(input.kind, input.amount, input.note);
    const headers = {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": connectionKey,
      "Content-Type": "application/json",
    };

    for (const device of devices as { id: string; token: string }[]) {
      const res = await fetch(`${GATEWAY_URL}/v1/projects/_/messages:send`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          message: {
            token: device.token,
            notification: { title, body },
            data: {
              path: `/escrow/${input.escrowId}`,
              escrow_id: input.escrowId,
              kind: input.kind,
            },
          },
        }),
      });
      if (!res.ok) {
        const errorBody = await res.text();
        console.error(`push send failed [${res.status}]: ${errorBody}`);
        // Stale registration tokens are removed so they aren't retried.
        if (res.status === 404 || (res.status === 400 && errorBody.includes("INVALID_ARGUMENT"))) {
          await serviceClient.from("device_tokens").delete().eq("id", device.id);
        }
      }
    }
  } catch (err) {
    console.error("notifyEscrow error", err);
  }
}
