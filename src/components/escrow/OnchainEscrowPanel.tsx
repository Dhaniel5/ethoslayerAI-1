import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { AlertTriangle, Copy, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { openDispute } from "@/lib/disputes";
import { explorerAddrUrl, explorerTxUrl } from "@/lib/solanaConfig";
import type { EscrowRow, MilestoneRow } from "@/lib/escrow";
import {
  approveMilestoneOnchain, escrowAddress, fetchOnchainEscrow, raiseDisputeOnchain,
  refundOnchain, releaseOnchain, syncStatusFromChain, type ChainCtx,
} from "@/lib/escrowOnchain";
import { OnChainState, STATE_LABEL, remainingOf, type OnChainEscrow } from "@/lib/escrowProgramCore";

const fmt = (b: bigint) => (Number(b) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

function Confirm(props: {
  label: string; title: string; description: string; onConfirm: () => void;
  disabled?: boolean; variant?: "default" | "outline" | "destructive"; confirmLabel?: string; size?: "default" | "sm";
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button variant={props.variant ?? "default"} size={props.size} disabled={props.disabled}>{props.label}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={props.onConfirm}>{props.confirmLabel ?? "Confirm"}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

interface Props {
  escrow: EscrowRow;
  milestones: MilestoneRow[];
  disputeId?: string | null;
  onChanged: () => void;
}

/** Shows an on-chain escrow's real state (read from the chain) and the actions the connected wallet may take. */
export default function OnchainEscrowPanel({ escrow, milestones, disputeId, onChanged }: Props) {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [chain, setChain] = useState<OnChainEscrow | null | undefined>(undefined);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const synced = useRef(false);

  const pda = useMemo(() => {
    try { return escrowAddress(escrow.payer_wallet, escrow.id); } catch { return null; }
  }, [escrow.payer_wallet, escrow.id]);

  const refresh = useCallback(async () => {
    if (!pda) return;
    try {
      setLoadErr(null);
      setChain(await fetchOnchainEscrow(connection, pda));
    } catch (e: any) {
      setLoadErr(e.message ?? "Could not read the escrow from the network.");
      setChain(null);
    }
  }, [connection, pda]);

  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    if (chain && !synced.current) {
      synced.current = true;
      syncStatusFromChain(escrow, chain.state).then(() => undefined);
    }
  }, [chain, escrow]);

  const me = publicKey?.toBase58();
  const role = !chain || !me ? "none" : chain.payer.toBase58() === me ? "payer" : chain.receiver.toBase58() === me ? "receiver" : "none";
  const ctx: ChainCtx | null = publicKey && signTransaction ? { connection, signer: { publicKey, signTransaction } } : null;
  const expired = chain ? BigInt(Math.floor(Date.now() / 1000)) > chain.expiry : false;

  const run = async (label: string, fn: (c: ChainCtx) => Promise<string | void>, done: string) => {
    if (!ctx) { toast({ title: "Connect your wallet first", variant: "destructive" }); return; }
    setBusy(label);
    try {
      const sig = await fn(ctx);
      toast({ title: done, description: sig ? "Confirmed on-chain." : undefined });
      await refresh();
      onChanged();
    } catch (e: any) {
      toast({ title: `${label} failed`, description: e.message, variant: "destructive" });
    } finally { setBusy(null); }
  };

  const raiseDispute = () => run("Raise dispute", async (c) => {
    await raiseDisputeOnchain(c, pda!);
    try {
      const id = await openDispute(escrow.id, reason || "No reason provided");
      navigate(`/disputes/${id}`);
    } catch (e: any) {
      toast({ title: "Escrow frozen, but the dispute room didn't open", description: e.message, variant: "destructive" });
    }
  }, "Dispute raised — the funds are frozen on-chain");

  if (!pda) return null;
  const state = chain?.state;

  return (
    <Card className="glass-card mb-6 border-primary/30">
      <CardContent className="p-5 space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <span className="font-heading font-semibold text-sm">On-chain escrow</span>
          </div>
          <div className="flex items-center gap-2">
            {chain && <span className="text-xs px-2 py-0.5 rounded-full bg-primary/15 text-primary">{STATE_LABEL[chain.state]}</span>}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={refresh} aria-label="Refresh"><RefreshCw className="h-3.5 w-3.5" /></Button>
          </div>
        </div>

        {chain === undefined && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading the escrow from the network…</div>}
        {loadErr && <div className="text-xs text-destructive">{loadErr}</div>}
        {chain === null && !loadErr && (
          <div className="text-xs text-amber-400 flex gap-2"><AlertTriangle className="h-4 w-4 shrink-0" /> This escrow isn't on the network the app is connected to. Check the cluster and program ID settings.</div>
        )}

        {chain && (
          <>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <span className="text-muted-foreground">Amount</span><span className="text-right">{fmt(chain.amount)} AUDD</span>
              <span className="text-muted-foreground">Paid to receiver</span><span className="text-right">{fmt(chain.released)} AUDD</span>
              <span className="text-muted-foreground">Refunded to payer</span><span className="text-right">{fmt(chain.refunded)} AUDD</span>
              <span className="text-muted-foreground">Still held</span><span className="text-right font-medium">{fmt(remainingOf(chain))} AUDD</span>
              <span className="text-muted-foreground">Payer refund opens</span>
              <span className="text-right">{new Date(Number(chain.expiry) * 1000).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>Account {short(pda.toBase58())}</span>
              <button className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => { navigator.clipboard?.writeText(pda.toBase58()); toast({ title: "Escrow account address copied" }); }}><Copy className="h-3 w-3" /> copy</button>
              <a className="inline-flex items-center gap-1 hover:text-foreground" href={explorerAddrUrl(pda.toBase58())} target="_blank" rel="noreferrer"><ExternalLink className="h-3 w-3" /> explorer</a>
            </div>

            {!publicKey && <div className="text-xs text-muted-foreground">Connect your wallet to act on this escrow.</div>}
            {publicKey && role === "none" && <div className="text-xs text-muted-foreground">The connected wallet ({short(me!)}) is not the payer or receiver of this escrow.</div>}
            {publicKey && role !== "none" && <div className="text-xs text-muted-foreground">Connected as the <b className="text-foreground">{role}</b> ({short(me!)}).</div>}

            {state === OnChainState.Locked && role !== "none" && (
              <div className="space-y-3">
                {role === "payer" && chain.milestones.length === 0 && (
                  <Confirm label={busy === "Release" ? "Releasing…" : "Release to receiver"} disabled={!!busy}
                    title={`Release ${fmt(remainingOf(chain))} AUDD to the receiver?`}
                    description="This sends the funds on-chain to the receiver's wallet. It can't be undone." confirmLabel="Release"
                    onConfirm={() => run("Release", (c) => releaseOnchain(c, escrow, pda), "Funds released")} />
                )}
                {role === "payer" && chain.milestones.length > 0 && (
                  <div className="space-y-2">
                    <div className="text-xs font-medium">Milestones</div>
                    {chain.milestones.map((m, i) => (
                      <div key={i} className="flex items-center justify-between gap-2 text-xs rounded-lg border border-border/40 p-2">
                        <span>{milestones[i]?.title ?? `Milestone ${i + 1}`} · {fmt(m.amount)} AUDD</span>
                        {m.approved ? <span className="text-emerald-400">paid</span> : (
                          <Confirm size="sm" variant="outline" label="Approve & pay" disabled={!!busy}
                            title={`Pay ${fmt(m.amount)} AUDD for this milestone?`} description="This sends that slice to the receiver on-chain. It can't be undone." confirmLabel="Pay"
                            onConfirm={() => run("Approve milestone", (c) => approveMilestoneOnchain(c, escrow, pda, i, milestones[i]?.id), "Milestone paid")} />
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {role === "payer" && (
                  <div>
                    <Confirm variant="outline" label="Refund me" disabled={!!busy || !expired}
                      title={`Take back ${fmt(remainingOf(chain))} AUDD?`} description="Only possible after the expiry date, and only if there's no open dispute." confirmLabel="Refund"
                      onConfirm={() => run("Refund", (c) => refundOnchain(c, escrow, pda), "Refunded to you")} />
                    {!expired && <span className="ml-2 text-xs text-muted-foreground">available after {new Date(Number(chain.expiry) * 1000).toLocaleDateString()}</span>}
                  </div>
                )}
                {role === "receiver" && (
                  <Confirm variant="outline" label="Refund the payer" disabled={!!busy}
                    title={`Return ${fmt(remainingOf(chain))} AUDD to the payer?`} description="You are voluntarily giving the money back. It can't be undone." confirmLabel="Refund payer"
                    onConfirm={() => run("Refund", (c) => refundOnchain(c, escrow, pda), "Refunded to the payer")} />
                )}
                <div className="space-y-2 pt-1">
                  <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Something wrong? Describe the problem (optional)" className="text-xs min-h-[60px]" />
                  <Confirm variant="destructive" label="Raise a dispute" disabled={!!busy}
                    title="Raise a dispute?" description="This freezes the escrow on-chain. Neither side can release or refund until the arbiter resolves it."
                    confirmLabel="Freeze & dispute" onConfirm={raiseDispute} />
                </div>
              </div>
            )}

            {state === OnChainState.Disputed && (
              <div className="space-y-2">
                <div className="text-xs text-amber-400">Frozen. Only the protocol arbiter can settle this escrow now.</div>
                {disputeId ? (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/disputes/${disputeId}`)}>Open dispute room</Button>
                ) : role !== "none" && (
                  <Button size="sm" variant="outline" disabled={!!busy} onClick={() => run("Open dispute room", async () => { const id = await openDispute(escrow.id, reason || "No reason provided"); navigate(`/disputes/${id}`); }, "Dispute room opened")}>Open dispute room</Button>
                )}
                <Button size="sm" variant="ghost" onClick={() => navigate("/arbiter")}>Arbiter console</Button>
              </div>
            )}

            {(state === OnChainState.Released || state === OnChainState.Refunded || state === OnChainState.Resolved) && (
              <div className="text-xs text-muted-foreground">This escrow is settled. Final state on-chain: <b className="text-foreground">{STATE_LABEL[chain.state]}</b>.</div>
            )}
          </>
        )}
        {busy && <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {busy}… approve it in your wallet.</div>}
      </CardContent>
    </Card>
  );
}
