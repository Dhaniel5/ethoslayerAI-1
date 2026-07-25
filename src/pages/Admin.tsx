import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { Loader2, Download, ExternalLink, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { useAuth } from "@/hooks/useAuth";
import Header from "@/components/Header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toCSV, downloadCSV } from "@/lib/csv";
import { explorerAddrUrl, explorerTxUrl } from "@/lib/solanaConfig";

type AdminUser = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  escrow_count: number;
  analysis_count: number;
  watchlist_count: number;
};

type Escrow = {
  id: string;
  user_id: string;
  amount_audd: number;
  status: string;
  payer_wallet: string;
  receiver_wallet: string;
  trust_score: number | null;
  trust_level: string | null;
  created_at: string;
  released_at: string | null;
};

type TopToken = {
  mint_address: string;
  token_symbol: string | null;
  token_name: string | null;
  analysis_count: number;
  avg_integrity: number | null;
};

type Metrics = {
  total_users: number;
  total_escrows: number;
  escrows_released: number;
  escrows_locked: number;
  escrows_disputed: number;
  total_audd_volume: number;
  released_audd_volume: number;
  total_analyses: number;
  active_watchlists: number;
};

const fmt = (n: number) => n.toLocaleString();
const fmtDate = (s: string | null) => (s ? new Date(s).toLocaleString() : "—");
const short = (a: string) => (a ? `${a.slice(0, 4)}…${a.slice(-4)}` : "—");

