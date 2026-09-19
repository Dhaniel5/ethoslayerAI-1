import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Bell, Loader2, ShieldAlert, MessageSquare, Gavel, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface NotificationRow {
  id: string;
  dispute_id: string | null;
  type: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
}

function iconFor(type: string) {
  if (type.includes("message")) return MessageSquare;
  if (type.includes("dispute") || type.includes("escalat")) return Gavel;
  if (type.includes("resolved") || type.includes("release")) return CheckCircle2;
  return ShieldAlert;
}

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}

export default function Notifications() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) return;
    setLoading(true);
    const { data } = await supabase
      .from("dispute_notifications")
      .select("id, dispute_id, type, title, body, read_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data as NotificationRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [user]);

  const openNotification = async (n: NotificationRow) => {
    if (!n.read_at) {
      await supabase.from("dispute_notifications").update({ read_at: new Date().toISOString() }).eq("id", n.id);
      setItems((prev) => prev.map((i) => (i.id === n.id ? { ...i, read_at: new Date().toISOString() } : i)));
    }
    if (n.dispute_id) navigate(`/disputes/${n.dispute_id}`);
  };

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="flex items-center gap-3 px-5 pt-6 pb-4">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="h-9 w-9 rounded-full glass-card flex items-center justify-center text-foreground/80"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="font-display text-lg font-bold text-foreground">Notifications</h1>
      </div>

      <div className="px-5">
        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <div className="glass-card p-8 text-center mt-4">
            <Bell className="h-8 w-8 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">You're all caught up — no notifications yet.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((n, i) => {
              const Icon = iconFor(n.type);
              const unread = !n.read_at;
              return (
                <motion.button
                  key={n.id}
                  type="button"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                  onClick={() => openNotification(n)}
                  className="w-full text-left glass-card p-4 flex items-start gap-3 active:scale-[0.99] transition-transform"
                >
                  <div
                    className={`h-9 w-9 rounded-full flex items-center justify-center shrink-0 ${
                      unread ? "bg-primary/15" : "bg-muted"
                    }`}
                  >
                    <Icon className={`h-4 w-4 ${unread ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm ${unread ? "font-semibold text-foreground" : "font-medium text-foreground/80"}`}>
                      {n.title}
                    </p>
                    {n.body && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
                    <p className="text-[11px] text-muted-foreground/70 mt-1">{timeAgo(n.created_at)}</p>
                  </div>
                  {unread && <span className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
