import { Link, useLocation, useNavigate } from "react-router-dom";
import { LogIn, LogOut, Menu, User as UserIcon, ShieldCheck } from "lucide-react";
import logo from "@/assets/logo.png";
import { useAuth } from "@/hooks/useAuth";
import { useProfile } from "@/hooks/useProfile";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Button } from "@/components/ui/button";
import WalletConnectButton from "@/components/WalletConnectButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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
  const { profile } = useProfile();
  const { isAdmin } = useIsAdmin();

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass-card border-t-0 border-x-0 rounded-none">
      <div className="container mx-auto px-6 h-16 flex items-center justify-between gap-3">
        <Link to="/" className="flex items-center gap-3 min-w-0">
          <img src={logo} alt="EthosLayer" className="h-8 w-8" />
          <span className="font-display text-lg font-semibold tracking-tight">
            <span className="gradient-text">Ethos</span>
            <span className="text-foreground">Layer</span>
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded border border-amber-500/40 bg-amber-500/10 text-amber-400">
            Testnet
          </span>
        </Link>

        <div className="flex items-center gap-3">
          {user && (
            <span className="text-xs text-muted-foreground hidden sm:block truncate max-w-[160px]">
              {profile?.username ? `@${profile.username}` : user.email}
            </span>
          )}

          <WalletConnectButton />

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost" className="gap-1.5 px-2" aria-label="Open menu">
                <Menu className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 bg-popover z-50">
              <DropdownMenuLabel className="text-xs text-muted-foreground">Navigate</DropdownMenuLabel>
              {navLinks.map((l) => (
                <DropdownMenuItem
                  key={l.to}
                  onSelect={() => navigate(l.to)}
                  className={location.pathname === l.to ? "text-primary" : ""}
                >
                  {l.label}
                </DropdownMenuItem>
              ))}

              <DropdownMenuSeparator />

              {user ? (
                <>
                  <DropdownMenuLabel className="text-xs text-muted-foreground truncate">
                    {user.email}
                  </DropdownMenuLabel>
                  <DropdownMenuItem onSelect={() => navigate("/profile")} className="gap-2">
                    <UserIcon className="h-3.5 w-3.5" />
                    Profile
                    {!profile?.username && (
                      <span className="ml-auto text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400">
                        Set username
                      </span>
                    )}
                  </DropdownMenuItem>
                  {isAdmin && (
                    <DropdownMenuItem onSelect={() => navigate("/admin")} className="gap-2">
                      <ShieldCheck className="h-3.5 w-3.5" />
                      Admin
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onSelect={handleSignOut} className="gap-2">
                    <LogOut className="h-3.5 w-3.5" />
                    Sign Out
                  </DropdownMenuItem>
                </>
              ) : (
                <DropdownMenuItem onSelect={() => navigate("/auth")} className="gap-2">
                  <LogIn className="h-3.5 w-3.5" />
                  Sign In
                </DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </header>
  );
};

export default Header;
