import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Plus, Trash2, ShieldCheck, Loader2, X, AlertCircle, CheckCircle2, Wallet } from "lucide-react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { computeTrustScore, suggestSaferTerms, isValidSolanaAddress } from "@/lib/trustScore";
import { createEscrow } from "@/lib/escrow";
import { ESCROW_VAULT_ADDRESS } from "@/lib/solanaConfig";
import { TrustBadge } from "./StatusBadges";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}

export default function CreateEscrowDialog({ open, onOpenChange, onCreated }: Props) {
  const { toast } = useToast();
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();
  const { setVisible } = useWalletModal();
  const [payer, setPayer] = useState("");
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [useMilestones, setUseMilestones] = useState(false);
  const [milestones, setMilestones] = useState<{ title: string; amount: string }[]>([
    { title: "", amount: "" },
  ]);
  const [submitting, setSubmitting] = useState(false);

  // Auto-fill payer from connected wallet.
  useEffect(() => {
    if (publicKey && !payer) setPayer(publicKey.toBase58());
  }, [publicKey, payer]);

  const amountNum = Number(amount) || 0;

  const trust = useMemo(
    () =>
      computeTrustScore({
        payer,
        receiver,
        amount: amountNum,
        hasMilestones: useMilestones && milestones.some((m) => m.title && Number(m.amount) > 0),
        hasDescription: description.trim().length > 5,
        hasExpiry: !!expiresAt,
      }),
    [payer, receiver, amountNum, useMilestones, milestones, description, expiresAt],
  );

  const tips = useMemo(
    () =>
      suggestSaferTerms(trust, {
        payer, receiver, amount: amountNum,
        hasMilestones: useMilestones, hasDescription: !!description, hasExpiry: !!expiresAt,
      }),
    [trust, payer, receiver, amountNum, useMilestones, description, expiresAt],
  );

  const milestoneSum = milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const milestoneMismatch =
    useMilestones && amountNum > 0 && Math.abs(milestoneSum - amountNum) > 0.001;

  const reset = () => {
    setPayer(""); setReceiver(""); setAmount(""); setDescription("");
    setExpiresAt(""); setUseMilestones(false);
    setMilestones([{ title: "", amount: "" }]);
  };

  const walletMatchesPayer = connected && publicKey?.toBase58() === payer;

  const canSubmit =
    isValidSolanaAddress(payer) &&
    isValidSolanaAddress(receiver) &&
    amountNum > 0 &&
    !milestoneMismatch &&
    walletMatchesPayer &&
    !submitting;

  const handleSubmit = async () => {
    if (!canSubmit || !publicKey || !signTransaction) return;
    setSubmitting(true);
    try {
      await createEscrow(
        {
          payer_wallet: payer,
          receiver_wallet: receiver,
          amount_audd: amountNum,
          description: description.trim() || undefined,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          trust,
          milestones: useMilestones
            ? milestones
                .filter((m) => m.title.trim() && Number(m.amount) > 0)
                .map((m) => ({ title: m.title.trim(), amount_audd: Number(m.amount) }))
            : undefined,
        },
        { connection, signer: { publicKey, signTransaction } },
      );
      toast({ title: "Escrow created", description: "AUDD locked on-chain in the vault." });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (e: any) {
      toast({ title: "Could not create escrow", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display">Create Escrow Contract</DialogTitle>
          <DialogDescription>
            Lock AUDD on Solana under programmable trust rules. EthosLayer never custodies funds — it coordinates conditions.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Payer wallet</Label>
              <Input value={payer} onChange={(e) => setPayer(e.target.value)} placeholder="Solana address" className="font-mono text-xs" />
              {payer && !isValidSolanaAddress(payer) && (
                <p className="text-xs text-destructive mt-1">Invalid Solana address.</p>
              )}
            </div>
            <div>
              <Label>Receiver wallet</Label>
              <Input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Solana address" className="font-mono text-xs" />
              {receiver && !isValidSolanaAddress(receiver) && (
                <p className="text-xs text-destructive mt-1">Invalid Solana address.</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label>Amount (AUDD)</Label>
              <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
            </div>
            <div>
              <Label>Expiry (optional)</Label>
              <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Agreement description</Label>
            <Textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Payment for Q3 design contract — delivery of brand system + 3 revisions."
              rows={3}
            />
          </div>

          <div className="rounded-lg border border-border p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold">Release conditions</p>
                <p className="text-xs text-muted-foreground">
                  {useMilestones ? "Funds release per approved milestone." : "Funds release on payer approval."}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant={useMilestones ? "secondary" : "outline"}
                onClick={() => setUseMilestones((v) => !v)}
              >
                {useMilestones ? "Switch to simple approval" : "Use milestones"}
              </Button>
            </div>

            {useMilestones && (
              <div className="space-y-2">
                {milestones.map((m, i) => (
                  <div key={i} className="flex gap-2">
                    <Input
                      value={m.title}
                      onChange={(e) => {
                        const next = [...milestones]; next[i].title = e.target.value; setMilestones(next);
                      }}
                      placeholder={`Milestone ${i + 1} title`}
                      className="flex-1"
                    />
                    <Input
                      type="number" min="0" step="0.01"
                      value={m.amount}
                      onChange={(e) => {
                        const next = [...milestones]; next[i].amount = e.target.value; setMilestones(next);
                      }}
                      placeholder="AUDD"
                      className="w-32"
                    />
                    <Button
                      type="button" size="icon" variant="ghost"
                      onClick={() => setMilestones(milestones.filter((_, j) => j !== i))}
                      disabled={milestones.length === 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button
                  type="button" size="sm" variant="outline"
                  onClick={() => setMilestones([...milestones, { title: "", amount: "" }])}
                >
                  <Plus className="h-3.5 w-3.5" /> Add milestone
                </Button>
                {milestoneMismatch && (
                  <p className="text-xs text-amber-400 flex items-center gap-1.5">
                    <AlertCircle className="h-3.5 w-3.5" />
                    Milestone total ({milestoneSum}) must equal escrow amount ({amountNum}).
                  </p>
                )}
              </div>
            )}
          </div>

          {/* AI Trust Panel */}
          <motion.div
            key={trust.score}
            initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}
            className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" />
                <p className="text-sm font-semibold">EthosLayer Trust Score</p>
              </div>
              <TrustBadge level={trust.level} score={trust.score} />
            </div>

            <div className="space-y-1.5">
              {trust.factors.slice(0, 5).map((f, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {f.impact === "positive" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" />
                  ) : f.impact === "negative" ? (
                    <X className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" />
                  ) : (
                    <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 ml-1 shrink-0" />
                  )}
                  <div>
                    <span className="font-medium text-foreground">{f.label}.</span>{" "}
                    <span className="text-muted-foreground">{f.detail}</span>
                  </div>
                </div>
              ))}
            </div>

            {tips.length > 0 && (
              <div className="pt-2 border-t border-border/50">
                <p className="text-xs font-semibold text-foreground mb-1">Suggested safer terms</p>
                <ul className="text-xs text-muted-foreground space-y-0.5 list-disc list-inside">
                  {tips.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            )}
          </motion.div>
        </div>

        {!connected && (
          <div className="flex items-center justify-between gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs text-amber-300">Connect Phantom to sign the on-chain AUDD lock.</p>
            <Button size="sm" variant="outline" onClick={() => setVisible(true)} className="gap-1.5">
              <Wallet className="h-3.5 w-3.5" /> Connect
            </Button>
          </div>
        )}
        {connected && !walletMatchesPayer && payer && (
          <p className="text-xs text-destructive">
            Connected wallet doesn't match the payer wallet. Switch wallets or use the connected address.
          </p>
        )}
        <p className="text-[11px] text-muted-foreground">
          AUDD will be transferred to vault <span className="font-mono">{ESCROW_VAULT_ADDRESS.slice(0, 8)}…{ESCROW_VAULT_ADDRESS.slice(-4)}</span> on Solana. Release requires the vault wallet.
        </p>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSubmit} disabled={!canSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Lock AUDD & Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
