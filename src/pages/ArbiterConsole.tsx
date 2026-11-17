import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { ArrowLeft, Gavel, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { fetchOnchainConfig, fetchOnchainEscrow, resolveDisputeOnchain } from "@/lib/escrowOnchain";
import { OnChainState, STATE_LABEL, remainingOf, type OnChainConfig, type OnChainEscrow } from "@/lib/escrowProgramCore";

const fmt = (b: bigint) => (Number(b) / 1e6).toLocaleString(undefined, { maximumFractionDigits: 6 });
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const toBase = (ui: string): bigint | null => {
  const n = Number(ui);
  return ui.trim() !== "" && Number.isFinite(n) && n >= 0 ? BigInt(Math.round(n * 1e6)) : null;
};

/**
 * Console for the protocol arbiter wallet. It talks to the chain only (no database), so it works
 * for any escrow. Only the wallet that is the program's current arbiter can resolve a dispute; the
 * program enforces that, this screen just makes it usable.
 */
export default function ArbiterConsole() {
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { connection } = useConnection();
  const { publicKey, signTransaction } = useWallet();
  const [addr, setAddr] = useState("");
  const [pda, setPda] = useState<PublicKey | null>(null);
  const [chain, setChain] = useState<OnChainEscrow | null>(null);
  const [config, setConfig] = useState<OnChainConfig | null>(null);
  const [toReceiver, setToReceiver] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async (address = addr) => {
    setBusy(true);
    try {
      const key = new PublicKey(address.trim());
      const [e, c] = await Promise.all([fetchOnchainEscrow(connection, key), fetchOnchainConfig(connection)]);
      if (!e) throw new Error("No escrow found at that address on this network.");
      setPda(key); setChain(e); setConfig(c);
    } catch (err: any) {
      setChain(null); setPda(null);
      toast({ title: "Couldn't load that escrow", description: err.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  const isArbiter = !!(publicKey && config && publicKey.equals(config.arbiter));
  const remaining = chain ? remainingOf(chain) : 0n;
  const entered = toBase(toReceiver);
  const valid = entered !== null && entered <= remaining;

  const resolve = async () => {
    if (!publicKey || !signTransaction || !pda || entered === null) return;
    setBusy(true);
    try {
      await resolveDisputeOnchain({ connection, signer: { publicKey, signTransaction } }, pda, entered);
      toast({ title: "Dispute resolved on-chain" });
      await load(pda.toBase58());
    } catch (err: any) {
      toast({ title: "Resolve failed", description: err.message, variant: "destructive" });
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-background">
      {!isMobile && <Header />}
      <main className={`container max-w-xl mx-auto px-4 ${isMobile ? "pt-4 pb-28" : "pt-24 pb-16"}`}>
        <button onClick={() => navigate(-1)} className="flex items-center gap-1 text-sm text-muted-foreground mb-4"><ArrowLeft className="h-4 w-4" /> Back</button>
        <div className="flex items-center gap-2 mb-1"><Gavel className="h-5 w-5 text-primary" /><h1 className="font-heading text-xl font-bold">Arbiter console</h1></div>
        <p className="text-xs text-muted-foreground mb-5">Settles disputed on-chain escrows. Only the wallet set as the protocol arbiter can do this; the program checks it.</p>

        <Card className="glass-card mb-4"><CardContent className="p-4 space-y-3">
          <div className="text-xs text-muted-foreground">
            Connected: {publicKey ? short(publicKey.toBase58()) : "no wallet"} ·{" "}
            {config ? (isArbiter ? <b className="text-emerald-400">you are the arbiter</b> : <>arbiter is {short(config.arbiter.toBase58())}</>) : "protocol config not loaded yet"}
          </div>
          <div className="flex gap-2">
            <Input value={addr} onChange={(e) => setAddr(e.target.value)} placeholder="Escrow account address" className="text-xs" />
            <Button onClick={() => load()} disabled={busy || addr.trim() === ""}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Load"}</Button>
          </div>
        </CardContent></Card>

        {chain && pda && (
          <Card className="glass-card"><CardContent className="p-4 space-y-3 text-xs">
            <div className="flex justify-between"><span className="text-muted-foreground">State</span><b>{STATE_LABEL[chain.state]}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Payer</span><span>{short(chain.payer.toBase58())}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Receiver</span><span>{short(chain.receiver.toBase58())}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Total / paid / refunded</span><span>{fmt(chain.amount)} / {fmt(chain.released)} / {fmt(chain.refunded)} AUDD</span></div>
            <div className="flex justify-between font-medium"><span className="text-muted-foreground">Still held</span><span>{fmt(remaining)} AUDD</span></div>

            {chain.state !== OnChainState.Disputed && <div className="text-muted-foreground">Only <b>Disputed</b> escrows can be resolved here.</div>}
            {chain.state === OnChainState.Disputed && !isArbiter && <div className="text-amber-400">Connect the arbiter wallet to resolve this dispute.</div>}
            {chain.state === OnChainState.Disputed && isArbiter && (
              <div className="space-y-3 pt-2 border-t border-border/40">
                <div className="font-medium">How much goes to the receiver?</div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => setToReceiver(String(Number(remaining) / 1e6))}>All to receiver</Button>
                  <Button size="sm" variant="outline" onClick={() => setToReceiver(String(Number(remaining) / 2e6))}>Split 50/50</Button>
                  <Button size="sm" variant="outline" onClick={() => setToReceiver("0")}>Refund the payer</Button>
                </div>
                <Input value={toReceiver} onChange={(e) => setToReceiver(e.target.value)} placeholder="Amount to receiver (AUDD)" inputMode="decimal" />
                {entered !== null && (
                  <div className={valid ? "text-muted-foreground" : "text-destructive"}>
                    {valid ? `Receiver gets ${fmt(entered)} AUDD · payer gets back ${fmt(remaining - entered)} AUDD` : `That is more than the ${fmt(remaining)} AUDD still held.`}
                  </div>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild><Button disabled={busy || !valid}>Resolve dispute</Button></AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Resolve this dispute?</AlertDialogTitle>
                      <AlertDialogDescription>Receiver gets {entered !== null ? fmt(entered) : "—"} AUDD and the payer gets {entered !== null ? fmt(remaining - entered) : "—"} AUDD back. This is final.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={resolve}>Resolve</AlertDialogAction></AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            )}
          </CardContent></Card>
        )}
      </main>
      {!isMobile && <Footer />}
    </div>
  );
}
