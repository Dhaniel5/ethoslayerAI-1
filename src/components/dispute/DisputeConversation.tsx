import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { sendDisputeMessage, type DisputeMessage, type PartyRole } from "@/lib/disputes";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

export default function DisputeConversation({
  disputeId, messages, role, canPost, onSent,
}: {
  disputeId: string;
  messages: DisputeMessage[];
  role: PartyRole;
  canPost: boolean;
  onSent: () => void;
}) {
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    try {
      await sendDisputeMessage(disputeId, body.trim());
      setBody("");
      onSent();
    } catch (e: any) {
      toast({ title: "Message not sent", description: e.message, variant: "destructive" });
    } finally {
      setSending(false);
    }
  };

  const label = (r: string) => (r === "buyer" ? "Client / Buyer" : r === "seller" ? "Freelancer / Seller" : "System");

  return (
    <div className="space-y-4">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No messages yet. Explain your position to move the dispute forward.
        </p>
      ) : (
        <div className="space-y-3">
          {messages.map((m) => {
            const mine = role !== null && m.author_role === role && m.author_id !== null;
            const system = m.author_role === "system";
            return (
              <div key={m.id} className={cn("flex", mine && !system ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg border p-3",
                    system
                      ? "w-full border-dashed border-border bg-muted/30 text-center"
                      : mine
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-card",
                  )}
                >
                  {!system && (
                    <p className="text-xs font-medium text-muted-foreground mb-1">
                      {label(m.author_role)}{mine ? " (you)" : ""}
                    </p>
                  )}
                  <p className={cn("text-sm whitespace-pre-wrap", system && "text-muted-foreground italic")}>{m.body}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1">
                    {new Date(m.created_at).toLocaleString()}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {canPost ? (
        <div className="space-y-2 pt-2 border-t border-border/50">
          <Textarea
            rows={3}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Write a message to the other party…"
          />
          <div className="flex justify-end">
            <Button onClick={send} disabled={sending || !body.trim()} className="gap-1.5">
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Send message
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground pt-2 border-t border-border/50">
          This dispute is closed — the conversation is read-only.
        </p>
      )}
    </div>
  );
}
