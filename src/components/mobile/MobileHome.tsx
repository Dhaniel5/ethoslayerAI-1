import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Bell, FilePlus2, QrCode, Sparkles, ChevronRight, Loader2, Shield } from "lucide-react";
import { useProfile } from "@/hooks/useProfile";
import { listEscrows, shortAddr, type EscrowRow } from "@/lib/escrow";
import { StatusBadge } from "@/components/escrow/StatusBadges";
import CreateEscrowDialog from "@/components/escrow/CreateEscrowDialog";

const STAGE_ORDER: EscrowRow["status"][] = ["pending", "locked", "in_review", "released"];

function stageProgress(status: EscrowRow["status"]) {
  if (status === "disputed" || status === "escalated") return 60;
  if (status === "cancelled" || status === "expired") return 100;
  const idx = STAGE_ORDER.indexOf(status);
  if (idx === -1) return 0;
  return Math.round(((idx + 1) / STAGE_ORDER.length) * 100);
}

function daysLeftLabel(expiresAt: string | null) {
  if (!expiresAt) return null;
  const ms = new Date(expiresAt).getTime() - Date.now();
  const days = Math.ceil(ms / (1000 * 60 * 60 * 24));
  if (days < 0) return "Expired";
  if (days === 0) return "Due today";
  return `${days} day${days === 1 ? "" : "s"} left`;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

const MobileHome = () => {
  const navigate = useNavigate();
  const { profile } = useProfile();
  const [escrows, setEscrows] = useState<EscrowRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      setEscrows(await listEscrows());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const active = useMemo(
    () => escrows.filter((e) => ["pending", "locked", "in_review"].includes(e.status)),
    [escrows],
  );
  const totalActiveValue = useMemo(
    () => active.reduce((sum, e) => sum + Number(e.amount_audd), 0),
    [active],
  );

  const name = profile?.display_name || profile?.username || "there";

  return (
    <div className="min-h-screen bg-background pb-6">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-6 pb-5">
        <div>
          <h1 className="font-display text-xl font-bold text-foreground">
            {greeting()}, {name} 👋
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Here's your trust layer for today.</p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => navigate("/notifications")}
            aria-label="Notifications"
            className="h-10 w-10 rounded-full glass-card flex items-center justify-center text-foreground/80 hover:text-foreground transition-colors"
          >
            <Bell className="h-4.5 w-4.5" />
          </button>
          <button
            type="button"
            onClick={() => navigate("/profile")}
            aria-label="Profile"
            className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-sm font-semibold text-primary-foreground"
          >
            {name.slice(0, 1).toUpperCase()}
          </button>
        </div>
      </div>

      <div className="px-5 space-y-6">
        {/* Total value card */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl p-5 bg-gradient-to-br from-primary to-secondary text-primary-foreground shadow-lg shadow-primary/20"
        >
          <p className="text-xs font-medium text-primary-foreground/80">Total Escrow Value</p>
          {loading ? (
            <Loader2 className="h-5 w-5 animate-spin mt-2 text-primary-foreground/80" />
          ) : (
            <>
              <p className="font-display text-3xl font-bold mt-1">
                ${totalActiveValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-primary-foreground/80 mt-1.5">
                {active.length} active agreement{active.length === 1 ? "" : "s"}
              </p>
            </>
          )}
        </motion.div>

        {/* Quick actions */}
        <div className="grid grid-cols-3 gap-3">
          <QuickAction icon={FilePlus2} label="Create Escrow" onClick={() => navigate("/settlement/new")} />
          <QuickAction icon={QrCode} label="Scan / Pay" onClick={() => navigate("/settlement")} />
          <QuickAction icon={Sparkles} label="AI Assistant" onClick={() => navigate("/analyze")} />
        </div>

        {/* Active agreements */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display text-sm font-semibold text-foreground">Active Agreements</h2>
            <button
              type="button"
              onClick={() => navigate("/settlement")}
              className="text-xs font-medium text-primary flex items-center gap-0.5"
            >
              View all <ChevronRight className="h-3 w-3" />
            </button>
          </div>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : escrows.length === 0 ? (
            <div className="glass-card p-6 text-center">
              <Shield className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
              <p className="text-sm text-muted-foreground mb-3">No agreements yet.</p>
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="text-xs font-medium text-primary"
              >
                Create your first escrow
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {escrows.slice(0, 5).map((e, i) => {
                const days = daysLeftLabel(e.expires_at);
                return (
                  <motion.button
                    key={e.id}
                    type="button"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    onClick={() => navigate(`/settlement/${e.id}`)}
                    className="w-full text-left glass-card p-4 flex items-center gap-3 active:scale-[0.99] transition-transform"
                  >
                    <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <Shield className="h-4.5 w-4.5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium text-foreground truncate">
                          {e.description || `Escrow · ${shortAddr(e.receiver_wallet)}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 mt-1">
                        <StatusBadge status={e.status} />
                        {days && <span className="text-[11px] text-muted-foreground">· {days}</span>}
                      </div>
                      <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-primary to-secondary"
                          style={{ width: `${stageProgress(e.status)}%` }}
                        />
                      </div>
                    </div>
                    <p className="text-sm font-display font-semibold text-foreground shrink-0">
                      {Number(e.amount_audd).toLocaleString()}
                    </p>
                  </motion.button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <CreateEscrowDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={refresh} />
    </div>
  );
};

function QuickAction({
  icon: Icon,
  label,
  onClick,
}: {
  icon: typeof FilePlus2;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-card flex flex-col items-center justify-center gap-2 py-4 px-2 active:scale-[0.97] transition-transform"
    >
      <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center">
        <Icon className="h-4.5 w-4.5 text-primary" />
      </div>
      <span className="text-[11px] font-medium text-foreground text-center leading-tight">{label}</span>
    </button>
  );
}

export default MobileHome;
