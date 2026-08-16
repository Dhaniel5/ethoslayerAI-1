import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, Scale } from "lucide-react";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { Card, CardContent } from "@/components/ui/card";
import { DisputeStatusBadge } from "@/components/dispute/DisputeStatusBadge";
import { listDisputes, type DisputeRow } from "@/lib/disputes";
import type { EscrowRow } from "@/lib/escrow";

export default function Disputes() {
  const [rows, setRows] = useState<(DisputeRow & { escrow: EscrowRow })[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listDisputes().then(setRows).catch(() => setRows([])).finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 pt-24 pb-16">
        <div className="container mx-auto px-6 max-w-4xl">
          <h1 className="text-2xl font-bold mb-1 flex items-center gap-2">
            <Scale className="h-6 w-6 text-primary" /> Disputes
          </h1>
          <p className="text-sm text-muted-foreground mb-6">
            Every dispute you are part of, as buyer or seller.
          </p>

          {loading ? (
            <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : rows.length === 0 ? (
            <Card className="glass-card"><CardContent className="p-10 text-center text-muted-foreground">
              No disputes. Escrows only enter dispute when one party raises an issue.
            </CardContent></Card>
          ) : (
            <div className="space-y-3">
              {rows.map((d) => (
                <Link key={d.id} to={`/disputes/${d.id}`}>
                  <Card className="glass-card hover:border-primary/40 transition-colors">
                    <CardContent className="p-4 flex items-start justify-between gap-4 flex-wrap">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold">{d.ref}</p>
                        <p className="text-sm text-muted-foreground line-clamp-1">{d.reason}</p>
                        <p className="text-xs text-muted-foreground/70 mt-1">
                          {Number(d.escrow?.amount_audd ?? 0).toLocaleString()} {(d.escrow as any)?.token_label ?? "AUDD"} ·
                          {" "}updated {new Date(d.last_activity_at).toLocaleDateString()}
                        </p>
                      </div>
                      <DisputeStatusBadge status={d.status} />
                    </CardContent>
                  </Card>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
