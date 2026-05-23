import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, History as HistoryIcon, Loader2 } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Button } from "@/components/ui/button";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { listAllEvents, shortAddr, type EscrowRow, type EventRow } from "@/lib/escrow";
import { StatusBadge } from "@/components/escrow/StatusBadges";

export default function TransactionHistory() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<(EventRow & { escrow: EscrowRow })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listAllEvents().then((r) => { setRows(r); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-5xl">
          <Button variant="ghost" size="sm" onClick={() => navigate("/settlement")} className="mb-4 gap-1.5">
            <ArrowLeft className="h-4 w-4" /> Back
          </Button>

          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
            <div className="flex items-center gap-3 mb-2">
              <HistoryIcon className="h-6 w-6 text-primary" />
              <h1 className="font-display text-2xl font-bold">Transaction History</h1>
            </div>
            <p className="text-sm text-muted-foreground mb-8">
              Every escrow lock, release, milestone approval, and dispute event on Solana.
            </p>
          </motion.div>

          {loading ? (
            <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
          ) : rows.length === 0 ? (
            <div className="glass-card p-10 text-center">
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            </div>
          ) : (
            <div className="glass-card overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Parties</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Tx</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow
                      key={r.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/settlement/${r.escrow_id}`)}
                    >
                      <TableCell className="capitalize font-medium">{r.event_type.replace("_", " ")}</TableCell>
                      <TableCell>{r.amount_audd ? `${Number(r.amount_audd).toLocaleString()} AUDD` : "—"}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {shortAddr(r.escrow.payer_wallet)} → {shortAddr(r.escrow.receiver_wallet)}
                      </TableCell>
                      <TableCell><StatusBadge status={r.escrow.status} /></TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.tx_signature ?? "—"}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
