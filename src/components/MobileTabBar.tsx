import { useLocation, useNavigate } from "react-router-dom";
import { Home, Wallet, Search, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const tabs = [
  { to: "/", label: "Home", icon: Home },
  { to: "/settlement", label: "Escrow", icon: Wallet },
  { to: "/analyze", label: "Analyze", icon: Search },
  { to: "/profile", label: "Profile", icon: User },
];

/**
 * Mobile-only bottom navigation. Hidden from md: upward, so the desktop
 * experience is completely unchanged.
 */
const MobileTabBar = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass-card border-b-0 border-x-0 rounded-none pb-[env(safe-area-inset-bottom)]"
      aria-label="Primary"
    >
      <ul className="grid grid-cols-4">
        {tabs.map((t) => {
          const active =
            t.to === "/" ? location.pathname === "/" : location.pathname.startsWith(t.to);
          const Icon = t.icon;
          return (
            <li key={t.to}>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate(t.to)}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "h-14 w-full rounded-none flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className="h-5 w-5" />
                {t.label}
              </Button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default MobileTabBar;
