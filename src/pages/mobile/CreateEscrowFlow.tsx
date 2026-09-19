import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  ArrowLeft, Check, CheckCircle2, X, Loader2, Plus, Trash2, ShieldCheck, Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { computeTrustScore, isValidSolanaAddress } from "@/lib/trustScore";
import { createEscrow, escrowShareLink } from "@/lib/escrow";
import { supabase } from "@/integrations/supabase/client";
import WalletConnectButton from "@/components/WalletConnectButton";

const STEPS = ["Details", "Terms", "Review", "Sign"] as const;

export default function CreateEscrowFlow() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { connection } = useConnection();
  const { publicKey, signTransaction, connected } = useWallet();

  const [step, setStep] = useState(0);
  const [receiver, setReceiver] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [useMilestones, setUseMilestones] = useState(false);
  const [milestones, setMilestones] = useState<{ title: string; amount: string }[]>([{ title: "", amount: "" }]);
  const [submitting, setSubmitting] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);

  const payer = publicKey?.toBase58() ?? "";
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

  const milestoneSum = milestones.reduce((s, m) => s + (Number(m.amount) || 0), 0);
  const milestoneMismatch = useMilestones && amountNum > 0 && Math.abs(milestoneSum - amountNum) > 0.001;

  const detailsValid = isValidSolanaAddress(receiver) && amountNum > 0;
  const termsValid = !useMilestones || (!milestoneMismatch && milestones.every((m) => m.title.trim() && Number(m.amount) > 0));
  const walletMatchesPayer = connected && publicKey?.toBase58() === payer && payer.length > 0;
  const canSubmit = detailsValid && termsValid && walletMatchesPayer && isValidSolanaAddress(payer) && !submitting;

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => (step === 0 ? navigate(-1) : setStep((s) => s - 1));

  const handleSubmit = async () => {
    if (!canSubmit || !publicKey || !signTransaction) return;
    setSubmitting(true);
    try {
      const created = await createEscrow(
        {
          payer_wallet: payer,
          receiver_wallet: receiver,
          amount_audd: amountNum,
          description: description.trim() || undefined,
          expires_at: expiresAt ? new Date(expiresAt).toISOString() : null,
          trust,
          milestones: useMilestones
            ? milestones.filter((m) => m.title.trim() && Number(m.amount) > 0)
                .map((m) => ({ title: m.title.trim(), amount_audd: Number(m.amount) }))
            : undefined,
        },
        { connection, signer: { publicKey, signTransaction } },
      );
      toast({ title: "Escrow created", description: "AUDD locked on-chain in the vault." });
      void supabase.functions.invoke("notify-escrow", { body: { escrow_id: created.id, kind: "funded" } });
      setCreatedId(created.id);
    } catch (e: any) {
      toast({ title: "Could not create escrow", description: e.message, variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (createdId) {
    return <CreatedScreen id={createdId} onDone={() => navigate(`/settlement/${createdId}`)} />;
  }

  return (
    <div className="min-h-screen bg-background pb-6 flex flex-col">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button type="button" onClick={back} aria-label="Back"
          className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-foreground">Create Escrow</h1>
      </div>

      {/* Stepper */}
      <div className="flex items-center px-5 pb-6 gap-1.5">
        {STEPS.map((label, i) => (
          <div key={label} className="flex-1 flex items-center gap-1.5">
            <div
              className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0 ${
                i < step ? "bg-primary text-primary-foreground" :
                i === step ? "bg-primary/15 text-primary border border-primary" :
                "bg-muted text-muted-foreground"
              }`}
            >
              {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
            </div>
            {i < STEPS.length - 1 && <div className={`h-0.5 flex-1 rounded ${i < step ? "bg-primary" : "bg-muted"}`} />}
          </div>
        ))}
      </div>

      <div className="px-5 flex-1">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div key="details" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <Field label="Amount (AUDD)">
                <Input type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" className="text-lg font-display" />
              </Field>
              <Field label="Recipient wallet">
                <Input value={receiver} onChange={(e) => setReceiver(e.target.value)} placeholder="Solana address" className="font-mono text-xs" />
                {receiver && !isValidSolanaAddress(receiver) && <p className="text-xs text-destructive mt-1">Invalid Solana address.</p>}
              </Field>
              <Field label="Description">
                <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What's this agreement for?" rows={3} />
              </Field>
              <Field label="Expiry (optional)">
                <Input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              </Field>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="terms" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <div className="glass-card p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-foreground">Release conditions</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {useMilestones ? "Funds release per approved milestone." : "Funds release on your approval."}
                  </p>
                </div>
                <Button type="button" size="sm" variant={useMilestones ? "secondary" : "outline"} onClick={() => setUseMilestones((v) => !v)}>
                  {useMilestones ? "Simple" : "Milestones"}
                </Button>
              </div>

              {useMilestones && (
                <div className="space-y-2">
                  {milestones.map((m, i) => (
                    <div key={i} className="glass-card p-3 flex gap-2 items-center">
                      <div className="flex-1 space-y-1.5">
                        <Input value={m.title} onChange={(e) => { const n = [...milestones]; n[i].title = e.target.value; setMilestones(n); }} placeholder={`Milestone ${i + 1} title`} className="h-8 text-sm" />
                        <Input type="number" min="0" step="0.01" value={m.amount} onChange={(e) => { const n = [...milestones]; n[i].amount = e.target.value; setMilestones(n); }} placeholder="AUDD amount" className="h-8 text-sm" />
                      </div>
                      <Button type="button" size="icon" variant="ghost" onClick={() => setMilestones(milestones.filter((_, j) => j !== i))} disabled={milestones.length === 1}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" size="sm" variant="outline" onClick={() => setMilestones([...milestones, { title: "", amount: "" }])} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" /> Add milestone
                  </Button>
                  {milestoneMismatch && (
                    <p className="text-xs text-amber-400">Milestone total ({milestoneSum}) must equal escrow amount ({amountNum}).</p>
                  )}
                </div>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="review" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-5">
              <div className="text-center pt-2">
                <div className="inline-flex items-center gap-1.5 text-xs text-emerald-400 font-medium mb-4">
                  <CheckCircle2 className="h-3.5 w-3.5" /> AI Analysis Complete
                </div>
                <div className="relative h-28 w-28 mx-auto">
                  <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
                    <circle cx="50" cy="50" r="42" strokeWidth="8" className="fill-none stroke-muted" />
                    <circle
                      cx="50" cy="50" r="42" strokeWidth="8" strokeLinecap="round"
                      className={`fill-none ${trust.level === "high" ? "stroke-[hsl(var(--score-healthy))]" : trust.level === "medium" ? "stroke-[hsl(var(--score-moderate))]" : "stroke-[hsl(var(--score-danger))]"}`}
                      strokeDasharray={264}
                      strokeDashoffset={264 - (264 * trust.score) / 100}
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="font-display text-2xl font-bold text-foreground">{trust.score}</span>
                    <span className="text-[10px] text-muted-foreground">/100</span>
                  </div>
                </div>
                <p className={`text-sm font-semibold mt-3 ${trust.level === "high" ? "score-healthy" : trust.level === "medium" ? "score-moderate" : "score-danger"}`}>
                  {trust.level === "high" ? "Low Risk" : trust.level === "medium" ? "Medium Risk" : "High Risk"}
                </p>
              </div>

              <div className="glass-card p-4 space-y-2.5">
                {trust.factors.slice(0, 5).map((f, i) => (
                  <div key={i} className="flex items-start gap-2 text-xs">
                    {f.impact === "positive" ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 mt-0.5 shrink-0" /> :
                     f.impact === "negative" ? <X className="h-3.5 w-3.5 text-destructive mt-0.5 shrink-0" /> :
                     <div className="h-1.5 w-1.5 rounded-full bg-muted-foreground mt-1.5 ml-1 shrink-0" />}
                    <div><span className="font-medium text-foreground">{f.label}.</span> <span className="text-muted-foreground">{f.detail}</span></div>
                  </div>
                ))}
              </div>

              <div className="glass-card p-4">
                <div className="flex items-center gap-2 mb-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-primary" />
                  <p className="text-xs font-semibold text-foreground">AI Insights</p>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {trust.level === "high"
                    ? "The terms are fair and well balanced based on the information provided."
                    : "Consider adding a clearer description or expiry date to reduce potential disputes."}
                </p>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="sign" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <div className="glass-card p-4 space-y-2 text-sm">
                <SummaryRow label="Amount" value={`${amountNum.toLocaleString()} AUDD`} />
                <SummaryRow label="Recipient" value={`${receiver.slice(0, 4)}…${receiver.slice(-4)}`} mono />
                <SummaryRow label="Release" value={useMilestones ? `${milestones.length} milestone(s)` : "Simple approval"} />
              </div>

              {!connected ? (
                <div className="glass-card p-4 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">Connect your wallet to sign the on-chain AUDD lock.</p>
                  <WalletConnectButton size="default" variant="default" />
                </div>
              ) : !walletMatchesPayer ? (
                <p className="text-xs text-destructive text-center">Connected wallet doesn't match this agreement's payer. Reconnect the right wallet.</p>
              ) : (
                <p className="text-xs text-muted-foreground text-center">
                  Connected as <span className="font-mono">{payer.slice(0, 4)}…{payer.slice(-4)}</span>. Ready to lock AUDD on-chain.
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-5 pt-6">
        {step < 3 ? (
          <Button
            className="w-full"
            disabled={(step === 0 && !detailsValid) || (step === 1 && !termsValid)}
            onClick={next}
          >
            Next
          </Button>
        ) : (
          <Button className="w-full gap-1.5" disabled={!canSubmit} onClick={handleSubmit}>
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Lock AUDD &amp; Create
          </Button>
        )}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span className={`text-foreground font-medium ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}

function CreatedScreen({ id, onDone }: { id: string; onDone: () => void }) {
  const { toast } = useToast();
  return (
    <div className="min-h-screen bg-background flex flex-col px-5 pt-14 pb-6">
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="mx-auto h-16 w-16 rounded-full bg-emerald-500/15 flex items-center justify-center mb-5">
        <CheckCircle2 className="h-8 w-8 text-emerald-400" />
      </motion.div>
      <h1 className="font-display text-xl font-bold text-foreground text-center">Escrow Created</h1>
      <p className="text-sm text-muted-foreground text-center mt-1.5">AUDD is locked on-chain. Share the link with your recipient.</p>

      <div className="glass-card p-4 mt-8 flex items-center gap-2">
        <p className="flex-1 text-xs font-mono text-muted-foreground truncate">{escrowShareLink(id)}</p>
        <button
          type="button"
          onClick={() => { navigator.clipboard.writeText(escrowShareLink(id)); toast({ title: "Link copied" }); }}
          className="text-primary shrink-0"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-auto pt-6">
        <Button className="w-full" onClick={onDone}>View Agreement</Button>
      </div>
    </div>
  );
}
