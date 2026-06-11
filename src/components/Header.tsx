import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn, LogOut } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import WalletConnectButton from "@/components/WalletConnectButton";

const navLinks = [
  { to: "/analyze", label: "Analyze" },
  { to: "/settlement", label: "Settlement" },
  { to: "/watchlist", label: "Watchlist" },
  { to: "/values", label: "Ethos" },
  { to: "/methodology", label: "Methodology" },
];

const Header = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut } = useAuth();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-card border-t-0 border-x-0 rounded-none">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-3">
          <img src={logo} alt="EthosLayer" className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight">
            <span className="gradient-text">Ethos</span>
            <span className="text-foreground">Layer</span>
          </span>
        </Link>

        <nav className="flex items-center gap-5">
          {navLinks.map((l) => (
            <Link
              key={l.to}
              to={l.to}
              className={`text-sm font-medium transition-colors hover:text-primary ${
                location.pathname === l.to ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {l.label}
            </Link>
          ))}

          <div className="pl-2 border-l border-border/50">
            <WalletConnectButton />
          </div>

          {user ? (
            <div className="flex items-center gap-2 pl-2 border-l border-border/50">
              <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[120px]">
                {user.email}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSignOut}
                className="gap-1 text-xs text-muted-foreground hover:text-foreground"
              >
                <LogOut className="h-3.5 w-3.5" />
                Sign Out
              </Button>
            </div>
          ) : (
            <Link to="/auth" className="pl-2 border-l border-border/50">
              <Button size="sm" variant="ghost" className="gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                <LogIn className="h-3.5 w-3.5" />
                Sign In
              </Button>
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
};

export default Header;
