import { useEffect, useState } from "react";
import { Handshake, Loader2 } from "lucide-react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { proposeResolution, type DisputeProposal } from "@/lib/disputes";
import { useToast } from "@/hooks/use-toast";

type Kind = DisputeProposal["kind"];

const OPTIONS: { value: Kind; label: string; help: string }[] = [
  { value: "release_seller", label: "Release funds to seller", help: "The full escrow amount goes to the receiver." },
  { value: "refund_buyer", label: "Refund buyer", help: "The full escrow amount returns to the payer." },
  { value: "split", label: "Split funds 50 / 50", help: "Each party receives half of the escrow." },
  { value: "custom", label: "Custom amount", help: "Choose exactly how much each party receives." },
];

export default function ProposeResolutionDialog({
  open, onOpenChange, disputeId, total, token, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  disputeId: string;
  total: number;
  token: string;
  onDone: () => void;
}) {
  const { toast } = useToast();
  const [kind, setKind] = useState<Kind>("split");
  const [buyer, setBuyer] = useState(total / 2);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (kind === "release_seller") setBuyer(0);
    else if (kind === "refund_buyer") setBuyer(total);
    else if (kind === "split") setBuyer(Number((total / 2).toFixed(6)));
  }, [kind, total]);

  const seller = Number((total - buyer).toFixed(6));
  const invalid = buyer < 0 || buyer > total || Number.isNaN(buyer);

  const submit = async () => {
    setSaving(true);
    try {
      await proposeResolution({
        disputeId, kind, amountBuyer: Number(buyer.toFixed(6)), amountSeller: seller, note: note || null,
      });
      toast({ title: "Resolution proposed", description: "The other party has been asked to accept it." });
      onOpenChange(false);
      setNote("");
      onDone();
    } catch (e: any) {
      toast({ title: "Could not propose resolution", description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Handshake className="h-5 w-5 text-primary" /> Propose a resolution
          </DialogTitle>
          <DialogDescription>
            Nothing moves until the other party accepts. You can change the split before submitting.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setKind(o.value)}
              className={`w-full text-left p-3 rounded-lg border transition-colors ${
                kind === o.value ? "border-primary bg-primary/5" : "border-border hover:border-primary/40"
              }`}
            >
              <p className="text-sm font-medium">{o.label}</p>
              <p className="text-xs text-muted-foreground">{o.help}</p>
            </button>
          ))}
        </div>

        {kind === "custom" && (
          <div className="space-y-2">
            <Label htmlFor="buyer-amount">Amount to buyer ({token})</Label>
            <Input
              id="buyer-amount"
              type="number"
              min={0}
              max={total}
              step="0.000001"
              value={buyer}
              onChange={(e) => setBuyer(Number(e.target.value))}
            />
            <p className="text-xs text-muted-foreground">
              Escrow total: {total.toLocaleString()} {token}. The remainder goes to the seller.
            </p>
          </div>
        )}

        <div className="space-y-2">
          <Label htmlFor="reso-note">Explanation (optional)</Label>
          <Textarea
            id="reso-note" rows={3} value={note} onChange={(e) => setNote(e.target.value)}
            placeholder="Why is this a fair outcome?"
          />
        </div>

        <div className="rounded-lg border border-border p-3 text-sm space-y-1">
          <p className="text-xs text-muted-foreground mb-1">Summary</p>
          <p>Buyer receives: <span className="font-semibold">{buyer.toLocaleString()} {token}</span></p>
          <p>Seller receives: <span className="font-semibold">{seller.toLocaleString()} {token}</span></p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || invalid} className="gap-1.5">
            {saving && <Loader2 className="h-4 w-4 animate-spin" />} Submit proposal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