const Admin = () => {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, loading: roleLoading } = useIsAdmin();

  const [users, setUsers] = useState<AdminUser[]>([]);
  const [escrows, setEscrows] = useState<Escrow[]>([]);
  const [topTokens, setTopTokens] = useState<TopToken[]>([]);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [loading, setLoading] = useState(true);

  const [userQuery, setUserQuery] = useState("");
  const [escrowStatus, setEscrowStatus] = useState<string>("all");

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [u, e, t, m] = await Promise.all([
        supabase.rpc("admin_list_users"),
        supabase.from("escrows").select("*").order("created_at", { ascending: false }),
        supabase.rpc("admin_top_tokens", { _limit: 20 }),
        supabase.rpc("admin_metrics"),
      ]);
      if (cancelled) return;
      setUsers((u.data as AdminUser[]) ?? []);
      setEscrows((e.data as Escrow[]) ?? []);
      setTopTokens((t.data as TopToken[]) ?? []);
      setMetrics((m.data as Metrics) ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="container mx-auto px-6 pt-32">
          <Card className="p-8 glass-card max-w-md mx-auto text-center">
            <ShieldAlert className="h-10 w-10 text-destructive mx-auto mb-3" />
            <h1 className="text-xl font-semibold mb-1">Admin access required</h1>
            <p className="text-sm text-muted-foreground">Your account does not have admin privileges.</p>
          </Card>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter(
    (u) => !userQuery || u.email?.toLowerCase().includes(userQuery.toLowerCase()),
  );
  const filteredEscrows = escrows.filter(
    (e) => escrowStatus === "all" || e.status === escrowStatus,
  );

  const exportUsers = () =>
    downloadCSV(
      `ethoslayer-users-${Date.now()}.csv`,
      toCSV(filteredUsers, [
        "id",
        "email",
        "created_at",
        "last_sign_in_at",
        "escrow_count",
        "analysis_count",
        "watchlist_count",
      ]),
    );

  const exportEscrows = () =>
    downloadCSV(
      `ethoslayer-escrows-${Date.now()}.csv`,
      toCSV(filteredEscrows, [
        "id",
        "user_id",
        "amount_audd",
        "status",
        "payer_wallet",
        "receiver_wallet",
        "trust_score",
        "trust_level",
        "created_at",
        "released_at",
      ]),
    );

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="container mx-auto px-6 pt-28 pb-16">
        <div className="mb-8">
          <h1 className="font-display text-3xl font-semibold tracking-tight">
            <span className="gradient-text">Admin</span> Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Platform-wide visibility into users, settlements, and analyses.
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : (
          <Tabs defaultValue="metrics" className="w-full">
            <TabsList className="mb-6">
              <TabsTrigger value="metrics">Metrics</TabsTrigger>
              <TabsTrigger value="users">Users</TabsTrigger>
              <TabsTrigger value="escrows">Escrows</TabsTrigger>
              <TabsTrigger value="analyses">Analyses</TabsTrigger>
            </TabsList>

            <TabsContent value="metrics">
              {metrics && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <MetricTile label="Total Users" value={fmt(metrics.total_users)} />
                  <MetricTile label="Total Escrows" value={fmt(metrics.total_escrows)} />
                  <MetricTile label="AUDD Volume (all)" value={fmt(metrics.total_audd_volume)} />
                  <MetricTile label="AUDD Released" value={fmt(metrics.released_audd_volume)} />
                  <MetricTile label="Locked" value={fmt(metrics.escrows_locked)} />
                  <MetricTile label="Released" value={fmt(metrics.escrows_released)} />
                  <MetricTile label="Disputed" value={fmt(metrics.escrows_disputed)} />
                  <MetricTile label="Total Analyses" value={fmt(metrics.total_analyses)} />
                  <MetricTile label="Active Watchlists" value={fmt(metrics.active_watchlists)} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="users">
              <Card className="glass-card p-4">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <Input
                    placeholder="Search by email…"
                    value={userQuery}
                    onChange={(e) => setUserQuery(e.target.value)}
                    className="sm:max-w-xs"
                  />
                  <div className="sm:ml-auto flex gap-2">
                    <Badge variant="outline">{filteredUsers.length} users</Badge>
                    <Button size="sm" variant="outline" onClick={exportUsers} className="gap-1.5">
                      <Download className="h-4 w-4" /> CSV
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Signed up</TableHead>
                        <TableHead>Last active</TableHead>
                        <TableHead className="text-right">Escrows</TableHead>
                        <TableHead className="text-right">Analyses</TableHead>
                        <TableHead className="text-right">Watchlist</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredUsers.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="font-medium">{u.email}</TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(u.created_at)}</TableCell>
                          <TableCell className="text-muted-foreground">{fmtDate(u.last_sign_in_at)}</TableCell>
                          <TableCell className="text-right">{u.escrow_count}</TableCell>
                          <TableCell className="text-right">{u.analysis_count}</TableCell>
                          <TableCell className="text-right">{u.watchlist_count}</TableCell>
                        </TableRow>
                      ))}
                      {filteredUsers.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                            No users found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="escrows">
              <Card className="glass-card p-4">
                <div className="flex flex-col sm:flex-row gap-3 mb-4">
                  <Select value={escrowStatus} onValueChange={setEscrowStatus}>
                    <SelectTrigger className="sm:max-w-[180px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All statuses</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="locked">Locked</SelectItem>
                      <SelectItem value="in_review">In review</SelectItem>
                      <SelectItem value="released">Released</SelectItem>
                      <SelectItem value="disputed">Disputed</SelectItem>
                      <SelectItem value="expired">Expired</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                  <div className="sm:ml-auto flex gap-2">
                    <Badge variant="outline">{filteredEscrows.length} escrows</Badge>
                    <Button size="sm" variant="outline" onClick={exportEscrows} className="gap-1.5">
                      <Download className="h-4 w-4" /> CSV
                    </Button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Created</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">AUDD</TableHead>
                        <TableHead>Trust</TableHead>
                        <TableHead>Payer</TableHead>
                        <TableHead>Receiver</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredEscrows.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="text-muted-foreground">{fmtDate(e.created_at)}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="capitalize">
                              {e.status.replace("_", " ")}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right font-medium">{fmt(e.amount_audd)}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {e.trust_score ?? "—"} {e.trust_level ? `(${e.trust_level})` : ""}
                          </TableCell>
                          <TableCell>
                            <a
                              href={explorerAddrUrl(e.payer_wallet)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {short(e.payer_wallet)} <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <a
                              href={explorerAddrUrl(e.receiver_wallet)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {short(e.receiver_wallet)} <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <a
                              href={`/settlement/${e.id}`}
                              className="text-xs text-muted-foreground hover:text-primary"
                            >
                              View
                            </a>
                          </TableCell>
                        </TableRow>
                      ))}
                      {filteredEscrows.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                            No escrows found
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>

            <TabsContent value="analyses">
              <Card className="glass-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold">Top analyzed tokens</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      downloadCSV(
                        `ethoslayer-top-tokens-${Date.now()}.csv`,
                        toCSV(topTokens),
                      )
                    }
                    className="gap-1.5"
                  >
                    <Download className="h-4 w-4" /> CSV
                  </Button>
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Symbol</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Mint</TableHead>
                        <TableHead className="text-right">Analyses</TableHead>
                        <TableHead className="text-right">Avg Integrity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {topTokens.map((t) => (
                        <TableRow key={t.mint_address}>
                          <TableCell className="font-medium">{t.token_symbol ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground">{t.token_name ?? "—"}</TableCell>
                          <TableCell>
                            <a
                              href={explorerAddrUrl(t.mint_address)}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline inline-flex items-center gap-1"
                            >
                              {short(t.mint_address)} <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell className="text-right">{t.analysis_count}</TableCell>
                          <TableCell className="text-right">{t.avg_integrity ?? "—"}</TableCell>
                        </TableRow>
                      ))}
                      {topTokens.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No analyses yet
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </main>
    </div>
  );
};

const MetricTile = ({ label, value }: { label: string; value: string }) => (
  <Card className="glass-card p-4">
    <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
    <div className="mt-1 text-2xl font-semibold font-display">{value}</div>
  </Card>
);

// silence unused import in some tsconfigs
void explorerTxUrl;

export default Admin;
