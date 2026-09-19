import { useNavigate } from "react-router-dom";
import {
  ShieldCheck, Bell, Wallet, HelpCircle, Info, LogOut, ChevronRight, FileText,
  Scale, History, ScanSearch,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";

const MobileSettings = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { profile } = useProfile();

  const name = profile?.display_name || profile?.username || "there";

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <div className="min-h-screen bg-background pb-6">
      <div className="px-5 pt-6 pb-5 flex items-center gap-3">
        <div className="h-12 w-12 rounded-full bg-gradient-to-br from-primary to-secondary flex items-center justify-center text-base font-semibold text-primary-foreground shrink-0">
          {name.slice(0, 1).toUpperCase()}
        </div>
        <div className="min-w-0">
          <p className="font-display text-base font-bold text-foreground truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
      </div>

      <div className="px-5 space-y-3">
        <div className="glass-card overflow-hidden">
          <Row icon={ShieldCheck} label="Security & Authentication" onClick={() => navigate("/profile/edit")} />
          <Row icon={Bell} label="Notifications" onClick={() => navigate("/notifications")} />
          <Row icon={Wallet} label="Connected Wallet" onClick={() => navigate("/wallet")} last />
        </div>

        <div className="glass-card overflow-hidden">
          <Row icon={Scale} label="Disputes" onClick={() => navigate("/disputes")} />
          <Row icon={History} label="Transaction History" onClick={() => navigate("/settlement/history")} />
          <Row icon={ScanSearch} label="Analysis History" onClick={() => navigate("/analyze/history")} last />
        </div>

        <div className="glass-card overflow-hidden">
          <Row icon={FileText} label="Whitepaper" href="/EthosLayer_Whitepaper.pdf" />
          <Row icon={HelpCircle} label="Help & Support" onClick={() => navigate("/methodology")} />
          <Row icon={Info} label="About EthosLayer" onClick={() => navigate("/values")} last />
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          className="w-full glass-card p-4 flex items-center justify-center gap-2 text-sm font-medium text-destructive active:scale-[0.99] transition-transform"
        >
          <LogOut className="h-4 w-4" /> Sign out
        </button>
      </div>
    </div>
  );
};

function Row({
  icon: Icon, label, onClick, href, last,
}: { icon: typeof Bell; label: string; onClick?: () => void; href?: string; last?: boolean }) {
  const content = (
    <>
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
      <span className="flex-1 text-sm text-foreground text-left">{label}</span>
      <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0" />
    </>
  );
  const cls = `w-full flex items-center gap-3 px-4 py-3.5 active:bg-muted/40 transition-colors ${
    last ? "" : "border-b border-border/50"
  }`;
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={cls}>
        {content}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {content}
    </button>
  );
}

export default MobileSettings;
